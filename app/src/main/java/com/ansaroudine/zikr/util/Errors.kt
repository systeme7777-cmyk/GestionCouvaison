package com.ansaroudine.zikr.util

import io.github.jan.supabase.auth.exception.AuthRestException
import io.github.jan.supabase.exceptions.HttpRequestException
import io.github.jan.supabase.exceptions.RestException
import io.ktor.client.network.sockets.ConnectTimeoutException
import io.ktor.client.plugins.HttpRequestTimeoutException
import kotlinx.coroutines.CancellationException
import java.io.IOException

/** Erreur métier déjà rédigée pour l'utilisateur. */
class UserFacingException(message: String) : Exception(message)

/** Indique si l'erreur provient d'un problème de réseau (l'opération pourra être retentée). */
fun Throwable.isNetworkError(): Boolean = when (this) {
    is HttpRequestException, is HttpRequestTimeoutException, is ConnectTimeoutException, is IOException -> true
    else -> cause?.let { it !== this && it.isNetworkError() } ?: false
}

/** Traduit n'importe quelle erreur en message clair, en français. */
fun Throwable.toUserMessage(): String {
    if (this is CancellationException) return "Opération annulée."
    if (this is UserFacingException) return message ?: "Erreur."
    if (isNetworkError()) return "Connexion impossible. Vérifiez votre accès à Internet."
    if (this is AuthRestException) {
        val raw = (error + " " + (description ?: "") + " " + (message ?: "")).lowercase()
        return when {
            "invalid login credentials" in raw || "invalid_credentials" in raw -> "Identifiant ou mot de passe incorrect."
            "banned" in raw -> "Ce compte est désactivé. Contactez un administrateur."
            "same_password" in raw || "should be different" in raw -> "Le nouveau mot de passe doit être différent de l'ancien."
            "weak_password" in raw || "password should be" in raw -> "Mot de passe trop faible (au moins 6 caractères)."
            "rate limit" in raw || "over_request_rate_limit" in raw -> "Trop de tentatives. Patientez quelques minutes."
            "session" in raw || "jwt" in raw || "refresh" in raw -> "Votre session a expiré. Veuillez vous reconnecter."
            else -> "Erreur d'authentification. Veuillez réessayer."
        }
    }
    if (this is RestException) {
        val text = listOfNotNull(error, description, message).joinToString(" ")
        return frenchServerMessage(text)
    }
    return frenchServerMessage(message ?: "")
}

private val knownFrenchMarkers = listOf(
    "Vous ", "Votre ", "Cette ", "Ce ", "Le ", "La ", "L'", "Les ", "Chaque ", "Impossible", "Action ",
    "Campagne ", "Participant ", "Identifiant", "Liste ", "Compte ", "Seul ", "Une ", "Accès ",
)

private fun frenchServerMessage(text: String): String {
    val lower = text.lowercase()
    return when {
        "permission denied" in lower || "42501" in lower -> "Vous n'avez pas l'autorisation d'effectuer cette action."
        "jwt expired" in lower || "invalid jwt" in lower -> "Votre session a expiré. Veuillez vous reconnecter."
        "duplicate key" in lower -> "Cet élément existe déjà."
        "violates check constraint" in lower -> "Les informations saisies ne sont pas valides."
        else -> {
            // Les messages de la base sont rédigés en français : on extrait la phrase utile
            val idx = knownFrenchMarkers.map { text.indexOf(it) }.filter { it >= 0 }.minOrNull()
            if (idx != null) {
                text.substring(idx).substringBefore("\n").substringBefore(" URL:").substringBefore(" Headers:").trim()
                    .removeSuffix("\"").trim()
            } else {
                "Une erreur est survenue. Veuillez réessayer."
            }
        }
    }
}
