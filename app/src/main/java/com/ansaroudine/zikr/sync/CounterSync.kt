package com.ansaroudine.zikr.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.ansaroudine.zikr.ZikrApp
import com.ansaroudine.zikr.data.AppJson
import com.ansaroudine.zikr.data.ZikrRepository
import com.ansaroudine.zikr.util.isNetworkError
import com.ansaroudine.zikr.util.parseInstant
import com.ansaroudine.zikr.util.toUserMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File
import java.util.concurrent.TimeUnit

enum class SyncStatus { SYNCED, PENDING, SYNCING, OFFLINE }

/**
 * Gestionnaire de synchronisation des décomptes.
 * - Chaque appui est enregistré immédiatement sur le téléphone (aucune perte même sans réseau).
 * - Les envois sont regroupés puis transmis au serveur avec un identifiant unique (jamais comptés deux fois).
 * - En cas de coupure, les envois sont retentés automatiquement, y compris application fermée.
 */
class CounterSync(
    private val context: Context,
    private val repo: ZikrRepository,
    private val scope: CoroutineScope,
    private val currentUser: () -> String?,
) {
    private val file = File(context.filesDir, "zikr_file_attente.json")
    private val stateLock = Mutex()
    private val flushLock = Mutex()
    private val _state = MutableStateFlow(load())
    val state: StateFlow<QueueState> = _state.asStateFlow()

    private val _status = MutableStateFlow(if (_state.value.ops.isEmpty()) SyncStatus.SYNCED else SyncStatus.PENDING)
    val status: StateFlow<SyncStatus> = _status.asStateFlow()

    private val _errors = MutableSharedFlow<String>(extraBufferCapacity = 8)
    val errors: SharedFlow<String> = _errors.asSharedFlow()

    /** Campagnes dont l'état doit être rechargé (après un refus du serveur). */
    private val _invalidated = MutableSharedFlow<String>(extraBufferCapacity = 8)
    val invalidated: SharedFlow<String> = _invalidated.asSharedFlow()

    @Volatile private var inflight: PendingOp? = null
    private var flushJob: Job? = null
    private var retryDelayMs = 1_000L

    fun isInflight(campaignId: String): Boolean = inflight?.campaignId == campaignId

    fun pendingCount(): Int = _state.value.ops.count { it.userId == currentUser() }

    fun add(campaignId: String, amount: Int) {
        val uid = currentUser() ?: return
        mutate { CounterQueue.add(it, uid, campaignId, amount, inflight?.clientId, System.currentTimeMillis()) }
        scheduleFlush(DEBOUNCE_MS)
    }

    /** Renvoie la quantité annulée, ou null si rien à annuler. */
    fun undo(campaignId: String): Int? {
        val uid = currentUser() ?: return null
        var undone: Int? = null
        mutate { s ->
            val r = CounterQueue.undo(s, uid, campaignId, inflight?.clientId, System.currentTimeMillis())
            if (r == null) s else { undone = r.second; r.first }
        }
        if (undone != null) scheduleFlush(DEBOUNCE_MS)
        return undone
    }

    fun canUndo(campaignId: String): Boolean = _state.value.undo[campaignId].orEmpty().isNotEmpty()

    fun mergeSnapshot(
        campaignId: String,
        personalCount: Long? = null,
        personalGoal: Long? = null,
        campaignTotal: Long? = null,
        globalGoal: Long? = null,
        updatedAt: String? = null,
    ) {
        if (isInflight(campaignId)) return
        val millis = parseInstant(updatedAt)?.toEpochMilli() ?: 0L
        mutate { CounterQueue.mergeSnapshot(it, campaignId, personalCount, personalGoal, campaignTotal, globalGoal, millis) }
    }

    /** Remplace l'état connu par celui fraîchement lu sur le serveur (ouverture d'écran, actualisation). */
    fun resetSnapshot(campaignId: String, personalCount: Long, personalGoal: Long, total: Long, globalGoal: Long, updatedAt: String?) {
        if (isInflight(campaignId)) return
        val millis = parseInstant(updatedAt)?.toEpochMilli() ?: 0L
        mutate { s ->
            val cur = s.snapshots[campaignId]
            if (cur != null && cur.updatedAtMillis > millis) s
            else s.copy(snapshots = s.snapshots + (campaignId to ServerSnapshot(personalCount, personalGoal, total, globalGoal, millis)))
        }
    }

    fun scheduleFlush(delayMs: Long = 0) {
        flushJob?.cancel()
        flushJob = scope.launch {
            if (delayMs > 0) delay(delayMs)
            flush()
        }
    }

    /** Envoie toutes les opérations en attente. Renvoie true si tout a été transmis. */
    suspend fun flush(): Boolean = flushLock.withLock {
        val uid = currentUser() ?: return@withLock false
        while (true) {
            val op = _state.value.ops.firstOrNull { it.userId == uid } ?: break
            inflight = op
            _status.value = SyncStatus.SYNCING
            try {
                val res = repo.addZikr(op.campaignId, op.amount, op.clientId)
                val snap = ServerSnapshot(
                    personalCount = res.personalCount,
                    personalGoal = res.personalGoal,
                    campaignTotal = res.campaignTotal,
                    globalGoal = res.globalGoal,
                    updatedAtMillis = parseInstant(res.updatedAt)?.toEpochMilli() ?: 0L,
                )
                inflight = null
                mutate { CounterQueue.confirm(it, op.clientId, op.campaignId, snap) }
                retryDelayMs = 1_000L
            } catch (e: Throwable) {
                inflight = null
                if (e is kotlinx.coroutines.CancellationException) throw e
                if (e.isNetworkError()) {
                    _status.value = SyncStatus.OFFLINE
                    scheduleBackgroundSync()
                    val wait = retryDelayMs
                    retryDelayMs = (retryDelayMs * 2).coerceAtMost(30_000L)
                    scope.launch { delay(wait); scheduleFlush() }
                    return@withLock false
                }
                // Refus du serveur (campagne clôturée, participant retiré, etc.) : opération abandonnée
                mutate { CounterQueue.drop(it, op.clientId) }
                _errors.tryEmit(e.toUserMessage())
                _invalidated.tryEmit(op.campaignId)
            }
        }
        _status.value = if (_state.value.ops.any { it.userId == uid }) SyncStatus.PENDING else SyncStatus.SYNCED
        true
    }

    private fun mutate(block: (QueueState) -> QueueState) {
        _state.update(block)
        if (_state.value.ops.isNotEmpty() && _status.value == SyncStatus.SYNCED) _status.value = SyncStatus.PENDING
        persist()
    }

    private fun persist() {
        scope.launch(Dispatchers.IO) {
            stateLock.withLock {
                val snapshot = _state.value
                runCatching {
                    val tmp = File(file.parentFile, file.name + ".tmp")
                    tmp.writeText(AppJson.encodeToString(QueueState.serializer(), snapshot))
                    if (!tmp.renameTo(file)) {
                        file.writeText(tmp.readText()); tmp.delete()
                    }
                }
            }
        }
    }

    private fun load(): QueueState = runCatching {
        if (file.exists()) AppJson.decodeFromString(QueueState.serializer(), file.readText()) else QueueState()
    }.getOrDefault(QueueState())

    /** Efface les données locales d'un autre compte (après déconnexion complète). */
    suspend fun clearForSignOut(keepUnsentOf: String?) = withContext(Dispatchers.IO) {
        mutate { s -> QueueState(ops = s.ops.filter { it.userId == keepUnsentOf }) }
    }

    fun scheduleBackgroundSync() {
        val request = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(SYNC_WORK, ExistingWorkPolicy.KEEP, request)
    }

    companion object {
        const val DEBOUNCE_MS = 700L
        const val SYNC_WORK = "zikr_sync"
    }
}

/** Envoie les décomptes restants dès que le réseau revient, même si l'application est fermée. */
class SyncWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val app = applicationContext as ZikrApp
        val container = app.container
        container.awaitSession()
        if (container.sync.pendingCount() == 0) return Result.success()
        return if (container.sync.flush() && container.sync.pendingCount() == 0) Result.success() else Result.retry()
    }
}
