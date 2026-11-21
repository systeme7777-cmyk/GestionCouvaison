package com.ansaroudine.zikr.ui.admin

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.GroupAdd
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.VolunteerActivism
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ansaroudine.zikr.AppContainer
import com.ansaroudine.zikr.data.Campaign
import com.ansaroudine.zikr.data.CampaignPhase
import com.ansaroudine.zikr.data.DailyStat
import com.ansaroudine.zikr.data.Participation
import com.ansaroudine.zikr.sync.tableChanges
import com.ansaroudine.zikr.ui.common.AuditList
import com.ansaroudine.zikr.ui.common.BackIcon
import com.ansaroudine.zikr.ui.common.EntriesList
import com.ansaroudine.zikr.ui.common.InfiniteScrollEffect
import com.ansaroudine.zikr.ui.common.PagedViewModel
import com.ansaroudine.zikr.ui.common.appViewModel
import com.ansaroudine.zikr.ui.components.AppCard
import com.ansaroudine.zikr.ui.components.Avatar
import com.ansaroudine.zikr.ui.components.ConfirmDialog
import com.ansaroudine.zikr.ui.components.DailyBarChart
import com.ansaroudine.zikr.ui.components.EmptyState
import com.ansaroudine.zikr.ui.components.ErrorBanner
import com.ansaroudine.zikr.ui.components.LabeledProgress
import com.ansaroudine.zikr.ui.components.LoadingBox
import com.ansaroudine.zikr.ui.components.PhaseChip
import com.ansaroudine.zikr.ui.components.PrimaryButton
import com.ansaroudine.zikr.ui.components.ProgressRing
import com.ansaroudine.zikr.ui.components.SearchField
import com.ansaroudine.zikr.ui.components.SectionTitle
import com.ansaroudine.zikr.ui.components.goalColor
import com.ansaroudine.zikr.ui.theme.GoldDark
import com.ansaroudine.zikr.ui.theme.Success
import com.ansaroudine.zikr.util.dateLabel
import com.ansaroudine.zikr.util.fmt
import com.ansaroudine.zikr.util.fmtLong
import com.ansaroudine.zikr.util.percentOf
import com.ansaroudine.zikr.util.toUserMessage
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.decodeRecord
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

val ZIKR_SUGGESTIONS = listOf(
    "Astaghfirullah",
    "Salat Ala Nabi ﷺ",
    "La ilaha illa Allah",
    "SubhanAllah",
    "Alhamdoulillah",
    "Allahou Akbar",
    "Hasbunallah wa ni'mal wakil",
    "Ya Latif",
    "Lâ hawla wa lâ quwwata illâ billâh",
)

