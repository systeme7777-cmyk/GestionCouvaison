package com.ansaroudine.zikr.ui.common

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsNone
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ansaroudine.zikr.AppContainer
import com.ansaroudine.zikr.BuildConfig
import com.ansaroudine.zikr.container
import com.ansaroudine.zikr.data.AppNotification
import com.ansaroudine.zikr.data.AuditEntry
import com.ansaroudine.zikr.data.PAGE_SIZE
import com.ansaroudine.zikr.data.Profile
import com.ansaroudine.zikr.data.ZikrEntry
import com.ansaroudine.zikr.ui.components.AppCard
import com.ansaroudine.zikr.ui.components.Avatar
import com.ansaroudine.zikr.ui.components.EmptyState
import com.ansaroudine.zikr.ui.components.ErrorBanner
import com.ansaroudine.zikr.ui.components.LoadingBox
import com.ansaroudine.zikr.ui.components.SectionTitle
import com.ansaroudine.zikr.ui.theme.Danger
import com.ansaroudine.zikr.ui.theme.Success
import com.ansaroudine.zikr.util.auditActionLabel
import com.ansaroudine.zikr.util.dayLabel
import com.ansaroudine.zikr.util.fmt
import com.ansaroudine.zikr.util.localDateOf
import com.ansaroudine.zikr.util.relativeTime
import com.ansaroudine.zikr.util.timeOf
import com.ansaroudine.zikr.util.toUserMessage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

// =====================================================================
// Liste paginée générique
// =====================================================================
data class PagedState<T>(
    val items: List<T> = emptyList(),
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val loadingMore: Boolean = false,
    val endReached: Boolean = false,
    val error: String? = null,
)

open class PagedViewModel<T>(private val fetch: suspend (page: Int) -> List<T>) : ViewModel() {
    protected val _state = MutableStateFlow(PagedState<T>())
    val state = _state.asStateFlow()
    private var page = 0

    init { refresh() }

    fun refresh(pull: Boolean = false) {
        page = 0
        _state.update { it.copy(loading = it.items.isEmpty(), refreshing = pull, error = null) }
        viewModelScope.launch {
            try {
                val items = fetch(0)
                _state.value = PagedState(items = items, loading = false, endReached = items.size < PAGE_SIZE)
            } catch (e: Throwable) {
                _state.update { it.copy(loading = false, refreshing = false, error = e.toUserMessage()) }
            }
        }
    }

    fun loadMore() {
        val s = _state.value
        if (s.loading || s.loadingMore || s.endReached) return
        _state.update { it.copy(loadingMore = true) }
        viewModelScope.launch {
            try {
                val next = fetch(page + 1)
                page++
                _state.update { it.copy(items = it.items + next, loadingMore = false, endReached = next.size < PAGE_SIZE) }
            } catch (e: Throwable) {
                _state.update { it.copy(loadingMore = false, error = e.toUserMessage()) }
            }
        }
    }
}

@Composable
fun InfiniteScrollEffect(listState: LazyListState, onLoadMore: () -> Unit) {
    val shouldLoad by remember {
        derivedStateOf {
            val last = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            last >= listState.layoutInfo.totalItemsCount - 5
        }
    }
    LaunchedEffect(listState) {
        snapshotFlow { shouldLoad }.distinctUntilChanged().filter { it }.collect { onLoadMore() }
    }
}

// =====================================================================
// Historique
// =====================================================================
class EntriesViewModel(c: AppContainer, userId: String?, campaignId: String?) :
    PagedViewModel<ZikrEntry>({ page -> c.zikr.entries(userId, campaignId, page) })

