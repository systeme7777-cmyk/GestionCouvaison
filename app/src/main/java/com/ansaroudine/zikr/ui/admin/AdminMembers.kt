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
import androidx.compose.material.icons.filled.AdminPanelSettings
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.PersonRemove
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ansaroudine.zikr.AppContainer
import com.ansaroudine.zikr.data.Campaign
import com.ansaroudine.zikr.data.Participation
import com.ansaroudine.zikr.data.ParticipantGoal
import com.ansaroudine.zikr.data.Profile
import com.ansaroudine.zikr.ui.common.BackIcon
import com.ansaroudine.zikr.ui.common.EntriesList
import com.ansaroudine.zikr.ui.common.InfiniteScrollEffect
import com.ansaroudine.zikr.ui.common.PagedViewModel
import com.ansaroudine.zikr.ui.common.appViewModel
import com.ansaroudine.zikr.ui.components.AppCard
import com.ansaroudine.zikr.ui.components.Avatar
import com.ansaroudine.zikr.ui.components.ConfirmDialog
import com.ansaroudine.zikr.ui.components.EmptyState
import com.ansaroudine.zikr.ui.components.ErrorBanner
import com.ansaroudine.zikr.ui.components.LabeledProgress
import com.ansaroudine.zikr.ui.components.LoadingBox
import com.ansaroudine.zikr.ui.components.PasswordField
import com.ansaroudine.zikr.ui.components.PrimaryButton
import com.ansaroudine.zikr.ui.components.SearchField
import com.ansaroudine.zikr.ui.components.SectionTitle
import com.ansaroudine.zikr.ui.components.Tag
import com.ansaroudine.zikr.ui.theme.Danger
import com.ansaroudine.zikr.ui.theme.GoldDark
import com.ansaroudine.zikr.ui.theme.Success
import com.ansaroudine.zikr.ui.theme.Warning
import com.ansaroudine.zikr.util.USERNAME_REGEX
import com.ansaroudine.zikr.util.fmt
import com.ansaroudine.zikr.util.generatePassword
import com.ansaroudine.zikr.util.suggestUsername
import com.ansaroudine.zikr.util.toUserMessage
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

// =====================================================================
// Sélection des participants d'une campagne et attribution des objectifs
// =====================================================================
data class AssignState(
    val loading: Boolean = true,
    val saving: Boolean = false,
    val error: String? = null,
    val campaign: Campaign? = null,
    val members: List<Profile> = emptyList(),
    val existing: Map<String, Participation> = emptyMap(),
    /** userId -> objectif saisi (texte) pour les personnes cochées */
    val selected: Map<String, String> = emptyMap(),
    val saved: Boolean = false,
)

class AssignViewModel(private val c: AppContainer, private val campaignId: String) : ViewModel() {
    private val _state = MutableStateFlow(AssignState())
    val state = _state.asStateFlow()
    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val messages = _messages.asSharedFlow()

