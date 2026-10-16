#!/usr/bin/env node
// 合并之前先在本地验一个分支（PR）。
//
// 用法（在主目录 ~/code/beta-app 里跑，或者在哪个 worktree 里跑都行）：
//   npm run try -- <分支名>
//   npm run try -- claude/project-thread-cw833d
//
// 它做的事：
//   1. 拉这个分支最新的代码
//   2. 放进一个**专门验分支用的** worktree（主目录旁边的 beta-app-try），
//      第一次就建，以后每次切过去 —— 主目录正在跑的 dev server、写到一半的代码一律不碰
//   3. 把主目录的 .env.local 拷过去、node_modules 链过去（CLAUDE.md「多会话并行」那三步）
//   4. 在那边起 `npm run dev`。3000 被主目录占着的话 Next 自己往后挑 3001…，看终端打出来的地址
//
// 切的是 detached HEAD，不是把分支 checkout 出来：同一个分支要是已经在别的 worktree 里
// checkout 着，git 不让再 checkout 一次。验分支只看不改，detached 正好。
//
// 那个 worktree 里有没提交的改动就停下来、不切 —— 切过去等于把改动冲掉。

import { execFileSync, spawn } from "node:child_process";
import { existsSync, copyFileSync, symlinkSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const die = (msg) => {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
};
const git = (args, cwd) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const branch = process.argv[2];
if (!branch) die("要给分支名：npm run try -- <分支名>（PR 页面上 head 那个）");

// 主目录 = 共用 .git 的那个目录。在哪个 worktree 里跑都能找回它
const commonDir = resolve(git(["rev-parse", "--git-common-dir"], process.cwd()));
const MAIN = dirname(commonDir);
const TRY = join(dirname(MAIN), "beta-app-try");

console.log(`→ 拉 origin/${branch}`);
try {
  git(["fetch", "origin", `+refs/heads/${branch}:refs/remotes/origin/${branch}`], MAIN);
} catch (e) {
  die(`拉不到 origin/${branch}：${String(e.stderr || e.message).trim()}`);
}

if (!existsSync(TRY)) {
  console.log(`→ 建 worktree：${TRY}`);
  git(["worktree", "add", "--detach", TRY, `origin/${branch}`], MAIN);
} else {
  const dirty = git(["status", "--porcelain", "--untracked-files=no"], TRY);
  if (dirty) die(`${TRY} 里有没提交的改动，先处理掉再切：\n${dirty}`);
  console.log(`→ 切到 origin/${branch}`);
  git(["checkout", "--detach", `origin/${branch}`], TRY);
}

// .env.local 每次都拷：主目录里改过连接串，这边跟着变
const env = join(MAIN, ".env.local");
if (existsSync(env)) copyFileSync(env, join(TRY, ".env.local"));
else console.warn("! 主目录没有 .env.local，dev server 连不上库");

if (!existsSync(join(TRY, "node_modules"))) symlinkSync(join(MAIN, "node_modules"), join(TRY, "node_modules"));
// node_modules 是跟主目录共用的。这个分支改了依赖的话共用的那份就不对了 —— 说一声，不替人装
const lock = (dir) => (existsSync(join(dir, "package-lock.json")) ? readFileSync(join(dir, "package-lock.json"), "utf8") : "");
if (lock(MAIN) !== lock(TRY)) {
  console.warn("! 这个分支的 package-lock.json 跟主目录不一样（改了依赖），共用的 node_modules 可能对不上");
}

const head = git(["log", "-1", "--format=%h %s"], TRY);
console.log(`\n✓ ${TRY} 现在是 ${branch}（${head}）\n→ 起 dev server，Ctrl+C 停\n`);
spawn("npm", ["run", "dev"], { cwd: TRY, stdio: "inherit" }).on("exit", (code) => process.exit(code ?? 0));
