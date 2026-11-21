package com.ansaroudine.zikr.ui.participant

import android.view.HapticFeedbackConstants
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Undo
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.CloudSync
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ansaroudine.zikr.AppContainer
import com.ansaroudine.zikr.container
import com.ansaroudine.zikr.data.Campaign
import com.ansaroudine.zikr.data.CampaignPhase
import com.ansaroudine.zikr.data.DailyStat
import com.ansaroudine.zikr.data.Participation
import com.ansaroudine.zikr.sync.CounterQueue
import com.ansaroudine.zikr.sync.SyncStatus
import com.ansaroudine.zikr.sync.tableChanges
import com.ansaroudine.zikr.ui.common.appViewModel
import com.ansaroudine.zikr.ui.components.AppCard
import com.ansaroudine.zikr.ui.components.DailyBarChart
import com.ansaroudine.zikr.ui.components.ErrorBanner
import com.ansaroudine.zikr.ui.components.LabeledProgress
import com.ansaroudine.zikr.ui.components.LoadingBox
import com.ansaroudine.zikr.ui.components.PhaseChip
import com.ansaroudine.zikr.ui.components.ProgressRing
import com.ansaroudine.zikr.ui.theme.CounterNumberStyle
import com.ansaroudine.zikr.ui.theme.Emerald
import com.ansaroudine.zikr.ui.theme.EmeraldDark
import com.ansaroudine.zikr.ui.theme.Gold
import com.ansaroudine.zikr.ui.theme.GoldDark
import com.ansaroudine.zikr.ui.theme.Success
import com.ansaroudine.zikr.util.dateLabel
import com.ansaroudine.zikr.util.fmt
import com.ansaroudine.zikr.util.percentOf
import com.ansaroudine.zikr.util.toUserMessage
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.decodeRecord
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Appuis sur les touches de volume, relayés par l'activité lorsque l'option est activée. */
object VolumeKeyBus {
    @Volatile var counterVisible: Boolean = false
    val presses = MutableSharedFlow<Unit>(extraBufferCapacity = 64)
}

data class CounterUi(
    val loading: Boolean = true,
    val error: String? = null,
    val campaign: Campaign? = null,
    val participation: Participation? = null,
    val personal: Long = 0,
    val personalGoal: Long = 0,
    val total: Long = 0,
    val globalGoal: Long = 0,
    val canUndo: Boolean = false,
    val sync: SyncStatus = SyncStatus.SYNCED,
    val daily: List<DailyStat> = emptyList(),
)

private data class CounterBase(
    val loading: Boolean = true,
    val error: String? = null,
    val campaign: Campaign? = null,
    val participation: Participation? = null,
    val daily: List<DailyStat> = emptyList(),
)

class CounterViewModel(private val c: AppContainer, private val campaignId: String, private val userId: String) : ViewModel() {
    private val base = MutableStateFlow(CounterBase())
    private val _events = MutableSharedFlow<String>(extraBufferCapacity = 8)
    val events = _events.asSharedFlow()
    private val _goalReached = MutableSharedFlow<Long>(extraBufferCapacity = 2)
    val goalReached = _goalReached.asSharedFlow()

    val ui: StateFlow<CounterUi> = combine(base, c.sync.state, c.sync.status) { b, q, status ->
        val snap = q.snapshots[campaignId]
        val pending = CounterQueue.pendingSum(q, userId, campaignId)
        CounterUi(
            loading = b.loading,
            error = b.error,
            campaign = b.campaign,
            participation = b.participation,
            personal = (snap?.personalCount ?: b.participation?.count ?: 0) + pending,
            personalGoal = snap?.personalGoal ?: b.participation?.personalGoal ?: 0,
            total = (snap?.campaignTotal ?: b.campaign?.totalCount ?: 0) + pending,
            globalGoal = snap?.globalGoal ?: b.campaign?.globalGoal ?: 0,
            canUndo = q.undo[campaignId].orEmpty().isNotEmpty(),
            sync = status,
            daily = b.daily,
        )
    }.stateIn(viewModelScope, SharingStarted.Eagerly, CounterUi())

