#!/usr/bin/env node
// 建 / 改 / 撤管理员的登录账号。管理员登录页没有注册（谁都能给自己开后台账号就等于没锁），
// 所以账号从这儿建。
//
// 用法：
//   npm run admin:user -- <管理员名> <邮箱>      建账号或者重设密码，挂到 admins 里那个人名下
//   npm run admin:user -- --remove <邮箱>        撤掉管理员（账号留着，只是不再是管理员）
//
// 「谁是管理员」记在登录账号的 app_metadata.admin_id 上（为什么见 lib/adminAuth.ts）。
// 撤掉之后，他手上的登录 token 要到过期（默认 1 小时）才失效。
//
// 连哪个库：跟应用一样看 NEXT_PUBLIC_SUPABASE_URL（.env.local），用 SUPABASE_SERVICE_ROLE_KEY。
// 要对 prod 操作，在命令前面临时设这两个变量；动手前会先打出来是哪个库。

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const die = (msg) => {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
};

function readEnvLocal() {
  const p = join(ROOT, ".env.local");
  if (!existsSync(p)) return {};
  const out = {};
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

/** 不回显地读一行（输密码用） */
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => {
      if (s.startsWith(question)) rl.output.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function findUserByEmail(supabase, email) {
  const target = email.toLowerCase();
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) die(`列账号失败：${error.message}`);
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 1000) return null;
  }
}

const env = { ...readEnvLocal(), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) die("缺 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY（.env.local）");

const PROD_REFS = JSON.parse(readFileSync(join(ROOT, "lib/prodRefs.json"), "utf8")).refs;
const ref = /^https?:\/\/([a-z0-9-]+)\.supabase\./i.exec(url)?.[1]?.toLowerCase() ?? "?";
console.log(`库：${PROD_REFS.includes(ref) ? "prod" : "test"}（${ref}）`);

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const args = process.argv.slice(2);

if (args[0] === "--remove") {
  const email = args[1];
  if (!email) die("用法：npm run admin:user -- --remove <邮箱>");
  const user = await findUserByEmail(supabase, email);
  if (!user) die(`没有 ${email} 这个账号`);
  const { admin_id, ...rest } = user.app_metadata ?? {};
  if (!admin_id) die(`${email} 本来就不是管理员`);
  const { error } = await supabase.auth.admin.updateUserById(user.id, { app_metadata: { ...rest, admin_id: null } });
  if (error) die(`撤销失败：${error.message}`);
  console.log(`✓ ${email} 不再是管理员（他手上的登录最多再管用 1 小时）`);
  process.exit(0);
}

const [adminName, email] = args;
if (!adminName || !email) die("用法：npm run admin:user -- <管理员名> <邮箱>");

const { data: admins, error: adminsError } = await supabase.from("admins").select("id, name");
if (adminsError) die(`读 admins 失败：${adminsError.message}`);
const admin = admins.find((a) => a.name === adminName);
if (!admin) die(`admins 里没有「${adminName}」。现有：${admins.map((a) => a.name).join("、")}（新管理员先在设置弹框里加）`);

// 一个管理员只挂一个账号：已经挂在别的账号上的话说出来，不悄悄变成两个
for (let page = 1; ; page++) {
  const { data } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
  const other = data.users.find(
    (u) => u.app_metadata?.admin_id === admin.id && (u.email ?? "").toLowerCase() !== email.toLowerCase()
  );
  if (other) die(`「${adminName}」已经挂在 ${other.email} 上了。先 --remove 那个再来`);
  if (data.users.length < 1000) break;
}

const password = await askHidden(`给 ${email} 设密码（至少 8 位）：`);
if (password.length < 8) die("密码至少 8 位");

const existing = await findUserByEmail(supabase, email);
if (existing) {
  const { error } = await supabase.auth.admin.updateUserById(existing.id, {
    password,
    app_metadata: { ...existing.app_metadata, admin_id: admin.id },
  });
  if (error) die(`更新失败：${error.message}`);
  console.log(`✓ ${email}（已有账号）现在是管理员「${adminName}」，密码已重设`);
} else {
  const { error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { admin_id: admin.id },
  });
  if (error) die(`建账号失败：${error.message}`);
  console.log(`✓ 建好了：${email} = 管理员「${adminName}」。去 /login/admin 登录`);
}
