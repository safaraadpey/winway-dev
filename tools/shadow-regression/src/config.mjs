import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");

dotenv.config({ path: path.join(root, ".env.local") });
dotenv.config({ path: path.join(root, ".env") });

export const config = {
  root,
  databaseUrl: process.env.DATABASE_URL?.trim() || "",
  engine: (process.env.SHADOW_REGRESSION_ENGINE || "bingo").trim(),
  filter: (process.env.SHADOW_REGRESSION_FILTER || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  keepRooms: process.env.SHADOW_REGRESSION_KEEP_ROOMS === "1",
  drainWaitMs: Number(process.env.SHADOW_REGRESSION_DRAIN_WAIT_MS || 15000),
  reportsDir: path.join(root, "tools/shadow-regression/reports"),
  maxRetryAcceptable: Number(process.env.SHADOW_REGRESSION_MAX_RETRY || 5),
};