    init {
        load()
        viewModelScope.launch {
            c.client.tableChanges("campaigns", "id", campaignId).collect { action ->
                if (action is PostgresAction.Update) {
                    val camp = runCatching { action.decodeRecord<Campaign>() }.getOrNull() ?: return@collect
                    base.update { it.copy(campaign = camp) }
                    c.sync.mergeSnapshot(campaignId, campaignTotal = camp.totalCount, globalGoal = camp.globalGoal, updatedAt = camp.updatedAt)
                }
            }
        }
        viewModelScope.launch {
            c.client.tableChanges("campaign_participants", "user_id", userId).collect { action ->
                if (action is PostgresAction.Update) {
                    val p = runCatching { action.decodeRecord<Participation>() }.getOrNull() ?: return@collect
                    if (p.campaignId != campaignId) return@collect
                    if (p.removedAt != null) { load(); return@collect }
                    base.update { it.copy(participation = it.participation?.copy(personalGoal = p.personalGoal, count = p.count) ?: p) }
                    c.sync.mergeSnapshot(campaignId, personalCount = p.count, personalGoal = p.personalGoal, updatedAt = p.updatedAt)
                }
            }
        }
        viewModelScope.launch { c.sync.invalidated.collect { if (it == campaignId) load() } }
    }

    fun load() {
        viewModelScope.launch {
            try {
                val p = c.zikr.participation(campaignId, userId)
                val camp = p?.campaigns ?: c.zikr.campaign(campaignId)
                if (p == null || p.removedAt != null || camp == null) {
                    base.value = CounterBase(loading = false, error = "Vous ne participez plus à cette campagne.")
                    return@launch
                }
                c.sync.resetSnapshot(campaignId, p.count, p.personalGoal, camp.totalCount, camp.globalGoal, camp.updatedAt)
                base.update { it.copy(loading = false, error = null, campaign = camp, participation = p) }
                val daily = runCatching { c.zikr.dailyStats(campaignId, 7) }.getOrDefault(emptyList())
                base.update { it.copy(daily = daily) }
            } catch (e: Throwable) {
                base.update { it.copy(loading = false, error = if (it.campaign == null) e.toUserMessage() else null) }
                if (base.value.campaign != null) _events.tryEmit(e.toUserMessage())
            }
        }
    }

    fun add(amount: Int) {
        val before = ui.value
        if (before.campaign?.phase() != CampaignPhase.ACTIVE) return
        c.sync.add(campaignId, amount)
        if (before.personalGoal > 0 && before.personal < before.personalGoal && before.personal + amount >= before.personalGoal) {
            _goalReached.tryEmit(before.personalGoal)
        }
    }

    fun undo() {
        val undone = c.sync.undo(campaignId)
        if (undone == null) _events.tryEmit("Rien à annuler.")
        else _events.tryEmit("Dernier ajout annulé (−${undone.toLong().fmt()}).")
    }

    fun correct(amount: Int) {
        val current = ui.value.personal
        if (amount > current) {
            _events.tryEmit("Vous ne pouvez pas retirer plus que votre total (${current.fmt()}).")
            return
        }
        c.sync.add(campaignId, -amount)
        _events.tryEmit("Correction de −${amount.toLong().fmt()} enregistrée.")
    }

