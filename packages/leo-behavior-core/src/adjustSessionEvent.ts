import { getProfilePreset } from "./profilePresets";
import { randomFloat, randomInt } from "./random";
import type { AdjustRoundParamsInput, AdjustRoundParamsResult } from "./types";

const BIG_WIN_PNL_THRESHOLD = 500;

export function adjustRoundParams(input: AdjustRoundParamsInput): AdjustRoundParamsResult {
  const random = input.random ?? Math.random;
  const preset = getProfilePreset(input.profile);
  const { runtime } = input;

  let cardCount = randomInt(
    preset.baseCardCount.min,
    preset.baseCardCount.max,
    random
  );
  let roundDelaySeconds = randomFloat(
    preset.roundDelaySeconds.min,
    preset.roundDelaySeconds.max,
    random
  );

  let skipProbability =
    preset.skipProbability.base +
    runtime.fatigue * preset.skipProbability.fatigueMultiplier;
  skipProbability = Math.min(skipProbability, preset.skipProbability.max);

  if (runtime.consecutiveLosses >= 2) {
    const lossFactor = Math.min(runtime.consecutiveLosses, 4);
    cardCount += Math.min(
      preset.lossStreak.cardBonusMax,
      Math.floor(lossFactor * preset.lossStreak.riskIncreaseFactor)
    );
    roundDelaySeconds = Math.max(
      0,
      roundDelaySeconds - preset.lossStreak.delayReductionMaxSeconds * (lossFactor / 4)
    );
    skipProbability = Math.max(0, skipProbability - 0.05);
  }

  if (runtime.consecutiveWins >= 1) {
    const winFactor = Math.min(runtime.consecutiveWins, 3);
    cardCount += Math.min(
      preset.winStreak.cardBonusMax,
      Math.floor(winFactor * preset.winStreak.riskIncreaseFactor)
    );
    roundDelaySeconds = Math.max(
      0,
      roundDelaySeconds - preset.winStreak.delayReductionMaxSeconds * (winFactor / 3)
    );
  }

  if (runtime.sessionPnl >= BIG_WIN_PNL_THRESHOLD) {
    cardCount = Math.max(preset.baseCardCount.min, cardCount - preset.bigWin.cardReduction);
    skipProbability = Math.min(1, skipProbability + preset.bigWin.skipBoost);
  }

  cardCount = Math.max(preset.baseCardCount.min, cardCount);

  const skipRound = random() < skipProbability;

  let earlyExit = false;
  let rageQuit = false;

  if (
    preset.lossStreak.rageQuitAfter != null &&
    runtime.consecutiveLosses >= preset.lossStreak.rageQuitAfter
  ) {
    rageQuit = random() < 0.35 + runtime.consecutiveLosses * 0.1;
    earlyExit = rageQuit;
  }

  if (runtime.sessionPnl >= BIG_WIN_PNL_THRESHOLD && preset.bigWin.earlyExitProbability > 0) {
    earlyExit = earlyExit || random() < preset.bigWin.earlyExitProbability;
  }

  if (input.profile === "cautious" && runtime.consecutiveLosses >= 2) {
    earlyExit = earlyExit || random() < 0.4;
  }

  return {
    cardCount,
    roundDelaySeconds: Math.round(roundDelaySeconds),
    skipRound,
    earlyExit,
    rageQuit,
  };
}
