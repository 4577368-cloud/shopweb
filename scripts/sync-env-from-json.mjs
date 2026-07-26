#!/usr/bin/env node
/**
 * 从桌面 env.keys.json 同步到本地 .env.local
 * 支持双端映射格式：{ key: { local, render, value } }
 * Usage: npm run env:sync
 */
import fs from "node:fs";
import path from "node:path";

const HOME_DIR = process.env.HOME || process.env.USERPROFILE || process.cwd();
const DESKTOP_KEYS_PATH = path.resolve(HOME_DIR, "Desktop", "env.keys.json");
const ENV_PATH = path.resolve(process.cwd(), ".env.local");
const BACKUP_PATH = path.resolve(process.cwd(), `.env.local.backup-${Date.now()}`);

if (!fs.existsSync(DESKTOP_KEYS_PATH)) {
  console.error(`Missing ~/Desktop/env.keys.json`);
  process.exit(1);
}
if (!fs.existsSync(ENV_PATH)) {
  console.error("Missing .env.local — 先从 .env.example 复制");
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(DESKTOP_KEYS_PATH, "utf8"));
const entries = new Map(); // localVarName -> value
const renderCommands = [];

for (const [groupKey, group] of Object.entries(raw)) {
  if (groupKey.startsWith("_")) continue;
  if (typeof group !== "object" || group === null) continue;

  const localKey = group.local;
  const renderKey = group.render;
  const value = group.value;

  if (localKey && value !== undefined) {
    entries.set(localKey, String(value));
  }
  if (renderKey && value !== undefined) {
    renderCommands.push({ renderKey, value: String(value) });
  }
}

const content = fs.readFileSync(ENV_PATH, "utf8");
const lines = content.split("\n");
const updated = new Set();
const result = lines.map((line) => {
  const t = line.trim();
  if (!t || t.startsWith("#")) return line;
  const eq = t.indexOf("=");
  if (eq < 1) return line;
  const key = t.slice(0, eq).trim();
  if (entries.has(key)) {
    updated.add(key);
    return `${key}=${entries.get(key)}`;
  }
  return line;
});

let appended = 0;
for (const [key, value] of entries) {
  if (!updated.has(key)) {
    result.push(`${key}=${value}`);
    appended++;
  }
}

fs.copyFileSync(ENV_PATH, BACKUP_PATH);
fs.writeFileSync(ENV_PATH, result.join("\n"), "utf8");

console.log(`✓ 已同步 ${updated.size} 个 key${appended > 0 ? `，追加 ${appended} 个` : ""} 到 .env.local`);
console.log(`  备份: ${path.basename(BACKUP_PATH)}`);

// 输出 Render 手动设置清单
if (renderCommands.length > 0) {
  console.log(`\n📋 Render Dashboard 需手动设置的变量（${renderCommands.length} 个）：`);
  for (const { renderKey, value } of renderCommands) {
    console.log(`  ${renderKey}=${value}`);
  }
  console.log("\n  请复制以上到 https://dashboard.render.com → shop-x2mw → Environment");
}

// 校验
try {
  const { execSync } = await import("node:child_process");
  execSync("node scripts/validate-env.mjs", { stdio: "inherit" });
} catch {
  /* validation prints its own errors */
}