    init { load() }

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val camp = c.zikr.campaign(campaignId) ?: throw IllegalStateException("Campagne introuvable.")
                val members = c.admin.allActiveMembers()
                val existing = c.zikr.campaignParticipants(campaignId).associateBy { it.userId }
                _state.update {
                    it.copy(
                        loading = false, campaign = camp, members = members, existing = existing,
                        selected = existing.mapValues { (_, p) -> p.personalGoal.toString() },
                    )
                }
            } catch (e: Throwable) {
                _state.update { it.copy(loading = false, error = e.toUserMessage()) }
            }
        }
    }

    fun toggle(userId: String) = _state.update { s ->
        if (userId in s.selected) s.copy(selected = s.selected - userId)
        else s.copy(selected = s.selected + (userId to (s.existing[userId]?.personalGoal?.toString() ?: defaultGoal(s))))
    }

    private fun defaultGoal(s: AssignState): String {
        val values = s.selected.values.mapNotNull { it.toLongOrNull() }
        return values.lastOrNull()?.toString() ?: ""
    }

    fun setGoal(userId: String, text: String) = _state.update { it.copy(selected = it.selected + (userId to text.filter { ch -> ch.isDigit() }.take(12))) }

    fun selectAll(ids: List<String>) = _state.update { s ->
        val add = ids.filter { it !in s.selected }.associateWith { s.existing[it]?.personalGoal?.toString() ?: defaultGoal(s) }
        s.copy(selected = s.selected + add)
    }

    fun clear() = _state.update { it.copy(selected = emptyMap()) }

    fun applySameGoal(goal: Long) = _state.update { s -> s.copy(selected = s.selected.mapValues { goal.toString() }) }

    /** Répartit l'objectif global à parts égales (arrondi au supérieur pour atteindre au moins l'objectif). */
    fun distribute() = _state.update { s ->
        val camp = s.campaign ?: return@update s
        val n = s.selected.size
        if (n == 0) return@update s
        val each = (camp.globalGoal + n - 1) / n
        s.copy(selected = s.selected.mapValues { each.toString() })
    }

    fun save() {
        val s = _state.value
        val items = s.selected.map { (id, g) -> ParticipantGoal(id, g.toLongOrNull() ?: 0) }
        if (items.any { it.goal <= 0 }) {
            _state.update { it.copy(error = "Chaque participant coché doit avoir un objectif supérieur à zéro.") }
            return
        }
        _state.update { it.copy(saving = true, error = null) }
        viewModelScope.launch {
            try {
                val r = c.admin.setParticipants(campaignId, items)
                val added = r["ajoutes"]?.toString()?.toIntOrNull() ?: 0
                val updated = r["modifies"]?.toString()?.toIntOrNull() ?: 0
                val removed = r["retires"]?.toString()?.toIntOrNull() ?: 0
                _messages.emit("Enregistré : $added ajouté(s), $updated modifié(s), $removed retiré(s).")
                _state.update { it.copy(saving = false, saved = true) }
            } catch (e: Throwable) {
                _state.update { it.copy(saving = false, error = e.toUserMessage()) }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AssignParticipantsScreen(campaignId: String, onBack: () -> Unit, onDone: () -> Unit, onCreateMember: () -> Unit) {
    val vm = appViewModel(key = "assign-$campaignId") { AssignViewModel(it, campaignId) }
    val state by vm.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    var search by rememberSaveable { mutableStateOf("") }
    var onlySelected by rememberSaveable { mutableStateOf(false) }
    var sameGoalDialog by remember { mutableStateOf(false) }
    var confirmRemoval by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { vm.messages.collect { snackbar.showSnackbar(it) } }
    LaunchedEffect(state.saved) { if (state.saved) { delay(400); onDone() } }

    val filtered = state.members.filter { m ->
        (!onlySelected || m.id in state.selected) &&
            (search.isBlank() || m.fullName.contains(search.trim(), true) || m.username.contains(search.trim(), true) || (m.phone ?: "").contains(search.trim()))
    }
    val sumGoals = state.selected.values.sumOf { it.toLongOrNull() ?: 0 }
    val goal = state.campaign?.globalGoal ?: 0
    val removedWithCounts = state.existing.values.filter { it.userId !in state.selected && it.count > 0 }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Participants et objectifs")
                        state.campaign?.let { Text(it.title, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                    }
                },
                navigationIcon = { BackIcon(onBack) },
                actions = { IconButton(onClick = onCreateMember) { Icon(Icons.Default.PersonAdd, "Nouveau membre") } },
            )
        },
        bottomBar = {
            Surface(tonalElevation = 3.dp, shadowElevation = 8.dp) {
                Column(Modifier.fillMaxWidth().padding(16.dp).imePadding()) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("${state.selected.size} participant(s) coché(s)", style = MaterialTheme.typography.titleSmall)
                            Text(
                                "Total des objectifs : ${sumGoals.fmt()} / ${goal.fmt()}",
                                style = MaterialTheme.typography.bodySmall,
                                color = if (sumGoals >= goal) Success else Warning,
                                fontWeight = FontWeight.SemiBold,
                            )
                            if (sumGoals < goal && state.selected.isNotEmpty()) {
                                Text("Il manque ${(goal - sumGoals).fmt()} pour couvrir l'objectif global.", style = MaterialTheme.typography.labelSmall, color = Warning)
                            }
                        }
                    }
                    state.error?.let { Spacer(Modifier.height(8.dp)); ErrorBanner(it) }
                    Spacer(Modifier.height(8.dp))
                    PrimaryButton("Enregistrer", { if (removedWithCounts.isNotEmpty()) confirmRemoval = true else vm.save() }, loading = state.saving, enabled = !state.loading)
                }
            }
        },
    ) { padding ->
        if (state.loading) { LoadingBox(Modifier.padding(padding)); return@Scaffold }
        LazyColumn(
            Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item { SearchField(search, { search = it }, "Rechercher un membre") }
            item {
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(selected = onlySelected, onClick = { onlySelected = !onlySelected }, label = { Text("Cochés uniquement") })
                    AssistChip(onClick = { vm.selectAll(filtered.map { it.id }) }, label = { Text("Tout cocher") })
                    AssistChip(onClick = vm::clear, label = { Text("Tout décocher") })
                    AssistChip(onClick = { sameGoalDialog = true }, label = { Text("Même objectif pour tous") }, enabled = state.selected.isNotEmpty())
                    AssistChip(onClick = vm::distribute, label = { Text("Répartir l'objectif global") }, enabled = state.selected.isNotEmpty())
                }
            }
            if (state.members.isEmpty()) {
                item {
                    EmptyState(Icons.Default.Groups, "Aucun membre", "Créez d'abord des participants.") {
                        Button(onClick = onCreateMember) { Text("Créer un participant") }
                    }
                }
            }
            items(filtered, key = { it.id }) { m ->
                val checked = m.id in state.selected
                val existing = state.existing[m.id]
                AppCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = checked, onCheckedChange = { vm.toggle(m.id) })
                        Column(Modifier.weight(1f).clickable { vm.toggle(m.id) }) {
                            Text(m.fullName, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(
                                buildString {
                                    append("@${m.username}")
                                    if (m.isAdmin) append(" · Administrateur")
                                    existing?.let { append(" · déjà ${it.count.fmt()} réalisés") }
                                },
                                style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1, overflow = TextOverflow.Ellipsis,
                            )
                        }
                        if (checked) {
                            OutlinedTextField(
                                value = state.selected[m.id] ?: "",
                                onValueChange = { vm.setGoal(m.id, it) },
                                modifier = Modifier.width(118.dp),
                                singleLine = true,
                                label = { Text("Objectif") },
                                isError = (state.selected[m.id]?.toLongOrNull() ?: 0) <= 0,
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                textStyle = MaterialTheme.typography.bodyMedium,
                            )
                        }
                    }
                }
            }
        }
    }

    if (sameGoalDialog) {
        GoalDialog("tous les participants cochés", state.selected.values.firstNotNullOfOrNull { it.toLongOrNull() } ?: 100, onDismiss = { sameGoalDialog = false }) {
            vm.applySameGoal(it); sameGoalDialog = false
        }
    }
    if (confirmRemoval) {
        ConfirmDialog(
            "Retirer des participants ?",
            "${removedWithCounts.size} participant(s) décoché(s) ont déjà effectué des décomptes. Ils ne pourront plus compter, " +
                "mais leurs décomptes restent comptabilisés dans la campagne et dans l'historique.",
            "Confirmer", onConfirm = vm::save, onDismiss = { confirmRemoval = false },
        )
    }
}

