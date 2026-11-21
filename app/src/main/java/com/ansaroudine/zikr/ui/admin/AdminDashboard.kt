package com.ansaroudine.zikr.ui.admin

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AdminPanelSettings
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.EventAvailable
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Today
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.VolunteerActivism
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ansaroudine.zikr.AppContainer
import com.ansaroudine.zikr.data.AdminOverview
import com.ansaroudine.zikr.data.AuditEntry
import com.ansaroudine.zikr.data.Campaign
import com.ansaroudine.zikr.sync.tableChanges
import com.ansaroudine.zikr.ui.common.AuditRow
import com.ansaroudine.zikr.ui.common.appViewModel
import com.ansaroudine.zikr.ui.components.EmptyState
import com.ansaroudine.zikr.ui.components.ErrorBanner
import com.ansaroudine.zikr.ui.components.LoadingBox
import com.ansaroudine.zikr.ui.components.SectionTitle
import com.ansaroudine.zikr.ui.components.StatTile
import com.ansaroudine.zikr.ui.theme.GoldDark
import com.ansaroudine.zikr.ui.theme.Success
import com.ansaroudine.zikr.util.fmt
import com.ansaroudine.zikr.util.toUserMessage
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.decodeRecord
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class DashboardState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val error: String? = null,
    val overview: AdminOverview? = null,
    val active: List<Campaign> = emptyList(),
    val activity: List<AuditEntry> = emptyList(),
)

class DashboardViewModel(private val c: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow(DashboardState())
    val state = _state.asStateFlow()
    private var debounce: Job? = null

    init {
        load()
        viewModelScope.launch {
            c.client.tableChanges("campaigns").collect { action ->
                when (action) {
                    is PostgresAction.Update -> {
                        val camp = runCatching { action.decodeRecord<Campaign>() }.getOrNull() ?: return@collect
                        _state.update { s -> s.copy(active = s.active.map { if (it.id == camp.id) camp else it }) }
                        scheduleOverviewRefresh()
                    }
                    else -> load(silent = true)
                }
            }
        }
    }

    /** Les statistiques globales sont recalculées au plus toutes les 3 secondes pendant les décomptes. */
    private fun scheduleOverviewRefresh() {
        if (debounce?.isActive == true) return
        debounce = viewModelScope.launch {
            delay(3_000)
            runCatching { c.admin.overview() }.getOrNull()?.let { o -> _state.update { it.copy(overview = o) } }
        }
    }

    fun load(silent: Boolean = false, pull: Boolean = false) {
        if (!silent) _state.update { it.copy(loading = it.overview == null, refreshing = pull, error = null) }
        viewModelScope.launch {
            try {
                val overview = c.admin.overview()
                val active = c.zikr.campaigns("active", "", 0)
                val activity = runCatching { c.zikr.auditAll(0).take(8) }.getOrDefault(emptyList())
                _state.value = DashboardState(loading = false, overview = overview, active = active, activity = activity)
            } catch (e: Throwable) {
                _state.update { it.copy(loading = false, refreshing = false, error = e.toUserMessage()) }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminDashboardScreen(
    contentPadding: PaddingValues,
    onOpenCampaign: (String) -> Unit,
    onOpenAudit: () -> Unit,
    onNewCampaign: () -> Unit,
) {
    val vm = appViewModel { DashboardViewModel(it) }
    val state by vm.state.collectAsState()
    LaunchedEffect(Unit) { vm.load(silent = true) }

    PullToRefreshBox(isRefreshing = state.refreshing, onRefresh = { vm.load(pull = true) }, modifier = Modifier.fillMaxSize().padding(contentPadding)) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            state.error?.let { item { ErrorBanner(it, onRetry = { vm.load() }) } }
            if (state.loading) item { LoadingBox() }
            state.overview?.let { o ->
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        StatTile("Campagnes en cours", o.activeCampaigns.fmt(), Icons.Default.Campaign, Modifier.weight(1f))
                        StatTile("Campagnes terminées", o.finishedCampaigns.fmt(), Icons.Default.EventAvailable, Modifier.weight(1f), accent = GoldDark)
                    }
                }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        StatTile("Membres actifs", "${o.activeMembers.fmt()} / ${o.participants.fmt()}", Icons.Default.Groups, Modifier.weight(1f))
                        StatTile("Administrateurs", o.administrateurs.fmt(), Icons.Default.AdminPanelSettings, Modifier.weight(1f), accent = MaterialTheme.colorScheme.tertiary)
                    }
                }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        StatTile("Zikr aujourd'hui", o.todayZikr.fmt(), Icons.Default.Today, Modifier.weight(1f), accent = GoldDark)
                        StatTile("Zikr au total", o.totalZikr.fmt(), Icons.AutoMirrored.Filled.TrendingUp, Modifier.weight(1f))
                        StatTile("Objectifs atteints", o.personalGoalsReached.fmt(), Icons.Default.CheckCircle, Modifier.weight(1f), accent = Success)
                    }
                }
            }
            if (!state.loading) {
                item {
                    SectionTitle("Campagnes en cours") {
                        TextButton(onClick = onNewCampaign) { Text("Nouvelle") }
                    }
                }
                if (state.active.isEmpty()) {
                    item { EmptyState(Icons.Default.VolunteerActivism, "Aucune campagne en cours", "Créez une campagne puis cochez les participants.") }
                }
                items(state.active, key = { it.id }) { c -> CampaignCard(c) { onOpenCampaign(c.id) } }
                if (state.activity.isNotEmpty()) {
                    item {
                        SectionTitle("Activité récente") { TextButton(onClick = onOpenAudit) { Text("Tout voir") } }
                    }
                    items(state.activity, key = { "a" + it.id }) { AuditRow(it) }
                }
            }
        }
    }
}
