#!/usr/bin/env node
/**
 * Audit i18n: missing keys, zh same-as-en, zh still English.
 * Run: node --experimental-strip-types scripts/audit-i18n.mjs
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import { en } from "../src/i18n/messages/en.ts";
import { zh } from "../src/i18n/messages/zh.ts";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");

function flatten(obj, prefix = "") {
  const keys = {};
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") keys[path] = v;
    else if (v && typeof v === "object") Object.assign(keys, flatten(v, path));
  }
  return keys;
}

function walkDir(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!entry.includes("node_modules")) walkDir(full, files);
    } else if ([".ts", ".tsx"].includes(extname(entry))) {
      files.push(full);
    }
  }
  return files;
}

function isMostlyEnglish(text) {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const letters = (text.match(/[a-zA-Z]/g) || []).length;
  if (letters < 6) return false;
  return cjk < 2;
}

const flatEn = flatten(en);
const flatZh = flatten(zh);

const usedKeys = new Set();
const keyRe = /\bt\(\s*["'`]([^"'`]+)["'`]/g;
for (const file of walkDir(join(ROOT, "src"))) {
  const content = readFileSync(file, "utf8");
  let m;
  while ((m = keyRe.exec(content))) usedKeys.add(m[1]);
}

const missingZh = [...usedKeys].filter((k) => flatZh[k] === undefined).sort();
const missingEn = [...usedKeys].filter((k) => flatEn[k] === undefined).sort();
const sameAsEn = [...usedKeys]
  .filter((k) => flatZh[k] && flatEn[k] && flatZh[k] === flatEn[k])
  .sort();
const looksEnglish = [...usedKeys]
  .filter((k) => flatZh[k] && isMostlyEnglish(flatZh[k]))
  .sort();

// Keys where zh value is clearly wrong (not same as en, but semantically swapped - hard to auto-detect)
// Shuffled detection: zh !== en but zh matches a different en key's value
const enValueToKeys = new Map();
for (const [k, v] of Object.entries(flatEn)) {
  if (!enValueToKeys.has(v)) enValueToKeys.set(v, []);
  enValueToKeys.get(v).push(k);
}
const likelyShuffled = [...usedKeys]
  .filter((k) => {
    const z = flatZh[k];
    const e = flatEn[k];
    if (!z || !e || z === e) return false;
    const owners = enValueToKeys.get(z);
    return owners && owners.length > 0 && !owners.includes(k);
  })
  .sort();

console.log(`Used keys: ${usedKeys.size}`);
console.log(`Missing in zh: ${missingZh.length}`);
for (const k of missingZh) {
  console.log(`  MISSING zh  ${k}`);
  console.log(`    en: ${(flatEn[k] || "(none)").slice(0, 100)}`);
}

console.log(`\nMissing in en: ${missingEn.length}`);
for (const k of missingEn.slice(0, 30)) console.log(`  MISSING en  ${k}`);

console.log(`\nzh same as en (used): ${sameAsEn.length}`);
for (const k of sameAsEn) console.log(`  SAME  ${k}: ${flatZh[k].slice(0, 90)}`);

console.log(`\nzh looks English (used): ${looksEnglish.length}`);
for (const k of looksEnglish) {
  if (sameAsEn.includes(k)) continue;
  console.log(`  EN?   ${k}: ${flatZh[k].slice(0, 90)}`);
}

console.log(`\nLikely shuffled (zh = another key's en value): ${likelyShuffled.length}`);
for (const k of likelyShuffled.slice(0, 80)) {
  const owners = enValueToKeys.get(flatZh[k]) || [];
  console.log(`  SHUF  ${k}`);
  console.log(`    zh: ${flatZh[k].slice(0, 80)}`);
  console.log(`    en should be: ${(flatEn[k] || "").slice(0, 80)}`);
  console.log(`    zh matches en key(s): ${owners.slice(0, 3).join(", ")}`);
}
