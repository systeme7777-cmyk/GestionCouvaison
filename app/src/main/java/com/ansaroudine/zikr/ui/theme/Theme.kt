package com.ansaroudine.zikr.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

val Emerald = Color(0xFF0B5D45)
val EmeraldDark = Color(0xFF06392A)
val EmeraldLight = Color(0xFF3E9C7C)
val Gold = Color(0xFFD4AF37)
val GoldDark = Color(0xFFA9861C)
val Success = Color(0xFF2E7D32)
val Warning = Color(0xFFE08A00)
val Danger = Color(0xFFC62828)

private val LightColors = lightColorScheme(
    primary = Emerald,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFCDEBDF),
    onPrimaryContainer = EmeraldDark,
    secondary = GoldDark,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFF6E7B4),
    onSecondaryContainer = Color(0xFF3D2F00),
    tertiary = Color(0xFF35618A),
    background = Color(0xFFF6F8F6),
    onBackground = Color(0xFF17201C),
    surface = Color.White,
    onSurface = Color(0xFF17201C),
    surfaceVariant = Color(0xFFE6EEEA),
    onSurfaceVariant = Color(0xFF46544E),
    surfaceContainer = Color(0xFFF0F4F1),
    surfaceContainerHigh = Color(0xFFE9EFEB),
    surfaceContainerLow = Color(0xFFF8FAF8),
    outline = Color(0xFF8A9A92),
    outlineVariant = Color(0xFFD3DDD8),
    error = Danger,
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF6FD3AE),
    onPrimary = Color(0xFF003827),
    primaryContainer = Color(0xFF0B5D45),
    onPrimaryContainer = Color(0xFFCDEBDF),
    secondary = Gold,
    onSecondary = Color(0xFF3D2F00),
    secondaryContainer = Color(0xFF574400),
    onSecondaryContainer = Color(0xFFF6E7B4),
    tertiary = Color(0xFF9CC9F5),
    background = Color(0xFF0E1412),
    onBackground = Color(0xFFDDE5E0),
    surface = Color(0xFF151C19),
    onSurface = Color(0xFFDDE5E0),
    surfaceVariant = Color(0xFF26302C),
    onSurfaceVariant = Color(0xFFB9C7C0),
    surfaceContainer = Color(0xFF1B2320),
    surfaceContainerHigh = Color(0xFF222B27),
    surfaceContainerLow = Color(0xFF121916),
    outline = Color(0xFF84948C),
    outlineVariant = Color(0xFF3A4641),
    error = Color(0xFFFF8A80),
)

private val AppTypography = Typography().let { t ->
    t.copy(
        headlineLarge = t.headlineLarge.copy(fontWeight = FontWeight.Bold),
        headlineMedium = t.headlineMedium.copy(fontWeight = FontWeight.Bold),
        headlineSmall = t.headlineSmall.copy(fontWeight = FontWeight.SemiBold),
        titleLarge = t.titleLarge.copy(fontWeight = FontWeight.SemiBold),
        titleMedium = t.titleMedium.copy(fontWeight = FontWeight.SemiBold),
        labelLarge = t.labelLarge.copy(fontWeight = FontWeight.SemiBold),
    )
}

val CounterNumberStyle = TextStyle(fontSize = 56.sp, fontWeight = FontWeight.Bold, letterSpacing = (-1).sp)

private val AppShapes = Shapes(
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(24.dp),
)

@Composable
fun ZikrTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (dark) DarkColors else LightColors,
        typography = AppTypography,
        shapes = AppShapes,
        content = content,
    )
}
