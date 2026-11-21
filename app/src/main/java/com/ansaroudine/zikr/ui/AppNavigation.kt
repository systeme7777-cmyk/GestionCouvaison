package com.ansaroudine.zikr.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.VolunteerActivism
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.ansaroudine.zikr.R
import com.ansaroudine.zikr.container
import com.ansaroudine.zikr.data.Profile
import com.ansaroudine.zikr.ui.admin.AdminDashboardScreen
import com.ansaroudine.zikr.ui.admin.AssignParticipantsScreen
import com.ansaroudine.zikr.ui.admin.CampaignDetailScreen
import com.ansaroudine.zikr.ui.admin.CampaignFormScreen
import com.ansaroudine.zikr.ui.admin.CampaignsScreen
import com.ansaroudine.zikr.ui.admin.MemberDetailScreen
import com.ansaroudine.zikr.ui.admin.MemberFormScreen
import com.ansaroudine.zikr.ui.admin.MembersScreen
import com.ansaroudine.zikr.ui.auth.AuthViewModel
import com.ansaroudine.zikr.ui.auth.ForcedPasswordScreen
import com.ansaroudine.zikr.ui.auth.LoginScreen
import com.ansaroudine.zikr.ui.auth.SetupOwnerScreen
import com.ansaroudine.zikr.ui.common.AuditList
import com.ansaroudine.zikr.ui.common.BackIcon
import com.ansaroudine.zikr.ui.common.HistoryScreen
import com.ansaroudine.zikr.ui.common.NotificationsScreen
import com.ansaroudine.zikr.ui.common.PermissionRequester
import com.ansaroudine.zikr.ui.common.ProfileScreen
import com.ansaroudine.zikr.ui.common.SessionState
import com.ansaroudine.zikr.ui.common.SessionViewModel
import com.ansaroudine.zikr.ui.common.appViewModel
import com.ansaroudine.zikr.ui.components.ErrorBanner
import com.ansaroudine.zikr.ui.components.PasswordField
import com.ansaroudine.zikr.ui.components.PrimaryButton
import com.ansaroudine.zikr.ui.participant.CounterScreen
import com.ansaroudine.zikr.ui.participant.HomeScreen
import com.ansaroudine.zikr.ui.theme.Emerald
import com.ansaroudine.zikr.ui.theme.EmeraldDark

@Composable
fun ZikrRoot(openNotificationsRequest: Int) {
    val session = appViewModel { SessionViewModel(it) }
    val state by session.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(Unit) { session.messages.collect { snackbar.showSnackbar(it, withDismissAction = true) } }

    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        when (val s = state) {
            SessionState.Loading -> SplashContent()
            is SessionState.SignedOut -> AuthNav(s.ownerExists, onRetry = session::recheckOwner)
            is SessionState.SignedIn -> {
                if (s.profile.mustChangePassword) {
                    ForcedPasswordScreen(onDone = session::refreshProfile, onSignOut = session::signOut)
                } else {
                    MainNav(s.profile, session, openNotificationsRequest)
                }
            }
        }
        SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 80.dp))
    }
}

@Composable
private fun SplashContent() {
    Box(
        Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Emerald, EmeraldDark))),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Image(painterResource(R.drawable.ic_launcher_foreground), null, Modifier.size(140.dp))
            CircularProgressIndicator(color = Color.White)
        }
    }
}

@Composable
private fun AuthNav(ownerExists: Boolean?, onRetry: () -> Unit) {
    var setup by rememberSaveable { mutableStateOf(false) }
    if (setup && ownerExists != true) SetupOwnerScreen(onBack = { setup = false })
    else LoginScreen(ownerExists, onSetup = { setup = true }, onRetryOwnerCheck = onRetry)
}

private object Routes {
    const val MAIN = "principal"
    const val COUNTER = "compteur/{id}"
    const val NOTIFICATIONS = "notifications"
    const val HISTORY = "historique"
    const val AUDIT = "journal"
    const val PASSWORD = "mot-de-passe"
    const val CAMPAIGN_NEW = "campagne-nouvelle"
    const val CAMPAIGN = "campagne/{id}"
    const val CAMPAIGN_EDIT = "campagne/{id}/modifier"
    const val CAMPAIGN_PARTICIPANTS = "campagne/{id}/participants"
    const val MEMBER_NEW = "membre-nouveau"
    const val MEMBER = "membre/{id}"
    const val MEMBER_EDIT = "membre/{id}/modifier"

