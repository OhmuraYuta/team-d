/**
 * 結合テスト: 仕様に定義されたレスポンス（ステータスコードと本文）が、本物のサーバーから返るか
 * 仕様: AI_SPECIFICATION.md 4.1, 4.4 / openapi.yaml の各 responses（200, 201, 204, 400, 409）
 */
import { beforeAll, describe, expect, it } from "vitest";
import { db, insertEmployee, insertMaster, PASSWORD, resetDatabase } from "./support/db";
import { Client } from "./support/http";

const admin = new Client();
const ids: Record<string, string> = {};

beforeAll(async () => {
  await resetDatabase();
  ids.admin = await insertEmployee({
    loginId: "EMP001",
    lastName: "大村",
    firstName: "悠太",
    role: "ADMIN",
  });
  ids.employee = await insertEmployee({ loginId: "EMP002", lastName: "青木", firstName: "大隼" });
  ids.center = await insertMaster("locations", "技術センター");
  await admin.login("EMP001", PASSWORD);
});

const valid = {
  loginId: "EMP100",
  password: "Welcome2026!",
  lastName: "佐藤",
  firstName: "花子",
  email: "sato@example.com",
};
const employeeCount = async () =>
  (await db.query("SELECT count(*)::int AS n FROM employees")).rows[0].n as number;

describe("[4.1] POST /auth/login", () => {
  it("成功時は 200 と { success: true, user: { id, employeeId, lastName, firstName, role } }", async () => {
    const res = await new Client().login("EMP001", PASSWORD);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      user: {
        id: ids.admin,
        employeeId: "EMP001",
        lastName: "大村",
        firstName: "悠太",
        role: "ADMIN",
      },
    });
  });
});

describe("[4.4][openapi] POST /admin/employees", () => {
  it("201 と { success: true, id, message }", async () => {
    const res = await admin.post("/api/v1/admin/employees", valid);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      success: true,
      id: expect.any(String),
      message: expect.any(String),
    });
  });

  it("社員IDの重複は 409 で、登録されない", async () => {
    const before = await employeeCount();
    const res = await admin.post("/api/v1/admin/employees", {
      ...valid,
      email: "other@example.com",
    });
    expect(res.status).toBe(409);
    expect(await employeeCount()).toBe(before);
  });

  it("メールアドレスの重複は 409 で、登録されない", async () => {
    const before = await employeeCount();
    const res = await admin.post("/api/v1/admin/employees", { ...valid, loginId: "EMP101" });
    expect(res.status).toBe(409);
    expect(await employeeCount()).toBe(before);
  });

  it.each([
    [
      "role が EMPLOYEE/ADMIN 以外",
      { ...valid, loginId: "EMP102", email: "a@example.com", role: "ROOT" },
    ],
    ["必須の loginId が無い", { ...valid, loginId: undefined, email: "b@example.com" }],
  ])("バリデーションエラー（%s）は 400 で、登録されない", async (_label, body) => {
    const before = await employeeCount();
    expect((await admin.post("/api/v1/admin/employees", body)).status).toBe(400);
    expect(await employeeCount()).toBe(before);
  });
});

describe("[4.4][openapi] PUT/DELETE /admin/employees/:id, POST /admin/users/:id/unlock", () => {
  it("PUT は 200", async () => {
    expect(
      (await admin.put(`/api/v1/admin/employees/${ids.employee}`, { hobbyInfo: "囲碁" })).status
    ).toBe(200);
  });

  it("POST unlock は 200", async () => {
    expect((await admin.post(`/api/v1/admin/users/${ids.employee}/unlock`)).status).toBe(200);
  });

  it("DELETE は 204 で、本文は空", async () => {
    const res = await admin.delete(`/api/v1/admin/employees/${ids.employee}`);
    expect(res.status).toBe(204);
    expect(res.body ?? "").toBe("");
  });
});

describe("[4.4][openapi] PUT /admin/settings/max-failed-attempts", () => {
  it("200 と { success: true, maxFailedAttempts, message }", async () => {
    const res = await admin.put("/api/v1/admin/settings/max-failed-attempts", {
      maxFailedAttempts: 7,
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      maxFailedAttempts: 7,
      message: "ログイン失敗許容回数を変更しました。",
    });
  });

  it.each([[0], [2.5], ["5"]])("integer・minimum 1 を満たさない値 (%j) は 400", async (value) => {
    const res = await admin.put("/api/v1/admin/settings/max-failed-attempts", {
      maxFailedAttempts: value,
    });
    expect(res.status).toBe(400);
  });
});

describe("[openapi] GET /seats", () => {
  it("locationId が UUID でなければ 400（クエリパラメーターが不正）", async () => {
    expect((await admin.get("/api/v1/seats?locationId=abc")).status).toBe(400);
  });

  it("未割当の座席は employee: null", async () => {
    await db.query(
      `INSERT INTO seats (id, location_id, floor, seat_code, x, y)
       VALUES (gen_random_uuid(), $1, '3F', 'Z-99', 50, 50)`,
      [ids.center]
    );
    const res = await admin.get(`/api/v1/seats?locationId=${ids.center}&floor=3F`);
    expect(res.status).toBe(200);
    expect(res.body.find((s: { seatCode: string }) => s.seatCode === "Z-99").employee).toBeNull();
  });
});