    fun retrySync() = c.sync.scheduleFlush()
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CounterScreen(campaignId: String, userId: String, onBack: () -> Unit) {
    val vm = appViewModel(key = "counter-$campaignId") { CounterViewModel(it, campaignId, userId) }
    val ui by vm.ui.collectAsState()
    val container = androidx.compose.ui.platform.LocalContext.current.container
    val settings by container.prefs.settings.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    val view = LocalView.current
    var showCustom by rememberSaveable { mutableStateOf(false) }
    var celebrate by remember { mutableStateOf<Long?>(null) }

    LaunchedEffect(Unit) { vm.events.collect { snackbar.showSnackbar(it) } }
    LaunchedEffect(Unit) {
        vm.goalReached.collect {
            celebrate = it
            view.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
        }
    }
    DisposableEffect(settings.keepScreenOn) {
        view.keepScreenOn = settings.keepScreenOn
        VolumeKeyBus.counterVisible = settings.volumeKeys
        onDispose {
            view.keepScreenOn = false
            VolumeKeyBus.counterVisible = false
        }
    }
    val active = ui.campaign?.phase() == CampaignPhase.ACTIVE

    fun tap(amount: Int) {
        if (!active) return
        if (settings.vibration) view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
        vm.add(amount)
    }
    LaunchedEffect(settings.volumeKeys, active) {
        if (settings.volumeKeys && active) VolumeKeyBus.presses.collect { tap(1) }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(ui.campaign?.title ?: "Campagne", maxLines = 1, overflow = TextOverflow.Ellipsis)
                        ui.campaign?.let {
                            Text(it.zikrType, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                        }
                    }
                },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Retour") } },
                actions = { SyncIndicator(ui.sync, vm::retrySync) },
            )
        },
    ) { padding ->
        if (ui.loading) { LoadingBox(Modifier.padding(padding)); return@Scaffold }
        if (ui.campaign == null) {
            Column(Modifier.padding(padding).padding(16.dp)) { ErrorBanner(ui.error ?: "Campagne introuvable.", onRetry = vm::load) }
            return@Scaffold
        }
        val campaign = ui.campaign!!
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(4.dp))
            if (!active) ClosedBanner(campaign)

            // Compteur personnel
            ProgressRing(
                progress = if (ui.personalGoal > 0) ui.personal.toFloat() / ui.personalGoal else 0f,
                size = 220.dp,
                stroke = 16.dp,
                color = if (ui.personal >= ui.personalGoal && ui.personalGoal > 0) Success else MaterialTheme.colorScheme.primary,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(ui.personal.fmt(), style = CounterNumberStyle.copy(fontSize = if (ui.personal >= 1_000_000) 38.sp else 52.sp))
                    Text("sur ${ui.personalGoal.fmt()}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "${percentOf(ui.personal, ui.personalGoal)} %",
                        style = MaterialTheme.typography.titleMedium,
                        color = if (ui.personal >= ui.personalGoal) Success else MaterialTheme.colorScheme.primary,
                    )
                }
            }
            Spacer(Modifier.height(6.dp))
            Text(
                if (ui.personal >= ui.personalGoal && ui.personalGoal > 0) "Objectif personnel atteint, Machallah !"
                else "Il vous reste ${(ui.personalGoal - ui.personal).coerceAtLeast(0).fmt()} pour atteindre votre objectif",
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(18.dp))

            BigCounterButton(enabled = active) { tap(1) }

            Spacer(Modifier.height(18.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(10, 33, 100).forEach { n ->
                    FilledTonalButton(
                        onClick = { tap(n) },
                        enabled = active,
                        modifier = Modifier.weight(1f).height(52.dp),
                        shape = RoundedCornerShape(14.dp),
                    ) { Text("+$n", style = MaterialTheme.typography.titleMedium) }
                }
                FilledTonalButton(
                    onClick = { showCustom = true },
                    enabled = active,
                    modifier = Modifier.weight(1f).height(52.dp),
                    shape = RoundedCornerShape(14.dp),
                ) { Icon(Icons.Default.Edit, "Valeur personnalisée") }
            }
            Spacer(Modifier.height(10.dp))
            OutlinedButton(
                onClick = vm::undo,
                enabled = active && ui.canUndo,
                modifier = Modifier.fillMaxWidth().height(50.dp),
                shape = RoundedCornerShape(14.dp),
            ) {
                Icon(Icons.AutoMirrored.Filled.Undo, null)
                Spacer(Modifier.width(8.dp))
                Text("Annuler le dernier ajout")
            }

            Spacer(Modifier.height(18.dp))
            AppCard {
                LabeledProgress("Progression globale de la campagne", ui.total, ui.globalGoal, color = GoldDark)
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    PhaseChip(campaign.phase(), ui.total >= ui.globalGoal)
                    Spacer(Modifier.width(8.dp))
                    Text(
                        "${campaign.participantsCount} participants",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(Modifier.height(6.dp))
                Text(
                    buildString {
                        append("Du ${campaign.startDate.dateLabel()}")
                        campaign.endDate?.let { append(" au ${it.dateLabel()}") } ?: append(" · sans date de fin")
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                campaign.description?.takeIf { it.isNotBlank() }?.let {
                    Spacer(Modifier.height(8.dp))
                    Text(it, style = MaterialTheme.typography.bodySmall)
                }
            }
            if (ui.daily.isNotEmpty()) {
                Spacer(Modifier.height(12.dp))
                AppCard {
                    Text("Mes 7 derniers jours", style = MaterialTheme.typography.titleSmall)
                    Spacer(Modifier.height(10.dp))
                    DailyBarChart(ui.daily)
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }

    if (showCustom) {
        CustomAmountDialog(
            onDismiss = { showCustom = false },
            onAdd = { tap(it); showCustom = false },
            onCorrect = { vm.correct(it); showCustom = false },
        )
    }
    celebrate?.let { goal ->
        AlertDialog(
            onDismissRequest = { celebrate = null },
            title = { Text("Machallah ! 🎉") },
            text = { Text("Vous avez atteint votre objectif de ${goal.fmt()} ${campaignTypeOf(ui.campaign)}. Qu'Allah l'accepte et vous récompense. Vous pouvez continuer si vous le souhaitez.") },
            confirmButton = { Button(onClick = { celebrate = null }) { Text("Amine") } },
        )
    }
}

private fun campaignTypeOf(c: Campaign?): String = c?.zikrType ?: ""

@Composable
private fun BigCounterButton(enabled: Boolean, onTap: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.93f else 1f, spring(stiffness = 900f), label = "bouton")
    Box(
        Modifier
            .size(190.dp)
            .scale(scale)
            .clip(CircleShape)
            .background(
                if (enabled) Brush.radialGradient(listOf(Emerald.copy(alpha = 0.9f), EmeraldDark))
                else Brush.radialGradient(listOf(Color.Gray, Color.DarkGray))
            )
            .clickable(interactionSource = interaction, indication = androidx.compose.material3.ripple(color = Gold), enabled = enabled, onClick = onTap)
            .semantics { contentDescription = "Ajouter un" },
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.size(170.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.06f)))
        Text("+1", color = Color.White, fontSize = 64.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun ClosedBanner(campaign: Campaign) {
    val phase = campaign.phase()
    val text = when (phase) {
        CampaignPhase.UPCOMING -> "Cette campagne commencera le ${campaign.startDate.dateLabel()}."
        CampaignPhase.ENDED -> "Cette campagne est terminée depuis le ${campaign.endDate?.dateLabel()}."
        CampaignPhase.CLOSED -> "Cette campagne a été clôturée par un administrateur."
        else -> ""
    }
    Surface(color = MaterialTheme.colorScheme.secondaryContainer, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Lock, null, tint = MaterialTheme.colorScheme.onSecondaryContainer)
            Spacer(Modifier.width(10.dp))
            Text(text, color = MaterialTheme.colorScheme.onSecondaryContainer, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
fun SyncIndicator(status: SyncStatus, onRetry: () -> Unit) {
    val (icon, label, tint) = when (status) {
        SyncStatus.SYNCED -> Triple(Icons.Default.CloudDone, "Synchronisé", Success)
        SyncStatus.PENDING, SyncStatus.SYNCING -> Triple(Icons.Default.CloudSync, "Envoi…", MaterialTheme.colorScheme.primary)
        SyncStatus.OFFLINE -> Triple(Icons.Default.CloudOff, "Hors ligne", MaterialTheme.colorScheme.error)
    }
    Row(
        Modifier.clip(RoundedCornerShape(50)).clickable(onClick = onRetry).padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = tint, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(4.dp))
        Text(label, style = MaterialTheme.typography.labelSmall, color = tint)
    }
}

@Composable
private fun CustomAmountDialog(onDismiss: () -> Unit, onAdd: (Int) -> Unit, onCorrect: (Int) -> Unit) {
    var text by rememberSaveable { mutableStateOf("") }
    var correction by rememberSaveable { mutableStateOf(false) }
    val value = text.toIntOrNull()
    val valid = value != null && value in 1..100_000
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (correction) "Corriger mon total" else "Ajouter une valeur") },
        text = {
            Column {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(selected = !correction, onClick = { correction = false }, label = { Text("Ajouter") })
                    FilterChip(selected = correction, onClick = { correction = true }, label = { Text("Retirer (erreur)") })
                }
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = text,
                    onValueChange = { v -> text = v.filter { it.isDigit() }.take(6) },
                    label = { Text("Nombre") },
                    singleLine = true,
                    isError = text.isNotEmpty() && !valid,
                    supportingText = { Text("Entre 1 et 100 000") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(4.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf(7, 11, 99, 313, 1000).forEach { n ->
                        Text(
                            "$n",
                            modifier = Modifier.clip(RoundedCornerShape(8.dp))
                                .background(MaterialTheme.colorScheme.surfaceVariant)
                                .clickable { text = n.toString() }
                                .padding(horizontal = 10.dp, vertical = 6.dp),
                            style = MaterialTheme.typography.labelLarge,
                        )
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = { if (valid) { if (correction) onCorrect(value!!) else onAdd(value!!) } }, enabled = valid) {
                Text(if (correction) "Retirer" else "Ajouter")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Fermer") } },
    )
}
