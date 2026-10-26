/**
 * 仕様: AI_SPECIFICATION.md 3「Database Schema」, 6.2「インデックス設計」
 * 仕様書の DDL から作ったDB (teamd_spec) を正解として、プロジェクトのスキーマ (teamd_test) と比べる。
 */
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { Client } from "pg";
import { pool } from "@/lib/db";

const spec = new Client({ connectionString: "postgresql://teamd:teamd@localhost:5432/teamd_spec" });
beforeAll(() => spec.connect());
afterAll(() => spec.end());

type Db = { query: (sql: string) => Promise<{ rows: Record<string, unknown>[] }> };

/** 各テーブルの列（型・NOT NULL・デフォルト値） */
async function columns(db: Db) {
  const { rows } = await db.query(`
    SELECT table_name, column_name, data_type, character_maximum_length AS len,
           is_nullable, column_default
    FROM information_schema.columns WHERE table_schema = 'public'
    ORDER BY table_name, column_name`);
  return rows;
}

/** 主キー・一意制約・外部キー（ON DELETE の挙動を含む） */
async function constraints(db: Db) {
  const { rows } = await db.query(`
    SELECT conrelid::regclass::text AS table_name, contype,
           pg_get_constraintdef(oid) AS definition
    FROM pg_constraint WHERE connamespace = 'public'::regnamespace
    ORDER BY 1, 2, 3`);
  return rows;
}

describe("[3] DBスキーマは仕様書の DDL と一致する", () => {
  it("テーブルの一覧が同じ", async () => {
    const tables = async (db: Db) =>
      (
        await db.query(
          `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1`
        )
      ).rows.map((r) => r.table_name);
    expect(await tables(pool)).toEqual(await tables(spec));
  });

  it("全テーブルの列名・型・長さ・NOT NULL・デフォルト値が同じ", async () => {
    expect(await columns(pool)).toEqual(await columns(spec));
  });

  it("主キー・一意制約・外部キー（ON DELETE CASCADE / SET NULL を含む）が同じ", async () => {
    expect(await constraints(pool)).toEqual(await constraints(spec));
  });

  it("スキーマ投入直後に初期設定 max_failed_attempts = '5' が登録されている", () => {
    // 値は global-setup.ts がDBを作った直後に記録したもの（テストごとの入れ直しの影響を受けない）
    const { project, spec } = inject("initialSettings");
    expect(spec).toEqual([{ key: "max_failed_attempts", value: "5" }]);
    expect(project).toEqual(spec);
  });
});

describe("[6.2] 検索パフォーマンス用インデックス", () => {
  it.each(["last_name", "first_name", "department_id", "location_id"])(
    "employees.%s にインデックスがある",
    async (column) => {
      const { rows } = await pool.query(
        `SELECT indexdef FROM pg_indexes WHERE tablename = 'employees'`
      );
      expect(rows.map((r) => r.indexdef).join("\n")).toMatch(new RegExp(`\\(${column}\\)`));
    }
  );
});
