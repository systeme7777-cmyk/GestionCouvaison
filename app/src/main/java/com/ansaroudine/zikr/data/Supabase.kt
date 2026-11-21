package com.ansaroudine.zikr.data

import com.ansaroudine.zikr.BuildConfig
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.functions.Functions
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.serializer.KotlinXSerializer
import kotlinx.serialization.json.Json
import kotlin.time.Duration.Companion.seconds

/** Domaine technique utilisé pour transformer un identifiant en adresse de connexion. */
const val LOGIN_EMAIL_DOMAIN = "ansaroudine-zikr.app"

fun usernameToEmail(username: String): String = "${username.trim().lowercase()}@$LOGIN_EMAIL_DOMAIN"

val AppJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    encodeDefaults = true
    coerceInputValues = true
}

fun buildSupabaseClient(): SupabaseClient = createSupabaseClient(
    supabaseUrl = BuildConfig.SUPABASE_URL,
    supabaseKey = BuildConfig.SUPABASE_ANON_KEY,
) {
    defaultSerializer = KotlinXSerializer(AppJson)
    requestTimeout = 20.seconds
    install(Auth) {
        alwaysAutoRefresh = true
        autoLoadFromStorage = true
        autoSaveToStorage = true
    }
    install(Postgrest)
    install(Functions)
    install(Realtime) {
        reconnectDelay = 3.seconds
    }
}
