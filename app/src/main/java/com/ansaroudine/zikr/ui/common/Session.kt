package com.ansaroudine.zikr.ui.common

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.ansaroudine.zikr.AppContainer
import com.ansaroudine.zikr.container
import com.ansaroudine.zikr.data.Profile
import com.ansaroudine.zikr.sync.tableChanges
import com.ansaroudine.zikr.util.isNetworkError
import com.ansaroudine.zikr.util.toUserMessage
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.status.SessionStatus
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.decodeRecord
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface SessionState {
    data object Loading : SessionState
    /** ownerExists = null si l'information n'a pas pu être vérifiée (hors ligne). */
    data class SignedOut(val ownerExists: Boolean?) : SessionState
    data class SignedIn(val profile: Profile) : SessionState
}

/** Crée un ViewModel ayant accès aux dépendances de l'application. */
@Composable
inline fun <reified VM : ViewModel> appViewModel(key: String? = null, crossinline create: (AppContainer) -> VM): VM {
    val container = LocalContext.current.container
    return viewModel(key = key) { create(container) }
}

class SessionViewModel(private val c: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow<SessionState>(SessionState.Loading)
    val state: StateFlow<SessionState> = _state.asStateFlow()

    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 8)
    val messages: SharedFlow<String> = _messages.asSharedFlow()

    private var profileWatch: Job? = null

    init {
        viewModelScope.launch {
            c.client.auth.sessionStatus.collect { status ->
                when (status) {
                    is SessionStatus.Initializing -> _state.value = SessionState.Loading
                    is SessionStatus.Authenticated -> onAuthenticated()
                    is SessionStatus.NotAuthenticated -> onSignedOut()
                    is SessionStatus.RefreshFailure -> {
                        // Hors ligne : on garde l'utilisateur connecté avec son profil mémorisé
                        val cached = c.prefs.cachedProfile
                        if (cached != null && _state.value !is SessionState.SignedIn) _state.value = SessionState.SignedIn(cached)
                    }
                }
            }
        }
        viewModelScope.launch { c.sync.errors.collect { _messages.emit(it) } }
    }

    private suspend fun onAuthenticated() {
        val uid = c.auth.currentUserId ?: return
        val profile = try {
            c.auth.loadProfile()
        } catch (e: Throwable) {
            if (e.isNetworkError()) c.prefs.cachedProfile?.takeIf { it.id == uid } else null
        }
        when {
            profile == null -> {
                if (c.prefs.cachedProfile?.id != uid) {
                    _messages.emit("Ce compte n'est pas autorisé à utiliser ANSAROUDINE ZIKR.")
                    signOut()
                }
            }
            profile.deletedAt != null || !profile.isActive -> {
                _messages.emit("Ce compte est désactivé. Contactez un administrateur.")
                signOut()
            }
            else -> {
                c.prefs.cachedProfile = profile
                _state.value = SessionState.SignedIn(profile)
                c.notifications.start(profile.id)
                c.sync.scheduleFlush()
                watchProfile(profile.id)
            }
        }
    }

    private suspend fun onSignedOut() {
        profileWatch?.cancel()
        c.notifications.stop()
        _state.value = SessionState.SignedOut(null)
        val exists = runCatching { c.auth.ownerExists() }.getOrNull()
        if (_state.value is SessionState.SignedOut) _state.value = SessionState.SignedOut(exists)
    }

    /** Applique immédiatement les changements de rôle ou la désactivation du compte. */
    private fun watchProfile(uid: String) {
        profileWatch?.cancel()
        profileWatch = viewModelScope.launch {
            c.client.tableChanges("zk_profiles", "id", uid).collect { action ->
                if (action is PostgresAction.Update) {
                    val p = runCatching { action.decodeRecord<Profile>() }.getOrNull() ?: return@collect
                    if (p.deletedAt != null || !p.isActive) {
                        _messages.emit("Votre compte a été désactivé.")
                        signOut()
                    } else {
                        val previous = (state.value as? SessionState.SignedIn)?.profile
                        c.prefs.cachedProfile = p
                        _state.value = SessionState.SignedIn(p)
                        if (previous != null && !previous.isAdmin && p.isAdmin) {
                            _messages.emit("Vous êtes maintenant administrateur.")
                        } else if (previous != null && previous.isAdmin && !p.isAdmin) {
                            _messages.emit("Vos droits d'administrateur ont été retirés.")
                        }
                    }
                }
            }
        }
    }

    fun refreshProfile() {
        viewModelScope.launch {
            runCatching { c.auth.loadProfile() }.getOrNull()?.let {
                c.prefs.cachedProfile = it
                _state.value = SessionState.SignedIn(it)
            }
        }
    }

    fun recheckOwner() {
        viewModelScope.launch {
            val exists = runCatching { c.auth.ownerExists() }.getOrNull()
            if (_state.value is SessionState.SignedOut) _state.value = SessionState.SignedOut(exists)
        }
    }

    fun signOut() {
        viewModelScope.launch {
            // Dernière tentative d'envoi des décomptes avant de se déconnecter
            runCatching { c.sync.flush() }
            val uid = c.auth.currentUserId
            c.notifications.stop()
            c.notifications.cancelPeriodicCheck()
            c.prefs.cachedProfile = null
            c.sync.clearForSignOut(keepUnsentOf = uid)
            c.auth.signOut()
        }
    }

    fun message(text: String) {
        _messages.tryEmit(text)
    }

    fun errorMessage(e: Throwable) {
        _messages.tryEmit(e.toUserMessage())
    }
}
