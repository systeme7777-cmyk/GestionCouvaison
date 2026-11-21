package com.ansaroudine.zikr.sync

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.postgresChangeFlow
import io.github.jan.supabase.realtime.realtime
import io.github.jan.supabase.postgrest.query.filter.FilterOperator
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.launch
import java.util.UUID

/**
 * Flux des modifications en temps réel d'une table (filtrées par colonne si besoin).
 * Les règles RLS du serveur s'appliquent : chacun ne reçoit que ce qu'il a le droit de voir.
 * L'abonnement est automatiquement fermé lorsque l'écran n'écoute plus.
 */
fun SupabaseClient.tableChanges(
    table: String,
    filterColumn: String? = null,
    filterValue: String? = null,
): Flow<PostgresAction> = callbackFlow {
    val channel = realtime.channel("zk-$table-${UUID.randomUUID()}")
    val changes = channel.postgresChangeFlow<PostgresAction>(schema = "public") {
        this.table = table
        if (filterColumn != null && filterValue != null) {
            filter(filterColumn, FilterOperator.EQ, filterValue)
        }
    }
    val job = launch { changes.collect { trySend(it) } }
    runCatching { channel.subscribe() }
    awaitClose {
        job.cancel()
        CoroutineScope(Dispatchers.IO + NonCancellable).launch {
            runCatching { realtime.removeChannel(channel) }
        }
    }
}
