package com.ansaroudine.zikr.ui.auth

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ansaroudine.zikr.AppContainer
import com.ansaroudine.zikr.R
import com.ansaroudine.zikr.ui.common.appViewModel
import com.ansaroudine.zikr.ui.components.ErrorBanner
import com.ansaroudine.zikr.ui.components.PasswordField
import com.ansaroudine.zikr.ui.components.PrimaryButton
import com.ansaroudine.zikr.ui.theme.Emerald
import com.ansaroudine.zikr.ui.theme.EmeraldDark
import com.ansaroudine.zikr.ui.theme.Gold
import com.ansaroudine.zikr.util.USERNAME_REGEX
import com.ansaroudine.zikr.util.suggestUsername
import com.ansaroudine.zikr.util.toUserMessage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class FormState(val loading: Boolean = false, val error: String? = null, val done: Boolean = false)

class AuthViewModel(private val c: AppContainer) : ViewModel() {
    private val _form = MutableStateFlow(FormState())
    val form = _form.asStateFlow()
    val lastUsername: String get() = c.prefs.lastUsername

    fun signIn(username: String, password: String) {
        val u = username.trim().lowercase()
        if (u.isEmpty() || password.isEmpty()) {
            _form.value = FormState(error = "Saisissez votre identifiant et votre mot de passe.")
            return
        }
        run {
            c.auth.signIn(u, password)
            c.prefs.lastUsername = u
        }
    }

    fun setupOwner(fullName: String, username: String, phone: String, password: String, confirm: String) {
        val u = username.trim().lowercase()
        val error = when {
            fullName.trim().length < 2 -> "Saisissez votre nom complet."
            !USERNAME_REGEX.matches(u) -> "L'identifiant doit contenir de 3 à 32 caractères : lettres minuscules sans accent, chiffres, point ou tiret."
            password.length < 6 -> "Le mot de passe doit contenir au moins 6 caractères."
            password != confirm -> "Les deux mots de passe ne correspondent pas."
            else -> null
        }
        if (error != null) { _form.value = FormState(error = error); return }
        run {
            c.auth.bootstrapOwner(fullName.trim(), u, phone.trim(), password)
            c.prefs.lastUsername = u
        }
    }

    fun changePassword(password: String, confirm: String) {
        val error = when {
            password.length < 6 -> "Le mot de passe doit contenir au moins 6 caractères."
            password != confirm -> "Les deux mots de passe ne correspondent pas."
            else -> null
        }
        if (error != null) { _form.value = FormState(error = error); return }
        run { c.auth.changePassword(password) }
    }

    private fun run(block: suspend () -> Unit) {
        if (_form.value.loading) return
        _form.value = FormState(loading = true)
        viewModelScope.launch {
            _form.value = try {
                block(); FormState(done = true)
            } catch (e: Throwable) {
                FormState(error = e.toUserMessage())
            }
        }
    }
}

