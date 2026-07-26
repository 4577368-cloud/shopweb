#!/usr/bin/env node
/**
 * 快速更新 .env.local 中的 key，支持批量替换与验证。
 * Usage:
 *   node scripts/update-env.mjs KEY=VALUE
 *   node scripts/update-env.mjs KEY1=VAL1 KEY2=VAL2
 *   node scripts/update-env.mjs --from-render        # 从 Render 拉取（需装 render CLI）
 *   node scripts/update-env.mjs --to-render          # 推送到 Render（需装 render CLI）
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ENV_PATH = path.resolve(process.cwd(), ".env.local");
const BACKUP_PATH = path.resolve(process.cwd(), `.env.local.backup-${Date.now()}`);

function readEnv() {
  if (!fs.existsSync(ENV_PATH)) {
    console.error("Missing .env.local — copy from .env.example first");
    process.exit(1);
  }
  return fs.readFileSync(ENV_PATH, "utf8");
}

function writeEnv(content) {
  fs.copyFileSync(ENV_PATH, BACKUP_PATH);
  fs.writeFileSync(ENV_PATH, content, "utf8");
  console.log(`✓ .env.local updated (backup: ${path.basename(BACKUP_PATH)})`);
}

function updateKeys(content, entries) {
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

  // Append keys not found in existing file
  for (const [key, value] of entries) {
    if (!updated.has(key)) {
      result.push(`${key}=${value}`);
      updated.add(key);
      console.log(`+ appended new key: ${key}`);
    } else {
      console.log(`~ updated: ${key}`);
    }
  }
  return result.join("\n");
}

function resolveKeysJsonPath() {
  const home = process.env.HOME || process.env.USERPROFILE || process.cwd();
  const desktop = path.resolve(home, "Desktop", "env.keys.json");
  const dotdir = path.resolve(home, ".tangbuy", "env.keys.json");
  if (fs.existsSync(desktop)) return desktop;
  if (fs.existsSync(dotdir)) return dotdir;
  const local = path.resolve(process.cwd(), "env.keys.json");
  if (fs.existsSync(local)) return local;
  return null;
}

function readKeysJson() {
  const p = resolveKeysJsonPath();
  if (!p) return null;
  try {
    const data = JSON.parse(fs.readFileSync(p, "utf8"));
    const entries = new Map();
    for (const [k, v] of Object.entries(data)) {
      if (!k.startsWith("_")) entries.set(k, v);
    }
    return entries;
  } catch {
    return null;
  }
}

function parseArgs(args) {
  const entries = new Map();
  const flags = { fromRender: false, toRender: false, fromJson: false };
  for (const arg of args) {
    if (arg === "--from-render") flags.fromRender = true;
    else if (arg === "--to-render") flags.toRender = true;
    else if (arg === "--from-json") flags.fromJson = true;
    else {
      const eq = arg.indexOf("=");
      if (eq > 0) entries.set(arg.slice(0, eq), arg.slice(eq + 1));
      else console.warn(`? ignored: ${arg}`);
    }
  }
  return { entries, flags };
}

function renderServiceName() {
  // infer from existing env or fallback
  const content = readEnv();
  const m = content.match(/NEXT_PUBLIC_API_BASE=https:\/\/([^\.]+)\.onrender\.com/);
  return m ? m[1] : null;
}

function pullFromRender(service) {
  try {
    const out = execSync(`render env list --service ${service} --format json`, { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] });
    const list = JSON.parse(out);
    const entries = new Map();
    for (const item of list) {
      if (item.key && item.value !== undefined) entries.set(item.key, item.value);
    }
    return entries;
  } catch (e) {
    console.error("✗ Failed to pull from Render. Is 'render' CLI installed and logged in?");
    console.error("  Install: https://render.com/docs/cli");
    console.error("  Login:   render login");
    process.exit(1);
  }
}

function pushToRender(service, entries) {
  for (const [key, value] of entries) {
    try {
      execSync(`render env set ${key}="${value.replace(/"/g, '\\"')}" --service ${service}`, { stdio: "inherit" });
      console.log(`✓ Render ${key} synced`);
    } catch {
      console.error(`✗ Render ${key} failed`);
    }
  }
}

// ===== Main =====
const { entries, flags } = parseArgs(process.argv.slice(2));
const service = renderServiceName();

if (flags.fromRender) {
  if (!service) {
    console.error("✗ Cannot infer Render service name from NEXT_PUBLIC_API_BASE");
    process.exit(1);
  }
  console.log(`Pulling env from Render service: ${service}...`);
  const remote = pullFromRender(service);
  const content = readEnv();
  const updated = updateKeys(content, remote);
  writeEnv(updated);
  console.log(`Synced ${remote.size} keys from Render`);
} else if (flags.toRender) {
  if (!service) {
    console.error("✗ Cannot infer Render service name");
    process.exit(1);
  }
  let toPush = entries;
  if (entries.size === 0 && flags.fromJson) {
    const jsonEntries = readKeysJson();
    if (!jsonEntries || jsonEntries.size === 0) {
      console.error("✗ No keys found in env.keys.json (checked Desktop / ~/.tangbuy / project root)");
      process.exit(1);
    }
    toPush = jsonEntries;
    console.log(`→ Pushing ${toPush.size} keys from env.keys.json to Render...`);
  }
  if (toPush.size === 0) {
    console.error("Usage: node scripts/update-env.mjs KEY=VALUE --to-render  OR  --to-render --from-json");
    process.exit(1);
  }
  pushToRender(service, toPush);
} else {
  if (entries.size === 0) {
    console.log("Usage: node scripts/update-env.mjs KEY=VALUE [KEY2=VALUE2] [--to-render] [--from-render]");
    process.exit(0);
  }
  const content = readEnv();
  const updated = updateKeys(content, entries);
  writeEnv(updated);
}

// Run validation
console.log("\nRunning validation...");
try {
  execSync("node scripts/validate-env.mjs", { stdio: "inherit" });
} catch {
  // validation prints its own errors
}
