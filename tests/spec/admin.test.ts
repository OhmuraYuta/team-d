/**
 * 仕様: AI_SPECIFICATION.md 2「ロールと権限」, 4.4「管理者機能」, 6.1「権限不足は403」
 *       docs/openapi.yaml /admin/*
 */
import { beforeEach, describe, expect, it } from "vitest";
import { uuidv7 } from "uuidv7";
import { POST as createRoute } from "@/app/api/v1/admin/employees/route";
import { DELETE as deleteRoute, PUT as updateRoute } from "@/app/api/v1/admin/employees/[id]/route";
import { PUT as settingsRoute } from "@/app/api/v1/admin/settings/max-failed-attempts/route";
import { POST as unlockRoute } from "@/app/api/v1/admin/users/[id]/unlock/route";
import { GET as searchRoute } from "@/app/api/v1/employees/route";
import { GET as detailRoute } from "@/app/api/v1/employees/[id]/route";
import { pool } from "@/lib/db";
import {
  accountState,
  insertEmployee,
  insertMaster,
  login,
  loginAs,
  PASSWORD,
  send,
  UUID_V7,
} from "../helpers";

let adminCookie: string;
let employeeCookie: string;
let employeeId: string;

beforeEach(async () => {
  await insertEmployee({ loginId: "ADM001", role: "ADMIN" });
  employeeId = await insertEmployee({ loginId: "EMP001", role: "EMPLOYEE" });
  adminCookie = await loginAs("ADM001");
  employeeCookie = await loginAs("EMP001");
});

const newEmployee = {
  loginId: "EMP100",
  password: "InitialPass1",
  lastName: "佐藤",
  firstName: "花子",
  email: "sato@example.com",
};

const create = (body: unknown, cookie = adminCookie) =>
  send(createRoute, "/api/v1/admin/employees", { method: "POST", cookie, body });
const update = (id: string, body: unknown, cookie = adminCookie) =>
  send(updateRoute, `/api/v1/admin/employees/${id}`, {
    method: "PUT",
    cookie,
    body,
    params: { id },
  });
const remove = (id: string, cookie = adminCookie) =>
  send(deleteRoute, `/api/v1/admin/employees/${id}`, { method: "DELETE", cookie, params: { id } });
const unlock = (id: string, cookie = adminCookie) =>
  send(unlockRoute, `/api/v1/admin/users/${id}/unlock`, { method: "POST", cookie, params: { id } });
const setMax = (body: unknown, cookie = adminCookie) =>
  send(settingsRoute, "/api/v1/admin/settings/max-failed-attempts", {
    method: "PUT",
    cookie,
    body,
  });
const detail = (id: string) =>
  send(detailRoute, `/api/v1/employees/${id}`, { cookie: adminCookie, params: { id } });

const employeeCount = async () =>
  (await pool.query("SELECT count(*)::int AS n FROM employees")).rows[0].n as number;

// ---------------------------------------------------------------------------
describe("[2][6.1] 管理者機能の権限", () => {
  const operations = {
    "POST /admin/employees": (c: string) => create(newEmployee, c),
    "PUT /admin/employees/:id": (c: string) => update(employeeId, { lastName: "改ざん" }, c),
    "DELETE /admin/employees/:id": (c: string) => remove(employeeId, c),
    "POST /admin/users/:id/unlock": (c: string) => unlock(employeeId, c),
    "PUT /admin/settings/max-failed-attempts": (c: string) => setMax({ maxFailedAttempts: 1 }, c),
  };

  for (const [name, call] of Object.entries(operations)) {
    it(`${name}: 未ログインは 401`, async () => {
      expect((await call("")).status).toBe(401);
    });

    it(`${name}: 一般社員は 403 で、データは一切変わらない`, async () => {
      const before = (await pool.query("SELECT * FROM employees ORDER BY id")).rows;
      const settingsBefore = (await pool.query("SELECT * FROM system_settings")).rows;

      expect((await call(employeeCookie)).status).toBe(403);

      expect((await pool.query("SELECT * FROM employees ORDER BY id")).rows).toEqual(before);
      expect((await pool.query("SELECT * FROM system_settings")).rows).toEqual(settingsBefore);
    });
  }

  it("管理者は一般社員の権限（社員検索）も持つ", async () => {
    expect((await send(searchRoute, "/api/v1/employees", { cookie: adminCookie })).status).toBe(
      200
    );
  });
});