// =====================================================================
// Liste des membres
// =====================================================================
class MembersViewModel(c: AppContainer, filter: String) : PagedViewModel<Profile>({ page ->
    c.admin.members(SearchHolder.value("members-$filter"), filter, page)
})

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MembersScreen(contentPadding: PaddingValues, isOwner: Boolean, onOpen: (String) -> Unit, onNew: () -> Unit) {
    var filter by rememberSaveable { mutableStateOf("all") }
    var search by rememberSaveable { mutableStateOf("") }
    val vm = appViewModel(key = "members-$filter") { MembersViewModel(it, filter) }
    val state by vm.state.collectAsState()
    val listState = rememberLazyListState()
    InfiniteScrollEffect(listState) { vm.loadMore() }
    LaunchedEffect(search, filter) {
        if (SearchHolder.value("members-$filter") != search) {
            SearchHolder.set("members-$filter", search)
            delay(300)
            vm.refresh()
        }
    }
    LaunchedEffect(Unit) { vm.refresh() }

    Box(Modifier.fillMaxSize().padding(contentPadding)) {
        Column(Modifier.fillMaxSize()) {
            Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                SearchField(search, { search = it }, "Rechercher par nom, identifiant ou téléphone")
                Spacer(Modifier.height(8.dp))
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("all" to "Tous", "participants" to "Participants", "admins" to "Administrateurs", "inactive" to "Désactivés").forEach { (k, l) ->
                        FilterChip(selected = filter == k, onClick = { filter = k }, label = { Text(l) })
                    }
                }
            }
            PullToRefreshBox(isRefreshing = state.refreshing, onRefresh = { vm.refresh(pull = true) }, modifier = Modifier.fillMaxSize()) {
                LazyColumn(
                    Modifier.fillMaxSize(), state = listState,
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 96.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    state.error?.let { item { ErrorBanner(it, onRetry = { vm.refresh() }) } }
                    if (state.loading) item { LoadingBox() }
                    else if (state.items.isEmpty() && state.error == null) {
                        item { EmptyState(Icons.Default.Groups, "Aucun membre trouvé", "Ajoutez des participants avec le bouton « Nouveau membre ».") }
                    }
                    items(state.items, key = { it.id }) { m -> MemberRow(m) { onOpen(m.id) } }
                    if (state.loadingMore) item { LoadingBox() }
                }
            }
        }
        ExtendedFloatingActionButton(
            onClick = onNew,
            icon = { Icon(Icons.Default.PersonAdd, null) },
            text = { Text(if (isOwner) "Nouveau membre" else "Nouveau participant") },
            modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp),
        )
    }
}

