package com.ansaroudine.zikr.data

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class UserSettings(
    val vibration: Boolean = true,
    val volumeKeys: Boolean = false,
    val keepScreenOn: Boolean = true,
    val notifications: Boolean = true,
)

/** Préférences locales du téléphone (confort d'utilisation uniquement). */
class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("zikr_preferences", Context.MODE_PRIVATE)

    private val _settings = MutableStateFlow(read())
    val settings: StateFlow<UserSettings> = _settings.asStateFlow()

    private fun read() = UserSettings(
        vibration = sp.getBoolean("vibration", true),
        volumeKeys = sp.getBoolean("volume_keys", false),
        keepScreenOn = sp.getBoolean("keep_screen_on", true),
        notifications = sp.getBoolean("notifications", true),
    )

    fun update(block: (UserSettings) -> UserSettings) {
        val s = block(_settings.value)
        sp.edit()
            .putBoolean("vibration", s.vibration)
            .putBoolean("volume_keys", s.volumeKeys)
            .putBoolean("keep_screen_on", s.keepScreenOn)
            .putBoolean("notifications", s.notifications)
            .apply()
        _settings.value = s
    }

    fun lastNotifiedId(userId: String): Long = sp.getLong("last_notified_$userId", -1L)

    fun setLastNotifiedId(userId: String, id: Long) {
        if (id > lastNotifiedId(userId)) sp.edit().putLong("last_notified_$userId", id).apply()
    }

    var cachedProfile: Profile?
        get() = sp.getString("cached_profile", null)?.let { runCatching { AppJson.decodeFromString(Profile.serializer(), it) }.getOrNull() }
        set(value) {
            sp.edit().apply {
                if (value == null) remove("cached_profile") else putString("cached_profile", AppJson.encodeToString(Profile.serializer(), value))
            }.apply()
        }

    var lastUsername: String
        get() = sp.getString("last_username", "") ?: ""
        set(value) = sp.edit().putString("last_username", value).apply()
}