// ---------------------------------------------------------------------------
describe("[4.4] POST /admin/employees（新規登録）", () => {
  it("201 と { success: true, id: UUIDv7, message } を返す（[3] IDはアプリ側でUUIDv7を生成）", async () => {
    const res = await create(newEmployee);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      success: true,
      id: expect.stringMatching(UUID_V7),
      message: expect.any(String),
    });
  });

  it("登録した社員は社員詳細APIで取得でき、所属・スキル・経歴も保存されている", async () => {
    const dept = await insertMaster("departments", "人事部");
    const skill = await insertMaster("skills", "Python");
    const res = await create({
      ...newEmployee,
      departmentId: dept,
      skills: [skill],
      selfPR: "よろしくお願いします",
      experiences: [
        { projectName: "採用システム", roleDescription: "PM", startDate: "2024-04-01" },
      ],
    });
    const { id } = await res.json();

    const body = await (await detail(id)).json();
    expect(body).toMatchObject({
      employeeId: "EMP100",
      lastName: "佐藤",
      firstName: "花子",
      email: "sato@example.com",
      department: "人事部",
      skills: ["Python"],
      selfPR: "よろしくお願いします",
      experiences: [
        { projectName: "採用システム", roleDescription: "PM", startDate: "2024-04-01" },
      ],
    });
  });

  it("登録した社員は、設定したパスワードでログインできる", async () => {
    await create(newEmployee);
    expect((await login("EMP100", "InitialPass1")).status).toBe(200);
  });

  it("パスワードは平文で保存しない", async () => {
    await create(newEmployee);
    const { rows } = await pool.query(
      "SELECT password_hash FROM employees WHERE login_id = 'EMP100'"
    );
    expect(rows[0].password_hash).not.toContain("InitialPass1");
  });

  it("role を省略したら EMPLOYEE（DBのデフォルトと同じ）", async () => {
    await create(newEmployee);
    const { user } = await (await login("EMP100", "InitialPass1")).json();
    expect(user.role).toBe("EMPLOYEE");
  });

  it("[openapi] 社員IDが重複していたら 409 で、登録されない", async () => {
    const before = await employeeCount();
    const res = await create({ ...newEmployee, loginId: "EMP001" });
    expect(res.status).toBe(409);
    expect(await employeeCount()).toBe(before);
  });

  it("[openapi] メールアドレスが重複していたら 409", async () => {
    expect((await create({ ...newEmployee, email: "emp001@example.com" })).status).toBe(409);
  });

  it.each([
    ["loginId なし", { ...newEmployee, loginId: undefined }],
    ["password なし", { ...newEmployee, password: undefined }],
    ["lastName なし", { ...newEmployee, lastName: undefined }],
    ["firstName なし", { ...newEmployee, firstName: undefined }],
    ["email なし", { ...newEmployee, email: undefined }],
    ["email の形式が不正", { ...newEmployee, email: "not-an-email" }],
    ["role が EMPLOYEE/ADMIN 以外", { ...newEmployee, role: "SUPERUSER" }],
  ])("[openapi] バリデーションエラー（%s）は 400 で、登録されない", async (_label, body) => {
    const before = await employeeCount();
    expect((await create(body)).status).toBe(400);
    expect(await employeeCount()).toBe(before);
  });

  it("[3] 経歴などの子テーブルの ID もアプリ側で UUIDv7 を生成する", async () => {
    const res = await create({
      ...newEmployee,
      experiences: [{ projectName: "A" }, { projectName: "B" }],
    });
    const { id } = await res.json();
    const { rows } = await pool.query(
      "SELECT id::text FROM employee_experiences WHERE employee_id = $1",
      [id]
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.id).toMatch(UUID_V7);
  });
});