@Composable
fun MemberRow(m: Profile, onClick: () -> Unit) {
    AppCard(onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Avatar(m.fullName)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(m.fullName, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    "@${m.username}" + (m.phone?.takeIf { it.isNotBlank() }?.let { " · $it" } ?: ""),
                    style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                if (m.isAdmin) Tag(if (m.isOwner) "Principal" else "Admin", GoldDark.copy(alpha = 0.15f), GoldDark)
                if (!m.isActive) Tag("Désactivé", Danger.copy(alpha = 0.12f), Danger)
            }
        }
    }
}

// =====================================================================
// Création / modification d'un membre
// =====================================================================
data class MemberFormState(
    val loading: Boolean = false,
    val initialLoading: Boolean = false,
    val error: String? = null,
    val existing: Profile? = null,
    val savedId: String? = null,
    val createdPassword: String? = null,
)

class MemberFormViewModel(private val c: AppContainer, private val memberId: String?) : ViewModel() {
    private val _state = MutableStateFlow(MemberFormState(initialLoading = memberId != null))
    val state = _state.asStateFlow()

    init {
        if (memberId != null) viewModelScope.launch {
            try { _state.update { it.copy(initialLoading = false, existing = c.admin.member(memberId)) } }
            catch (e: Throwable) { _state.update { it.copy(initialLoading = false, error = e.toUserMessage()) } }
        }
    }

