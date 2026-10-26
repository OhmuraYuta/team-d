/**
 * 結合テスト: シードスクリプト (npm run db:seed) → API、および想定規模での性能
 *   README の手順どおりにシードを流したデータで、表示されているアカウントでログイン・検索・フロアマップが使えるか
 *   社員800名（仕様1章の想定規模）で、HTTP越しの検索が3秒以内に返るか
 * 仕様: AI_SPECIFICATION.md 1, 6.2 / scripts/seed.ts の出力するアカウント
 */
import { execSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "./support/db";
import { DATABASE_URL } from "./support/env";
import { Client } from "./support/http";

beforeAll(() => {
  // チームが使うコマンドそのものを、テスト用DBに向けて実行する
  execSync("npm run db:seed", {
    env: { ...process.env, DATABASE_URL },
    stdio: "ignore",
    timeout: 120_000,
  });
}, 180_000);

describe("シードデータでシステムが使える", () => {
  it("シードが表示する管理者アカウント (EMP001 / SecurePassword123) でログインでき、ADMIN になる", async () => {
    const res = await new Client().login("EMP001", "SecurePassword123");
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ lastName: "大村", firstName: "悠太", role: "ADMIN" });
  });

  it("シードが表示する一般社員アカウント (EMP002 / Password123!) でログインでき、EMPLOYEE になる", async () => {
    const res = await new Client().login("EMP002", "Password123!");
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ lastName: "青木", role: "EMPLOYEE" });
  });

  it("一般社員で検索・詳細が使え、詳細の座席がフロアマップ上の同じ座席と一致する", async () => {
    const user = new Client();
    await user.login("EMP002", "Password123!");

    const search = await user.get("/api/v1/employees?employeeId=EMP001");
    expect(search.body.totalCount).toBe(1);
    const detail = await user.get(`/api/v1/employees/${search.body.results[0].id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.seat).toMatchObject({ seatCode: "A-12", floor: "3F" });

    const locations = await user.get("/api/v1/locations");
    const center = locations.body.find((l: { name: string }) => l.name === "技術センター");
    const seats = await user.get(`/api/v1/seats?locationId=${center.id}&floor=3F`);
    const seat = seats.body.find((s: { id: string }) => s.id === detail.body.seat.id);
    expect(seat.employee).toMatchObject({ employeeId: "EMP001" });
  });

  it("シードの座標はすべて 0〜100（割合%）の範囲", async () => {
    const admin = new Client();
    await admin.login("EMP001", "SecurePassword123");
    const seats = await admin.get("/api/v1/seats");
    expect(seats.body.length).toBeGreaterThan(0);
    for (const s of seats.body) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(100);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(100);
    }
  });
});

describe("[6.2] 想定規模（社員800名）での検索性能", () => {
  it("HTTP越しでも、複合条件の検索が3秒以内に返る", async () => {
    const { rows } = await db.query(
      `SELECT d.id AS dept, l.id AS loc FROM departments d, locations l
       WHERE d.name = '技術開発部' AND l.name = '本社'`
    );
    await db.query(
      `INSERT INTO employees (id, login_id, password_hash, last_name, first_name, email,
                              department_id, location_id, hobby_info)
       SELECT gen_random_uuid(), 'BULK' || i, 'x', '山田' || i, '太郎', 'bulk' || i || '@example.com',
              $1, $2, CASE WHEN i % 3 = 0 THEN '登山' ELSE '読書' END
       FROM generate_series(1, 800) AS i`,
      [rows[0].dept, rows[0].loc]
    );

    const user = new Client();
    await user.login("EMP002", "Password123!");
    const start = performance.now();
    const res = await user.get(
      `/api/v1/employees?lastName=${encodeURIComponent("山田")}&departmentId=${rows[0].dept}&hobby=${encodeURIComponent("登山")}`
    );
    const elapsed = performance.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.totalCount).toBe(266);
    expect(elapsed).toBeLessThan(3000);
  });

  it("HTTP越しでも、条件なしの全件検索（800名超）が3秒以内に返る", async () => {
    const user = new Client();
    await user.login("EMP002", "Password123!");
    const start = performance.now();
    const res = await user.get("/api/v1/employees");
    expect(res.status).toBe(200);
    expect(res.body.totalCount).toBeGreaterThanOrEqual(800);
    expect(performance.now() - start).toBeLessThan(3000);
  });
});
