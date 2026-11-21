package com.ansaroudine.zikr

import android.content.Intent
import android.os.Bundle
import android.view.KeyEvent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.mutableIntStateOf
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.ansaroudine.zikr.ui.ZikrRoot
import com.ansaroudine.zikr.ui.participant.VolumeKeyBus
import com.ansaroudine.zikr.ui.theme.ZikrTheme

class MainActivity : ComponentActivity() {

    private val openNotifications = mutableIntStateOf(0)

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        handleIntent(intent)
        setContent {
            ZikrTheme {
                ZikrRoot(openNotificationsRequest = openNotifications.intValue)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        if (intent?.getBooleanExtra(EXTRA_OPEN_NOTIFICATIONS, false) == true) {
            intent.removeExtra(EXTRA_OPEN_NOTIFICATIONS)
            openNotifications.intValue += 1
        }
    }

    override fun onResume() {
        super.onResume()
        // Envoie les décomptes éventuellement en attente dès le retour dans l'application
        container.sync.scheduleFlush()
        container.notifications.refreshUnread()
    }

    /** Option : compter avec les touches de volume sur l'écran de décompte. */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val isVolume = event.keyCode == KeyEvent.KEYCODE_VOLUME_UP || event.keyCode == KeyEvent.KEYCODE_VOLUME_DOWN
        if (isVolume && VolumeKeyBus.counterVisible) {
            if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) VolumeKeyBus.presses.tryEmit(Unit)
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    companion object {
        const val EXTRA_OPEN_NOTIFICATIONS = "ouvrir_notifications"
    }
}