    fun save(fullName: String, username: String, phone: String, password: String, role: String) {
        val u = username.trim().lowercase()
        val error = when {
            fullName.trim().length < 2 -> "Le nom complet doit contenir au moins 2 caractères."
            !USERNAME_REGEX.matches(u) -> "L'identifiant doit contenir de 3 à 32 caractères : lettres minuscules sans accent, chiffres, point ou tiret."
            memberId == null && password.length < 6 -> "Le mot de passe doit contenir au moins 6 caractères."
            else -> null
        }
        if (error != null) { _state.update { it.copy(error = error) }; return }
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                if (memberId == null) {
                    val p = c.admin.createMember(fullName.trim(), u, phone.trim(), password, role)
                    _state.update { it.copy(loading = false, savedId = p.id, createdPassword = password, existing = p) }
                } else {
                    c.admin.updateMember(memberId, fullName.trim(), u, phone.trim())
                    _state.update { it.copy(loading = false, savedId = memberId) }
                }
            } catch (e: Throwable) {
                _state.update { it.copy(loading = false, error = e.toUserMessage()) }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MemberFormScreen(memberId: String?, isOwner: Boolean, onBack: () -> Unit, onSaved: (String) -> Unit) {
    val vm = appViewModel(key = "member-form-$memberId") { MemberFormViewModel(it, memberId) }
    val state by vm.state.collectAsState()
    var initialized by rememberSaveable { mutableStateOf(memberId == null) }
    var fullName by rememberSaveable { mutableStateOf("") }
    var username by rememberSaveable { mutableStateOf("") }
    var usernameEdited by rememberSaveable { mutableStateOf(memberId != null) }
    var phone by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf(generatePassword()) }
    var role by rememberSaveable { mutableStateOf(Profile.ROLE_PARTICIPANT) }

    LaunchedEffect(state.existing) {
        val e = state.existing
        if (!initialized && e != null) {
            fullName = e.fullName; username = e.username; phone = e.phone ?: ""; role = e.role
            initialized = true
        }
    }
    LaunchedEffect(state.savedId) { if (state.savedId != null && memberId != null) onSaved(state.savedId!!) }

    Scaffold(topBar = {
        TopAppBar(
            title = { Text(if (memberId == null) "Nouveau membre" else "Modifier le membre") },
            navigationIcon = { BackIcon(onBack) },
        )
    }) { padding ->
        if (state.initialLoading) { LoadingBox(Modifier.padding(padding)); return@Scaffold }
        Column(
            Modifier.fillMaxSize().padding(padding).imePadding().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (memberId == null && isOwner) {
                Text("Type de compte", style = MaterialTheme.typography.labelLarge)
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    SegmentedButton(
                        selected = role == Profile.ROLE_PARTICIPANT, onClick = { role = Profile.ROLE_PARTICIPANT },
                        shape = SegmentedButtonDefaults.itemShape(0, 2),
                    ) { Text("Participant") }
                    SegmentedButton(
                        selected = role == Profile.ROLE_ADMIN, onClick = { role = Profile.ROLE_ADMIN },
                        shape = SegmentedButtonDefaults.itemShape(1, 2),
                    ) { Text("Administrateur") }
                }
            }
            OutlinedTextField(
                value = fullName,
                onValueChange = { fullName = it.take(80); if (!usernameEdited) username = suggestUsername(it) },
                label = { Text("Nom complet") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
            )
            OutlinedTextField(
                value = username,
                onValueChange = { username = it.trim().lowercase().take(32); usernameEdited = true },
                label = { Text("Identifiant de connexion") },
                supportingText = { Text("Lettres minuscules sans accent, chiffres, point ou tiret (3 à 32)") },
                isError = username.isNotEmpty() && !USERNAME_REGEX.matches(username),
                singleLine = true, modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii, autoCorrectEnabled = false),
            )
            OutlinedTextField(
                value = phone, onValueChange = { phone = it.take(30) }, label = { Text("Téléphone (facultatif)") },
                singleLine = true, modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            )
            if (memberId == null) {
                PasswordField(password, { password = it }, "Mot de passe provisoire", supporting = "La personne devra le changer à sa première connexion")
                TextButton(onClick = { password = generatePassword() }) {
                    Icon(Icons.Default.Refresh, null); Spacer(Modifier.width(6.dp)); Text("Générer un autre mot de passe")
                }
            }
            state.error?.let { ErrorBanner(it) }
            PrimaryButton(if (memberId == null) "Créer le compte" else "Enregistrer", { vm.save(fullName, username, phone, password, role) }, loading = state.loading)
        }
    }

    // Après création : récapitulatif des identifiants à transmettre
    if (memberId == null && state.savedId != null && state.createdPassword != null) {
        AlertDialog(
            onDismissRequest = {},
            title = { Text("Compte créé") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Transmettez ces informations de connexion à ${state.existing?.fullName ?: "la personne"} :")
                    Surface(color = MaterialTheme.colorScheme.surfaceVariant, shape = MaterialTheme.shapes.small) {
                        Column(Modifier.padding(12.dp)) {
                            Text("Identifiant : ${state.existing?.username}", fontWeight = FontWeight.Bold)
                            Text("Mot de passe : ${state.createdPassword}", fontWeight = FontWeight.Bold)
                        }
                    }
                    Text("Le mot de passe devra être changé à la première connexion.", style = MaterialTheme.typography.bodySmall)
                }
            },
            confirmButton = { Button(onClick = { onSaved(state.savedId!!) }) { Text("Terminé") } },
        )
    }
}