    fun counter(id: String) = "compteur/$id"
    fun campaign(id: String) = "campagne/$id"
    fun campaignEdit(id: String) = "campagne/$id/modifier"
    fun campaignParticipants(id: String) = "campagne/$id/participants"
    fun member(id: String) = "membre/$id"
    fun memberEdit(id: String) = "membre/$id/modifier"
}

private enum class Tab(val label: String, val icon: ImageVector) {
    DASHBOARD("Tableau de bord", Icons.Default.Dashboard),
    CAMPAIGNS("Campagnes", Icons.Default.Campaign),
    MEMBERS("Membres", Icons.Default.Groups),
    MY_ZIKR("Mon Zikr", Icons.Default.VolunteerActivism),
    HOME("Accueil", Icons.Default.Home),
    HISTORY("Historique", Icons.Default.History),
    NOTIFICATIONS("Notifications", Icons.Default.Notifications),
    PROFILE("Profil", Icons.Default.Person),
}

@Composable
private fun MainNav(profile: Profile, session: SessionViewModel, openNotificationsRequest: Int) {
    val nav = rememberNavController()
    LaunchedEffect(openNotificationsRequest) {
        if (openNotificationsRequest > 0) nav.navigate(Routes.NOTIFICATIONS) { launchSingleTop = true }
    }
    fun back() { nav.popBackStack() }
    fun id(entry: androidx.navigation.NavBackStackEntry) = entry.arguments?.getString("id") ?: ""
    val openCampaign: (String) -> Unit = { cid -> nav.navigate(if (profile.isAdmin) Routes.campaign(cid) else Routes.counter(cid)) }

    NavHost(nav, startDestination = Routes.MAIN) {
        composable(Routes.MAIN) { MainTabs(profile, session, nav) }
        composable(Routes.COUNTER) { e -> CounterScreen(id(e), profile.id, onBack = ::back) }
        composable(Routes.NOTIFICATIONS) {
            SimpleScaffold("Notifications", ::back) { p -> NotificationsScreen(profile.id, p, onOpenCampaign = openCampaign) }
        }
        composable(Routes.HISTORY) { SimpleScaffold("Mon historique", ::back) { p -> HistoryScreen(profile.id, p) } }
        composable(Routes.AUDIT) { SimpleScaffold("Journal d'activité", ::back) { p -> Box(Modifier.padding(p)) { AuditList("all", null) } } }
        composable(Routes.PASSWORD) { ChangePasswordScreen(onBack = ::back) }
        if (profile.isAdmin) {
            composable(Routes.CAMPAIGN_NEW) {
                CampaignFormScreen(null, onBack = ::back, onSaved = { cid, _ ->
                    nav.navigate(Routes.campaignParticipants(cid)) { popUpTo(Routes.CAMPAIGN_NEW) { inclusive = true } }
                })
            }
            composable(Routes.CAMPAIGN) { e ->
                val cid = id(e)
                CampaignDetailScreen(
                    cid, onBack = ::back,
                    onEdit = { nav.navigate(Routes.campaignEdit(cid)) },
                    onManageParticipants = { nav.navigate(Routes.campaignParticipants(cid)) },
                    onOpenMember = { nav.navigate(Routes.member(it)) },
                )
            }
            composable(Routes.CAMPAIGN_EDIT) { e -> CampaignFormScreen(id(e), onBack = ::back, onSaved = { _, _ -> back() }) }
            composable(Routes.CAMPAIGN_PARTICIPANTS) { e ->
                val cid = id(e)
                AssignParticipantsScreen(
                    cid, onBack = ::back,
                    onDone = {
                        if (!nav.popBackStack(Routes.CAMPAIGN, inclusive = false)) {
                            nav.navigate(Routes.campaign(cid)) { popUpTo(Routes.MAIN) }
                        }
                    },
                    onCreateMember = { nav.navigate(Routes.MEMBER_NEW) },
                )
            }
            composable(Routes.MEMBER_NEW) { MemberFormScreen(null, profile.isOwner, onBack = ::back, onSaved = { back() }) }
            composable(Routes.MEMBER) { e ->
                val mid = id(e)
                MemberDetailScreen(mid, profile, onBack = ::back, onEdit = { nav.navigate(Routes.memberEdit(mid)) }, onOpenCampaign = { nav.navigate(Routes.campaign(it)) })
            }
            composable(Routes.MEMBER_EDIT) { e ->
                MemberFormScreen(id(e), profile.isOwner, onBack = ::back, onSaved = { if (it == profile.id) session.refreshProfile(); back() })
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainTabs(profile: Profile, session: SessionViewModel, nav: NavHostController) {
    val tabs = if (profile.isAdmin) listOf(Tab.DASHBOARD, Tab.CAMPAIGNS, Tab.MEMBERS, Tab.MY_ZIKR, Tab.PROFILE)
    else listOf(Tab.HOME, Tab.HISTORY, Tab.NOTIFICATIONS, Tab.PROFILE)
    var selectedName by rememberSaveable(profile.isAdmin) { mutableStateOf(tabs.first().name) }
    val selected = tabs.firstOrNull { it.name == selectedName } ?: tabs.first()
    val unread by LocalContext.current.container.notifications.unread.collectAsState()
    PermissionRequester()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (selected == Tab.HOME || selected == Tab.DASHBOARD) "ANSAROUDINE ZIKR" else selected.label) },
                actions = {
                    if (selected != Tab.NOTIFICATIONS) {
                        IconButton(onClick = { if (profile.isAdmin) nav.navigate(Routes.NOTIFICATIONS) else selectedName = Tab.NOTIFICATIONS.name }) {
                            BadgedBox(badge = { if (unread > 0) Badge { Text(if (unread > 99) "99+" else unread.toString()) } }) {
                                Icon(Icons.Default.Notifications, "Notifications")
                            }
                        }
                    }
                },
            )
        },
        bottomBar = {
            NavigationBar {
                tabs.forEach { t ->
                    NavigationBarItem(
                        selected = t == selected,
                        onClick = { selectedName = t.name },
                        icon = {
                            if (t == Tab.NOTIFICATIONS && unread > 0) BadgedBox(badge = { Badge { Text(unread.coerceAtMost(99).toString()) } }) { Icon(t.icon, null) }
                            else Icon(t.icon, null)
                        },
                        label = { Text(t.label, maxLines = 1, style = MaterialTheme.typography.labelSmall) },
                    )
                }
            }
        },
    ) { padding ->
        val openCampaignCounter: (String) -> Unit = { nav.navigate(Routes.counter(it)) }
        when (selected) {
            Tab.DASHBOARD -> AdminDashboardScreen(
                padding,
                onOpenCampaign = { nav.navigate(Routes.campaign(it)) },
                onOpenAudit = { nav.navigate(Routes.AUDIT) },
                onNewCampaign = { nav.navigate(Routes.CAMPAIGN_NEW) },
            )
            Tab.CAMPAIGNS -> CampaignsScreen(padding, onOpen = { nav.navigate(Routes.campaign(it)) }, onNew = { nav.navigate(Routes.CAMPAIGN_NEW) })
            Tab.MEMBERS -> MembersScreen(padding, profile.isOwner, onOpen = { nav.navigate(Routes.member(it)) }, onNew = { nav.navigate(Routes.MEMBER_NEW) })
            Tab.MY_ZIKR, Tab.HOME -> HomeScreen(profile.id, profile.fullName.substringBefore(' '), openCampaignCounter, padding)
            Tab.HISTORY -> HistoryScreen(profile.id, padding)
            Tab.NOTIFICATIONS -> NotificationsScreen(profile.id, padding, onOpenCampaign = openCampaignCounter)
            Tab.PROFILE -> ProfileScreen(
                profile, padding,
                onChangePassword = { nav.navigate(Routes.PASSWORD) },
                onOpenHistory = if (profile.isAdmin) ({ nav.navigate(Routes.HISTORY) }) else null,
                onOpenNotifications = if (profile.isAdmin) ({ nav.navigate(Routes.NOTIFICATIONS) }) else null,
                onSignOut = session::signOut,
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SimpleScaffold(title: String, onBack: () -> Unit, content: @Composable (androidx.compose.foundation.layout.PaddingValues) -> Unit) {
    Scaffold(topBar = { TopAppBar(title = { Text(title) }, navigationIcon = { BackIcon(onBack) }) }) { p -> content(p) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChangePasswordScreen(onBack: () -> Unit) {
    val vm = appViewModel(key = "change-password") { AuthViewModel(it) }
    val form by vm.form.collectAsState()
    var password by rememberSaveable { mutableStateOf("") }
    var confirm by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(form.done) { if (form.done) onBack() }
    SimpleScaffold("Changer mon mot de passe", onBack) { p ->
        Column(
            Modifier.fillMaxSize().padding(p).imePadding().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            PasswordField(password, { password = it }, "Nouveau mot de passe", supporting = "Au moins 6 caractères")
            PasswordField(confirm, { confirm = it }, "Confirmer le mot de passe", imeAction = ImeAction.Done, onDone = { vm.changePassword(password, confirm) })
            form.error?.let { ErrorBanner(it) }
            Spacer(Modifier.height(4.dp))
            PrimaryButton("Enregistrer", { vm.changePassword(password, confirm) }, loading = form.loading)
        }
    }
}
