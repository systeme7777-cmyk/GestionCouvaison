package com.ansaroudine.zikr.data

import com.ansaroudine.zikr.util.UserFacingException
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.functions.functions
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import java.time.LocalDate

const val PAGE_SIZE = 40

// =====================================================================
// Authentification et compte courant
// =====================================================================
class AuthRepository(private val client: SupabaseClient) {

    private val _profile = MutableStateFlow<Profile?>(null)
    val profile: StateFlow<Profile?> = _profile.asStateFlow()

    val currentUserId: String? get() = client.auth.currentUserOrNull()?.id

    suspend fun ownerExists(): Boolean =
        client.postgrest.rpc("owner_exists").decodeAs<Boolean>()

    suspend fun signIn(username: String, password: String) {
        client.auth.signInWith(Email) {
            email = usernameToEmail(username)
            this.password = password
        }
        val p = loadProfile()
        if (p == null || p.deletedAt != null) {
            client.auth.signOut()
            throw UserFacingException("Ce compte n'est pas autorisé à utiliser ANSAROUDINE ZIKR.")
        }
        if (!p.isActive) {
            client.auth.signOut()
            throw UserFacingException("Ce compte est désactivé. Contactez un administrateur.")
        }
    }

    suspend fun bootstrapOwner(fullName: String, username: String, phone: String, password: String) {
        val res = invokeAdminFunction(client, buildJsonObject {
            put("action", "bootstrap_owner")
            put("full_name", fullName)
            put("username", username)
            put("phone", phone)
            put("password", password)
        })
        if (res.user == null) throw UserFacingException("La configuration a échoué. Veuillez réessayer.")
        signIn(username, password)
    }

    /** Recharge le profil du compte connecté (null si aucun profil). */
    suspend fun loadProfile(): Profile? {
        val uid = currentUserId ?: run { _profile.value = null; return null }
        val p = client.from("profiles").select { filter { eq("id", uid) } }.decodeSingleOrNull<Profile>()
        _profile.value = p
        return p
    }

    suspend fun changePassword(newPassword: String) {
        client.auth.updateUser { password = newPassword }
        client.postgrest.rpc("password_changed")
        loadProfile()
    }

    suspend fun signOut() {
        runCatching { client.auth.signOut() }
        _profile.value = null
    }
}

// =====================================================================
// Campagnes, participations, décomptes
// =====================================================================
class ZikrRepository(private val client: SupabaseClient) {

    suspend fun myParticipations(userId: String): List<Participation> =
        client.from("campaign_participants").select(Columns.raw("*, campaigns(*)")) {
            filter {
                eq("user_id", userId)
                exact("removed_at", null)
            }
            order("created_at", Order.DESCENDING)
        }.decodeList()

    suspend fun participation(campaignId: String, userId: String): Participation? =
        client.from("campaign_participants").select(Columns.raw("*, campaigns(*)")) {
            filter {
                eq("campaign_id", campaignId)
                eq("user_id", userId)
            }
        }.decodeSingleOrNull()

    suspend fun campaign(id: String): Campaign? =
        client.from("campaigns").select { filter { eq("id", id) } }.decodeSingleOrNull()

    /** filter : "active", "upcoming", "finished" ou "all" */
    suspend fun campaigns(filter: String, search: String, page: Int): List<Campaign> {
        val today = LocalDate.now().toString()
        return client.from("campaigns").select {
            filter {
                when (filter) {
                    "active" -> {
                        eq("status", Campaign.STATUS_ACTIVE)
                        lte("start_date", today)
                        or {
                            exact("end_date", null)
                            gte("end_date", today)
                        }
                    }
                    "upcoming" -> {
                        eq("status", Campaign.STATUS_ACTIVE)
                        gt("start_date", today)
                    }
                    "finished" -> or {
                        eq("status", Campaign.STATUS_CLOSED)
                        lt("end_date", today)
                    }
                }
                if (search.isNotBlank()) {
                    or {
                        ilike("title", "%${search.trim()}%")
                        ilike("zikr_type", "%${search.trim()}%")
                    }
                }
            }
            order("created_at", Order.DESCENDING)
            range(page * PAGE_SIZE.toLong(), (page + 1) * PAGE_SIZE.toLong() - 1)
        }.decodeList()
    }

    suspend fun campaignParticipants(campaignId: String): List<Participation> =
        client.from("campaign_participants")
            .select(Columns.raw("*, profiles!campaign_participants_user_id_fkey(id, full_name, username)")) {
                filter {
                    eq("campaign_id", campaignId)
                    exact("removed_at", null)
                }
                order("count", Order.DESCENDING)
            }.decodeList()

    suspend fun userParticipations(userId: String): List<Participation> = myParticipations(userId)

    suspend fun addZikr(campaignId: String, amount: Int, clientId: String): AddZikrResult =
        client.postgrest.rpc("add_zikr", buildJsonObject {
            put("p_campaign", campaignId)
            put("p_amount", amount)
            put("p_client_id", clientId)
        }).decodeAs()