// ---------------------------------------------------------------------------
describe("[4.4] PUT /admin/employees/:id（更新）", () => {
  it("200 を返し、変更内容が社員詳細に反映される", async () => {
    const res = await update(employeeId, { lastName: "鈴木", hobbyInfo: "将棋" });
    expect(res.status).toBe(200);
    expect(await (await detail(employeeId)).json()).toMatchObject({
      lastName: "鈴木",
      hobbyInfo: "将棋",
    });
  });

  it("指定しなかった項目は変わらない", async () => {
    await update(employeeId, { lastName: "鈴木" });
    expect(await (await detail(employeeId)).json()).toMatchObject({
      employeeId: "EMP001",
      firstName: "太郎",
      email: "emp001@example.com",
    });
  });

  it("role を ADMIN に変えると、次のログインから管理者になる", async () => {
    await update(employeeId, { role: "ADMIN" });
    const { user } = await (await login("EMP001", PASSWORD)).json();
    expect(user.role).toBe("ADMIN");
  });

  it("[3] 経歴を更新しても、新しい行の ID は UUIDv7", async () => {
    await update(employeeId, { experiences: [{ projectName: "新プロジェクト" }] });
    const { rows } = await pool.query(
      "SELECT id::text FROM employee_experiences WHERE employee_id = $1",
      [employeeId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toMatch(UUID_V7);
  });
});

// ---------------------------------------------------------------------------
describe("[4.4] DELETE /admin/employees/:id（削除）", () => {
  it("204 を返し、その社員は社員詳細で 404・検索にも出なくなる", async () => {
    expect((await remove(employeeId)).status).toBe(204);
    expect((await detail(employeeId)).status).toBe(404);
    const search = await (
      await send(searchRoute, "/api/v1/employees?employeeId=EMP001", { cookie: adminCookie })
    ).json();
    expect(search.totalCount).toBe(0);
  });

  it("削除された社員はログインできない", async () => {
    await remove(employeeId);
    expect((await login("EMP001", PASSWORD)).status).not.toBe(200);
  });

  it("ありがとうメッセージを送受信していた社員も削除できる", async () => {
    const adminId = (await pool.query("SELECT id FROM employees WHERE login_id='ADM001'")).rows[0]
      .id;
    await pool.query(
      "INSERT INTO thank_you_messages (id, sender_id, receiver_id, content) VALUES ($1, $2, $3, 'ありがとう')",
      [uuidv7(), adminId, employeeId]
    );
    expect((await remove(employeeId)).status).toBe(204);
  });
});

// ---------------------------------------------------------------------------
describe("[4.4] POST /admin/users/:id/unlock（ロック解除）", () => {
  it("ロックを解除して失敗回数を0にし、その社員は再びログインできる", async () => {
    for (let i = 0; i < 5; i++) await login("EMP001", "wrong-password");
    expect((await accountState("EMP001"))!.is_locked).toBe(true);

    expect((await unlock(employeeId)).status).toBe(200);
    expect(await accountState("EMP001")).toMatchObject({ is_locked: false, failed_attempts: 0 });
    expect((await login("EMP001", PASSWORD)).status).toBe(200);
  });

  it("解除後は、また5回連続で失敗するまでロックされない（回数がリセットされている）", async () => {
    for (let i = 0; i < 5; i++) await login("EMP001", "wrong-password");
    await unlock(employeeId);
    for (let i = 0; i < 4; i++) await login("EMP001", "wrong-password");
    expect((await accountState("EMP001"))!.is_locked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe("[4.4] PUT /admin/settings/max-failed-attempts（ログイン失敗許容回数）", () => {
  it("[openapi] 200 と { success: true, maxFailedAttempts, message } を返す", async () => {
    const res = await setMax({ maxFailedAttempts: 3 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      maxFailedAttempts: 3,
      message: "ログイン失敗許容回数を変更しました。",
    });
  });

  it("3回に変更すると、3回連続失敗でロックされる", async () => {
    await setMax({ maxFailedAttempts: 3 });
    for (let i = 0; i < 2; i++) await login("EMP001", "wrong-password");
    expect((await accountState("EMP001"))!.is_locked).toBe(false);
    expect((await login("EMP001", "wrong-password")).status).toBe(403);
    expect((await accountState("EMP001"))!.is_locked).toBe(true);
  });

  it("10回に変更すると、5回失敗してもロックされない", async () => {
    await setMax({ maxFailedAttempts: 10 });
    for (let i = 0; i < 5; i++) await login("EMP001", "wrong-password");
    expect((await accountState("EMP001"))!.is_locked).toBe(false);
  });

  it.each([[0], [-1], [2.5], ["5"], [null], [undefined]])(
    "[openapi] integer・minimum 1 を満たさない値 (%j) は 400 で、設定は変わらない",
    async (value) => {
      expect((await setMax({ maxFailedAttempts: value })).status).toBe(400);
      const { rows } = await pool.query(
        "SELECT value FROM system_settings WHERE key='max_failed_attempts'"
      );
      expect(rows[0].value).toBe("5");
    }
  );
});
