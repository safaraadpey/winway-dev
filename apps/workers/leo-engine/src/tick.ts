import {
  enforceHardLimits,
  generateWindowTimeline,
  LEO_TIME_BAND_WINDOWS,
  type LeoBehaviorProfile,
  type LeoTimeBand,
} from "@dingmoney/leo-behavior-core";
import type pg from "pg";

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

    for (const user of usersResult.rows) {
      const exists = await client.query<{ id: string }>(
        `SELECT id FROM public.leo_execution_queue
          WHERE user_id = $1 AND window_date = $2::date AND window_band = $3
          LIMIT 1`,
        [user.user_id, windowDate, currentBand]
      );
      if ((exists.rowCount ?? 0) > 0) continue;

      const timeline = generateWindowTimeline({
        windowDate,
        timeBand: currentBand,
        config: {
          behaviorProfile: user.behavior_profile as LeoBehaviorProfile,
          sessionBudget: Number(user.session_budget),
          hardStopLoss: Number(user.hard_stop_loss),
          maxConcurrentTables: Number(user.max_concurrent_tables ?? 0),
          preferredTemplateIds: user.preferred_template_ids ?? [],
          randomTemplateIds: user.random_template_ids ?? [],
        },
      });

      await client.query("BEGIN");
      try {
        for (const event of timeline.events) {
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
              event.sequence,
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
        inserted += timeline.events.length;
        console.log(
          `${LOG} scheduler user=${user.user_id} band=${currentBand} events=${timeline.events.length}`
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
};

export async function runLeoProcessorTick(pool: pg.Pool, limit = 20): Promise<number> {
  const client = await pool.connect();
  let processed = 0;

  try {
    const settingsResult = await client.query<{ system_enabled: boolean }>(
      `SELECT system_enabled FROM public.leo_settings WHERE id = true`
    );
    if (!settingsResult.rows[0]?.system_enabled) return 0;

    const pickResult = await client.query<QueueRow>(
      `SELECT * FROM public.fn_pick_leo_execution_queue($1)`,
      [limit]
    );

    for (const job of pickResult.rows) {
      const nowIso = new Date().toISOString();

      try {
        if (job.event_type === "round_join" && job.template_id && job.card_count) {
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

          await client.query(
            `SELECT room_id, ticket_ids FROM game_core.fn_system_join_or_create_room($1::uuid, $2::uuid, $3::integer, NULL)`,
            [job.user_id, job.template_id, job.card_count]
          );
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
