import {
  generateWindowTimeline,
  LEO_BEHAVIOR_PROFILES,
  LEO_TIME_BANDS,
  type LeoBehaviorProfile,
  type LeoTimeBand,
} from "@dingmoney/leo-behavior-core";
import { connectPgWithRetry } from "@/lib/db/pgConnect";
import { pgPool } from "@/lib/pg";
import {
  LEO_PROFILE_LABELS,
  LEO_TIME_BAND_LABELS,
  type LeoOverview,
  type LeoPreviewPayload,
  type LeoPreviewResult,
  type LeoConfigPreset,
  type LeoSaveUserConfigPayload,
  type LeoSettings,
  type LeoTemplateOption,
  type LeoUserConfig,
  type LeoUserDetail,
  type LeoUserListRow,
} from "@/src/types/leo";

const LOG_PREFIX = "[Leo]";

const CONFLICT_MESSAGE_FA =
  "این کاربر در Dev Player فعال است. برای فعال‌سازی لئو ابتدا Dev Player را غیرفعال کنید.";

function mapSettings(row: {
  system_enabled: boolean;
  scheduler_enabled: boolean;
  scheduler_tick_seconds: number;
  processor_tick_seconds: number;
  timezone: string;
  updated_at: string | null;
}): LeoSettings {
  return {
    systemEnabled: row.system_enabled,
    schedulerEnabled: row.scheduler_enabled,
    schedulerTickSeconds: row.scheduler_tick_seconds,
    processorTickSeconds: row.processor_tick_seconds,
    timezone: row.timezone,
    updatedAt: row.updated_at,
  };
}

function mapUserConfig(row: {
  user_id: string;
  is_enabled: boolean;
  active_time_bands: string[];
  behavior_profile: string;
  session_budget: string | number;
  hard_stop_loss: string | number;
  max_concurrent_tables?: string | number;
  preferred_template_ids: string[];
  random_template_ids: string[];
  updated_at: string | null;
}): LeoUserConfig {
  return {
    userId: row.user_id,
    isEnabled: row.is_enabled,
    activeTimeBands: row.active_time_bands as LeoTimeBand[],
    behaviorProfile: row.behavior_profile as LeoBehaviorProfile,
    sessionBudget: Number(row.session_budget ?? 0),
    hardStopLoss: Number(row.hard_stop_loss ?? 0),
    maxConcurrentTables: Number(row.max_concurrent_tables ?? 0),
    preferredTemplateIds: row.preferred_template_ids ?? [],
    randomTemplateIds: row.random_template_ids ?? [],
    updatedAt: row.updated_at,
  };
}

export async function checkDevPlayerConflict(
  client: Awaited<ReturnType<typeof connectPgWithRetry>>,
  userId: string
): Promise<boolean> {
  const { rows } = await client.query<{ active: boolean }>(
    `SELECT public.fn_user_has_active_dev_player($1::uuid) AS active`,
    [userId]
  );
  return rows[0]?.active === true;
}

export async function loadLeoOverview(): Promise<LeoOverview> {
  const client = await connectPgWithRetry(pgPool);

  try {
    const [settingsResult, enabledResult, pendingResult] = await Promise.all([
      client.query(
        `SELECT system_enabled, scheduler_enabled, scheduler_tick_seconds,
                processor_tick_seconds, timezone, updated_at
           FROM public.leo_settings
          WHERE id = true`
      ),
      client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM public.leo_user_configs WHERE is_enabled = true`
      ),
      client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM public.leo_execution_queue WHERE status = 'pending'`
      ),
    ]);

    const settingsRow = settingsResult.rows[0];
    if (!settingsRow) {
      throw new Error("leo settings not found");
    }

    return {
      settings: mapSettings(settingsRow),
      enabledUserCount: Number(enabledResult.rows[0]?.count ?? 0),
      pendingEventCount: Number(pendingResult.rows[0]?.count ?? 0),
    };
  } finally {
    client.release();
  }
}

