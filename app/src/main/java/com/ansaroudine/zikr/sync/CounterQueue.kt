package com.ansaroudine.zikr.sync

import kotlinx.serialization.Serializable
import java.util.UUID

/** Une opération de décompte en attente d'envoi au serveur. */
@Serializable
data class PendingOp(
    val clientId: String,
    val userId: String,
    val campaignId: String,
    val amount: Int,
    val createdAt: Long,
)

/** Dernier état connu côté serveur pour une campagne du participant. */
@Serializable
data class ServerSnapshot(
    val personalCount: Long,
    val personalGoal: Long,
    val campaignTotal: Long,
    val globalGoal: Long,
    val updatedAtMillis: Long = 0,
)

@Serializable
data class QueueState(
    val ops: List<PendingOp> = emptyList(),
    /** Pile des dernières actions par campagne (pour le bouton Annuler). */
    val undo: Map<String, List<Int>> = emptyMap(),
    val snapshots: Map<String, ServerSnapshot> = emptyMap(),
)

/**
 * Logique pure de la file d'attente (sans entrées/sorties), testée unitairement.
 * Les appuis rapides sont regroupés dans une seule opération tant qu'elle n'est pas en cours d'envoi,
 * ce qui limite le nombre de requêtes même avec des centaines de participants.
 */
object CounterQueue {
    const val MAX_OP_AMOUNT = 100_000
    const val MAX_UNDO = 200

    fun pendingSum(state: QueueState, userId: String, campaignId: String): Long =
        state.ops.filter { it.userId == userId && it.campaignId == campaignId }.sumOf { it.amount.toLong() }

    fun personalDisplayed(state: QueueState, userId: String, campaignId: String): Long? =
        state.snapshots[campaignId]?.let { it.personalCount + pendingSum(state, userId, campaignId) }

    fun add(
        state: QueueState,
        userId: String,
        campaignId: String,
        amount: Int,
        inflightId: String?,
        now: Long,
        recordUndo: Boolean = true,
        newId: () -> String = { UUID.randomUUID().toString() },
    ): QueueState {
        require(amount != 0)
        val ops = state.ops.toMutableList()
        val lastIndex = ops.indexOfLast { it.userId == userId && it.campaignId == campaignId }
        val last = ops.getOrNull(lastIndex)
        val canMerge = last != null &&
            last.clientId != inflightId &&
            lastIndex == ops.lastIndex &&
            (last.amount > 0) == (amount > 0) &&
            kotlin.math.abs(last.amount.toLong() + amount) <= MAX_OP_AMOUNT
        if (canMerge) {
            ops[lastIndex] = last!!.copy(amount = last.amount + amount)
        } else {
            ops += PendingOp(newId(), userId, campaignId, amount, now)
        }
        val undo = if (recordUndo && amount > 0) {
            val stack = (state.undo[campaignId].orEmpty() + amount).takeLast(MAX_UNDO)
            state.undo + (campaignId to stack)
        } else state.undo
        return state.copy(ops = ops, undo = undo)
    }

    /**
     * Annule la dernière action. Si elle n'est pas encore envoyée, elle est simplement retirée de la file ;
     * sinon une correction négative est enregistrée (l'historique reste complet).
     * Renvoie null si rien ne peut être annulé.
     */
    fun undo(
        state: QueueState,
        userId: String,
        campaignId: String,
        inflightId: String?,
        now: Long,
        newId: () -> String = { UUID.randomUUID().toString() },
    ): Pair<QueueState, Int>? {
        val stack = state.undo[campaignId].orEmpty()
        val amount = stack.lastOrNull() ?: return null
        val displayed = personalDisplayed(state, userId, campaignId) ?: return null
        if (displayed < amount) return null
        val newUndo = state.undo + (campaignId to stack.dropLast(1))

        val ops = state.ops.toMutableList()
        val lastIndex = ops.indexOfLast { it.userId == userId && it.campaignId == campaignId }
        val last = ops.getOrNull(lastIndex)
        if (last != null && last.clientId != inflightId && last.amount > 0 && last.amount >= amount) {
            val remaining = last.amount - amount
            if (remaining == 0) ops.removeAt(lastIndex) else ops[lastIndex] = last.copy(amount = remaining)
            return state.copy(ops = ops, undo = newUndo) to amount
        }
        val withCorrection = add(state.copy(undo = newUndo), userId, campaignId, -amount, inflightId, now, false, newId)
        return withCorrection to amount
    }

    /** Applique la réponse du serveur : l'opération est retirée et l'état serveur mis à jour en même temps. */
    fun confirm(state: QueueState, clientId: String, campaignId: String, snapshot: ServerSnapshot): QueueState {
        val current = state.snapshots[campaignId]
        val newSnap = if (current != null && current.updatedAtMillis > snapshot.updatedAtMillis) {
            // Une mise à jour plus récente est déjà connue pour le total ; le compteur personnel vient de la réponse
            current.copy(personalCount = snapshot.personalCount, personalGoal = snapshot.personalGoal)
        } else snapshot
        return state.copy(
            ops = state.ops.filterNot { it.clientId == clientId },
            snapshots = state.snapshots + (campaignId to newSnap),
        )
    }

    fun drop(state: QueueState, clientId: String): QueueState =
        state.copy(ops = state.ops.filterNot { it.clientId == clientId })

    /** Mise à jour reçue en temps réel ou par rechargement : ignorée si plus ancienne que l'état connu. */
    fun mergeSnapshot(
        state: QueueState,
        campaignId: String,
        personalCount: Long? = null,
        personalGoal: Long? = null,
        campaignTotal: Long? = null,
        globalGoal: Long? = null,
        updatedAtMillis: Long = 0,
    ): QueueState {
        val cur = state.snapshots[campaignId]
        if (cur == null) {
            if (personalCount == null || personalGoal == null || campaignTotal == null || globalGoal == null) return state
            return state.copy(
                snapshots = state.snapshots + (campaignId to ServerSnapshot(personalCount, personalGoal, campaignTotal, globalGoal, updatedAtMillis))
            )
        }
        if (updatedAtMillis < cur.updatedAtMillis) return state
        val next = cur.copy(
            personalCount = personalCount ?: cur.personalCount,
            personalGoal = personalGoal ?: cur.personalGoal,
            campaignTotal = campaignTotal ?: cur.campaignTotal,
            globalGoal = globalGoal ?: cur.globalGoal,
            updatedAtMillis = updatedAtMillis,
        )
        return state.copy(snapshots = state.snapshots + (campaignId to next))
    }
}
