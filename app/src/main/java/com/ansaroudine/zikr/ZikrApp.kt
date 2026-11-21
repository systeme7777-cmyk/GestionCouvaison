package com.ansaroudine.zikr

import android.app.Application
import android.content.Context
import com.ansaroudine.zikr.data.AdminRepository
import com.ansaroudine.zikr.data.AuthRepository
import com.ansaroudine.zikr.data.NotificationRepository
import com.ansaroudine.zikr.data.Prefs
import com.ansaroudine.zikr.data.ZikrRepository
import com.ansaroudine.zikr.data.buildSupabaseClient
import com.ansaroudine.zikr.notif.NotificationCenter
import com.ansaroudine.zikr.sync.CounterSync
import io.github.jan.supabase.auth.auth
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

class ZikrApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        container.notifications.createChannel()
    }
}

/** Assemblage des dépendances de l'application. */
class AppContainer(context: Context) {
    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    val client = buildSupabaseClient()
    val prefs = Prefs(context)
    val auth = AuthRepository(client)
    val zikr = ZikrRepository(client)
    val admin = AdminRepository(client)
    val notificationRepo = NotificationRepository(client)
    val sync = CounterSync(context, zikr, appScope) { auth.currentUserId }
    val notifications = NotificationCenter(context, client, notificationRepo, prefs, appScope)

    suspend fun awaitSession() {
        client.auth.awaitInitialization()
    }
}

val Context.container: AppContainer get() = (applicationContext as ZikrApp).container