class AuditViewModel(c: AppContainer, mode: String, id: String?) :
    PagedViewModel<AuditEntry>({ page ->
        when (mode) {
            "user" -> c.zikr.auditForUser(id!!, page)
            "campaign" -> c.zikr.auditForCampaign(id!!, page)
            else -> c.zikr.auditAll(page)
        }
    })

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HistoryScreen(userId: String, contentPadding: PaddingValues) {
    var tab by rememberSaveable { mutableIntStateOf(0) }
    Column(Modifier.fillMaxSize().padding(contentPadding)) {
        PrimaryTabRow(selectedTabIndex = tab) {
            Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("Mes décomptes") })
            Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Modifications") })
        }
        if (tab == 0) EntriesList(userId = userId, campaignId = null, showUser = false)
        else AuditList(mode = "user", id = userId)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EntriesList(userId: String?, campaignId: String?, showUser: Boolean, header: (@Composable () -> Unit)? = null) {
    val vm = appViewModel(key = "entries-$userId-$campaignId") { EntriesViewModel(it, userId, campaignId) }
    val state by vm.state.collectAsState()
    val listState = rememberLazyListState()
    InfiniteScrollEffect(listState) { vm.loadMore() }
    val grouped = remember(state.items) { state.items.groupBy { localDateOf(it.createdAt) } }

    PullToRefreshBox(isRefreshing = state.refreshing, onRefresh = { vm.refresh(pull = true) }, modifier = Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), state = listState, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            header?.let { item { it() } }
            state.error?.let { item { ErrorBanner(it, onRetry = { vm.refresh() }) } }
            if (state.loading) item { LoadingBox() }
            else if (state.items.isEmpty() && state.error == null) {
                item { EmptyState(Icons.Default.History, "Aucun décompte", "Les décomptes enregistrés apparaîtront ici.") }
            }
            grouped.forEach { (day, entries) ->
                item(key = "d$day") {
                    val sum = entries.sumOf { it.amount.toLong() }
                    Row(Modifier.fillMaxWidth().padding(top = 10.dp, bottom = 2.dp)) {
                        Text(dayLabel(day), style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                        Text("Total : ${sum.fmt()}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                    }
                }
                items(entries, key = { it.id }) { e -> EntryRow(e, showUser) }
            }
            if (state.loadingMore) item { LoadingBox() }
        }
    }
}

@Composable
private fun EntryRow(e: ZikrEntry, showUser: Boolean) {
    val positive = e.amount > 0
    AppCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(36.dp).clip(CircleShape)
                    .background((if (positive) Success else Danger).copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(if (positive) Icons.Default.Add else Icons.Default.Remove, null, tint = if (positive) Success else Danger, modifier = Modifier.size(18.dp))
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    if (showUser) e.profiles?.fullName ?: "—" else e.campaigns?.title ?: "Campagne",
                    style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
                Text(
                    buildString {
                        append(if (positive) e.campaigns?.zikrType ?: "" else "Annulation / correction")
                        append(" · total ${e.countAfter.fmt()}")
                    },
                    style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    (if (positive) "+" else "−") + kotlin.math.abs(e.amount).toLong().fmt(),
                    style = MaterialTheme.typography.titleMedium,
                    color = if (positive) Success else Danger,
                )
                Text(timeOf(e.createdAt), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AuditList(mode: String, id: String?) {
    val vm = appViewModel(key = "audit-$mode-$id") { AuditViewModel(it, mode, id) }
    val state by vm.state.collectAsState()
    val listState = rememberLazyListState()
    InfiniteScrollEffect(listState) { vm.loadMore() }
    PullToRefreshBox(isRefreshing = state.refreshing, onRefresh = { vm.refresh(pull = true) }, modifier = Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), state = listState, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            state.error?.let { item { ErrorBanner(it, onRetry = { vm.refresh() }) } }
            if (state.loading) item { LoadingBox() }
            else if (state.items.isEmpty() && state.error == null) {
                item { EmptyState(Icons.Default.History, "Aucune modification", "Les modifications importantes seront conservées ici.") }
            }
            items(state.items, key = { it.id }) { a -> AuditRow(a) }
            if (state.loadingMore) item { LoadingBox() }
        }
    }
}

@Composable
fun AuditRow(a: AuditEntry) {
    AppCard {
        Text(auditActionLabel(a.action), style = MaterialTheme.typography.titleSmall)
        val parts = buildList {
            a.target?.fullName?.takeIf { it.isNotBlank() && a.targetUser != a.actorId }?.let { add("Concerne : $it") }
            a.campaign?.title?.takeIf { it.isNotBlank() }?.let { add("Campagne : $it") }
            detailsText(a.action, a.details)?.let { add(it) }
            a.actor?.fullName?.takeIf { it.isNotBlank() }?.let { add("Par : $it") }
        }
        parts.forEach {
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Spacer(Modifier.height(2.dp))
        Text(relativeTime(a.createdAt), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
    }
}

private fun JsonObject.str(key: String): String? = (this[key] as? JsonPrimitive)?.contentOrNull

private fun detailsText(action: String, d: JsonObject): String? = when (action) {
    "objectif_modifie" -> "Objectif : ${d.str("avant")?.toLongOrNull()?.fmt() ?: "?"} → ${d.str("apres")?.toLongOrNull()?.fmt() ?: "?"}"
    "participant_ajoute", "participant_reintegre" -> d.str("objectif")?.toLongOrNull()?.let { "Objectif : ${it.fmt()}" }
    "participant_retire" -> "Réalisé : ${d.str("realise")?.toLongOrNull()?.fmt() ?: "0"} / ${d.str("objectif")?.toLongOrNull()?.fmt() ?: "?"}"
    "campagne_creee" -> "${d.str("titre") ?: ""} · objectif ${d.str("objectif")?.toLongOrNull()?.fmt() ?: ""} ${d.str("type") ?: ""}"
    "campagne_supprimee", "campagne_cloturee", "campagne_rouverte" -> d.str("titre")
    "objectif_personnel_atteint", "objectif_global_atteint" -> d.str("objectif")?.toLongOrNull()?.let { "Objectif : ${it.fmt()}" }
    "participant_cree", "administrateur_cree", "participant_supprime", "administrateur_supprime" ->
        listOfNotNull(d.str("nom"), d.str("identifiant")?.let { "@$it" }).joinToString(" ").ifBlank { null }
    else -> null
}

// =====================================================================
// Notifications
// =====================================================================
class NotificationsViewModel(private val c: AppContainer, userId: String) :
    PagedViewModel<AppNotification>({ page -> c.notificationRepo.list(userId, page) }) {

    init {
        viewModelScope.launch {
            c.notifications.incoming.collect { n -> _state.update { it.copy(items = listOf(n) + it.items.filterNot { x -> x.id == n.id }) } }
        }
    }

    fun markAllRead() {
        viewModelScope.launch {
            runCatching { c.notificationRepo.markRead(null) }
            val now = java.time.OffsetDateTime.now().toString()
            _state.update { s -> s.copy(items = s.items.map { if (it.readAt == null) it.copy(readAt = now) else it }) }
            c.notifications.setUnread(0)
        }
    }

    fun markRead(n: AppNotification) {
        if (n.isRead) return
        viewModelScope.launch {
            runCatching { c.notificationRepo.markRead(listOf(n.id)) }
            val now = java.time.OffsetDateTime.now().toString()
            _state.update { s -> s.copy(items = s.items.map { if (it.id == n.id) it.copy(readAt = now) else it }) }
            c.notifications.refreshUnread()
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(userId: String, contentPadding: PaddingValues, onOpenCampaign: (String) -> Unit) {
    val vm = appViewModel(key = "notifs-$userId") { NotificationsViewModel(it, userId) }
    val state by vm.state.collectAsState()
    val listState = rememberLazyListState()
    InfiniteScrollEffect(listState) { vm.loadMore() }
    PermissionRequester()

    PullToRefreshBox(isRefreshing = state.refreshing, onRefresh = { vm.refresh(pull = true) }, modifier = Modifier.fillMaxSize().padding(contentPadding)) {
        LazyColumn(Modifier.fillMaxSize(), state = listState, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (state.items.any { !it.isRead }) {
                item {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        TextButton(onClick = vm::markAllRead) {
                            Icon(Icons.Default.DoneAll, null); Spacer(Modifier.width(6.dp)); Text("Tout marquer comme lu")
                        }
                    }
                }
            }
            state.error?.let { item { ErrorBanner(it, onRetry = { vm.refresh() }) } }
            if (state.loading) item { LoadingBox() }
            else if (state.items.isEmpty() && state.error == null) {
                item { EmptyState(Icons.Default.NotificationsNone, "Aucune notification", "Vous serez averti des nouvelles campagnes et des objectifs atteints.") }
            }
            items(state.items, key = { it.id }) { n ->
                val campaignId = (n.data["campaign_id"] as? JsonPrimitive)?.contentOrNull
                AppCard(onClick = {
                    vm.markRead(n)
                    if (campaignId != null) onOpenCampaign(campaignId)
                }) {
                    Row(verticalAlignment = Alignment.Top) {
                        Box(
                            Modifier.padding(top = 6.dp).size(10.dp).clip(CircleShape)
                                .background(if (n.isRead) MaterialTheme.colorScheme.surfaceVariant else MaterialTheme.colorScheme.primary),
                        )
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(n.title, style = MaterialTheme.typography.titleSmall, fontWeight = if (n.isRead) FontWeight.Normal else FontWeight.Bold)
                            Text(n.body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(Modifier.height(4.dp))
                            Text(relativeTime(n.createdAt), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
                        }
                    }
                }
            }
            if (state.loadingMore) item { LoadingBox() }
        }
    }
}

/** Demande l'autorisation d'afficher des notifications (Android 13 et plus). */
@Composable
fun PermissionRequester() {
    if (Build.VERSION.SDK_INT < 33) return
    val context = LocalContext.current
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    LaunchedEffect(Unit) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
}

// =====================================================================
// Profil et réglages
// =====================================================================
@Composable
fun ProfileScreen(
    profile: Profile,
    contentPadding: PaddingValues,
    onChangePassword: () -> Unit,
    onOpenHistory: (() -> Unit)?,
    onOpenNotifications: (() -> Unit)?,
    onSignOut: () -> Unit,
) {
    val c = LocalContext.current.container
    val settings by c.prefs.settings.collectAsState()
    val pending by c.sync.state.collectAsState()
    var confirmSignOut by remember { mutableStateOf(false) }

    LazyColumn(Modifier.fillMaxSize().padding(contentPadding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            AppCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Avatar(profile.fullName, size = 56.dp)
                    Spacer(Modifier.width(14.dp))
                    Column {
                        Text(profile.fullName, style = MaterialTheme.typography.titleLarge)
                        Text("@${profile.username}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(profile.roleLabel, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                    }
                }
                profile.phone?.takeIf { it.isNotBlank() }?.let {
                    Spacer(Modifier.height(8.dp))
                    Text("Téléphone : $it", style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
        item {
            AppCard {
                SectionTitle("Compte")
                SettingLink(Icons.Default.Key, "Changer mon mot de passe", onChangePassword)
                onOpenHistory?.let { HorizontalDivider(); SettingLink(Icons.Default.History, "Mon historique", it) }
                onOpenNotifications?.let { HorizontalDivider(); SettingLink(Icons.Default.Notifications, "Mes notifications", it) }
            }
        }
        item {
            AppCard {
                SectionTitle("Réglages du compteur")
                SettingSwitch("Vibration à chaque appui", settings.vibration) { v -> c.prefs.update { it.copy(vibration = v) } }
                SettingSwitch("Compter avec les touches de volume", settings.volumeKeys) { v -> c.prefs.update { it.copy(volumeKeys = v) } }
                SettingSwitch("Garder l'écran allumé pendant le décompte", settings.keepScreenOn) { v -> c.prefs.update { it.copy(keepScreenOn = v) } }
                SettingSwitch("Afficher les notifications", settings.notifications) { v -> c.prefs.update { it.copy(notifications = v) } }
            }
        }
        item {
            AppCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Info, null, tint = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.width(10.dp))
                    Column {
                        Text("ANSAROUDINE ZIKR", style = MaterialTheme.typography.titleSmall)
                        Text("Version ${BuildConfig.VERSION_NAME}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("Vos données sont sauvegardées automatiquement et en toute sécurité.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
        item {
            TextButton(onClick = { confirmSignOut = true }, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.AutoMirrored.Filled.Logout, null, tint = Danger)
                Spacer(Modifier.width(8.dp))
                Text("Se déconnecter", color = Danger)
            }
        }
    }
    if (confirmSignOut) {
        val unsent = pending.ops.count { it.userId == profile.id }
        com.ansaroudine.zikr.ui.components.ConfirmDialog(
            title = "Se déconnecter ?",
            message = if (unsent > 0) "Certains décomptes ne sont pas encore envoyés. Ils seront conservés sur ce téléphone et envoyés à votre prochaine connexion."
            else "Vous pourrez vous reconnecter à tout moment ; toutes vos données sont conservées.",
            confirmLabel = "Se déconnecter",
            onConfirm = onSignOut,
            onDismiss = { confirmSignOut = false },
            destructive = true,
        )
    }
}

@Composable
private fun SettingLink(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit) {
    ListItem(
        headlineContent = { Text(label) },
        leadingContent = { Icon(icon, null) },
        modifier = Modifier.clickable(onClick = onClick),
        colors = ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.surface),
    )
}

@Composable
private fun SettingSwitch(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().clickable { onChange(!checked) }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onChange)
    }
}

@Composable
fun BackIcon(onBack: () -> Unit) {
    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Retour") }
}
