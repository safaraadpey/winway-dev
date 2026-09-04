#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs";
import pg from "pg";

const DB = process.env.DATABASE_URL;
const file = process.argv[2];
if (!DB || !file) {
  console.error("Usage: tsx apply-migration-once.ts <path-to.sql>");
  process.exit(2);
}

async function main(): Promise<void> {
  const sql = fs.readFileSync(file, "utf8");
  const client = new pg.Client({
    connectionString: DB,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(sql);
    console.log("migration applied:", file);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