export async function patchLeoSettings(payload: {
  systemEnabled?: boolean;
  schedulerEnabled?: boolean;
}): Promise<LeoSettings> {
  const client = await connectPgWithRetry(pgPool);

  try {
    const { rows } = await client.query(
      `UPDATE public.leo_settings
          SET system_enabled = COALESCE($1, system_enabled),
              scheduler_enabled = COALESCE($2, scheduler_enabled),
              updated_at = now()
        WHERE id = true
        RETURNING system_enabled, scheduler_enabled, scheduler_tick_seconds,
                  processor_tick_seconds, timezone, updated_at`,
      [payload.systemEnabled ?? null, payload.schedulerEnabled ?? null]
    );
    return mapSettings(rows[0]);
  } finally {
    client.release();
  }
}

export async function loadLeoUsers(params?: {
  search?: string;
  operatorId?: string;
  limit?: number;
}): Promise<LeoUserListRow[]> {
  const client = await connectPgWithRetry(pgPool);
  const limit = Math.min(Math.max(params?.limit ?? 200, 1), 500);
  const search = params?.search?.trim().toLowerCase() ?? "";
  const operatorId = params?.operatorId?.trim() ?? "";

  try {
    const { rows } = await client.query<{
      user_id: string;
      username: string;
      display_name: string | null;
      role: string;
      leo_enabled: boolean;
      behavior_profile: string | null;
      dev_player_active: boolean;
    }>(
      `SELECT
         u.id AS user_id,
         u.username,
         COALESCE(p.nickname, u.username) AS display_name,
         u.role::text AS role,
         COALESCE(c.is_enabled, false) AS leo_enabled,
         c.behavior_profile,
         public.fn_user_has_active_dev_player(u.id) AS dev_player_active
       FROM public.users u
       LEFT JOIN public.user_profiles p ON p.user_id = u.id
       LEFT JOIN public.leo_user_configs c ON c.user_id = u.id
       WHERE u.role = 'player'
         AND u.status = 'active'
         AND ($1 = '' OR LOWER(u.username) LIKE '%' || $1 || '%')
         AND (
           $3 = ''
           OR u.id IN (
             SELECT pa.user_id
               FROM public.player_affiliation pa
              WHERE pa.super_id = $3::uuid OR pa.agent_id = $3::uuid
             UNION
             SELECT child.id
               FROM public.users child
              WHERE child.parent_id = $3::uuid
                AND child.role = 'player'
           )
         )
       ORDER BY COALESCE(c.is_enabled, false) DESC, u.username ASC
       LIMIT $2`,
      [search, limit, operatorId]
    );

    return rows.map((row) => ({
      userId: row.user_id,
      username: row.username,
      displayName: row.display_name ?? row.username,
      role: row.role,
      leoEnabled: row.leo_enabled,
      behaviorProfile: (row.behavior_profile as LeoBehaviorProfile | null) ?? null,
      devPlayerActive: row.dev_player_active,
    }));
  } finally {
    client.release();
  }
}

