#!/usr/bin/env node
/**
 * 将当前系统 .env.local 同步为 env.test，并推送到公司 GitLab（永不推 GitHub）。
 *
 * - 源文件: .env.local
 * - 产物:   env.test（本地 gitignore，不会进 origin/GitHub）
 * - 远端:   gitlab → 独立分支 ops/env（仅含 env.test，与代码分支隔离）
 *
 * Usage: npm run env:gitlab
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, ".env.local");
const OUT = path.join(ROOT, "env.test");
const GITLAB_REMOTE = "gitlab";
const GITLAB_BRANCH = "ops/env";

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    cwd: opts.cwd ?? ROOT,
    encoding: "utf8",
    stdio: opts.stdio ?? ["ignore", "pipe", "pipe"],
  }).trim();
}

function remoteUrl(name) {
  try {
    return run("git", ["remote", "get-url", name]);
  } catch {
    return "";
  }
}

function assertGitlabOnly() {
  const url = remoteUrl(GITLAB_REMOTE);
  if (!url) {
    console.error(
      `Missing git remote "${GITLAB_REMOTE}". Add: git remote add gitlab <公司 GitLab URL>`
    );
    process.exit(1);
  }
  if (/github\.com/i.test(url)) {
    console.error(
      `Refusing to sync: remote "${GITLAB_REMOTE}" points at GitHub:\n  ${url}`
    );
    process.exit(1);
  }
  const origin = remoteUrl("origin");
  if (origin && /github\.com/i.test(origin) === false && /gitlab/i.test(origin)) {
    // unusual but allowed
  }
  if (origin && origin === url) {
    console.warn(
      `⚠ origin 与 gitlab 是同一地址；仍只推送分支 ${GITLAB_BRANCH}，不会改 main。`
    );
  }
  return url;
}

function buildEnvTest() {
  if (!fs.existsSync(SRC)) {
    console.error("Missing .env.local — copy from .env.example first");
    process.exit(1);
  }
  const body = fs.readFileSync(SRC, "utf8").replace(/\r\n/g, "\n").trimEnd();
  const stamp = new Date().toISOString().slice(0, 19).replace("T", " ");
  const header = [
    "# env.test — Tangbuy 公司 GitLab 部署用（由 .env.local 同步）",
    `# 生成时间: ${stamp}`,
    "# 警告: 含密钥。仅允许推送到 gitlab.tangbuy.cn；禁止进入 GitHub。",
    "# 同步命令: npm run env:gitlab",
    "",
  ].join("\n");
  fs.writeFileSync(OUT, `${header}${body}\n`, "utf8");
  const keys = body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => l.split("=")[0]);
  return keys;
}

function pushOpsEnvBranch(gitlabUrl) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tb-env-gitlab-"));
  try {
    // Detached worktree, then orphan branch → ops/env 只含 env 文件，不污染 main 历史
    run("git", ["worktree", "add", "--detach", tmp, "HEAD"]);
    run("git", ["checkout", "--orphan", GITLAB_BRANCH], { cwd: tmp });
    // 清空孤儿分支上的全部 tracked 文件
    try {
      run("git", ["rm", "-rf", "--ignore-unmatch", "."], { cwd: tmp });
    } catch {
      /* empty tree */
    }
    // 再清未跟踪残留
    for (const name of fs.readdirSync(tmp)) {
      if (name === ".git") continue;
      fs.rmSync(path.join(tmp, name), { recursive: true, force: true });
    }

    fs.copyFileSync(OUT, path.join(tmp, "env.test"));
    fs.writeFileSync(
      path.join(tmp, "README.md"),
      [
        "# ops/env",
        "",
        "公司 GitLab 部署环境变量分支（与 `main` 代码隔离）。",
        "",
        "- 文件: `env.test`（由开发机 `.env.local` 同步）",
        "- 更新: 在主仓执行 `npm run env:gitlab`",
        "- **禁止**推送到 GitHub / `origin`",
        "",
      ].join("\n"),
      "utf8"
    );

    execFileSync("git", ["add", "-f", "env.test", "README.md"], {
      cwd: tmp,
      stdio: "inherit",
    });
    execFileSync(
      "git",
      [
        "commit",
        "-m",
        "chore(env): sync env.test for company GitLab deploy",
      ],
      { cwd: tmp, stdio: "inherit" }
    );
    // 独立分支允许 force，保证始终只有最新一份 env
    execFileSync(
      "git",
      [
        "push",
        "--force",
        "-u",
        GITLAB_REMOTE,
        `HEAD:refs/heads/${GITLAB_BRANCH}`,
      ],
      { cwd: tmp, stdio: "inherit" }
    );
    console.log(`✓ 已推送到 ${gitlabUrl}`);
    console.log(`  分支: ${GITLAB_BRANCH}`);
    console.log(`  文件: env.test`);
  } finally {
    try {
      run("git", ["worktree", "remove", "--force", tmp]);
    } catch {
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      try {
        run("git", ["worktree", "prune"]);
      } catch {
        /* ignore */
      }
    }
    // 不保留本地 ops/env，避免误 merge 进 main 把密钥带进 GitHub
    try {
      run("git", ["branch", "-D", GITLAB_BRANCH]);
    } catch {
      /* may not exist locally */
    }
  }
}

const gitlabUrl = assertGitlabOnly();
const keys = buildEnvTest();
console.log(`✓ 已写入 env.test（${keys.length} keys）← .env.local`);
console.log(`  keys: ${keys.join(", ")}`);
pushOpsEnvBranch(gitlabUrl);
console.log(
  "\n提醒: env.test 在 .gitignore 中；日常 git push origin / GitHub 不会带上密钥。"
);
