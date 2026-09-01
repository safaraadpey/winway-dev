import {
  enforceHardLimits,
  filterTemplateIdsByStakeTiers,
  generateWindowTimeline,
  LEO_STAKE_TIERS,
  LEO_TIME_BAND_WINDOWS,
  stakeTierFromPrice,
  stakeTiersForTemplateIds,
  type LeoBehaviorProfile,
  type LeoStakeTier,
  type LeoTimeBand,
} from "@dingmoney/leo-behavior-core";
import type pg from "pg";
import { resolveBandRoster } from "./bandRoster.js";
import { processRoundJoin } from "./roundJoinProcessor.js";

const LOG = "[Leo]";

export function getCurrentTehranBand(now = new Date()): LeoTimeBand | null {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tehran",
      hour: "numeric",
      hour12: false,
    }).format(now)
  );

  for (const band of Object.values(LEO_TIME_BAND_WINDOWS)) {
    if (hour >= band.startHour && hour < band.endHour) {
      return band.band;
    }
  }
  return null;
}

export function getTehranDateString(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

type LeoUserRow = {
  user_id: string;
  behavior_profile: string;
  session_budget: string;
  hard_stop_loss: string;
  max_concurrent_tables: string;
  preferred_template_ids: string[];
  random_template_ids: string[];
  active_time_bands: string[];
};

export async function runLeoSchedulerTick(pool: pg.Pool): Promise<number> {
  const client = await pool.connect();
  let inserted = 0;

  try {
    const settingsResult = await client.query<{
      system_enabled: boolean;
      scheduler_enabled: boolean;
    }>(`SELECT system_enabled, scheduler_enabled FROM public.leo_settings WHERE id = true`);

    const settings = settingsResult.rows[0];
    if (!settings?.system_enabled || !settings.scheduler_enabled) {
      return 0;
    }

    const now = new Date();
    const currentBand = getCurrentTehranBand(now);
    if (!currentBand) return 0;

    const windowDate = getTehranDateString(now);

    const usersResult = await client.query<LeoUserRow>(
      `SELECT c.user_id, c.behavior_profile, c.session_budget, c.hard_stop_loss,
              c.max_concurrent_tables, c.preferred_template_ids, c.random_template_ids, c.active_time_bands
         FROM public.leo_user_configs c
        WHERE c.is_enabled = true
          AND $1 = ANY(c.active_time_bands)
          AND NOT public.fn_user_has_active_dev_player(c.user_id)`,
      [currentBand]
    );

    const capResult = await client.query<{
      light_max_active_players: number;
      light_shuffle_enabled: boolean;
      medium_max_active_players: number;
      medium_shuffle_enabled: boolean;
      heavy_max_active_players: number;
      heavy_shuffle_enabled: boolean;
    }>(
      `SELECT light_max_active_players, light_shuffle_enabled,
              medium_max_active_players, medium_shuffle_enabled,
              heavy_max_active_players, heavy_shuffle_enabled
         FROM public.leo_band_caps
        WHERE time_band = $1`,
      [currentBand]
    );
    const capRow = capResult.rows[0];
    const stakeCaps: Record<LeoStakeTier, { maxActivePlayers: number; shuffleEnabled: boolean }> = {
      light: {
        maxActivePlayers: Number(capRow?.light_max_active_players ?? 0),
        shuffleEnabled: capRow?.light_shuffle_enabled === true,
      },
      medium: {
        maxActivePlayers: Number(capRow?.medium_max_active_players ?? 0),
        shuffleEnabled: capRow?.medium_shuffle_enabled === true,
      },
      heavy: {
        maxActivePlayers: Number(capRow?.heavy_max_active_players ?? 0),
        shuffleEnabled: capRow?.heavy_shuffle_enabled === true,
      },
    };

    const templatesResult = await client.query<{ id: string; price: string | number }>(
      `SELECT id::text AS id, price
         FROM public.room_templates
        WHERE status = 'active'
          AND COALESCE(room_type, 'normal') <> 'tournament'`
    );
    const priceByTemplateId = new Map(
      templatesResult.rows.map((row) => [row.id, Number(row.price ?? 0)] as const)
    );
    const templateIdsByStake = new Map<LeoStakeTier, string[]>(
      LEO_STAKE_TIERS.map((stakeTier) => [
        stakeTier,
        [...priceByTemplateId.entries()]
          .filter(([, price]) => stakeTierFromPrice(price) === stakeTier)
          .map(([id]) => id),
      ])
    );

    const eligibleByStake = new Map<LeoStakeTier, string[]>();
    for (const stakeTier of LEO_STAKE_TIERS) {
      eligibleByStake.set(
        stakeTier,
        usersResult.rows
          .filter((user) => {
            const pool = [
              ...(user.preferred_template_ids ?? []),
              ...(user.random_template_ids ?? []),
            ];
            return stakeTiersForTemplateIds(pool, priceByTemplateId).has(stakeTier);
          })
          .map((user) => user.user_id)
      );
    }

    const allowedTiersByUser = new Map<string, Set<LeoStakeTier>>();
    const droppedEntirely = new Set<string>();
    let selectedUserIds: string[] = [];

    await client.query("BEGIN");
    try {
      for (const stakeTier of LEO_STAKE_TIERS) {
        const stakeCap = stakeCaps[stakeTier];
        const eligibleUserIds = eligibleByStake.get(stakeTier) ?? [];
        await client.query(
          `INSERT INTO public.leo_band_rosters (time_band, window_date, stake_tier, selected_user_ids)
           VALUES ($1, $2::date, $3, '{}'::uuid[])
           ON CONFLICT (time_band, window_date, stake_tier) DO NOTHING`,
          [currentBand, windowDate, stakeTier]
        );
        const rosterResult = await client.query<{
          selected_user_ids: string[];
          selected_at: Date | string;
          shuffle_generation: number;
        }>(
          `SELECT selected_user_ids, selected_at, shuffle_generation
             FROM public.leo_band_rosters
            WHERE time_band = $1 AND window_date = $2::date AND stake_tier = $3
            FOR UPDATE`,
          [currentBand, windowDate, stakeTier]
        );
        const rosterRow = rosterResult.rows[0];
        const hasPersistedRoster = (rosterRow?.selected_user_ids?.length ?? 0) > 0;
        const resolved = resolveBandRoster({
          eligibleUserIds,
          maxActivePlayers: stakeCap.maxActivePlayers,
          shuffleEnabled: stakeCap.shuffleEnabled,
          existing: hasPersistedRoster
            ? {
                selectedUserIds: rosterRow.selected_user_ids,
                selectedAtMs: new Date(rosterRow.selected_at).getTime(),
                shuffleGeneration: Number(rosterRow.shuffle_generation ?? 0),
              }
            : null,
          nowMs: now.getTime(),
        });

        if (resolved.changed) {
          await client.query(
            `UPDATE public.leo_band_rosters
                SET selected_user_ids = $4::uuid[],
                    selected_at = $5::timestamptz,
                    shuffle_generation = $6,
                    updated_at = now()
              WHERE time_band = $1 AND window_date = $2::date AND stake_tier = $3`,
            [
              currentBand,
              windowDate,
              stakeTier,
              resolved.roster.selectedUserIds,
              new Date(resolved.roster.selectedAtMs).toISOString(),
              resolved.roster.shuffleGeneration,
            ]
          );
          console.log(
            `${LOG} roster band=${currentBand} stake=${stakeTier} cap=${stakeCap.maxActivePlayers} shuffle=${stakeCap.shuffleEnabled} selected=${resolved.roster.selectedUserIds.length} dropped=${resolved.droppedUserIds.length} added=${resolved.addedUserIds.length} gen=${resolved.roster.shuffleGeneration}`
          );
        }

        for (const userId of resolved.roster.selectedUserIds) {
          const tiers = allowedTiersByUser.get(userId) ?? new Set<LeoStakeTier>();
          tiers.add(stakeTier);
          allowedTiersByUser.set(userId, tiers);
        }

        const stakeTemplateIds = templateIdsByStake.get(stakeTier) ?? [];
        if (resolved.droppedUserIds.length > 0 && stakeTemplateIds.length > 0) {
          await client.query(
            `UPDATE public.leo_execution_queue
                SET status = 'cancelled', updated_at = now(), error_text = 'dropped_from_stake_roster'
              WHERE user_id = ANY($1::uuid[])
                AND window_date = $2::date
                AND window_band = $3
                AND status IN ('pending', 'processing')
                AND event_type = 'round_join'
                AND template_id = ANY($4::uuid[])`,
            [resolved.droppedUserIds, windowDate, currentBand, stakeTemplateIds]
          );
        }

        for (const userId of resolved.droppedUserIds) {
          droppedEntirely.add(userId);
        }
      }

      for (const userId of allowedTiersByUser.keys()) {
        droppedEntirely.delete(userId);
      }
      if (droppedEntirely.size > 0) {
        await client.query(
          `UPDATE public.leo_execution_queue
              SET status = 'cancelled', updated_at = now(), error_text = 'dropped_from_band_roster'
            WHERE user_id = ANY($1::uuid[])
              AND window_date = $2::date
              AND window_band = $3
              AND status IN ('pending', 'processing')`,
          [[...droppedEntirely], windowDate, currentBand]
        );
      }

      await client.query("COMMIT");
      selectedUserIds = [...allowedTiersByUser.keys()];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    const usersById = new Map(usersResult.rows.map((row) => [row.user_id, row]));

    for (const userId of selectedUserIds) {
      const user = usersById.get(userId);
      if (!user) continue;

      const pending = await client.query<{ id: string }>(
        `SELECT id FROM public.leo_execution_queue
          WHERE user_id = $1 AND window_date = $2::date AND window_band = $3
            AND status IN ('pending', 'processing')
          LIMIT 1`,
        [user.user_id, windowDate, currentBand]
      );
      if ((pending.rowCount ?? 0) > 0) continue;

      const seqResult = await client.query<{ max_seq: string | number | null }>(
        `SELECT MAX(sequence_no) AS max_seq FROM public.leo_execution_queue
          WHERE user_id = $1 AND window_date = $2::date AND window_band = $3`,
        [user.user_id, windowDate, currentBand]
      );
      const sequenceOffset = Number(seqResult.rows[0]?.max_seq ?? -1) + 1;

      const allowedTiers = allowedTiersByUser.get(user.user_id) ?? new Set<LeoStakeTier>();
      const preferredTemplateIds = filterTemplateIdsByStakeTiers(
        user.preferred_template_ids ?? [],
        allowedTiers,
        priceByTemplateId
      );
      const randomTemplateIds = filterTemplateIdsByStakeTiers(
        user.random_template_ids ?? [],
        allowedTiers,
        priceByTemplateId
      );
      if (preferredTemplateIds.length === 0 && randomTemplateIds.length === 0) continue;

      const timeline = generateWindowTimeline({
        windowDate,
        timeBand: currentBand,
        config: {
          behaviorProfile: user.behavior_profile as LeoBehaviorProfile,
          sessionBudget: Number(user.session_budget),
          hardStopLoss: Number(user.hard_stop_loss),
          maxConcurrentTables: Number(user.max_concurrent_tables ?? 0),
          preferredTemplateIds,
          randomTemplateIds,
        },
      });

      const futureEvents = timeline.events.filter(
        (event) => event.scheduledAt.getTime() >= now.getTime()
      );
      if (futureEvents.length === 0) continue;

      await client.query("BEGIN");
      try {
        for (const [index, event] of futureEvents.entries()) {
          await client.query(
            `INSERT INTO public.leo_execution_queue (
               user_id, window_date, window_band, sequence_no, event_type,
               scheduled_at, session_index, table_pool_source, template_id,
               card_count, round_delay_seconds, payload
             ) VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)`,
            [
              user.user_id,
              windowDate,
              currentBand,
              sequenceOffset + index,
              event.eventType,
              event.scheduledAt.toISOString(),
              event.sessionIndex,
              event.tablePoolSource ?? null,
              event.templateId ?? null,
              event.cardCount ?? null,
              event.roundDelaySeconds ?? null,
              JSON.stringify({ label: event.label ?? null }),
            ]
          );
        }
        await client.query("COMMIT");
        inserted += futureEvents.length;
        console.log(
          `${LOG} scheduler user=${user.user_id} band=${currentBand} events=${futureEvents.length}`
        );
      } catch (error) {
        await client.query("ROLLBACK");
        console.error(`${LOG} scheduler insert failed user=${user.user_id}`, error);
      }
    }
  } finally {
    client.release();
  }

  return inserted;
}

type QueueRow = {
  id: string;
  user_id: string;
  event_type: string;
  template_id: string | null;
  card_count: number | null;
  session_index: number;
  window_date: string;
  window_band: string;
  scheduled_at: Date | string;
};

export async function runLeoProcessorTick(pool: pg.Pool, limit = 20): Promise<number> {
  const client = await pool.connect();
  let processed = 0;

  try {
    const settingsResult = await client.query<{
      system_enabled: boolean;
      max_leo_players_per_waiting_room: number;
      max_leo_cards_per_join: number;
    }>(
      `SELECT system_enabled, max_leo_players_per_waiting_room, max_leo_cards_per_join
         FROM public.leo_settings WHERE id = true`
    );
    if (!settingsResult.rows[0]?.system_enabled) return 0;

    const maxLeoPlayersPerWaitingRoom = Number(
      settingsResult.rows[0]?.max_leo_players_per_waiting_room ?? 3
    );
    const maxLeoCardsPerJoin = Number(settingsResult.rows[0]?.max_leo_cards_per_join ?? 0);

    const pickResult = await client.query<QueueRow>(
      `SELECT * FROM public.fn_pick_leo_execution_queue($1)`,
      [limit]
    );

    const roundJoinTemplates = new Set(
      pickResult.rows
        .filter((job) => job.event_type === "round_join" && job.template_id)
        .map((job) => job.template_id as string)
    );
    if (roundJoinTemplates.size > 0) {
      console.log(
        `${LOG} processor pick round_join templates=${roundJoinTemplates.size} jobs=${pickResult.rowCount ?? 0}`
      );
    }

    for (const job of pickResult.rows) {
      const nowIso = new Date().toISOString();

      try {
        if (job.event_type === "round_join" && job.template_id && job.card_count) {
          const templatePriceResult = await client.query<{ price: string | number }>(
            `SELECT price FROM public.room_templates WHERE id = $1`,
            [job.template_id]
          );
          const templatePrice = Number(templatePriceResult.rows[0]?.price ?? NaN);
          if (Number.isFinite(templatePrice)) {
            const stakeTier = stakeTierFromPrice(templatePrice);
            const stakeRoster = await client.query<{ selected_user_ids: string[] }>(
              `SELECT selected_user_ids
                 FROM public.leo_band_rosters
                WHERE time_band = $1 AND window_date = $2::date AND stake_tier = $3`,
              [job.window_band, job.window_date, stakeTier]
            );
            const selectedIds = stakeRoster.rows[0]?.selected_user_ids;
            if (Array.isArray(selectedIds) && selectedIds.length > 0 && !selectedIds.includes(job.user_id)) {
              await client.query(
                `UPDATE public.leo_execution_queue
                    SET status = 'skipped', processed_at = $2, updated_at = $2, error_text = $3
                  WHERE id = $1`,
                [job.id, nowIso, "not_on_stake_roster"]
              );
              continue;
            }
          }

          const configResult = await client.query<{
            session_budget: string;
            hard_stop_loss: string;
          }>(
            `SELECT session_budget, hard_stop_loss FROM public.leo_user_configs WHERE user_id = $1`,
            [job.user_id]
          );
          const config = configResult.rows[0];
          const runtimeResult = await client.query<{
            session_spend: string;
            session_pnl: string;
          }>(
            `SELECT session_spend, session_pnl FROM public.leo_session_runtime
              WHERE user_id = $1 AND window_key = $2 AND session_index = $3`,
            [job.user_id, `${job.window_date}:${job.window_band}`, job.session_index]
          );
          const runtime = runtimeResult.rows[0];

          const limits = enforceHardLimits({
            sessionBudget: Number(config?.session_budget ?? 0),
            hardStopLoss: Number(config?.hard_stop_loss ?? 0),
            runtime: {
              sessionSpend: Number(runtime?.session_spend ?? 0),
              sessionPnl: Number(runtime?.session_pnl ?? 0),
              consecutiveLosses: 0,
              consecutiveWins: 0,
              roundsPlayed: 0,
              fatigue: 0,
              inTilt: false,
              inHotStreak: false,
            },
            proposedSpend: 0,
          });

          if (!limits.allowed) {
            await client.query(
              `UPDATE public.leo_execution_queue
                  SET status = 'cancelled', updated_at = now(), error_text = $2
                WHERE user_id = $1 AND status = 'pending'`,
              [job.user_id, limits.reason]
            );
            await client.query(
              `UPDATE public.leo_execution_queue
                  SET status = 'skipped', processed_at = $2, updated_at = $2
                WHERE id = $1`,
              [job.id, nowIso]
            );
            continue;
          }

          const joinOutcome = await processRoundJoin(
            client,
            {
              id: job.id,
              user_id: job.user_id,
              template_id: job.template_id,
              card_count: job.card_count,
              session_index: job.session_index,
              window_date: job.window_date,
              window_band: job.window_band,
              scheduled_at: job.scheduled_at,
            },
            maxLeoPlayersPerWaitingRoom,
            maxLeoCardsPerJoin
          );

          if (joinOutcome.kind === "deferred") {
            continue;
          }

          if (joinOutcome.kind === "skipped") {
            await client.query(
              `UPDATE public.leo_execution_queue
                  SET status = 'skipped', processed_at = $2, updated_at = $2, error_text = $3
                WHERE id = $1`,
              [job.id, nowIso, joinOutcome.reason]
            );
            continue;
          }
        }

        if (job.event_type === "exit") {
          await client.query(
            `UPDATE public.leo_execution_queue
                SET status = 'cancelled', updated_at = now()
              WHERE user_id = $1 AND status = 'pending' AND id <> $2`,
            [job.user_id, job.id]
          );
        }

        const finalStatus =
          job.event_type === "skip" ? "skipped" : "done";

        await client.query(
          `UPDATE public.leo_execution_queue
              SET status = $2, processed_at = $3, updated_at = $3
            WHERE id = $1`,
          [job.id, finalStatus, nowIso]
        );
        processed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await client.query(
          `UPDATE public.leo_execution_queue
              SET status = 'failed', error_text = $2, processed_at = $3, updated_at = $3
            WHERE id = $1`,
          [job.id, message, nowIso]
        );
        console.error(`${LOG} processor job=${job.id} failed`, message);
      }
    }
  } finally {
    client.release();
  }

  return processed;
}
