/**
 * 結合テスト: 想定規模での検索性能（HTTP越し）
 * 仕様: AI_SPECIFICATION.md 1「アクティブ社員数 約800名」, 6.2「検索実行時は3秒以内に結果を表示」
 * ネットワーク・ミドルウェア・JSON変換を含めた、ブラウザから見た応答時間で確認する。
 */
import { beforeAll, describe, expect, it } from "vitest";
import { db, insertEmployee, insertMaster, PASSWORD, resetDatabase } from "./support/db";
import { Client } from "./support/http";

const user = new Client();
const ids: Record<string, string> = {};

beforeAll(async () => {
  await resetDatabase();
  ids.dev = await insertMaster("departments", "技術開発部");
  ids.hq = await insertMaster("locations", "本社");
  ids.react = await insertMaster("skills", "React");
  await insertEmployee({ loginId: "EMP001", lastName: "検索", firstName: "する人" });

  // 社員800名。3人に1人が趣味「登山」、5人に1人が React を持つ
  await db.query(
    `INSERT INTO employees (id, login_id, password_hash, last_name, first_name, email,
                            department_id, location_id, hobby_info)
     SELECT gen_random_uuid(), 'BULK' || i, 'x', '山田' || i, '太郎', 'bulk' || i || '@example.com',
            $1, $2, CASE WHEN i % 3 = 0 THEN '登山' ELSE '読書' END
     FROM generate_series(1, 800) AS i`,
    [ids.dev, ids.hq]
  );
  await db.query(
    `INSERT INTO employee_skills (employee_id, skill_id)
     SELECT id, $1 FROM employees WHERE login_id LIKE 'BULK%' AND substring(login_id, 5)::int % 5 = 0`,
    [ids.react]
  );
  await user.login("EMP001", PASSWORD);
});

async function timed(path: string) {
  const start = performance.now();
  const res = await user.get(path);
  return { res, elapsed: performance.now() - start };
}

describe("[1][6.2] 社員800名で、検索が3秒以内に返る", () => {
  it("条件なし（全件）", async () => {
    const { res, elapsed } = await timed("/api/v1/employees");
    expect(res.status).toBe(200);
    expect(res.body.totalCount).toBe(801);
    expect(elapsed).toBeLessThan(3000);
  });

  it("姓（部分一致）+ 部署（完全一致）+ 趣味（部分一致）の複合条件", async () => {
    const q = `lastName=${encodeURIComponent("山田")}&departmentId=${ids.dev}&hobby=${encodeURIComponent("登山")}`;
    const { res, elapsed } = await timed(`/api/v1/employees?${q}`);
    expect(res.status).toBe(200);
    expect(res.body.totalCount).toBe(266);
    expect(elapsed).toBeLessThan(3000);
  });

  it("スキル（部分一致）+ 拠点（完全一致）の複合条件", async () => {
    const { res, elapsed } = await timed(`/api/v1/employees?skill=React&locationId=${ids.hq}`);
    expect(res.status).toBe(200);
    expect(res.body.totalCount).toBe(160);
    expect(elapsed).toBeLessThan(3000);
  });
});
