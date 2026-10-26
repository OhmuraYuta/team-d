import { readFileSync } from "node:fs";
import { Client } from "pg";
import type { TestProject } from "vitest/node";

const BASE = "postgresql://teamd:teamd@localhost:5432";

/** AI_SPECIFICATION.md「3. Database Schema」に載っている DDL（```sql ブロック）を取り出す */
export function specDdl(): string {
  const spec = readFileSync("AI_SPECIFICATION.md", "utf8");
  const section = spec.slice(
    spec.indexOf("## 3. Database Schema"),
    spec.indexOf("## 4. API Endpoints")
  );
  const match = section.match(/```sql\n([\s\S]*?)```/);
  if (!match) throw new Error("AI_SPECIFICATION.md から DDL を取り出せません");
  return match[1];
}

/** DBを作り直してDDLを流し、その直後の system_settings の中身を返す */
async function recreate(admin: Client, name: string, ddl: string) {
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${name}`);
  const db = new Client({ connectionString: `${BASE}/${name}` });
  await db.connect();
  await db.query(ddl);
  const { rows } = await db.query("SELECT key, value FROM system_settings ORDER BY key");
  await db.end();
  return rows as { key: string; value: string }[];
}

declare module "vitest" {
  export interface ProvidedContext {
    initialSettings: {
      project: { key: string; value: string }[];
      spec: { key: string; value: string }[];
    };
  }
}

/**
 * テスト開始前に1回だけ実行される。
 * - teamd_test: プロジェクトのスキーマ (db/init/01_schema.sql) で作る。APIテストはこのDBを使う
 * - teamd_spec: 仕様書の DDL そのもので作る。スキーマが仕様どおりか比べるための「正解」
 * 前提: `npm run db:up` で Postgres コンテナが起動していること。
 */
export default async function setup({ provide }: TestProject) {
  const admin = new Client({ connectionString: `${BASE}/teamd_dev` });
  try {
    await admin.connect();
  } catch {
    throw new Error("Postgres に接続できません。先に `npm run db:up` を実行してください。");
  }
  const project = await recreate(
    admin,
    "teamd_test",
    readFileSync("db/init/01_schema.sql", "utf8")
  );
  const spec = await recreate(admin, "teamd_spec", specDdl());
  await admin.end();

  // 各テストは毎回データを入れ直すので、「スキーマ投入直後の初期データ」はここで記録してテストに渡す
  provide("initialSettings", { project, spec });
}
