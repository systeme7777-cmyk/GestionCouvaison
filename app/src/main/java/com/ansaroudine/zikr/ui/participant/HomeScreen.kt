package com.ansaroudine.zikr.ui.participant

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Today
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.VolunteerActivism
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ansaroudine.zikr.AppContainer
import com.ansaroudine.zikr.data.MyOverview
import com.ansaroudine.zikr.data.Participation
import com.ansaroudine.zikr.sync.CounterQueue
import com.ansaroudine.zikr.sync.tableChanges
import com.ansaroudine.zikr.ui.common.appViewModel
import com.ansaroudine.zikr.ui.components.AppCard
import com.ansaroudine.zikr.ui.components.EmptyState
import com.ansaroudine.zikr.ui.components.ErrorBanner
import com.ansaroudine.zikr.ui.components.LabeledProgress
import com.ansaroudine.zikr.ui.components.LoadingBox
import com.ansaroudine.zikr.ui.components.PhaseChip
import com.ansaroudine.zikr.ui.components.SectionTitle
import com.ansaroudine.zikr.ui.components.StatTile
import com.ansaroudine.zikr.ui.theme.GoldDark
import com.ansaroudine.zikr.ui.theme.Success
import com.ansaroudine.zikr.util.dateLabel
import com.ansaroudine.zikr.util.fmt
import com.ansaroudine.zikr.util.toUserMessage
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.decodeRecord
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class HomeState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val error: String? = null,
    val items: List<Participation> = emptyList(),
    val overview: MyOverview? = null,
)

class HomeViewModel(private val c: AppContainer, private val userId: String) : ViewModel() {
    private val raw = MutableStateFlow(HomeState())