// =====================================================================
// Carte de campagne
// =====================================================================
@Composable
fun CampaignCard(c: Campaign, onClick: () -> Unit) {
    AppCard(onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(c.title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(c.zikrType, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary, maxLines = 1)
            }
            Spacer(Modifier.width(8.dp))
            PhaseChip(c.phase(), c.goalReached)
        }
        Spacer(Modifier.height(10.dp))
        LabeledProgress("Objectif global", c.totalCount, c.globalGoal, color = GoldDark)
        Spacer(Modifier.height(6.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Groups, null, modifier = Modifier.padding(end = 4.dp).height(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("${c.participantsCount} participants", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.width(12.dp))
            Icon(Icons.Default.CalendarMonth, null, modifier = Modifier.padding(end = 4.dp).height(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(
                c.startDate.dateLabel() + (c.endDate?.let { " → ${it.dateLabel()}" } ?: ""),
                style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

// =====================================================================
// Liste des campagnes
// =====================================================================
class CampaignListViewModel(private val c: AppContainer, private val filter: String) : PagedViewModel<Campaign>({ page ->
    c.zikr.campaigns(filter, SearchHolder.value(filter), page)
}) {
    init {
        viewModelScope.launch {
            c.client.tableChanges("campaigns").collect { action ->
                if (action is PostgresAction.Update) {
                    val camp = runCatching { action.decodeRecord<Campaign>() }.getOrNull() ?: return@collect
                    _state.update { s -> s.copy(items = s.items.map { if (it.id == camp.id) camp else it }) }
                } else refresh()
            }
        }
    }
}

/** Texte de recherche partagé entre l'écran et le chargement paginé. */
object SearchHolder {
    private val values = mutableMapOf<String, String>()
    fun value(key: String) = values[key] ?: ""
    fun set(key: String, v: String) { values[key] = v }
}

@OptIn(ExperimentalMaterial3Api::class, FlowPreview::class)
@Composable
fun CampaignsScreen(contentPadding: PaddingValues, onOpen: (String) -> Unit, onNew: () -> Unit) {
    var filter by rememberSaveable { mutableStateOf("active") }
    var search by rememberSaveable { mutableStateOf("") }
    val vm = appViewModel(key = "campaigns-$filter") { CampaignListViewModel(it, filter) }
    val state by vm.state.collectAsState()
    val listState = rememberLazyListState()
    InfiniteScrollEffect(listState) { vm.loadMore() }
    LaunchedEffect(search, filter) {
        if (SearchHolder.value(filter) != search) {
            SearchHolder.set(filter, search)
            delay(350)
            vm.refresh()
        }
    }

    Box(Modifier.fillMaxSize().padding(contentPadding)) {
        Column(Modifier.fillMaxSize()) {
            Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                SearchField(search, { search = it }, "Rechercher une campagne")
                Spacer(Modifier.height(8.dp))
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("active" to "En cours", "upcoming" to "À venir", "finished" to "Terminées", "all" to "Toutes").forEach { (k, label) ->
                        FilterChip(selected = filter == k, onClick = { filter = k }, label = { Text(label) })
                    }
                }
            }
            PullToRefreshBox(isRefreshing = state.refreshing, onRefresh = { vm.refresh(pull = true) }, modifier = Modifier.fillMaxSize()) {
                LazyColumn(
                    Modifier.fillMaxSize(), state = listState,
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 96.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    state.error?.let { item { ErrorBanner(it, onRetry = { vm.refresh() }) } }
                    if (state.loading) item { LoadingBox() }
                    else if (state.items.isEmpty() && state.error == null) {
                        item { EmptyState(Icons.Default.VolunteerActivism, "Aucune campagne", "Appuyez sur « Nouvelle campagne » pour commencer.") }
                    }
                    items(state.items, key = { it.id }) { c -> CampaignCard(c) { onOpen(c.id) } }
                    if (state.loadingMore) item { LoadingBox() }
                }
            }
        }
        ExtendedFloatingActionButton(
            onClick = onNew,
            icon = { Icon(Icons.Default.Add, null) },
            text = { Text("Nouvelle campagne") },
            modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp),
        )
    }
}

// =====================================================================
// Création / modification d'une campagne
// =====================================================================
data class CampaignFormState(
    val loading: Boolean = false,
    val initialLoading: Boolean = false,
    val error: String? = null,
    val savedId: String? = null,
    val existing: Campaign? = null,
)

class CampaignFormViewModel(private val c: AppContainer, private val campaignId: String?) : ViewModel() {
    private val _state = MutableStateFlow(CampaignFormState(initialLoading = campaignId != null))
    val state = _state.asStateFlow()

    init {
        if (campaignId != null) viewModelScope.launch {
            try {
                _state.update { it.copy(initialLoading = false, existing = c.zikr.campaign(campaignId)) }
            } catch (e: Throwable) {
                _state.update { it.copy(initialLoading = false, error = e.toUserMessage()) }
            }
        }
    }

    fun save(title: String, type: String, description: String, start: LocalDate, end: LocalDate?, goalText: String) {
        val goal = goalText.filter { it.isDigit() }.toLongOrNull()
        val error = when {
            title.trim().length < 2 -> "Le titre doit contenir au moins 2 caractères."
            type.isBlank() -> "Indiquez le type de Zikr."
            goal == null || goal <= 0 -> "L'objectif global doit être un nombre supérieur à zéro."
            end != null && end.isBefore(start) -> "La date de fin doit être postérieure ou égale à la date de début."
            else -> null
        }
        if (error != null) { _state.update { it.copy(error = error) }; return }
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val id = if (campaignId == null) {
                    c.admin.createCampaign(title.trim(), type.trim(), description.trim(), start, end, goal!!)
                } else {
                    c.admin.updateCampaign(campaignId, title.trim(), type.trim(), description.trim(), start, end, goal!!)
                    campaignId
                }
                _state.update { it.copy(loading = false, savedId = id) }
            } catch (e: Throwable) {
                _state.update { it.copy(loading = false, error = e.toUserMessage()) }
            }
        }
    }
}

private fun LocalDate.toUtcMillis(): Long = atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
private fun Long.toLocalDateUtc(): LocalDate = Instant.ofEpochMilli(this).atZone(ZoneOffset.UTC).toLocalDate()

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CampaignFormScreen(campaignId: String?, onBack: () -> Unit, onSaved: (id: String, isNew: Boolean) -> Unit) {
    val vm = appViewModel(key = "campaign-form-$campaignId") { CampaignFormViewModel(it, campaignId) }
    val state by vm.state.collectAsState()

    var initialized by rememberSaveable { mutableStateOf(campaignId == null) }
    var title by rememberSaveable { mutableStateOf("") }
    var type by rememberSaveable { mutableStateOf("") }
    var description by rememberSaveable { mutableStateOf("") }
    var start by rememberSaveable { mutableStateOf(LocalDate.now().toString()) }
    var end by rememberSaveable { mutableStateOf<String?>(null) }
    var hasEnd by rememberSaveable { mutableStateOf(false) }
    var goal by rememberSaveable { mutableStateOf("") }
    var pickStart by remember { mutableStateOf(false) }
    var pickEnd by remember { mutableStateOf(false) }

    LaunchedEffect(state.existing) {
        val e = state.existing
        if (!initialized && e != null) {
            title = e.title; type = e.zikrType; description = e.description ?: ""
            start = e.startDate; end = e.endDate; hasEnd = e.endDate != null; goal = e.globalGoal.toString()
            initialized = true
        }
    }
    LaunchedEffect(state.savedId) { state.savedId?.let { onSaved(it, campaignId == null) } }

    Scaffold(topBar = {
        TopAppBar(title = { Text(if (campaignId == null) "Nouvelle campagne" else "Modifier la campagne") }, navigationIcon = { BackIcon(onBack) })
    }) { padding ->
        if (state.initialLoading) { LoadingBox(Modifier.padding(padding)); return@Scaffold }
        Column(
            Modifier.fillMaxSize().padding(padding).imePadding().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedTextField(
                value = title, onValueChange = { title = it.take(120) }, label = { Text("Titre de la campagne") },
                singleLine = true, modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
            )
            OutlinedTextField(
                value = type, onValueChange = { type = it.take(120) }, label = { Text("Type de Zikr") },
                singleLine = true, modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
            )
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ZIKR_SUGGESTIONS.forEach { s -> AssistChip(onClick = { type = s }, label = { Text(s) }) }
            }
            OutlinedTextField(
                value = description, onValueChange = { description = it.take(2000) }, label = { Text("Description (facultative)") },
                minLines = 3, modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
            )
            OutlinedTextField(
                value = goal.toLongOrNull()?.fmt() ?: goal,
                onValueChange = { v -> goal = v.filter { it.isDigit() }.take(13) },
                label = { Text("Objectif global") },
                singleLine = true, modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            )
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(10_000L, 50_000L, 100_000L, 500_000L, 1_000_000L).forEach { g -> AssistChip(onClick = { goal = g.toString() }, label = { Text(g.fmt()) }) }
            }
            DateRow("Date de début", LocalDate.parse(start).fmtLong()) { pickStart = true }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Définir une date de fin", style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                Switch(checked = hasEnd, onCheckedChange = {
                    hasEnd = it
                    if (it && end == null) end = LocalDate.parse(start).plusDays(30).toString()
                })
            }
            if (hasEnd) DateRow("Date de fin", end?.let { LocalDate.parse(it).fmtLong() } ?: "—") { pickEnd = true }
            state.error?.let { ErrorBanner(it) }
            PrimaryButton(
                if (campaignId == null) "Créer et choisir les participants" else "Enregistrer les modifications",
                { vm.save(title, type, description, LocalDate.parse(start), if (hasEnd) end?.let { LocalDate.parse(it) } else null, goal) },
                loading = state.loading,
            )
        }
    }
    if (pickStart) DateDialog(LocalDate.parse(start), { start = it.toString(); pickStart = false }, { pickStart = false })
    if (pickEnd) DateDialog(end?.let { LocalDate.parse(it) } ?: LocalDate.parse(start), { end = it.toString(); pickEnd = false }, { pickEnd = false })
}