export async function loadLeoUserDetail(userId: string): Promise<LeoUserDetail | null> {
  const client = await connectPgWithRetry(pgPool);

  try {
    const { rows } = await client.query<{
      user_id: string;
      username: string;
      display_name: string | null;
      is_enabled: boolean;
      active_time_bands: string[];
      behavior_profile: string;
      session_budget: string;
      hard_stop_loss: string;
      max_concurrent_tables: string;
      preferred_template_ids: string[];
      random_template_ids: string[];
      updated_at: string | null;
      dev_player_active: boolean;
    }>(
      `SELECT
         u.id AS user_id,
         u.username,
         COALESCE(p.nickname, u.username) AS display_name,
         COALESCE(c.is_enabled, false) AS is_enabled,
         COALESCE(c.active_time_bands, '{}'::text[]) AS active_time_bands,
         COALESCE(c.behavior_profile, 'methodical') AS behavior_profile,
         COALESCE(c.session_budget, 0) AS session_budget,
         COALESCE(c.hard_stop_loss, 0) AS hard_stop_loss,
         COALESCE(c.max_concurrent_tables, 0) AS max_concurrent_tables,
         COALESCE(c.preferred_template_ids, '{}'::uuid[]) AS preferred_template_ids,
         COALESCE(c.random_template_ids, '{}'::uuid[]) AS random_template_ids,
         c.updated_at,
         public.fn_user_has_active_dev_player(u.id) AS dev_player_active
       FROM public.users u
       LEFT JOIN public.user_profiles p ON p.user_id = u.id
       LEFT JOIN public.leo_user_configs c ON c.user_id = u.id
       WHERE u.id = $1`,
      [userId]
    );

    const row = rows[0];
    if (!row) return null;

    const devPlayerActive = row.dev_player_active;
    const config = mapUserConfig({
      user_id: row.user_id,
      is_enabled: row.is_enabled,
      active_time_bands: row.active_time_bands,
      behavior_profile: row.behavior_profile,
      session_budget: row.session_budget,
      hard_stop_loss: row.hard_stop_loss,
      max_concurrent_tables: row.max_concurrent_tables,
      preferred_template_ids: row.preferred_template_ids,
      random_template_ids: row.random_template_ids,
      updated_at: row.updated_at,
    });

    return {
      ...config,
      username: row.username,
      displayName: row.display_name ?? row.username,
      devPlayerActive,
      canEnableLeo: !devPlayerActive,
      conflictMessage: devPlayerActive ? CONFLICT_MESSAGE_FA : null,
    };
  } finally {
    client.release();
  }
}

export async function saveLeoUserConfig(params: {
  userId: string;
  payload: LeoSaveUserConfigPayload;
  updatedBy: string;
}): Promise<LeoUserDetail> {
  const client = await connectPgWithRetry(pgPool);

  if (!LEO_BEHAVIOR_PROFILES.includes(params.payload.behaviorProfile)) {
    throw new Error("invalid behavior profile");
  }

  for (const band of params.payload.activeTimeBands) {
    if (!LEO_TIME_BANDS.includes(band)) {
      throw new Error("invalid time band");
    }
  }

  try {
    if (params.payload.isEnabled) {
      const conflict = await checkDevPlayerConflict(client, params.userId);
      if (conflict) {
        const err = new Error("conflict_dev_player_active");
        throw err;
      }
    }

    await client.query(
      `INSERT INTO public.leo_user_configs (
         user_id, is_enabled, active_time_bands, behavior_profile,
         session_budget, hard_stop_loss, max_concurrent_tables,
         preferred_template_ids, random_template_ids, updated_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (user_id) DO UPDATE SET
         is_enabled = EXCLUDED.is_enabled,
         active_time_bands = EXCLUDED.active_time_bands,
         behavior_profile = EXCLUDED.behavior_profile,
         session_budget = EXCLUDED.session_budget,
         hard_stop_loss = EXCLUDED.hard_stop_loss,
         max_concurrent_tables = EXCLUDED.max_concurrent_tables,
         preferred_template_ids = EXCLUDED.preferred_template_ids,
         random_template_ids = EXCLUDED.random_template_ids,
         updated_by = EXCLUDED.updated_by,
         updated_at = now()`,
      [
        params.userId,
        params.payload.isEnabled,
        params.payload.activeTimeBands,
        params.payload.behaviorProfile,
        params.payload.sessionBudget,
        params.payload.hardStopLoss,
        params.payload.maxConcurrentTables,
        params.payload.preferredTemplateIds,
        params.payload.randomTemplateIds,
        params.updatedBy,
      ]
    );

    console.log(
      `${LOG_PREFIX} saved user=${params.userId} enabled=${params.payload.isEnabled} profile=${params.payload.behaviorProfile}`
    );

    const detail = await loadLeoUserDetail(params.userId);
    if (!detail) throw new Error("user not found after save");
    return detail;
  } finally {
    client.release();
  }
}

