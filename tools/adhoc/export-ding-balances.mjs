import fs from "node:fs";
import path from "node:path";

const roleFa = {
  admin: "ادمین",
  super: "سوپر",
  agent: "ایجنت",
  player: "بازیکن",
};

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

const rows = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));

const headers = [
  "ردیف",
  "نام کاربری",
  "نام کامل",
  "نقش",
  "بالاسری",
  "موجودی دینگ",
  "قفل‌شده دینگ",
  "موجودی آزاد دینگ",
  "وضعیت",
];

const lines = [headers.map(csvEscape).join(",")];

rows.forEach((row, index) => {
  lines.push(
    [
      index + 1,
      row.username,
      row.full_name ?? "",
      roleFa[row.role] ?? row.role,
      row.parent_username ?? "",
      Number(row.ding_balance ?? 0),
      Number(row.ding_locked ?? 0),
      Number(row.ding_available ?? 0),
      row.status === "active" ? "فعال" : row.status,
    ]
      .map(csvEscape)
      .join(",")
  );
});

const totalBalance = rows.reduce((sum, row) => sum + Number(row.ding_balance ?? 0), 0);
const totalLocked = rows.reduce((sum, row) => sum + Number(row.ding_locked ?? 0), 0);
const totalAvailable = rows.reduce((sum, row) => sum + Number(row.ding_available ?? 0), 0);
const withBalance = rows.filter((row) => Number(row.ding_balance ?? 0) > 0).length;

lines.push("");
lines.push(
  [
    "جمع کل",
    `${rows.length} کاربر`,
    "",
    "",
    "",
    totalBalance,
    totalLocked,
    totalAvailable,
    `${withBalance} کاربر با موجودی`,
  ]
    .map(csvEscape)
    .join(",")
);

const outDir = path.resolve("exports");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "user-ding-balances-2026-08-20.csv");
fs.writeFileSync(outFile, `\uFEFF${lines.join("\n")}\n`, "utf8");
console.log(outFile);
console.log(`rows=${rows.length} with_balance=${withBalance} total=${totalBalance}`);