@Composable
private fun AuthBackground(content: @Composable () -> Unit) {
    Box(
        Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Emerald, EmeraldDark))),
        contentAlignment = Alignment.TopCenter,
    ) {
        Column(
            Modifier.fillMaxSize().statusBarsPadding().imePadding().verticalScroll(rememberScrollState()).padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(28.dp))
            Box(
                Modifier.size(104.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.08f)),
                contentAlignment = Alignment.Center,
            ) {
                Image(painterResource(R.drawable.ic_launcher_foreground), contentDescription = null, modifier = Modifier.size(120.dp))
            }
            Spacer(Modifier.height(12.dp))
            Text("ANSAROUDINE", color = Gold, fontSize = 28.sp, fontWeight = FontWeight.Bold, letterSpacing = 3.sp)
            Text("ZIKR", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 8.sp)
            Spacer(Modifier.height(6.dp))
            Text(
                "Ensemble pour le rappel d'Allah",
                color = Color.White.copy(alpha = 0.8f),
                style = MaterialTheme.typography.bodyMedium,
            )
            Spacer(Modifier.height(24.dp))
            Card(
                modifier = Modifier.fillMaxWidth().widthIn(max = 480.dp),
                shape = RoundedCornerShape(24.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            ) {
                Column(Modifier.padding(22.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) { content() }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
fun LoginScreen(ownerExists: Boolean?, onSetup: () -> Unit, onRetryOwnerCheck: () -> Unit) {
    val vm = appViewModel { AuthViewModel(it) }
    val form by vm.form.collectAsState()
    var username by rememberSaveable { mutableStateOf(vm.lastUsername) }
    var password by rememberSaveable { mutableStateOf("") }

    AuthBackground {
        Text("Connexion", style = MaterialTheme.typography.headlineSmall)
        Text(
            "Utilisez l'identifiant et le mot de passe fournis par votre administrateur.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        OutlinedTextField(
            value = username,
            onValueChange = { username = it.trim().lowercase() },
            label = { Text("Identifiant") },
            leadingIcon = { Icon(Icons.Default.Person, null) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii, imeAction = ImeAction.Next, autoCorrectEnabled = false),
        )
        PasswordField(password, { password = it }, "Mot de passe", imeAction = ImeAction.Done, onDone = { vm.signIn(username, password) })
        form.error?.let { ErrorBanner(it) }
        PrimaryButton("Se connecter", { vm.signIn(username, password) }, loading = form.loading)

        when (ownerExists) {
            false -> {
                Spacer(Modifier.height(4.dp))
                Text(
                    "Première utilisation : aucun administrateur n'est encore configuré.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
                TextButton(onClick = onSetup, modifier = Modifier.fillMaxWidth()) { Text("Configurer l'application") }
            }
            null -> TextButton(onClick = onRetryOwnerCheck, modifier = Modifier.fillMaxWidth()) {
                Text("Vérifier la connexion au serveur")
            }
            true -> Unit
        }
    }
}

@Composable
fun SetupOwnerScreen(onBack: () -> Unit) {
    val vm = appViewModel { AuthViewModel(it) }
    val form by vm.form.collectAsState()
    var fullName by rememberSaveable { mutableStateOf("") }
    var username by rememberSaveable { mutableStateOf("") }
    var usernameEdited by rememberSaveable { mutableStateOf(false) }
    var phone by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var confirm by rememberSaveable { mutableStateOf("") }

    AuthBackground {
        Text("Configuration initiale", style = MaterialTheme.typography.headlineSmall)
        Text(
            "Créez le compte de l'administrateur principal (propriétaire de l'application). " +
                "Cette étape n'est possible qu'une seule fois.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        OutlinedTextField(
            value = fullName,
            onValueChange = {
                fullName = it
                if (!usernameEdited) username = suggestUsername(it)
            },
            label = { Text("Nom complet") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words, imeAction = ImeAction.Next),
        )
        OutlinedTextField(
            value = username,
            onValueChange = { username = it.trim().lowercase(); usernameEdited = true },
            label = { Text("Identifiant de connexion") },
            supportingText = { Text("Lettres minuscules, chiffres, point ou tiret") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii, imeAction = ImeAction.Next, autoCorrectEnabled = false),
        )
        OutlinedTextField(
            value = phone,
            onValueChange = { phone = it },
            label = { Text("Téléphone (facultatif)") },
            leadingIcon = { Icon(Icons.Default.Phone, null) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone, imeAction = ImeAction.Next),
        )
        PasswordField(password, { password = it }, "Mot de passe", supporting = "Au moins 6 caractères")
        PasswordField(confirm, { confirm = it }, "Confirmer le mot de passe", imeAction = ImeAction.Done)
        form.error?.let { ErrorBanner(it) }
        PrimaryButton("Créer le compte administrateur", { vm.setupOwner(fullName, username, phone, password, confirm) }, loading = form.loading)
        TextButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Retour à la connexion") }
    }
}

@Composable
fun ForcedPasswordScreen(onDone: () -> Unit, onSignOut: () -> Unit) {
    val vm = appViewModel { AuthViewModel(it) }
    val form by vm.form.collectAsState()
    var password by rememberSaveable { mutableStateOf("") }
    var confirm by rememberSaveable { mutableStateOf("") }
    androidx.compose.runtime.LaunchedEffect(form.done) { if (form.done) onDone() }

    AuthBackground {
        Text("Choisissez votre mot de passe", style = MaterialTheme.typography.headlineSmall)
        Text(
            "Pour sécuriser votre compte, remplacez le mot de passe temporaire donné par l'administrateur par un mot de passe personnel.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        PasswordField(password, { password = it }, "Nouveau mot de passe", supporting = "Au moins 6 caractères")
        PasswordField(confirm, { confirm = it }, "Confirmer le mot de passe", imeAction = ImeAction.Done, onDone = { vm.changePassword(password, confirm) })
        form.error?.let { ErrorBanner(it) }
        PrimaryButton("Enregistrer", { vm.changePassword(password, confirm) }, loading = form.loading)
        TextButton(onClick = onSignOut, modifier = Modifier.fillMaxWidth()) { Text("Se déconnecter") }
    }
}