    suspend fun entries(userId: String?, campaignId: String?, page: Int): List<ZikrEntry> =
        client.from("zikr_entries").select(
            Columns.raw("*, campaigns(id, title, zikr_type), profiles(id, full_name, username)")
        ) {
            filter {
                if (userId != null) eq("user_id", userId)
                if (campaignId != null) eq("campaign_id", campaignId)
            }
            order("id", Order.DESCENDING)
            range(page * PAGE_SIZE.toLong(), (page + 1) * PAGE_SIZE.toLong() - 1)
        }.decodeList()

    suspend fun dailyStats(campaignId: String, days: Int, userId: String? = null): List<DailyStat> =
        client.postgrest.rpc("campaign_daily_stats", buildJsonObject {
            put("p_campaign", campaignId)
            put("p_days", days)
            if (userId != null) put("p_user", userId)
        }).decodeList()

    suspend fun myOverview(): MyOverview = client.postgrest.rpc("my_overview").decodeAs()

    suspend fun auditForUser(userId: String, page: Int): List<AuditEntry> = audit(page) { eq("target_user", userId) }

    suspend fun auditAll(page: Int): List<AuditEntry> = audit(page) { }

    suspend fun auditForCampaign(campaignId: String, page: Int): List<AuditEntry> = audit(page) { eq("campaign_id", campaignId) }

    private suspend fun audit(
        page: Int,
        block: io.github.jan.supabase.postgrest.query.filter.PostgrestFilterBuilder.() -> Unit,
    ): List<AuditEntry> =
        client.from("audit_log").select(
            Columns.raw(
                "*, actor:profiles!audit_log_actor_id_fkey(id, full_name, username), " +
                    "target:profiles!audit_log_target_user_fkey(id, full_name, username), " +
                    "campaign:campaigns(id, title, zikr_type)"
            )
        ) {
            filter(block)
            order("id", Order.DESCENDING)
            range(page * PAGE_SIZE.toLong(), (page + 1) * PAGE_SIZE.toLong() - 1)
        }.decodeList()
}

// =====================================================================
// Administration
// =====================================================================
class AdminRepository(private val client: SupabaseClient) {

    suspend fun overview(): AdminOverview = client.postgrest.rpc("admin_overview").decodeAs()

    /** filter : "all", "participants", "admins", "inactive" */
    suspend fun members(search: String, filter: String, page: Int, pageSize: Int = PAGE_SIZE): List<Profile> =
        client.from("profiles").select {
            filter {
                exact("deleted_at", null)
                when (filter) {
                    "participants" -> eq("role", Profile.ROLE_PARTICIPANT)
                    "admins" -> eq("role", Profile.ROLE_ADMIN)
                    "inactive" -> eq("is_active", false)
                }
                if (search.isNotBlank()) {
                    val s = search.trim()
                    or {
                        ilike("full_name", "%$s%")
                        ilike("username", "%$s%")
                        ilike("phone", "%$s%")
                    }
                }
            }
            order("full_name", Order.ASCENDING)
            range(page * pageSize.toLong(), (page + 1) * pageSize.toLong() - 1)
        }.decodeList()

    suspend fun allActiveMembers(): List<Profile> {
        val result = mutableListOf<Profile>()
        var page = 0
        while (true) {
            val chunk = client.from("profiles").select {
                filter {
                    exact("deleted_at", null)
                    eq("is_active", true)
                }
                order("full_name", Order.ASCENDING)
                range(page * 500L, (page + 1) * 500L - 1)
            }.decodeList<Profile>()
            result += chunk
            if (chunk.size < 500) break
            page++
        }
        return result
    }

    suspend fun member(id: String): Profile? =
        client.from("profiles").select { filter { eq("id", id) } }.decodeSingleOrNull()

    suspend fun createMember(fullName: String, username: String, phone: String, password: String, role: String): Profile =
        invokeAdminFunction(client, buildJsonObject {
            put("action", "create_user")
            put("full_name", fullName)
            put("username", username)
            put("phone", phone)
            put("password", password)
            put("role", role)
        }).user ?: throw UserFacingException("Création impossible.")

    suspend fun updateMember(id: String, fullName: String, username: String, phone: String) {
        invokeAdminFunction(client, buildJsonObject {
            put("action", "update_user")
            put("user_id", id)
            put("full_name", fullName)
            put("username", username)
            put("phone", phone)
        })
    }

    suspend fun resetPassword(id: String, password: String) {
        invokeAdminFunction(client, buildJsonObject {
            put("action", "reset_password")
            put("user_id", id)
            put("password", password)
        })
    }

    suspend fun setActive(id: String, active: Boolean) {
        invokeAdminFunction(client, buildJsonObject {
            put("action", "set_active")
            put("user_id", id)
            put("active", active)
        })
    }

    suspend fun setRole(id: String, role: String) {
        invokeAdminFunction(client, buildJsonObject {
            put("action", "set_role")
            put("user_id", id)
            put("role", role)
        })
    }

