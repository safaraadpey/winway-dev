import { msUntilNextTehranRun } from "./tehran.js";

export type SchedulerConfig = {
  hour: number;
  minute: number;
  runOnStart: boolean;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function startDailyScheduler(
  config: SchedulerConfig,
  run: () => Promise<void>
): Promise<void> {
  if (config.runOnStart) {
    console.log("[Backup] run-on-start enabled");
    await run().catch((err) => {
      console.error("[Backup] run-on-start failed", err);
    });
  }

  for (;;) {
    const waitMs = msUntilNextTehranRun(new Date(), config.hour, config.minute);
    const nextAt = new Date(Date.now() + waitMs).toISOString();
    console.log("[Backup] sleeping until next run", {
      waitMs,
      nextAt,
      hour: config.hour,
      minute: config.minute,
      timezone: "Asia/Tehran",
    });
    await sleep(waitMs);
    await run().catch((err) => {
      console.error("[Backup] scheduled run failed", err);
    });
  }
}
