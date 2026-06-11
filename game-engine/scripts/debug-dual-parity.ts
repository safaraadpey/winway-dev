/**
 * Replay dual-mode parity for a finished room using live DB data.
 * Run: npx tsx scripts/debug-dual-parity.ts [roomId]
 */
import "dotenv/config";
import { createSupabaseAdmin } from "../src/db/supabase-admin.js";
import { loadConfig } from "../src/config/env.js";
import { GameRepo } from "../src/repositories/index.js";
import { buildRegistryFromDbRows } from "../src/core/card-registry/build.js";
import { validateDualModeParity } from "../src/runtime/dual-mode-validator.js";
import { buildRoomAssignmentIndex } from "../src/runtime/room-assignments.js";
import { normalizePoolCardId } from "../src/state/cardId.js";
import type { CardCell, RoomStateSnapshot } from "../src/state/room-state.js";
import { RoomRuntimeState } from "../src/state/room-state.js";
import type { RoomRow, TicketRow } from "../src/repositories/types.js";

const roomId =
  process.argv[2] ?? "7e7a5122-067a-4e9a-a729-0004a5bc65bc";

const config = loadConfig();
const supabase = createSupabaseAdmin(config);
const repo = new GameRepo(supabase);

async function main(): Promise<void> {
  const { data: room, error: roomErr } = await supabase
    .from("rooms")
    .select(
      "id,status,currency,room_seed,room_template_id,next_draw_at,starts_at,min_players,countdown_sec,first_line_draw_number,line_reward_percentage,full_reward_percentage,ding_per_number,meta"
    )
    .eq("id", roomId)
    .single();
  if (roomErr || !room) throw roomErr ?? new Error("room not found");

  const { data: tickets } = await supabase
    .from("tickets")
    .select(
      "id,room_id,player_user_id,pool_card_id,price,reservation_status,cancelled_at"
    )
    .eq("room_id", roomId);
  const evalTickets = (tickets ?? []).filter((t) =>
    ["reserved", "confirmed", "consumed"].includes(t.reservation_status)
  );

  const poolCardIds = [
    ...new Set(evalTickets.map((t) => normalizePoolCardId(t.pool_card_id))),
  ];

  const { data: cardNumbers } = await supabase
    .from("card_numbers")
    .select("pool_card_id,value,row_no")
    .in("pool_card_id", poolCardIds);

  const cellsByCard = new Map<string, CardCell[]>();
  for (const cn of cardNumbers ?? []) {
    const cardId = normalizePoolCardId(cn.pool_card_id);
    if (!cellsByCard.has(cardId)) cellsByCard.set(cardId, []);
    cellsByCard.get(cardId)!.push({ value: cn.value, rowNo: cn.row_no });
  }

  const ticketIds = evalTickets.map((t) => t.id);
  const { data: markRows } = await supabase
    .from("marks")
    .select("ticket_id,value")
    .in("ticket_id", ticketIds);

  const markedByTicket = new Map<string, Set<number>>();
  for (const m of markRows ?? []) {
    if (!markedByTicket.has(m.ticket_id)) markedByTicket.set(m.ticket_id, new Set());
    markedByTicket.get(m.ticket_id)!.add(m.value);
  }

  const { data: results } = await supabase
    .from("results")
    .select("ticket_id,win_type")
    .eq("room_id", roomId);

  const existingLineTickets = new Set(
    (results ?? []).filter((r) => r.win_type === "line").map((r) => r.ticket_id)
  );
  const existingFullTickets = new Set(
    (results ?? []).filter((r) => r.win_type === "full").map((r) => r.ticket_id)
  );

  const { data: draws } = await supabase
    .from("draws")
    .select("number")
    .eq("room_id", roomId)
    .order("number");

  const drawOrder = (draws ?? []).map((d) => d.number);

  const [maskRows, indexRows] = await Promise.all([
    repo.getCardDefinitionMasks(),
    repo.getCardNumberIndex(),
  ]);
  console.log("loaded index rows:", indexRows.length, "masks:", maskRows.length);

  const raw608 = indexRows.find(
    (r) => Number(r.pool_card_id) === 608 && Number(r.value) === 2
  );
  console.log("raw index row 608/2:", raw608);

  const registryBeforeLoop = buildRegistryFromDbRows(maskRows, indexRows);

  const entries2 = registryBeforeLoop.numberIndex.get(2) ?? [];
  console.log("registry value=2 count:", entries2.length);
  console.log(
    "registry has 608:",
    entries2.some((e) => e.cardId === "608"),
    entries2.map((e) => e.cardId)
  );

  const registry = registryBeforeLoop;

  const snapshot: RoomStateSnapshot = {
    room: room as RoomRow,
    tickets: evalTickets as TicketRow[],
    cellsByCard,
    markedByTicket: new Map(),
    existingLineTickets,
    existingFullTickets,
    drawnNumbers: [],
    unprocessedDrawNumbers: new Set(),
    templateDingPerNumber: null,
  };

  const state = new RoomRuntimeState(snapshot);
  const assignments = buildRoomAssignmentIndex(state.getTickets() as TicketRow[]);

  let mismatches = 0;
  let first: unknown = null;

  for (const drawNumber of drawOrder) {
    const preDrawMarks = new Map<string, Set<number>>();
    for (const [ticketId, values] of state.getMarks()) {
      preDrawMarks.set(ticketId, new Set(values));
    }

    const scanMarkRows = state.applyMarkForDrawScan(drawNumber);
    const scanEval = state.evaluateDrawScan(drawNumber);

    const bitmaskSnapshot = state.snapshotForBitmaskCompare();
    const bitmaskOutcome = state.applyMarkAndEvaluateBitmaskOnSnapshot(
      drawNumber,
      registry,
      bitmaskSnapshot,
      preDrawMarks
    );

    const postScanMarks = new Map<string, Set<number>>();
    for (const [ticketId, values] of state.getMarks()) {
      postScanMarks.set(ticketId, new Set(values));
    }

    const validation = validateDualModeParity({
      context: {
        roomId,
        drawNumber,
        drawSequence: drawOrder.slice(0, drawOrder.indexOf(drawNumber) + 1),
        drawsProcessed: state.drawsProcessed,
        wasReconciled: false,
        hasUnprocessedDraw: false,
        firstLineDrawNumber: state.room.first_line_draw_number,
        ticketCount: state.getTickets().length,
      },
      scan: {
        markRows: scanMarkRows,
        evalOut: scanEval,
        markedByTicket: postScanMarks,
      },
      bitmask: {
        markRows: bitmaskOutcome.markRows,
        evalOut: bitmaskOutcome.evalOut,
        maskByTicket: bitmaskOutcome.maskByTicket,
      },
      ticketCardId: assignments.ticketCardId,
      registry,
    });

    state.absorbEvaluation(scanEval, drawNumber);
    state.recordDrawProcessed(drawNumber);

    if (!validation.parity) {
      mismatches++;
      if (!first) {
        const indexEntries = registry.numberIndex.get(drawNumber) ?? [];
        const assignmentKeys = [...assignments.assignmentsByCardId.keys()];
        const roomCardIds = new Set(
          (state.getTickets() as TicketRow[]).map((t) =>
            normalizePoolCardId(t.pool_card_id)
          )
        );
        first = {
          drawNumber,
          mismatches: validation.mismatches,
          scanMarkRows,
          bitmaskMarkRows: bitmaskOutcome.markRows,
          indexHit: indexEntries.length,
          indexCardIdsSample: indexEntries.slice(0, 5).map((e) => e.cardId),
          assignmentKeys,
          roomCardIds: [...roomCardIds],
          indexHitsRoom: indexEntries
            .filter((e) => roomCardIds.has(e.cardId))
            .map((e) => e.cardId),
          assignmentLookup: indexEntries
            .filter((e) => roomCardIds.has(e.cardId))
            .map((e) => ({
              cardId: e.cardId,
              tickets: assignments.assignmentsByCardId.get(e.cardId),
            })),
        };
      }
    }
  }

  console.log({ roomId, draws: drawOrder.length, mismatches, first });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