function mapPresetRow(row: {
  id: string;
  name: string;
  source_user_id: string | null;
  source_display_name: string | null;
  is_enabled: boolean;
  active_time_bands: string[];
  behavior_profile: string;
  session_budget: string | number;
  hard_stop_loss: string | number;
  max_concurrent_tables: string | number;
  preferred_template_ids: string[];
  random_template_ids: string[];
  created_at: string | null;
  updated_at: string | null;
}): LeoConfigPreset {
  return {
    id: row.id,
    name: row.name,
    sourceUserId: row.source_user_id,
    sourceDisplayName: row.source_display_name,
    isEnabled: row.is_enabled,
    activeTimeBands: row.active_time_bands as LeoTimeBand[],
    behaviorProfile: row.behavior_profile as LeoBehaviorProfile,
    sessionBudget: Number(row.session_budget ?? 0),
    hardStopLoss: Number(row.hard_stop_loss ?? 0),
    maxConcurrentTables: Number(row.max_concurrent_tables ?? 0),
    preferredTemplateIds: row.preferred_template_ids ?? [],
    randomTemplateIds: row.random_template_ids ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function loadLeoPresets(): Promise<LeoConfigPreset[]> {
  const client = await connectPgWithRetry(pgPool);

  try {
    const { rows } = await client.query<{
      id: string;
      name: string;
      source_user_id: string | null;
      source_display_name: string | null;
      is_enabled: boolean;
      active_time_bands: string[];
      behavior_profile: string;
      session_budget: string;
      hard_stop_loss: string;
      max_concurrent_tables: string;
      preferred_template_ids: string[];
      random_template_ids: string[];
      created_at: string | null;
      updated_at: string | null;
    }>(
      `SELECT
         p.id,
         p.name,
         p.source_user_id,
         COALESCE(up.nickname, su.username) AS source_display_name,
         p.is_enabled,
         p.active_time_bands,
         p.behavior_profile,
         p.session_budget,
         p.hard_stop_loss,
         p.max_concurrent_tables,
         p.preferred_template_ids,
         p.random_template_ids,
         p.created_at,
         p.updated_at
       FROM public.leo_config_presets p
       LEFT JOIN public.users su ON su.id = p.source_user_id
       LEFT JOIN public.user_profiles up ON up.user_id = p.source_user_id
       ORDER BY p.name ASC`
    );

    return rows.map(mapPresetRow);
  } finally {
    client.release();
  }
}

export async function createLeoPreset(params: {
  name: string;
  payload: LeoSaveUserConfigPayload;
  sourceUserId?: string | null;
  createdBy: string;
}): Promise<LeoConfigPreset> {
  const client = await connectPgWithRetry(pgPool);
  const name = params.name.trim();

  if (!name) {
    throw new Error("preset name is required");
  }

  if (!LEO_BEHAVIOR_PROFILES.includes(params.payload.behaviorProfile)) {
    throw new Error("invalid behavior profile");
  }

  for (const band of params.payload.activeTimeBands) {
    if (!LEO_TIME_BANDS.includes(band)) {
      throw new Error("invalid time band");
    }
  }

  try {
    const { rows } = await client.query<{
      id: string;
      name: string;
      source_user_id: string | null;
      source_display_name: string | null;
      is_enabled: boolean;
      active_time_bands: string[];
      behavior_profile: string;
      session_budget: string;
      hard_stop_loss: string;
      max_concurrent_tables: string;
      preferred_template_ids: string[];
      random_template_ids: string[];
      created_at: string | null;
      updated_at: string | null;
    }>(
      `INSERT INTO public.leo_config_presets (
         name,
         source_user_id,
         is_enabled,
         active_time_bands,
         behavior_profile,
         session_budget,
         hard_stop_loss,
         max_concurrent_tables,
         preferred_template_ids,
         random_template_ids,
         created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING
         id,
         name,
         source_user_id,
         NULL::text AS source_display_name,
         is_enabled,
         active_time_bands,
         behavior_profile,
         session_budget,
         hard_stop_loss,
         max_concurrent_tables,
         preferred_template_ids,
         random_template_ids,
         created_at,
         updated_at`,
      [
        name,
        params.sourceUserId ?? null,
        params.payload.isEnabled,
        params.payload.activeTimeBands,
        params.payload.behaviorProfile,
        params.payload.sessionBudget,
        params.payload.hardStopLoss,
        params.payload.maxConcurrentTables,
        params.payload.preferredTemplateIds,
        params.payload.randomTemplateIds,
        params.createdBy,
      ]
    );

    const preset = mapPresetRow(rows[0]);
    console.log(`${LOG_PREFIX} preset created id=${preset.id} name=${preset.name}`);

    if (params.sourceUserId) {
      const detail = await loadLeoPresets();
      const created = detail.find((item) => item.id === preset.id);
      return created ?? preset;
    }

    return preset;
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "23505"
    ) {
      throw new Error("preset name already exists");
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteLeoPreset(presetId: string): Promise<void> {
  const client = await connectPgWithRetry(pgPool);

  try {
    const { rowCount } = await client.query(
      `DELETE FROM public.leo_config_presets WHERE id = $1::uuid`,
      [presetId]
    );

    if (!rowCount) {
      throw new Error("preset not found");
    }

    console.log(`${LOG_PREFIX} preset deleted id=${presetId}`);
  } finally {
    client.release();
  }
}

export async function loadLeoTemplates(): Promise<LeoTemplateOption[]> {
  const client = await connectPgWithRetry(pgPool);

  try {
    const { rows } = await client.query<{
      id: string;
      name: string;
      price: string | number;
      status: string;
      room_type: string;
    }>(
      `SELECT id, name, price, status, room_type
         FROM public.room_templates
        WHERE status = 'active'
          AND COALESCE(room_type, 'normal') <> 'tournament'
        ORDER BY price ASC, name ASC`
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      price: Number(row.price ?? 0),
      status: row.status,
      roomType: row.room_type,
    }));
  } finally {
    client.release();
  }
}

export async function previewLeoTimeline(payload: LeoPreviewPayload): Promise<LeoPreviewResult> {
  const windowDate =
    payload.windowDate ??
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tehran",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

  const result = generateWindowTimeline({
    windowDate,
    timeBand: payload.timeBand,
    config: {
      behaviorProfile: payload.behaviorProfile,
      sessionBudget: payload.sessionBudget,
      hardStopLoss: payload.hardStopLoss,
      maxConcurrentTables: payload.maxConcurrentTables ?? 0,
      preferredTemplateIds: payload.preferredTemplateIds,
      randomTemplateIds: payload.randomTemplateIds,
    },
  });

  const templateIds = [
    ...new Set(result.events.map((e) => e.templateId).filter(Boolean) as string[]),
  ];
  const templateNameById = new Map<string, string>();
  if (templateIds.length > 0) {
    const client = await connectPgWithRetry(pgPool);
    try {
      const { rows } = await client.query<{ id: string; name: string }>(
        `SELECT id, name FROM public.room_templates WHERE id = ANY($1::uuid[])`,
        [templateIds]
      );
      for (const row of rows) {
        templateNameById.set(row.id, row.name);
      }
    } finally {
      client.release();
    }
  }

  console.log(
    `${LOG_PREFIX} preview profile=${payload.behaviorProfile} band=${payload.timeBand} events=${result.events.length}`
  );

  return {
    windowDate,
    timeBand: payload.timeBand,
    timeBandLabel: LEO_TIME_BAND_LABELS[payload.timeBand],
    events: result.events.map((event) => ({
      sequence: event.sequence,
      eventType: event.eventType,
      scheduledAt: event.scheduledAt.toISOString(),
      sessionIndex: event.sessionIndex,
      tablePoolSource: event.tablePoolSource,
      templateId: event.templateId,
      templateName: event.templateId ? templateNameById.get(event.templateId) : undefined,
      cardCount: event.cardCount,
      concurrentJoinIndex: event.concurrentJoinIndex,
      concurrentJoinTotal: event.concurrentJoinTotal,
      label: event.label,
    })),
  };
}

export { LEO_PROFILE_LABELS, LEO_TIME_BAND_LABELS };