@Composable
private fun DateRow(label: String, value: String, onClick: () -> Unit) {
    OutlinedTextField(
        value = value, onValueChange = {}, readOnly = true, enabled = false,
        label = { Text(label) },
        trailingIcon = { Icon(Icons.Default.CalendarMonth, null) },
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        colors = androidx.compose.material3.OutlinedTextFieldDefaults.colors(
            disabledTextColor = MaterialTheme.colorScheme.onSurface,
            disabledLabelColor = MaterialTheme.colorScheme.onSurfaceVariant,
            disabledBorderColor = MaterialTheme.colorScheme.outline,
            disabledTrailingIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
        ),
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DateDialog(initial: LocalDate, onPick: (LocalDate) -> Unit, onDismiss: () -> Unit) {
    val pickerState = rememberDatePickerState(initialSelectedDateMillis = initial.toUtcMillis())
    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = { TextButton(onClick = { pickerState.selectedDateMillis?.let { onPick(it.toLocalDateUtc()) } }) { Text("Valider") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Annuler") } },
    ) { DatePicker(state = pickerState, title = { Text("Choisir une date", Modifier.padding(start = 24.dp, top = 16.dp)) }) }
}

// =====================================================================
// Détail d'une campagne (administrateur)
// =====================================================================
data class CampaignDetailState(
    val loading: Boolean = true,
    val error: String? = null,
    val campaign: Campaign? = null,
    val participants: List<Participation> = emptyList(),
    val daily: List<DailyStat> = emptyList(),
    val deleted: Boolean = false,
    val busy: Boolean = false,
)

class CampaignDetailViewModel(private val c: AppContainer, private val id: String) : ViewModel() {
    private val _state = MutableStateFlow(CampaignDetailState())
    val state = _state.asStateFlow()
    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val messages = _messages.asSharedFlow()
    private var dailyJob: Job? = null

    init {
        load()
        viewModelScope.launch {
            c.client.tableChanges("campaigns", "id", id).collect { action ->
                if (action is PostgresAction.Update) {
                    val camp = runCatching { action.decodeRecord<Campaign>() }.getOrNull() ?: return@collect
                    _state.update { it.copy(campaign = camp) }
                    refreshDailySoon()
                }
            }
        }
        viewModelScope.launch {
            c.client.tableChanges("campaign_participants", "campaign_id", id).collect { action ->
                when (action) {
                    is PostgresAction.Update -> {
                        val p = runCatching { action.decodeRecord<Participation>() }.getOrNull() ?: return@collect
                        if (p.removedAt != null) loadParticipants()
                        else _state.update { s ->
                            s.copy(participants = s.participants.map {
                                if (it.userId == p.userId) it.copy(count = p.count, personalGoal = p.personalGoal, completedAt = p.completedAt, lastEntryAt = p.lastEntryAt) else it
                            })
                        }
                    }
                    else -> loadParticipants()
                }
            }
        }
    }

    private fun refreshDailySoon() {
        if (dailyJob?.isActive == true) return
        dailyJob = viewModelScope.launch {
            delay(5_000)
            runCatching { c.zikr.dailyStats(id, 14) }.getOrNull()?.let { d -> _state.update { it.copy(daily = d) } }
        }
    }

    fun load() {
        viewModelScope.launch {
            try {
                val camp = c.zikr.campaign(id)
                if (camp == null) { _state.update { it.copy(loading = false, error = "Campagne introuvable.") }; return@launch }
                val parts = c.zikr.campaignParticipants(id)
                val daily = runCatching { c.zikr.dailyStats(id, 14) }.getOrDefault(emptyList())
                _state.update { it.copy(loading = false, error = null, campaign = camp, participants = parts, daily = daily) }
            } catch (e: Throwable) {
                _state.update { it.copy(loading = false, error = e.toUserMessage()) }
            }
        }
    }

    private fun loadParticipants() {
        viewModelScope.launch {
            runCatching { c.zikr.campaignParticipants(id) }.getOrNull()?.let { p -> _state.update { it.copy(participants = p) } }
            runCatching { c.zikr.campaign(id) }.getOrNull()?.let { camp -> _state.update { it.copy(campaign = camp) } }
        }
    }

    private fun act(success: String, block: suspend () -> Unit) {
        _state.update { it.copy(busy = true) }
        viewModelScope.launch {
            try {
                block(); _messages.emit(success)
            } catch (e: Throwable) {
                _messages.emit(e.toUserMessage())
            } finally {
                _state.update { it.copy(busy = false) }
            }
        }
    }

    fun setStatus(closed: Boolean) = act(if (closed) "Campagne clôturée." else "Campagne rouverte.") {
        c.admin.setCampaignStatus(id, if (closed) Campaign.STATUS_CLOSED else Campaign.STATUS_ACTIVE)
        loadParticipants()
    }

    fun delete() = act("Campagne supprimée.") {
        c.admin.deleteCampaign(id)
        _state.update { it.copy(deleted = true) }
    }

    fun updateGoal(userId: String, goal: Long) = act("Objectif mis à jour.") {
        c.admin.updateGoal(id, userId, goal)
        loadParticipants()
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CampaignDetailScreen(
    campaignId: String,
    onBack: () -> Unit,
    onEdit: () -> Unit,
    onManageParticipants: () -> Unit,
    onOpenMember: (String) -> Unit,
) {
    val vm = appViewModel(key = "campaign-$campaignId") { CampaignDetailViewModel(it, campaignId) }
    val state by vm.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    var menu by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var confirmClose by remember { mutableStateOf(false) }
    var editGoal by remember { mutableStateOf<Participation?>(null) }
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var search by rememberSaveable { mutableStateOf("") }
    var sortByProgress by rememberSaveable { mutableStateOf(true) }

    LaunchedEffect(Unit) { vm.messages.collect { snackbar.showSnackbar(it) } }
    LaunchedEffect(state.deleted) { if (state.deleted) onBack() }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = { Text(state.campaign?.title ?: "Campagne", maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = { BackIcon(onBack) },
                actions = {
                    IconButton(onClick = onEdit) { Icon(Icons.Default.Edit, "Modifier") }
                    IconButton(onClick = { menu = true }) { Icon(Icons.Default.MoreVert, "Plus d'actions") }
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        val closed = state.campaign?.status == Campaign.STATUS_CLOSED
                        DropdownMenuItem(
                            text = { Text(if (closed) "Rouvrir la campagne" else "Clôturer la campagne") },
                            leadingIcon = { Icon(if (closed) Icons.Default.LockOpen else Icons.Default.Lock, null) },
                            onClick = { menu = false; if (closed) vm.setStatus(false) else confirmClose = true },
                        )
                        DropdownMenuItem(
                            text = { Text("Supprimer") },
                            leadingIcon = { Icon(Icons.Default.Delete, null) },
                            onClick = { menu = false; confirmDelete = true },
                        )
                    }
                },
            )
        },
        floatingActionButton = {
            if (tab == 0) ExtendedFloatingActionButton(onClick = onManageParticipants, icon = { Icon(Icons.Default.GroupAdd, null) }, text = { Text("Participants") })
        },
    ) { padding ->
        val camp = state.campaign
        if (state.loading) { LoadingBox(Modifier.padding(padding)); return@Scaffold }
        if (camp == null) { Column(Modifier.padding(padding).padding(16.dp)) { ErrorBanner(state.error ?: "Campagne introuvable.", onRetry = vm::load) }; return@Scaffold }

        Column(Modifier.fillMaxSize().padding(padding)) {
            PrimaryTabRow(selectedTabIndex = tab) {
                Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("Suivi") })
                Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Décomptes") })
                Tab(selected = tab == 2, onClick = { tab = 2 }, text = { Text("Journal") })
            }
            when (tab) {
                1 -> EntriesList(userId = null, campaignId = campaignId, showUser = true)
                2 -> AuditList(mode = "campaign", id = campaignId)
                else -> {
                    val sumGoals = state.participants.sumOf { it.personalGoal }
                    val completed = state.participants.count { it.count >= it.personalGoal }
                    val visible = state.participants
                        .filter { search.isBlank() || it.profiles?.fullName?.contains(search.trim(), ignoreCase = true) == true || it.profiles?.username?.contains(search.trim(), ignoreCase = true) == true }
                        .let { list -> if (sortByProgress) list.sortedByDescending { it.count.toDouble() / it.personalGoal.coerceAtLeast(1) } else list.sortedBy { it.profiles?.fullName?.lowercase() } }

                    LazyColumn(
                        Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 96.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        item {
                            AppCard {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    ProgressRing(camp.progress, size = 96.dp, stroke = 10.dp, color = if (camp.goalReached) Success else GoldDark) {
                                        Text("${percentOf(camp.totalCount, camp.globalGoal)} %", style = MaterialTheme.typography.titleMedium)
                                    }
                                    Spacer(Modifier.width(16.dp))
                                    Column(Modifier.weight(1f)) {
                                        Text(camp.zikrType, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
                                        Text("${camp.totalCount.fmt()} / ${camp.globalGoal.fmt()}", style = MaterialTheme.typography.titleLarge)
                                        Text(
                                            if (camp.goalReached) "Objectif global atteint" else "Reste ${camp.remaining.fmt()}",
                                            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                        Spacer(Modifier.height(4.dp))
                                        PhaseChip(camp.phase(), camp.goalReached)
                                    }
                                }
                                Spacer(Modifier.height(12.dp))
                                HorizontalDivider()
                                Spacer(Modifier.height(8.dp))
                                InfoLine("Période", camp.startDate.dateLabel() + (camp.endDate?.let { " → ${it.dateLabel()}" } ?: " · sans date de fin"))
                                InfoLine("Participants", "${state.participants.size} (dont $completed ont atteint leur objectif)")
                                InfoLine("Total des objectifs individuels", sumGoals.fmt())
                                if (sumGoals < camp.globalGoal && state.participants.isNotEmpty()) {
                                    Text(
                                        "Attention : la somme des objectifs individuels est inférieure à l'objectif global (il manque ${(camp.globalGoal - sumGoals).fmt()}).",
                                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error,
                                    )
                                }
                                camp.description?.takeIf { it.isNotBlank() }?.let {
                                    Spacer(Modifier.height(6.dp))
                                    Text(it, style = MaterialTheme.typography.bodySmall)
                                }
                            }
                        }
                        if (state.daily.isNotEmpty()) item {
                            AppCard {
                                Text("Progression des 14 derniers jours", style = MaterialTheme.typography.titleSmall)
                                Spacer(Modifier.height(10.dp))
                                DailyBarChart(state.daily)
                            }
                        }
                        item {
                            SectionTitle("Participants") {
                                TextButton(onClick = { sortByProgress = !sortByProgress }) { Text(if (sortByProgress) "Tri : avancement" else "Tri : nom") }
                            }
                        }
                        if (state.participants.size > 6) item { SearchField(search, { search = it }, "Rechercher un participant") }
                        if (state.participants.isEmpty()) {
                            item {
                                EmptyState(Icons.Default.Groups, "Aucun participant", "Cochez les participants qui prendront part à cette campagne.") {
                                    Button(onClick = onManageParticipants) { Text("Choisir les participants") }
                                }
                            }
                        }
                        items(visible, key = { it.userId }) { p ->
                            ParticipantProgressRow(p, onClick = { onOpenMember(p.userId) }, onEditGoal = { editGoal = p })
                        }
                    }
                }
            }
        }
    }

    if (confirmDelete) ConfirmDialog(
        "Supprimer la campagne ?",
        "La suppression n'est possible que si aucun décompte n'a encore été enregistré. Sinon, clôturez la campagne : tout l'historique sera conservé.",
        "Supprimer", onConfirm = vm::delete, onDismiss = { confirmDelete = false }, destructive = true,
    )
    if (confirmClose) ConfirmDialog(
        "Clôturer la campagne ?",
        "Les participants ne pourront plus ajouter de décomptes. Vous pourrez la rouvrir à tout moment.",
        "Clôturer", onConfirm = { vm.setStatus(true) }, onDismiss = { confirmClose = false },
    )
    editGoal?.let { p ->
        GoalDialog(p.profiles?.fullName ?: "", p.personalGoal, onDismiss = { editGoal = null }) { g -> vm.updateGoal(p.userId, g); editGoal = null }
    }
}

@Composable
private fun InfoLine(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
        Text(value, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
fun ParticipantProgressRow(p: Participation, onClick: () -> Unit, onEditGoal: () -> Unit) {
    val name = p.profiles?.fullName ?: "Participant"
    AppCard(onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Avatar(name, size = 38.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(name, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    "Réalisé ${p.count.fmt()} · Objectif ${p.personalGoal.fmt()} · Reste ${p.remaining.fmt()}",
                    style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
            Text("${p.percent} %", style = MaterialTheme.typography.titleSmall, color = goalColor(p.count, p.personalGoal))
            IconButton(onClick = onEditGoal) { Icon(Icons.Default.Edit, "Modifier l'objectif") }
        }
        androidx.compose.material3.LinearProgressIndicator(
            progress = { p.progress },
            modifier = Modifier.fillMaxWidth().padding(top = 6.dp).height(6.dp),
            color = goalColor(p.count, p.personalGoal),
            trackColor = MaterialTheme.colorScheme.surfaceVariant,
            drawStopIndicator = {},
            gapSize = 0.dp,
        )
    }
}

@Composable
fun GoalDialog(name: String, current: Long, onDismiss: () -> Unit, onSave: (Long) -> Unit) {
    var text by rememberSaveable { mutableStateOf(current.toString()) }
    val value = text.toLongOrNull()
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Objectif de $name") },
        text = {
            OutlinedTextField(
                value = text, onValueChange = { v -> text = v.filter { it.isDigit() }.take(12) },
                label = { Text("Objectif personnel") }, singleLine = true,
                isError = value == null || value <= 0,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            )
        },
        confirmButton = { Button(onClick = { value?.let(onSave) }, enabled = value != null && value > 0) { Text("Enregistrer") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Annuler") } },
    )
}