// =====================================================================
// Fiche d'un membre
// =====================================================================
data class MemberDetailState(
    val loading: Boolean = true,
    val error: String? = null,
    val member: Profile? = null,
    val participations: List<Participation> = emptyList(),
    val busy: Boolean = false,
    val deleted: Boolean = false,
)

class MemberDetailViewModel(private val c: AppContainer, private val id: String) : ViewModel() {
    private val _state = MutableStateFlow(MemberDetailState())
    val state = _state.asStateFlow()
    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val messages = _messages.asSharedFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            try {
                val m = c.admin.member(id)
                val parts = runCatching { c.zikr.userParticipations(id) }.getOrDefault(emptyList())
                _state.update { it.copy(loading = false, member = m, participations = parts, error = if (m == null) "Membre introuvable." else null) }
            } catch (e: Throwable) {
                _state.update { it.copy(loading = false, error = e.toUserMessage()) }
            }
        }
    }

    private fun act(success: String, block: suspend () -> Unit) {
        _state.update { it.copy(busy = true) }
        viewModelScope.launch {
            try { block(); _messages.emit(success); load() }
            catch (e: Throwable) { _messages.emit(e.toUserMessage()) }
            finally { _state.update { it.copy(busy = false) } }
        }
    }

    fun setActive(active: Boolean) = act(if (active) "Compte réactivé." else "Compte désactivé.") { c.admin.setActive(id, active) }
    fun setRole(admin: Boolean) = act(if (admin) "Nommé administrateur." else "Droits d'administrateur retirés.") {
        c.admin.setRole(id, if (admin) Profile.ROLE_ADMIN else Profile.ROLE_PARTICIPANT)
    }
    fun resetPassword(pwd: String) = act("Mot de passe réinitialisé : $pwd") { c.admin.resetPassword(id, pwd) }
    fun delete() {
        _state.update { it.copy(busy = true) }
        viewModelScope.launch {
            try { c.admin.deleteMember(id); _state.update { it.copy(deleted = true) } }
            catch (e: Throwable) { _messages.emit(e.toUserMessage()); _state.update { it.copy(busy = false) } }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MemberDetailScreen(
    memberId: String,
    me: Profile,
    onBack: () -> Unit,
    onEdit: () -> Unit,
    onOpenCampaign: (String) -> Unit,
) {
    val vm = appViewModel(key = "member-$memberId") { MemberDetailViewModel(it, memberId) }
    val state by vm.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var confirm by remember { mutableStateOf<String?>(null) }
    var resetDialog by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { vm.messages.collect { snackbar.showSnackbar(it, withDismissAction = true) } }
    LaunchedEffect(state.deleted) { if (state.deleted) onBack() }

    val m = state.member
    val isSelf = m?.id == me.id
    val canManage = m != null && !isSelf && !m.isOwner && (!m.isAdmin || me.isOwner)

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = { Text(m?.fullName ?: "Membre", maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = { BackIcon(onBack) },
                actions = { if (canManage || (isSelf && m != null)) IconButton(onClick = onEdit) { Icon(Icons.Default.Edit, "Modifier") } },
            )
        },
    ) { padding ->
        if (state.loading) { LoadingBox(Modifier.padding(padding)); return@Scaffold }
        if (m == null) { Column(Modifier.padding(padding).padding(16.dp)) { ErrorBanner(state.error ?: "Membre introuvable.", onRetry = vm::load) }; return@Scaffold }

        Column(Modifier.fillMaxSize().padding(padding)) {
            PrimaryTabRow(selectedTabIndex = tab) {
                Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("Fiche") })
                Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Décomptes") })
            }
            if (tab == 1) {
                EntriesList(userId = memberId, campaignId = null, showUser = false)
                return@Column
            }
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                item {
                    AppCard {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Avatar(m.fullName, size = 56.dp)
                            Spacer(Modifier.width(14.dp))
                            Column(Modifier.weight(1f)) {
                                Text(m.fullName, style = MaterialTheme.typography.titleLarge)
                                Text("@${m.username}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(m.roleLabel, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
                            }
                            if (!m.isActive) Tag("Désactivé", Danger.copy(alpha = 0.12f), Danger)
                        }
                        m.phone?.takeIf { it.isNotBlank() }?.let { Spacer(Modifier.height(8.dp)); Text("Téléphone : $it") }
                    }
                }
                if (canManage) item {
                    AppCard {
                        SectionTitle("Actions")
                        ActionRow(Icons.Default.Key, "Réinitialiser le mot de passe") { resetDialog = true }
                        if (me.isOwner) {
                            HorizontalDivider()
                            if (m.isAdmin) ActionRow(Icons.Default.PersonRemove, "Retirer les droits d'administrateur") { confirm = "demote" }
                            else ActionRow(Icons.Default.AdminPanelSettings, "Nommer administrateur") { confirm = "promote" }
                        }
                        HorizontalDivider()
                        if (m.isActive) ActionRow(Icons.Default.Block, "Désactiver le compte") { confirm = "deactivate" }
                        else ActionRow(Icons.Default.CheckCircle, "Réactiver le compte") { vm.setActive(true) }
                        HorizontalDivider()
                        ActionRow(Icons.Default.Delete, "Supprimer le compte", danger = true) { confirm = "delete" }
                    }
                }
                item { SectionTitle("Participations (${state.participations.size})") }
                if (state.participations.isEmpty()) item {
                    Text("Ce membre ne participe à aucune campagne.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                items(state.participations, key = { it.campaignId }) { p ->
                    AppCard(onClick = { onOpenCampaign(p.campaignId) }) {
                        Text(p.campaigns?.title ?: "Campagne", style = MaterialTheme.typography.titleSmall)
                        Text(p.campaigns?.zikrType ?: "", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.height(8.dp))
                        LabeledProgress("Objectif personnel", p.count, p.personalGoal)
                    }
                }
            }
        }
    }

    confirm?.let { action ->
        val (title, msg, label, destructive) = when (action) {
            "promote" -> Quad("Nommer administrateur ?", "${m?.fullName} pourra gérer les campagnes et les participants.", "Nommer", false)
            "demote" -> Quad("Retirer les droits ?", "${m?.fullName} redeviendra simple participant.", "Retirer", true)
            "deactivate" -> Quad("Désactiver le compte ?", "${m?.fullName} ne pourra plus se connecter. Ses données sont conservées et le compte peut être réactivé.", "Désactiver", true)
            else -> Quad("Supprimer le compte ?", "Le compte de ${m?.fullName} sera supprimé définitivement. Ses décomptes restent conservés dans l'historique des campagnes.", "Supprimer", true)
        }
        ConfirmDialog(title, msg, label, onConfirm = {
            when (action) {
                "promote" -> vm.setRole(true)
                "demote" -> vm.setRole(false)
                "deactivate" -> vm.setActive(false)
                "delete" -> vm.delete()
            }
        }, onDismiss = { confirm = null }, destructive = destructive)
    }
    if (resetDialog) {
        var pwd by rememberSaveable { mutableStateOf(generatePassword()) }
        AlertDialog(
            onDismissRequest = { resetDialog = false },
            title = { Text("Nouveau mot de passe") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Communiquez ce mot de passe provisoire à ${m?.fullName}. Il devra le changer à sa prochaine connexion.")
                    PasswordField(pwd, { pwd = it }, "Mot de passe provisoire")
                    TextButton(onClick = { pwd = generatePassword() }) { Text("Générer un autre") }
                }
            },
            confirmButton = { Button(onClick = { vm.resetPassword(pwd); resetDialog = false }, enabled = pwd.length >= 6) { Text("Réinitialiser") } },
            dismissButton = { TextButton(onClick = { resetDialog = false }) { Text("Annuler") } },
        )
    }
}

private data class Quad(val a: String, val b: String, val c: String, val d: Boolean)

@Composable
private fun ActionRow(icon: ImageVector, label: String, danger: Boolean = false, onClick: () -> Unit) {
    ListItem(
        headlineContent = { Text(label, color = if (danger) Danger else MaterialTheme.colorScheme.onSurface) },
        leadingContent = { Icon(icon, null, tint = if (danger) Danger else MaterialTheme.colorScheme.primary) },
        modifier = Modifier.clickable(onClick = onClick),
        colors = ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.surface),
    )
}
