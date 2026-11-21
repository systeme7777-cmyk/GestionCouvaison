package com.ansaroudine.zikr

import com.ansaroudine.zikr.sync.CounterQueue
import com.ansaroudine.zikr.sync.QueueState
import com.ansaroudine.zikr.sync.ServerSnapshot
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CounterQueueTest {
    private val u = "utilisateur"
    private val c = "campagne"
    private var seq = 0
    private val ids: () -> String = { "id-${seq++}" }

    private fun base() = QueueState(snapshots = mapOf(c to ServerSnapshot(10, 100, 500, 1000, 1)))

    @Test
    fun appuisRapidesRegroupes() {
        var s = base()
        repeat(5) { s = CounterQueue.add(s, u, c, 1, null, 0, newId = ids) }
        assertEquals(1, s.ops.size)
        assertEquals(5, s.ops[0].amount)
        assertEquals(15L, CounterQueue.personalDisplayed(s, u, c))
        assertEquals(listOf(1, 1, 1, 1, 1), s.undo[c])
    }

    @Test
    fun operationEnCoursNestPasModifiee() {
        var s = CounterQueue.add(base(), u, c, 1, null, 0, newId = ids)
        val inflight = s.ops[0].clientId
        s = CounterQueue.add(s, u, c, 1, inflight, 0, newId = ids)
        assertEquals(2, s.ops.size)
        assertEquals(1, s.ops[0].amount)
        assertNotEquals(inflight, s.ops[1].clientId)
    }

    @Test
    fun annulerRetireLocalementSiPasEncoreEnvoye() {
        var s = CounterQueue.add(base(), u, c, 33, null, 0, newId = ids)
        s = CounterQueue.add(s, u, c, 1, null, 0, newId = ids)
        val (after, amount) = CounterQueue.undo(s, u, c, null, 0, ids)!!
        assertEquals(1, amount)
        assertEquals(33, after.ops.single().amount)
        val (after2, amount2) = CounterQueue.undo(after, u, c, null, 0, ids)!!
        assertEquals(33, amount2)
        assertEquals(0, after2.ops.size)
        assertEquals(10L, CounterQueue.personalDisplayed(after2, u, c))
    }

    @Test
    fun annulerApresEnvoiCreeUneCorrection() {
        var s = CounterQueue.add(base(), u, c, 100, null, 0, newId = ids)
        val sent = s.ops[0]
        s = CounterQueue.confirm(s, sent.clientId, c, ServerSnapshot(110, 100, 600, 1000, 2))
        assertEquals(0, s.ops.size)
        val (after, amount) = CounterQueue.undo(s, u, c, null, 0, ids)!!
        assertEquals(100, amount)
        assertEquals(-100, after.ops.single().amount)
        assertEquals(10L, CounterQueue.personalDisplayed(after, u, c))
    }

    @Test
    fun impossibleDAnnulerSousZero() {
        val s = QueueState(
            snapshots = mapOf(c to ServerSnapshot(0, 100, 0, 1000, 1)),
            undo = mapOf(c to listOf(50)),
        )
        assertNull(CounterQueue.undo(s, u, c, null, 0, ids))
    }

    @Test
    fun rienAAnnuler() {
        assertNull(CounterQueue.undo(base(), u, c, null, 0, ids))
    }

    @Test
    fun miseAJourAncienneIgnoree() {
        var s = QueueState(snapshots = mapOf(c to ServerSnapshot(10, 100, 500, 1000, 50)))
        s = CounterQueue.mergeSnapshot(s, c, campaignTotal = 400, updatedAtMillis = 40)
        assertEquals(500L, s.snapshots[c]!!.campaignTotal)
        s = CounterQueue.mergeSnapshot(s, c, campaignTotal = 700, updatedAtMillis = 60)
        assertEquals(700L, s.snapshots[c]!!.campaignTotal)
    }

    @Test
    fun confirmationNeDoublePasLeTotal() {
        var s = CounterQueue.add(base(), u, c, 10, null, 0, newId = ids)
        val op = s.ops[0]
        // Affichage avant confirmation : 500 + 10 en attente
        assertEquals(510L, s.snapshots[c]!!.campaignTotal + CounterQueue.pendingSum(s, u, c))
        s = CounterQueue.confirm(s, op.clientId, c, ServerSnapshot(20, 100, 510, 1000, 5))
        assertEquals(510L, s.snapshots[c]!!.campaignTotal + CounterQueue.pendingSum(s, u, c))
    }

    @Test
    fun signesDifferentsNonFusionnes() {
        var s = CounterQueue.add(base(), u, c, 5, null, 0, newId = ids)
        s = CounterQueue.add(s, u, c, -2, null, 0, recordUndo = false, newId = ids)
        assertEquals(listOf(5, -2), s.ops.map { it.amount })
    }

    @Test
    fun campagnesSepareesNonFusionnees() {
        var s = CounterQueue.add(base(), u, c, 5, null, 0, newId = ids)
        s = CounterQueue.add(s, u, "autre", 3, null, 0, newId = ids)
        s = CounterQueue.add(s, u, c, 2, null, 0, newId = ids)
        assertEquals(listOf(5, 3, 2), s.ops.map { it.amount })
        assertEquals(7L, CounterQueue.pendingSum(s, u, c))
    }

    @Test
    fun plafondParOperation() {
        var s = CounterQueue.add(base(), u, c, 100_000, null, 0, newId = ids)
        s = CounterQueue.add(s, u, c, 1, null, 0, newId = ids)
        assertEquals(listOf(100_000, 1), s.ops.map { it.amount })
    }
}
