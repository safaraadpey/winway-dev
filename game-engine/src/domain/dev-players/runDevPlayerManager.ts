import type { DevPlayerRepo } from "../../repositories/devPlayerRepo.js";
import type { Logger } from "../../metrics/logger.js";
import { isWithinPlayWindow } from "./isWithinPlayWindow.js";
import {
  advanceSchedulerCycle,
  canScheduleWorkCycleJoin,
  isJoinDue,
  isPauseCycleConfigured,
  rollJoinDelaySeconds,
  rollTicketCount,
} from "./schedulerCycle.js";
import { pickDevPlayerForJoin } from "./selectDevPlayer.js";
import { shuffle } from "./random.js";
import {
  isPriceInPlayerRange,
  isTemplateJoinable,
  passesActiveRoomGate,
  passesDevPlayerMaxPerRoomGate,
  passesNormalPlayersPerRoomGate,
} from "./templateGates.js";
import type {
  BuildScheduleBatchResult,
  DevPlayerConfigSnapshot,
  DevPlayerJoinPresetSnapshot,
  DevPlayerSettingsSnapshot,
  RoomTemplateSnapshot,
  ScheduleInsertRow,
  TemplateLimitSnapshot,
} from "./types.js";

const DEFAULT_JOIN_INTERVAL_SECONDS = 300;

function emptySkipped(): BuildScheduleBatchResult["skipped"] {
  return {
    systemOff: 0,
    schedulerPause: 0,
    outsidePresetWindow: 0,
    outsidePlayerWindow: 0,
    wallet: 0,
    priceRange: 0,
    templateFiltered: 0,
    roomLimit: 0,
    joinInterval: 0,
    maxPerTick: 0,
    roomDevPlayerLimit: 0,
    normalPlayerRequirement: 0,
    duplicatePending: 0,
    noEligiblePlayer: 0,
    noEligibleTemplate: 0,
  };
}

function isPlayerEligibleForTemplate(
  player: DevPlayerConfigSnapshot,
  template: RoomTemplateSnapshot,
  preset: DevPlayerJoinPresetSnapshot,
  settings: DevPlayerSettingsSnapshot,
  now: Date
): { ok: true } | { ok: false; reason: keyof BuildScheduleBatchResult["skipped"] } {
  const playerWindows =
    player.playWindows.length > 0 ? player.playWindows : preset.playWindows;
  if (!isWithinPlayWindow(playerWindows, now, settings.timezone)) {
    return { ok: false, reason: "outsidePlayerWindow" };
  }
  if (!isPriceInPlayerRange(template.price, player.minRoomPrice, player.maxRoomPrice)) {
    return { ok: false, reason: "priceRange" };
  }
  return { ok: true };
}

interface EligibleTemplate {
  templateId: string;
  template: RoomTemplateSnapshot;
  limit: TemplateLimitSnapshot;
}

function isTemplateEligible(
  templateId: string,
  template: RoomTemplateSnapshot | undefined,
  limit: TemplateLimitSnapshot | undefined,
  preset: DevPlayerJoinPresetSnapshot,
  activeRoomCounts: Map<string, number>,
  joinTargetRoomCounts: Map<string, { devPlayers: number; normalPlayers: number }>,
  skipped: BuildScheduleBatchResult["skipped"]
): boolean {
  if (!template || !limit) {
    skipped.templateFiltered += 1;
    return false;
  }
  if (!isTemplateJoinable(template, preset)) {
    skipped.templateFiltered += 1;
    return false;
  }
  const activeRooms = activeRoomCounts.get(templateId) ?? 0;
  if (!passesActiveRoomGate(activeRooms, limit)) {
    skipped.roomLimit += 1;
    return false;
  }
  const joinTargetCounts = joinTargetRoomCounts.get(templateId) ?? {
    devPlayers: 0,
    normalPlayers: 0,
  };
  if (!passesNormalPlayersPerRoomGate(joinTargetCounts.normalPlayers, limit.minNormalPlayersPerRoom)) {
    skipped.normalPlayerRequirement += 1;
    return false;
  }
  if (!passesDevPlayerMaxPerRoomGate(joinTargetCounts.devPlayers, limit.maxDevPlayersPerRoom)) {
    skipped.roomDevPlayerLimit += 1;
    return false;
  }
  return true;
}

/**
 * Dev Player Manager — one natural join attempt per scheduler tick.
 * Random work/pause cycle (when configured) and random per-template join spacing.
 */
