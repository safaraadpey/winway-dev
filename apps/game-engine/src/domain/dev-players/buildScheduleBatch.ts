import type { DevPlayerRepo } from "../../repositories/devPlayerRepo.js";
import type { Logger } from "../../metrics/logger.js";
import { runDevPlayerManager } from "./runDevPlayerManager.js";
import type { BuildScheduleBatchOptions, BuildScheduleBatchResult } from "./types.js";

/** Scheduler entrypoint — delegates to Dev Player Manager. */
export async function buildScheduleBatch(
  repo: DevPlayerRepo,
  log: Logger,
  now: Date = new Date(),
  options?: BuildScheduleBatchOptions
): Promise<BuildScheduleBatchResult> {
  return runDevPlayerManager(repo, log, now, options);
}
