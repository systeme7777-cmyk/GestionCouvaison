package com.ansaroudine.zikr.util

import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

val FRENCH: Locale = Locale.FRANCE

private val numberFormat = ThreadLocal.withInitial { NumberFormat.getIntegerInstance(FRENCH) }

/** 1234567 -> "1 234 567" */
fun Long.fmt(): String = numberFormat.get()!!.format(this).replace(' ', ' ').replace(' ', ' ')
fun Int.fmt(): String = toLong().fmt()

fun percentOf(done: Long, goal: Long): Int = if (goal <= 0) 0 else ((done * 100) / goal).toInt()

private val dayFormatter = DateTimeFormatter.ofPattern("d MMMM yyyy", FRENCH)
private val shortDayFormatter = DateTimeFormatter.ofPattern("d MMM", FRENCH)
private val timeFormatter = DateTimeFormatter.ofPattern("HH:mm", FRENCH)
private val dayHeaderFormatter = DateTimeFormatter.ofPattern("EEEE d MMMM yyyy", FRENCH)

fun parseInstant(value: String?): Instant? = value?.let { v ->
    runCatching { OffsetDateTime.parse(v).toInstant() }.getOrNull() ?: runCatching { Instant.parse(v) }.getOrNull()
}

fun localDateOf(timestamp: String): LocalDate =
    parseInstant(timestamp)?.atZone(ZoneId.systemDefault())?.toLocalDate() ?: LocalDate.now()

fun LocalDate.fmtLong(): String = format(dayFormatter)
fun LocalDate.fmtShort(): String = format(shortDayFormatter)
fun LocalDate.fmtHeader(): String = format(dayHeaderFormatter).replaceFirstChar { it.titlecase(FRENCH) }

fun String.dateLabel(): String = runCatching { LocalDate.parse(this).fmtLong() }.getOrDefault(this)

fun timeOf(timestamp: String): String =
    parseInstant(timestamp)?.atZone(ZoneId.systemDefault())?.format(timeFormatter) ?: ""

/** "à l'instant", "il y a 5 min", "hier à 14:02", "3 mars à 09:10" */
fun relativeTime(timestamp: String, now: Instant = Instant.now()): String {
    val instant = parseInstant(timestamp) ?: return ""
    val minutes = ChronoUnit.MINUTES.between(instant, now)
    val zoned = instant.atZone(ZoneId.systemDefault())
    val today = LocalDate.now()
    return when {
        minutes < 1 -> "à l'instant"
        minutes < 60 -> "il y a $minutes min"
        zoned.toLocalDate() == today -> "aujourd'hui à ${zoned.format(timeFormatter)}"
        zoned.toLocalDate() == today.minusDays(1) -> "hier à ${zoned.format(timeFormatter)}"
        else -> "${zoned.toLocalDate().fmtShort()} à ${zoned.format(timeFormatter)}"
    }
}

fun dayLabel(date: LocalDate, today: LocalDate = LocalDate.now()): String = when (date) {
    today -> "Aujourd'hui"
    today.minusDays(1) -> "Hier"
    else -> date.fmtHeader()
}

/** Propose un identifiant à partir d'un nom : "Aïcha Ndiaye" -> "aicha.ndiaye" */
fun suggestUsername(fullName: String): String {
    val normalized = java.text.Normalizer.normalize(fullName.trim().lowercase(), java.text.Normalizer.Form.NFD)
        .replace(Regex("\\p{Mn}+"), "")
        .replace(Regex("[^a-z0-9]+"), ".")
        .trim('.')
    return normalized.take(32)
}

val USERNAME_REGEX = Regex("^[a-z0-9._-]{3,32}$")

fun generatePassword(length: Int = 8): String {
    val chars = "abcdefghjkmnpqrstuvwxyz23456789"
    val rnd = java.security.SecureRandom()
    return (1..length).map { chars[rnd.nextInt(chars.length)] }.joinToString("")
}

/** Traduction des actions du journal en phrases lisibles. */
fun auditActionLabel(action: String): String = when (action) {
    "campagne_creee" -> "Campagne créée"
    "campagne_modifiee" -> "Campagne modifiée"
    "campagne_cloturee" -> "Campagne clôturée"
    "campagne_rouverte" -> "Campagne rouverte"
    "campagne_supprimee" -> "Campagne supprimée"
    "participant_ajoute" -> "Participant ajouté à une campagne"
    "participant_reintegre" -> "Participant réintégré dans une campagne"
    "participant_retire" -> "Participant retiré d'une campagne"
    "objectif_modifie" -> "Objectif personnel modifié"
    "objectif_personnel_atteint" -> "Objectif personnel atteint"
    "objectif_global_atteint" -> "Objectif global atteint"
    "mot_de_passe_modifie" -> "Mot de passe modifié"
    "mot_de_passe_reinitialise" -> "Mot de passe réinitialisé"
    "proprietaire_cree" -> "Application configurée (administrateur principal)"
    "administrateur_cree" -> "Administrateur créé"
    "participant_cree" -> "Participant créé"
    "compte_modifie" -> "Informations du compte modifiées"
    "compte_desactive" -> "Compte désactivé"
    "compte_reactive" -> "Compte réactivé"
    "promu_administrateur" -> "Nommé administrateur"
    "droits_admin_retires" -> "Droits d'administrateur retirés"
    "administrateur_supprime" -> "Administrateur supprimé"
    "participant_supprime" -> "Participant supprimé"
    else -> action.replace('_', ' ').replaceFirstChar { it.titlecase(FRENCH) }
}
