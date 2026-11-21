package com.ansaroudine.zikr.notif

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.ansaroudine.zikr.MainActivity
import com.ansaroudine.zikr.R
import com.ansaroudine.zikr.ZikrApp
import com.ansaroudine.zikr.data.AppJson
import com.ansaroudine.zikr.data.AppNotification
import com.ansaroudine.zikr.data.NotificationRepository
import com.ansaroudine.zikr.data.Prefs
import com.ansaroudine.zikr.sync.tableChanges
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.decodeRecord
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.concurrent.TimeUnit

/**
 * Notifications de l'application :
 * - en temps réel pendant que l'application est ouverte ou en arrière-plan ;
 * - par vérification périodique (toutes les 15 minutes) lorsque l'application est fermée.
 */
class NotificationCenter(
    private val context: Context,
    private val client: SupabaseClient,
    private val repo: NotificationRepository,
    private val prefs: Prefs,
    private val scope: CoroutineScope,
) {
    private val _unread = MutableStateFlow(0L)
    val unread: StateFlow<Long> = _unread.asStateFlow()

    private val _incoming = MutableSharedFlow<AppNotification>(extraBufferCapacity = 16)
    val incoming: SharedFlow<AppNotification> = _incoming.asSharedFlow()

    private var job: Job? = null
    private var currentUser: String? = null

    fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                context.getString(R.string.channel_general),
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply { description = context.getString(R.string.channel_general_desc) }
            context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    fun start(userId: String) {
        if (currentUser == userId && job?.isActive == true) return
        stop()
        currentUser = userId
        job = scope.launch {
            // Au premier lancement, on ne réaffiche pas les anciennes notifications
            if (prefs.lastNotifiedId(userId) < 0) {
                runCatching { prefs.setLastNotifiedId(userId, repo.latestId(userId)) }
            }
            refreshUnread()
            catchUp(userId)
            client.tableChanges("zk_notifications", "user_id", userId).collect { action ->
                when (action) {
                    is PostgresAction.Insert -> {
                        val n = runCatching { action.decodeRecord<AppNotification>() }.getOrNull()
                        if (n != null && n.userId == userId) {
                            _incoming.tryEmit(n)
                            showSystem(userId, n)
                            refreshUnread()
                        }
                    }
                    is PostgresAction.Update -> refreshUnread()
                    else -> Unit
                }
            }
        }
        schedulePeriodicCheck()
    }

    fun stop() {
        job?.cancel()
        job = null
        currentUser = null
        _unread.value = 0
    }

    fun refreshUnread() {
        val uid = currentUser ?: return
        scope.launch { runCatching { _unread.value = repo.unreadCount(uid) } }
    }

    fun setUnread(value: Long) {
        _unread.value = value
    }

    /** Affiche les notifications non encore présentées (utilisé aussi par la tâche périodique). */
    suspend fun catchUp(userId: String) {
        val last = prefs.lastNotifiedId(userId).coerceAtLeast(0)
        val list = runCatching { repo.newerThan(userId, last) }.getOrDefault(emptyList())
        list.forEach { showSystem(userId, it) }
    }

    fun showSystem(userId: String, n: AppNotification) {
        if (n.id <= prefs.lastNotifiedId(userId)) return
        prefs.setLastNotifiedId(userId, n.id)
        if (!prefs.settings.value.notifications) return
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(MainActivity.EXTRA_OPEN_NOTIFICATIONS, true)
        }
        val pending = PendingIntent.getActivity(
            context, n.id.toInt(), intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(0xFF0B5D45.toInt())
            .setContentTitle(n.title)
            .setContentText(n.body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(n.body))
            .setAutoCancel(true)
            .setContentIntent(pending)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()
        runCatching { NotificationManagerCompat.from(context).notify(n.id.toInt(), notification) }
    }

    private fun schedulePeriodicCheck() {
        val request = PeriodicWorkRequestBuilder<NotificationWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork(PERIODIC_WORK, ExistingPeriodicWorkPolicy.KEEP, request)
    }

    fun cancelPeriodicCheck() {
        WorkManager.getInstance(context).cancelUniqueWork(PERIODIC_WORK)
    }

    companion object {
        const val CHANNEL_ID = "zikr_activite"
        const val PERIODIC_WORK = "zikr_notifications"
    }
}

class NotificationWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val container = (applicationContext as ZikrApp).container
        container.awaitSession()
        val uid = container.auth.currentUserId ?: return Result.success()
        container.notifications.catchUp(uid)
        // Profite de la tâche pour envoyer d'éventuels décomptes restés en attente
        if (container.sync.pendingCount() > 0) container.sync.flush()
        return Result.success()
    }
}
