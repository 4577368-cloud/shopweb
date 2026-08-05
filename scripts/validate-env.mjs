#!/usr/bin/env node
/**
 * Sanity-check env files (no secret values printed).
 * Usage: node scripts/validate-env.mjs [.env.local]
 */
import fs from "node:fs";
import path from "node:path";

const envPath = path.resolve(process.cwd(), process.argv[2] ?? ".env.local");
if (!fs.existsSync(envPath)) {
  console.error(`Missing ${envPath} — copy from .env.example`);
  process.exit(1);
}

const raw = fs.readFileSync(envPath, "utf8");
const vars = {};
for (const line of raw.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq < 1) continue;
  vars[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
}

const required = ["NEXT_PUBLIC_API_BASE"];
const recommended = [
  "NEXT_PUBLIC_TANGBUY_MALL_GATEWAY_BASE_URL",
  "TANGBUY_ADMIN_API_BASE",
  "TANGBUY_ADMIN_TOKEN",
  "NEXT_PUBLIC_TANGBUY_ADMIN_BROWSER_TOKEN",
];

let failed = false;
for (const key of required) {
  if (!vars[key]) {
    console.error(`✗ missing required: ${key}`);
    failed = true;
  } else {
    console.log(`✓ ${key}`);
  }
}

for (const key of recommended) {
  if (!vars[key]) {
    console.warn(`⚠ missing recommended: ${key}`);
  } else {
    console.log(`✓ ${key}`);
  }
}

const apiBase = vars.NEXT_PUBLIC_API_BASE ?? "";
if (apiBase.includes("localhost") && !apiBase.includes("127.0.0.1")) {
  console.warn(
    "⚠ NEXT_PUBLIC_API_BASE uses localhost — prefer 127.0.0.1 for local plugin or the GitLab gateway URL for production"
  );
}

if (
  vars.TANGBUY_ADMIN_TOKEN &&
  !vars.NEXT_PUBLIC_TANGBUY_ADMIN_BROWSER_TOKEN
) {
  console.warn(
    "⚠ Set NEXT_PUBLIC_TANGBUY_ADMIN_BROWSER_TOKEN to the same JWT as TANGBUY_ADMIN_TOKEN (1688 入池需浏览器直连 admin)"
  );
}

if (vars.NEXT_PUBLIC_TANGBUY_MALL_TOKEN) {
  console.warn(
    "⚠ NEXT_PUBLIC_TANGBUY_MALL_TOKEN is deprecated — mall/catalog/estimate use the logged-in user's TANGBUY_TOKEN / embedded platform token"
  );
}

if (failed) process.exit(1);
console.log("\nEnv structure OK (mall auth = per-user portal JWT; Shopify keys live on the plugin host).");
