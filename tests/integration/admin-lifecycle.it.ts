/**
 * 結合テスト: 管理者による社員のライフサイクル
 *   入社（登録）→ 本人がログイン → 異動（更新）→ 検索・詳細に反映 → 退職（削除）→ ログインも閲覧もできない
 * 仕様: AI_SPECIFICATION.md 2, 3, 4.1, 4.2, 4.4 / openapi.yaml /admin/employees, /seats
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  db,
  insertEmployee,
  insertMaster,
  insertSeat,
  PASSWORD,
  resetDatabase,
} from "./support/db";
import { Client } from "./support/http";

const admin = new Client();
const ids: Record<string, string> = {};

beforeAll(async () => {
  await resetDatabase();
  ids.dev = await insertMaster("departments", "技術開発部");
  ids.hr = await insertMaster("departments", "人事部");
  ids.center = await insertMaster("locations", "技術センター");
  ids.python = await insertMaster("skills", "Python");
  ids.seat = await insertSeat({
    locationId: ids.center,
    floor: "3F",
    seatCode: "A-20",
    x: 60,
    y: 40,
  });
  await insertEmployee({ loginId: "ADM001", lastName: "人事", firstName: "担当", role: "ADMIN" });
  await insertEmployee({ loginId: "EMP001", lastName: "同僚", firstName: "一郎" });
  await admin.login("ADM001", PASSWORD);
});

describe("管理者: 社員の入社から退職まで", () => {
  it("1. [4.4][3] 入社: 新しい社員を登録すると 201、ID はアプリ側で生成した UUIDv7", async () => {
    const res = await admin.post("/api/v1/admin/employees", {
      loginId: "EMP100",
      password: "Welcome2026!",
      lastName: "佐藤",
      firstName: "花子",
      email: "sato@example.com",
      departmentId: ids.dev,
      locationId: ids.center,
      seatId: ids.seat,
      skills: [ids.python],
      experiences: [{ projectName: "新人研修", startDate: "2026-04-01" }],
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab]/);
    ids.sato = res.body.id;
  });

  it("2. [4.1] 本人が、管理者が設定した初期パスワードでログインできる", async () => {
    const sato = new Client();
    const res = await sato.login("EMP100", "Welcome2026!");
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: ids.sato, lastName: "佐藤", role: "EMPLOYEE" });
  });

  it("3. [4.2] 他の社員が検索すると見つかり、詳細に所属・スキル・経歴・座席が出る", async () => {
    const colleague = new Client();
    await colleague.login("EMP001", PASSWORD);

    const search = await colleague.get("/api/v1/employees?lastName=%E4%BD%90%E8%97%A4"); // 佐藤
    expect(search.body.results.map((r: { id: string }) => r.id)).toEqual([ids.sato]);

    const detail = await colleague.get(`/api/v1/employees/${ids.sato}`);
    expect(detail.body).toMatchObject({
      department: "技術開発部",
      skills: ["Python"],
      experiences: [{ projectName: "新人研修", startDate: "2026-04-01" }],
      seat: { seatCode: "A-20" },
    });
  });

  it("4. [openapi /seats] 登録した座席が、フロアマップ上でもこの社員の席になっている", async () => {
    const res = await admin.get(`/api/v1/seats?locationId=${ids.center}&floor=3F`);
    const seat = res.body.find((s: { id: string }) => s.id === ids.seat);
    expect(seat.employee).toMatchObject({ id: ids.sato, employeeId: "EMP100" });
  });

  it("5. [4.4] 異動: 人事部へ更新し、座席を外すと 200", async () => {
    const res = await admin.put(`/api/v1/admin/employees/${ids.sato}`, {
      departmentId: ids.hr,
      seatId: null,
    });
    expect(res.status).toBe(200);
  });

  it("6. [4.2][openapi /seats] 異動が検索・詳細・フロアマップすべてに反映される", async () => {
    const byDept = await admin.get(`/api/v1/employees?departmentId=${ids.hr}`);
    expect(byDept.body.results.map((r: { id: string }) => r.id)).toEqual([ids.sato]);

    const detail = await admin.get(`/api/v1/employees/${ids.sato}`);
    expect(detail.body.department).toBe("人事部");
    expect(detail.body.seat ?? null).toBeNull();

    const seats = await admin.get(`/api/v1/seats?locationId=${ids.center}&floor=3F`);
    expect(seats.body.find((s: { id: string }) => s.id === ids.seat).employee).toBeNull();
  });

  // [3] thank_you_messages は employees を ON DELETE なしで参照している。
  // メッセージを受け取った社員でも [4.4] 管理者が削除できることを確認するため、先に1件送っておく
  it("7. [4.3] 同僚がこの社員にありがとうメッセージを送る", async () => {
    const colleague = new Client();
    await colleague.login("EMP001", PASSWORD);
    const res = await colleague.post("/api/v1/messages", {
      receiverId: ids.sato,
      content: "研修おつかれさま",
    });
    expect(res.status).toBe(201);
  });

  it("8. [4.4] 退職: メッセージを受け取っている社員でも削除でき、204", async () => {
    const res = await admin.delete(`/api/v1/admin/employees/${ids.sato}`);
    expect(res.status).toBe(204);
  });

  it("9. 削除後はログインできず、[openapi] 詳細は 404、検索にも出ない", async () => {
    expect((await new Client().login("EMP100", "Welcome2026!")).status).not.toBe(200);
    expect((await admin.get(`/api/v1/employees/${ids.sato}`)).status).toBe(404);
    expect((await admin.get("/api/v1/employees?employeeId=EMP100")).body.totalCount).toBe(0);
  });

  it("10. [3] スキル・経歴は ON DELETE CASCADE でDBから消えている", async () => {
    const { rows } = await db.query(
      `SELECT (SELECT count(*) FROM employee_skills WHERE employee_id = $1)::int AS skills,
              (SELECT count(*) FROM employee_experiences WHERE employee_id = $1)::int AS experiences`,
      [ids.sato]
    );
    expect(rows[0]).toEqual({ skills: 0, experiences: 0 });
  });
});