export async function runDevPlayerManager(
  repo: DevPlayerRepo,
  log: Logger,
  now: Date = new Date()
): Promise<BuildScheduleBatchResult> {
  const skipped = emptySkipped();

  const settingsBundle = await repo.getSettingsWithRuntime();
  if (!settingsBundle) {
    skipped.systemOff = 1;
    return { created: 0, skipped };
  }

  const { settings, runtime: initialRuntime } = settingsBundle;
  if (!settings.systemEnabled || !settings.schedulerEnabled) {
    skipped.systemOff = 1;
    return { created: 0, skipped };
  }

  const cycle = advanceSchedulerCycle(settings, initialRuntime, now);
  if (cycle.transitioned) {
    await repo.updateSchedulerRuntime({
      cyclePhase: cycle.runtime.cyclePhase,
      cyclePhaseEndsAt: cycle.runtime.cyclePhaseEndsAt,
      joinsInWorkCycleByTemplate: cycle.runtime.joinsInWorkCycleByTemplate,
    });
  }

  const pauseCycleConfigured = isPauseCycleConfigured(settings);

  if (cycle.inPause) {
    skipped.schedulerPause = 1;
    return { created: 0, skipped };
  }

  if (!settings.activeJoinPresetId) {
    skipped.noEligibleTemplate = 1;
    return { created: 0, skipped };
  }

  const preset = await repo.getJoinPreset(settings.activeJoinPresetId);
  if (!preset) {
    skipped.noEligibleTemplate = 1;
    return { created: 0, skipped };
  }

  if (!isWithinPlayWindow(preset.playWindows, now, settings.timezone)) {
    skipped.outsidePresetWindow = 1;
    return { created: 0, skipped };
  }

  const [players, limits, templates] = await Promise.all([
    repo.getEnabledPlayerConfigs(),
    repo.getPresetTemplateLimits(preset.id),
    repo.getTemplatesByIds(preset.templateRoomLimitEnabledIds),
  ]);

  if (players.length === 0 || templates.length === 0) {
    skipped.noEligibleTemplate = 1;
    return { created: 0, skipped };
  }

  const limitsByTemplate = new Map(limits.map((l) => [l.templateId, l]));
  const templatesById = new Map(templates.map((t) => [t.id, t]));
  const devPlayerUserIds = players.map((player) => player.userId);

  const [activeRoomCounts, joinTargetRoomCounts, occupiedDevPlayerIds] = await Promise.all([
    repo.getActiveRoomCountsByTemplate(preset.templateRoomLimitEnabledIds),
    repo.getJoinTargetRoomPlayerCounts(preset.templateRoomLimitEnabledIds, devPlayerUserIds),
    repo.getOccupiedDevPlayerIds(devPlayerUserIds),
  ]);

  const eligibleTemplates: EligibleTemplate[] = [];
  for (const templateId of preset.templateRoomLimitEnabledIds) {
    const template = templatesById.get(templateId);
    const limit = limitsByTemplate.get(templateId);
    if (!isTemplateEligible(
      templateId,
      template,
      limit,
      preset,
      activeRoomCounts,
      joinTargetRoomCounts,
      skipped
    )) {
      continue;
    }
    if (!isJoinDue(templateId, cycle.runtime.nextJoinAtByTemplate, now)) {
      skipped.joinInterval += 1;
      continue;
    }
    const joinsCompleted = cycle.runtime.joinsInWorkCycleByTemplate[templateId] ?? 0;
    const joinsPerWorkCycle = limit?.maxJoinsPerTick ?? 10;
    if (
      !canScheduleWorkCycleJoin(pauseCycleConfigured, joinsCompleted, joinsPerWorkCycle)
    ) {
      skipped.maxPerTick += 1;
      continue;
    }
    eligibleTemplates.push({ templateId, template: template!, limit: limit! });
  }

  if (eligibleTemplates.length === 0) {
    skipped.noEligibleTemplate = 1;
    return { created: 0, skipped };
  }

  const walletBalances = new Map<string, number>();
  for (const player of players) {
    walletBalances.set(player.userId, await repo.getWalletBalance(player.userId));
  }

  const shuffledTemplates = shuffle(eligibleTemplates);
  let selectedInsert: ScheduleInsertRow | null = null;
  let selectedTemplateId: string | null = null;
  let selectedJoinInterval = DEFAULT_JOIN_INTERVAL_SECONDS;

  for (const candidate of shuffledTemplates) {
    const playerCandidates: DevPlayerConfigSnapshot[] = [];

    for (const player of players) {
      const eligibility = isPlayerEligibleForTemplate(
        player,
        candidate.template,
        preset,
        settings,
        now
      );
      if (!eligibility.ok) {
        skipped[eligibility.reason] += 1;
        continue;
      }

      const balance = walletBalances.get(player.userId) ?? 0;
      if (balance < preset.minWalletBalance) {
        skipped.wallet += 1;
        continue;
      }

      if (await repo.hasPendingSchedule(player.userId, candidate.templateId)) {
        skipped.duplicatePending += 1;
        continue;
      }

      playerCandidates.push(player);
    }

    const pickedPlayer = pickDevPlayerForJoin(playerCandidates, occupiedDevPlayerIds);
    if (!pickedPlayer) {
      continue;
    }

    selectedTemplateId = candidate.templateId;
    selectedJoinInterval = candidate.limit.joinIntervalSeconds || DEFAULT_JOIN_INTERVAL_SECONDS;
    selectedInsert = {
      userId: pickedPlayer.userId,
      roomTemplateId: candidate.templateId,
      ticketCount: rollTicketCount(
        pickedPlayer.maxTicketCount,
        candidate.template.maxCardsPerPlayer
      ),
      scheduledAt: now.toISOString(),
      status: preset.autoApproveSchedules ? "approved" : "draft",
      createdBy: pickedPlayer.userId,
    };
    break;
  }

  if (!selectedInsert || !selectedTemplateId) {
    skipped.noEligiblePlayer = 1;
    return { created: 0, skipped };
  }

  const created = await repo.insertSchedules([selectedInsert]);
  const joinDelaySeconds = rollJoinDelaySeconds(selectedJoinInterval);
  const nextJoinAtByTemplate = {
    ...cycle.runtime.nextJoinAtByTemplate,
    [selectedTemplateId]: new Date(now.getTime() + joinDelaySeconds * 1000).toISOString(),
  };
  const joinsInWorkCycleByTemplate = {
    ...cycle.runtime.joinsInWorkCycleByTemplate,
    [selectedTemplateId]:
      (cycle.runtime.joinsInWorkCycleByTemplate[selectedTemplateId] ?? 0) + created,
  };

  await repo.updateSchedulerRuntime({ nextJoinAtByTemplate, joinsInWorkCycleByTemplate });

  log.info("dev-player-manager tick", {
    created,
    templateId: selectedTemplateId,
    userId: selectedInsert.userId,
    joinDelaySeconds,
    joinsInWorkCycle: joinsInWorkCycleByTemplate[selectedTemplateId],
    skipped,
  });

  return { created, skipped };
}
