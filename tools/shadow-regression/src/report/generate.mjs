import fs from "node:fs/promises";
import path from "node:path";

/**
 * @param {import('../framework/types.mjs').ScenarioResult[]} results
 * @param {{ engine: string, startedAt: string, finishedAt: string }} meta
 * @param {string} reportsDir
 */
export async function writeReports(results, meta, reportsDir) {
  await fs.mkdir(reportsDir, { recursive: true });

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const skipped = results.filter((r) => r.status === "SKIP").length;
  const overall = failed === 0 ? "PASS" : "FAIL";

  const report = {
    overall,
    ...meta,
    summary: { total: results.length, passed, failed, skipped },
    results,
  };

  const jsonPath = path.join(reportsDir, "latest.json");
  const mdPath = path.join(reportsDir, "latest.md");
  const stamped = path.join(
    reportsDir,
    `report-${meta.finishedAt.replace(/[:.]/g, "-")}.json`
  );

  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
  await fs.writeFile(stamped, JSON.stringify(report, null, 2), "utf8");
  await fs.writeFile(mdPath, toMarkdown(report), "utf8");

  return { overall, jsonPath, mdPath, report };
}

/**
 * @param {any} report
 */
function toMarkdown(report) {
  const lines = [
    `# Platform Shadow Regression Report`,
    ``,
    `**Overall:** ${report.overall}`,
    `**Engine:** ${report.engine}`,
    `**Started:** ${report.startedAt}`,
    `**Finished:** ${report.finishedAt}`,
    ``,
    `| PASS | FAIL | SKIP | TOTAL |`,
    `|-----:|-----:|-----:|------:|`,
    `| ${report.summary.passed} | ${report.summary.failed} | ${report.summary.skipped} | ${report.summary.total} |`,
    ``,
    `## Scenarios`,
    ``,
    `| Status | ID | Title | Room | Session | Duration ms | Mismatch |`,
    `|---|---|---|---|---|---:|---|`,
  ];

  for (const r of report.results) {
    lines.push(
      `| ${r.status} | ${r.id} | ${escapeMd(r.title)} | ${r.roomId ?? "-"} | ${r.sessionId ?? "-"} | ${r.durationMs} | ${escapeMd(r.mismatch || r.skipReason || "")} |`
    );
  }

  lines.push(``, `## Soft issues`, ``);
  for (const r of report.results) {
    const soft = (r.issues || []).filter((i) => i.severity === "soft");
    if (!soft.length) continue;
    lines.push(`### ${r.id}`);
    for (const s of soft) lines.push(`- \`${s.code}\`: ${s.message}`);
  }

  lines.push(``);
  return lines.join("\n");
}

function escapeMd(s) {
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}
