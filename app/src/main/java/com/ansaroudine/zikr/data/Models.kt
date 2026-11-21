package com.ansaroudine.zikr.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import java.time.LocalDate

@Serializable
data class Profile(
    val id: String,
    val username: String,
    @SerialName("full_name") val fullName: String,
    val phone: String? = null,
    val role: String = ROLE_PARTICIPANT,
    @SerialName("is_owner") val isOwner: Boolean = false,
    @SerialName("is_active") val isActive: Boolean = true,
    @SerialName("must_change_password") val mustChangePassword: Boolean = false,
    @SerialName("deleted_at") val deletedAt: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
) {
    val isAdmin: Boolean get() = role == ROLE_ADMIN
    val roleLabel: String
        get() = when {
            isOwner -> "Administrateur principal"
            isAdmin -> "Administrateur"
            else -> "Participant"
        }

    companion object {
        const val ROLE_ADMIN = "admin"
        const val ROLE_PARTICIPANT = "participant"
    }
}

@Serializable
data class ProfileRef(
    val id: String? = null,
    @SerialName("full_name") val fullName: String = "",
    val username: String = "",
)

@Serializable
data class Campaign(
    val id: String,
    val title: String,
    @SerialName("zikr_type") val zikrType: String,
    val description: String? = null,
    @SerialName("start_date") val startDate: String,
    @SerialName("end_date") val endDate: String? = null,
    @SerialName("global_goal") val globalGoal: Long,
    @SerialName("total_count") val totalCount: Long = 0,
    @SerialName("participants_count") val participantsCount: Int = 0,
    val status: String = STATUS_ACTIVE,
    @SerialName("goal_reached_at") val goalReachedAt: String? = null,
    @SerialName("closed_at") val closedAt: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
) {
    val start: LocalDate get() = LocalDate.parse(startDate)
    val end: LocalDate? get() = endDate?.let { LocalDate.parse(it) }

    fun phase(today: LocalDate = LocalDate.now()): CampaignPhase = when {
        status == STATUS_CLOSED -> CampaignPhase.CLOSED
        end?.isBefore(today) == true -> CampaignPhase.ENDED
        start.isAfter(today) -> CampaignPhase.UPCOMING
        else -> CampaignPhase.ACTIVE
    }

    val progress: Float get() = if (globalGoal <= 0) 0f else (totalCount.toFloat() / globalGoal).coerceIn(0f, 1f)
    val remaining: Long get() = (globalGoal - totalCount).coerceAtLeast(0)
    val goalReached: Boolean get() = totalCount >= globalGoal

    companion object {
        const val STATUS_ACTIVE = "en_cours"
        const val STATUS_CLOSED = "terminee"
    }
}

enum class CampaignPhase(val label: String) {
    ACTIVE("En cours"),
    UPCOMING("À venir"),
    ENDED("Terminée"),
    CLOSED("Clôturée");

    val isFinished: Boolean get() = this == ENDED || this == CLOSED
}

@Serializable
data class Participation(
    @SerialName("campaign_id") val campaignId: String,
    @SerialName("user_id") val userId: String,
    @SerialName("personal_goal") val personalGoal: Long,
    val count: Long = 0,
    @SerialName("completed_at") val completedAt: String? = null,
    @SerialName("last_entry_at") val lastEntryAt: String? = null,
    @SerialName("removed_at") val removedAt: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
    val campaigns: Campaign? = null,
    val profiles: ProfileRef? = null,
) {
    val progress: Float get() = if (personalGoal <= 0) 0f else (count.toFloat() / personalGoal).coerceIn(0f, 1f)
    val remaining: Long get() = (personalGoal - count).coerceAtLeast(0)
    val percent: Int get() = if (personalGoal <= 0) 0 else ((count * 100) / personalGoal).toInt()
}

@Serializable
data class CampaignRef(
    val id: String? = null,
    val title: String = "",
    @SerialName("zikr_type") val zikrType: String = "",
)

@Serializable
data class ZikrEntry(
    val id: Long,
    @SerialName("campaign_id") val campaignId: String,
    @SerialName("user_id") val userId: String,
    val amount: Int,
    val kind: String,
    @SerialName("count_after") val countAfter: Long,
    @SerialName("created_at") val createdAt: String,
    val campaigns: CampaignRef? = null,
    val profiles: ProfileRef? = null,
)

@Serializable
data class AuditEntry(
    val id: Long,
    @SerialName("actor_id") val actorId: String? = null,
    val action: String,
    @SerialName("target_user") val targetUser: String? = null,
    @SerialName("campaign_id") val campaignId: String? = null,
    val details: JsonObject = JsonObject(emptyMap()),
    @SerialName("created_at") val createdAt: String,
    val actor: ProfileRef? = null,
    val target: ProfileRef? = null,
    val campaign: CampaignRef? = null,
)

@Serializable
data class AppNotification(
    val id: Long,
    @SerialName("user_id") val userId: String,
    val type: String,
    val title: String,
    val body: String,
    val data: JsonObject = JsonObject(emptyMap()),
    @SerialName("read_at") val readAt: String? = null,
    @SerialName("created_at") val createdAt: String,
) {
    val isRead: Boolean get() = readAt != null
}

@Serializable
data class AdminOverview(
    @SerialName("campagnes_en_cours") val activeCampaigns: Long = 0,
    @SerialName("campagnes_terminees") val finishedCampaigns: Long = 0,
    val participants: Long = 0,
    @SerialName("participants_actifs") val activeMembers: Long = 0,
    val administrateurs: Long = 0,
    @SerialName("total_zikr") val totalZikr: Long = 0,
    @SerialName("zikr_aujourdhui") val todayZikr: Long = 0,
    @SerialName("objectifs_personnels_atteints") val personalGoalsReached: Long = 0,
)

@Serializable
data class MyOverview(
    @SerialName("total_zikr") val totalZikr: Long = 0,
    @SerialName("zikr_aujourdhui") val todayZikr: Long = 0,
    val campagnes: Long = 0,
    @SerialName("objectifs_atteints") val goalsReached: Long = 0,
)

@Serializable
data class DailyStat(
    val day: String,
    val total: Long,
)

@Serializable
data class AddZikrResult(
    @SerialName("entry_id") val entryId: Long,
    @SerialName("personal_count") val personalCount: Long,
    @SerialName("personal_goal") val personalGoal: Long,
    @SerialName("campaign_total") val campaignTotal: Long,
    @SerialName("global_goal") val globalGoal: Long,
    @SerialName("updated_at") val updatedAt: String? = null,
    val duplicate: Boolean = false,
)

@Serializable
data class FunctionResult(
    val ok: Boolean = false,
    val error: String? = null,
    val user: Profile? = null,
)

@Serializable
data class ParticipantGoal(
    @SerialName("user_id") val userId: String,
    val goal: Long,
)
