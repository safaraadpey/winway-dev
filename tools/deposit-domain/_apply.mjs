import dotenv from "dotenv";
import fs from "fs";
import pg from "pg";
dotenv.config({ path: ".env.local" });
const sql = fs.readFileSync(
  "sql/migrations/20260803170000_p6_5_deposit_domain_foundation.sql",
  "utf8"
);
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
try {
  await pool.query(sql);
  console.log("P6_5_MIGRATION_OK");
} catch (e) {
  console.error("P6_5_MIGRATION_FAIL", e.message);
  process.exit(1);
} finally {
  await pool.end();
}
