import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { ADMIN_DATABASE_URL, BASE_URL, PORT, SERVER_ENV } from "./env";

/**
 * 結合テスト全体の準備と後片付け（最初と最後に1回だけ動く）
 *  1. テスト専用DB teamd_it を作り直し、db/init/01_schema.sql を流す
 *  2. next build（INTEGRATION_SKIP_BUILD=1 なら前回のビルドを使い回す）
 *  3. next start でポート 3100 にサーバーを起動し、応答するまで待つ
 *  4. 全テスト後にサーバーを止める
 * 前提: `npm run db:up` で Postgres が起動していること。
 */
let server: ChildProcess | undefined;

export default async function setup() {
  await recreateDatabase();

  const env = { ...process.env, ...SERVER_ENV };
  if (process.env.INTEGRATION_SKIP_BUILD !== "1") {
    console.log("[integration] next build 中...（1分ほどかかります）");
    const build = spawnSync("npx", ["next", "build"], { env, encoding: "utf8" });
    if (build.status !== 0) {
      throw new Error(`next build に失敗しました\n${build.stdout}\n${build.stderr}`);
    }
  }

  await assertPortFree();
  console.log(`[integration] next start (port ${PORT})`);
  server = spawn("npx", ["next", "start", "--port", String(PORT)], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true, // npx の子プロセスごとまとめて止められるよう、別プロセスグループにする
  });
  let log = "";
  server.stdout?.on("data", (d) => (log += d));
  server.stderr?.on("data", (d) => (log += d));
  await waitForServer(() => log);

  return async function teardown() {
    if (server?.pid) {
      try {
        process.kill(-server.pid, "SIGTERM");
      } catch {
        /* すでに終了している */
      }
    }
  };
}

async function recreateDatabase() {
  const admin = new Client({ connectionString: ADMIN_DATABASE_URL });
  try {
    await admin.connect();
  } catch {
    throw new Error("Postgres に接続できません。先に `npm run db:up` を実行してください。");
  }
  await admin.query("DROP DATABASE IF EXISTS teamd_it WITH (FORCE)");
  await admin.query("CREATE DATABASE teamd_it");
  await admin.end();

  const db = new Client({ connectionString: SERVER_ENV.DATABASE_URL });
  await db.connect();
  await db.query(readFileSync("db/init/01_schema.sql", "utf8"));
  await db.end();
}

async function assertPortFree() {
  try {
    await fetch(BASE_URL);
  } catch {
    return; // 繋がらない = 空いている
  }
  throw new Error(
    `ポート ${PORT} がすでに使われています。前回のテストサーバーが残っていないか確認してください。`
  );
}

async function waitForServer(getLog: () => string) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server?.exitCode !== null && server?.exitCode !== undefined) {
      throw new Error(`next start が終了しました\n${getLog()}`);
    }
    try {
      const res = await fetch(`${BASE_URL}/login`);
      if (res.ok) return;
    } catch {
      /* まだ起動中 */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`サーバーが60秒以内に起動しませんでした\n${getLog()}`);
}