    suspend fun deleteMember(id: String) {
        invokeAdminFunction(client, buildJsonObject {
            put("action", "delete_user")
            put("user_id", id)
        })
    }

    suspend fun createCampaign(
        title: String, zikrType: String, description: String,
        start: LocalDate, end: LocalDate?, goal: Long,
    ): String = client.postgrest.rpc("create_campaign", campaignParams(title, zikrType, description, start, end, goal))
        .decodeAs()

    suspend fun updateCampaign(
        id: String, title: String, zikrType: String, description: String,
        start: LocalDate, end: LocalDate?, goal: Long,
    ) {
        client.postgrest.rpc("update_campaign", buildJsonObject {
            put("p_id", id)
            campaignParams(title, zikrType, description, start, end, goal).forEach { (k, v) -> put(k, v) }
        })
    }

    private fun campaignParams(
        title: String, zikrType: String, description: String,
        start: LocalDate, end: LocalDate?, goal: Long,
    ): JsonObject = buildJsonObject {
        put("p_title", title)
        put("p_zikr_type", zikrType)
        put("p_description", description)
        put("p_start_date", start.toString())
        put("p_end_date", end?.toString())
        put("p_global_goal", goal)
    }

    suspend fun setCampaignStatus(id: String, status: String) {
        client.postgrest.rpc("set_campaign_status", buildJsonObject {
            put("p_id", id)
            put("p_status", status)
        })
    }

    suspend fun deleteCampaign(id: String) {
        client.postgrest.rpc("delete_campaign", buildJsonObject { put("p_id", id) })
    }

    suspend fun setParticipants(campaignId: String, items: List<ParticipantGoal>): JsonObject =
        client.postgrest.rpc("set_campaign_participants", buildJsonObject {
            put("p_campaign", campaignId)
            putJsonArray("p_items") { items.forEach { add(AppJson.encodeToJsonElement(it)) } }
        }).decodeAs()

    suspend fun updateGoal(campaignId: String, userId: String, goal: Long) {
        client.postgrest.rpc("update_participant_goal", buildJsonObject {
            put("p_campaign", campaignId)
            put("p_user", userId)
            put("p_goal", goal)
        })
    }
}

// =====================================================================
// Notifications
// =====================================================================
class NotificationRepository(private val client: SupabaseClient) {

    suspend fun list(userId: String, page: Int): List<AppNotification> =
        client.from("notifications").select {
            filter { eq("user_id", userId) }
            order("id", Order.DESCENDING)
            range(page * PAGE_SIZE.toLong(), (page + 1) * PAGE_SIZE.toLong() - 1)
        }.decodeList()

    suspend fun newerThan(userId: String, lastId: Long): List<AppNotification> =
        client.from("notifications").select {
            filter {
                eq("user_id", userId)
                gt("id", lastId)
                exact("read_at", null)
            }
            order("id", Order.ASCENDING)
            limit(20)
        }.decodeList()

    suspend fun latestId(userId: String): Long =
        client.from("notifications").select(Columns.list("id")) {
            filter { eq("user_id", userId) }
            order("id", Order.DESCENDING)
            limit(1)
        }.decodeList<IdOnly>().firstOrNull()?.id ?: 0L

    suspend fun unreadCount(userId: String): Long =
        client.from("notifications").select {
            filter {
                eq("user_id", userId)
                exact("read_at", null)
            }
            count(io.github.jan.supabase.postgrest.query.Count.EXACT)
            limit(1)
        }.countOrNull() ?: 0L

    suspend fun markRead(ids: List<Long>?) {
        client.postgrest.rpc("mark_notifications_read", buildJsonObject {
            if (ids != null) putJsonArray("p_ids") { ids.forEach { add(kotlinx.serialization.json.JsonPrimitive(it)) } }
        })
    }
}

@kotlinx.serialization.Serializable
data class IdOnly(val id: Long)

// =====================================================================
// Appel de la fonction sécurisée de gestion des comptes
// =====================================================================
suspend fun invokeAdminFunction(
    client: SupabaseClient,
    body: JsonObject,
): FunctionResult {
    val response = try {
        client.functions.invoke(function = "admin-users") {
            contentType(ContentType.Application.Json)
            setBody(AppJson.encodeToString(JsonObject.serializer(), body))
        }
    } catch (e: io.github.jan.supabase.exceptions.RestException) {
        val parsed = runCatching { AppJson.decodeFromString<FunctionResult>(e.error) }.getOrNull()
        throw UserFacingException(parsed?.error ?: "Action impossible. Veuillez réessayer.")
    }
    val text = response.bodyAsText()
    val result = runCatching { AppJson.decodeFromString<FunctionResult>(text) }
        .getOrElse { throw UserFacingException("Réponse inattendue du serveur. Veuillez réessayer.") }
    if (!result.ok) throw UserFacingException(result.error ?: "Action impossible.")
    return result
}