    /** Les compteurs affichés incluent les appuis pas encore transmis au serveur. */
    val state: StateFlow<HomeState> = combine(raw, c.sync.state) { s, q ->
        s.copy(items = s.items.map { p ->
            val pending = CounterQueue.pendingSum(q, userId, p.campaignId)
            val snap = q.snapshots[p.campaignId]
            val count = (snap?.personalCount ?: p.count) + pending
            val total = (snap?.campaignTotal ?: p.campaigns?.totalCount ?: 0) + pending
            p.copy(count = count, campaigns = p.campaigns?.copy(totalCount = total))
        })
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), HomeState())

    init {
        load()
        viewModelScope.launch {
            c.client.tableChanges("zk_campaign_participants", "user_id", userId).collect { action ->
                when (action) {
                    is PostgresAction.Update -> {
                        val p = runCatching { action.decodeRecord<Participation>() }.getOrNull() ?: return@collect
                        if (p.removedAt != null) load(silent = true)
                        else {
                            raw.update { s -> s.copy(items = s.items.map { if (it.campaignId == p.campaignId) it.copy(count = p.count, personalGoal = p.personalGoal, completedAt = p.completedAt) else it }) }
                            c.sync.mergeSnapshot(p.campaignId, personalCount = p.count, personalGoal = p.personalGoal, updatedAt = p.updatedAt)
                        }
                    }
                    is PostgresAction.Insert, is PostgresAction.Delete -> load(silent = true)
                    else -> Unit
                }
            }
        }
        viewModelScope.launch {
            c.client.tableChanges("zk_campaigns").collect { action ->
                if (action is PostgresAction.Update) {
                    val camp = runCatching { action.decodeRecord<com.ansaroudine.zikr.data.Campaign>() }.getOrNull() ?: return@collect
                    if (!c.sync.isInflight(camp.id)) {
                        raw.update { s -> s.copy(items = s.items.map { if (it.campaignId == camp.id) it.copy(campaigns = camp) else it }) }
                        c.sync.mergeSnapshot(camp.id, campaignTotal = camp.totalCount, globalGoal = camp.globalGoal, updatedAt = camp.updatedAt)
                    }
                }
            }
        }
    }

    fun load(silent: Boolean = false, pull: Boolean = false) {
        if (!silent) raw.update { it.copy(loading = it.items.isEmpty(), refreshing = pull, error = null) }
        viewModelScope.launch {
            try {
                val items = c.zikr.myParticipations(userId)
                items.forEach { p ->
                    val camp = p.campaigns ?: return@forEach
                    c.sync.resetSnapshot(p.campaignId, p.count, p.personalGoal, camp.totalCount, camp.globalGoal, camp.updatedAt)
                }
                val overview = runCatching { c.zikr.myOverview() }.getOrNull()
                raw.update { it.copy(loading = false, refreshing = false, error = null, items = items, overview = overview ?: it.overview) }
            } catch (e: Throwable) {
                raw.update { it.copy(loading = false, refreshing = false, error = e.toUserMessage()) }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    userId: String,
    firstName: String,
    onOpenCampaign: (String) -> Unit,
    contentPadding: PaddingValues,
) {
    val vm = appViewModel(key = "home-$userId") { HomeViewModel(it, userId) }
    val state by vm.state.collectAsState()
    LaunchedEffect(Unit) { vm.load(silent = true) }

    val active = state.items.filter { it.campaigns?.phase()?.isFinished == false }
    val finished = state.items.filter { it.campaigns?.phase()?.isFinished == true }

    PullToRefreshBox(
        isRefreshing = state.refreshing,
        onRefresh = { vm.load(pull = true) },
        modifier = Modifier.fillMaxSize().padding(contentPadding),
    ) {
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Column {
                    Text("As-salamou alaykoum, $firstName", style = MaterialTheme.typography.headlineSmall)
                    Text(
                        "Qu'Allah accepte vos invocations.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            state.error?.let { item { ErrorBanner(it, onRetry = { vm.load() }) } }
            state.overview?.let { o ->
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        StatTile("Aujourd'hui", o.todayZikr.fmt(), Icons.Default.Today, Modifier.weight(1f))
                        StatTile("Total réalisé", o.totalZikr.fmt(), Icons.AutoMirrored.Filled.TrendingUp, Modifier.weight(1f), accent = GoldDark)
                        StatTile("Objectifs atteints", "${o.goalsReached} / ${o.campagnes}", Icons.Default.CheckCircle, Modifier.weight(1f), accent = Success)
                    }
                }
            }
            if (state.loading) item { LoadingBox() }
            else if (state.items.isEmpty() && state.error == null) {
                item {
                    EmptyState(
                        Icons.Default.VolunteerActivism,
                        "Aucune campagne pour le moment",
                        "Lorsqu'un administrateur vous ajoutera à une campagne de Zikr, elle apparaîtra ici.",
                    )
                }
            }
            if (active.isNotEmpty()) {
                item { SectionTitle("Mes campagnes en cours") }
                items(active, key = { it.campaignId }) { p -> ParticipationCard(p) { onOpenCampaign(p.campaignId) } }
            }
            if (finished.isNotEmpty()) {
                item { SectionTitle("Campagnes terminées") }
                items(finished, key = { "f" + it.campaignId }) { p -> ParticipationCard(p) { onOpenCampaign(p.campaignId) } }
            }
        }
    }
}

@Composable
fun ParticipationCard(p: Participation, onClick: () -> Unit) {
    val c = p.campaigns ?: return
    AppCard(onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(c.title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(c.zikrType, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
            }
            Spacer(Modifier.width(8.dp))
            PhaseChip(c.phase(), c.goalReached)
        }
        Spacer(Modifier.height(12.dp))
        LabeledProgress("Mon objectif", p.count, p.personalGoal)
        Spacer(Modifier.height(10.dp))
        LabeledProgress("Progression globale", c.totalCount, c.globalGoal, color = GoldDark)
        Spacer(Modifier.height(6.dp))
        Row {
            Icon16(Icons.Default.AutoAwesome)
            Text(
                buildString {
                    append("Du ${c.startDate.dateLabel()}")
                    c.endDate?.let { append(" au ${it.dateLabel()}") }
                },
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun Icon16(icon: androidx.compose.ui.graphics.vector.ImageVector) {
    androidx.compose.material3.Icon(
        icon, null,
        tint = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(end = 4.dp).height(14.dp).width(14.dp),
    )
}
