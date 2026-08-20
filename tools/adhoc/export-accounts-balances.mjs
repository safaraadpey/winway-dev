import fs from "node:fs";
import path from "node:path";

const rows = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));

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

function uplineAgent(row) {
  if (row.assigned_agent) return row.assigned_agent;
  if (row.parent_role === "agent" || row.parent_role === "super") return row.parent_username;
  return "";
}

function uplineSuper(row) {
  if (row.assigned_super) return row.assigned_super;
  if (row.parent_role === "super") return row.parent_username;
  if (row.parent_role === "agent" && row.parent_username) return row.parent_username;
  return "";
}

const headers = [
  "ردیف",
  "نام کاربری",
  "نام کامل",
  "نقش",
  "وضعیت",
  "بالاسری مستقیم",
  "نقش بالاسری",
  "ایجنت بالاسری",
  "سوپر بالاسری",
  "موجودی ریالی",
  "قفل‌شده ریالی",
  "موجودی دینگ",
  "قفل‌شده دینگ",
  "کد معرف",
];

const lines = [headers.map(csvEscape).join(",")];

rows.forEach((row, index) => {
  lines.push(
    [
      index + 1,
      row.username,
      row.full_name ?? "",
      roleFa[row.role] ?? row.role,
      row.status === "active" ? "فعال" : row.status,
      row.parent_username ?? "",
      row.parent_role ? roleFa[row.parent_role] ?? row.parent_role : "",
      uplineAgent(row),
      uplineSuper(row),
      Number(row.wallet_balance_irr ?? 0),
      Number(row.wallet_locked_irr ?? 0),
      Number(row.ding_balance ?? 0),
      Number(row.ding_locked ?? 0),
      row.referral_code ?? "",
    ]
      .map(csvEscape)
      .join(",")
  );
});

const totalIrr = rows.reduce((sum, row) => sum + Number(row.wallet_balance_irr ?? 0), 0);
const totalDing = rows.reduce((sum, row) => sum + Number(row.ding_balance ?? 0), 0);

lines.push("");
lines.push(
  [
    "جمع کل",
    `${rows.length} اکانت`,
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    totalIrr,
    "",
    totalDing,
    "",
    "",
  ]
    .map(csvEscape)
    .join(",")
);

const outDir = path.resolve("exports");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "accounts-with-balances-2026-08-20.csv");
fs.writeFileSync(outFile, `\uFEFF${lines.join("\n")}\n`, "utf8");
console.log(outFile);
console.log(`rows=${rows.length} total_irr=${totalIrr} total_ding=${totalDing}`);
