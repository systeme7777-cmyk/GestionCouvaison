package com.ansaroudine.zikr

import com.ansaroudine.zikr.util.USERNAME_REGEX
import com.ansaroudine.zikr.util.auditActionLabel
import com.ansaroudine.zikr.util.fmt
import com.ansaroudine.zikr.util.generatePassword
import com.ansaroudine.zikr.util.parseInstant
import com.ansaroudine.zikr.util.percentOf
import com.ansaroudine.zikr.util.suggestUsername
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FormatTest {
    @Test
    fun nombresEnFrancais() {
        assertEquals("1 000 000", 1_000_000L.fmt())
        assertEquals("500", 500L.fmt())
    }

    @Test
    fun pourcentages() {
        assertEquals(50, percentOf(250, 500))
        assertEquals(0, percentOf(10, 0))
        assertEquals(120, percentOf(600, 500))
    }

    @Test
    fun identifiantSuggere() {
        assertEquals("aicha.ndiaye", suggestUsername("Aïcha Ndiaye"))
        assertEquals("moussa", suggestUsername("  Moussa "))
        assertTrue(USERNAME_REGEX.matches(suggestUsername("Fatou Bintou Diop")))
    }

    @Test
    fun motDePasseGenere() {
        val p = generatePassword()
        assertEquals(8, p.length)
        assertTrue(p.all { it.isLetterOrDigit() })
    }

    @Test
    fun datesServeur() {
        assertNotNull(parseInstant("2026-11-21T19:52:03.123456+00:00"))
        assertNotNull(parseInstant("2026-11-21T19:52:03Z"))
    }

    @Test
    fun journalEnFrancais() {
        assertEquals("Nommé administrateur", auditActionLabel("promu_administrateur"))
        assertEquals("Campagne créée", auditActionLabel("campagne_creee"))
    }
}
