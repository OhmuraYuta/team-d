/**
 * 結合テスト: 認証・認可（本物の Next.js サーバー + ミドルウェア + DB）
 * 仕様: AI_SPECIFICATION.md 4.1, 6.1 / openapi.yaml securitySchemes
 */
import { beforeAll, describe, expect, it } from "vitest";
import { insertEmployee, PASSWORD, resetDatabase } from "./support/db";
import { Client } from "./support/http";

beforeAll(async () => {
  await resetDatabase();
  await insertEmployee({ loginId: "ADM001", lastName: "管理", firstName: "者", role: "ADMIN" });
  await insertEmployee({ loginId: "EMP001", lastName: "一般", firstName: "社員" });
});

describe("ログインして得た Cookie で、別のAPIを使える", () => {
  it("ログインすると token Cookie が発行され、次のリクエストから自動で送られて検索できる", async () => {
    const user = new Client();
    const login = await user.login("EMP001", PASSWORD);
    expect(login.status).toBe(200);
    expect(user.token, "Set-Cookie で token が届いていない").toBeDefined();

    const search = await user.get("/api/v1/employees");
    expect(search.status).toBe(200);
    expect(search.body.totalCount).toBe(2);
  });

  it("サーバーが返す Cookie は HttpOnly・SameSite=Lax・Max-Age=1800", async () => {
    const res = await new Client().login("EMP001", PASSWORD);
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith("token="))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Max-Age=1800/i);
  });

  it("[6.1] next start（本番モード）で動いているので、Cookie に Secure が付く", async () => {
    const res = await new Client().login("EMP001", PASSWORD);
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith("token="))!;
    expect(cookie).toMatch(/Secure/i);
  });
});

describe("本物のミドルウェアで保護されている", () => {
  const protectedApis = [
    "/api/v1/employees",
    "/api/v1/employees/01900000-0000-7000-8000-000000000001",
    "/api/v1/locations",
    "/api/v1/seats",
    "/api/v1/messages/latest",
  ];

  it.each(protectedApis)("未ログインで GET %s → 401", async (path) => {
    const res = await new Client().get(path);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ success: false, error: "UNAUTHORIZED" });
  });

  it("偽物のトークンを Cookie に入れても 401", async () => {
    const res = await new Client().request("GET", "/api/v1/employees", {
      headers: { cookie: "token=eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiQURNSU4ifQ.forged" },
    });
    expect(res.status).toBe(401);
  });

  it("[openapi bearerAuth] ログインで得たトークンを Authorization: Bearer で送っても使える", async () => {
    const user = new Client();
    await user.login("EMP001", PASSWORD);
    const res = await new Client().request("GET", "/api/v1/employees", {
      headers: { authorization: `Bearer ${user.token}` },
    });
    expect(res.status).toBe(200);
  });

  it("ログインAPIは未ログインでも呼べる（ミドルウェアに止められず、ログイン処理まで届く）", async () => {
    // ミドルウェアに止められると error は UNAUTHORIZED。ログイン処理まで届けば認証失敗のエラーになる
    const res = await new Client().login("EMP001", "wrong-password");
    expect(res.body.error).not.toBe("UNAUTHORIZED");
    expect(res.body.success).toBe(false);
  });
});

describe("[2][6.1] 権限: 一般社員は管理者APIを使えない", () => {
  const someId = "01900000-0000-7000-8000-000000000001";
  const adminApis: [string, string, unknown][] = [
    ["POST", "/api/v1/admin/employees", { loginId: "X" }],
    ["PUT", `/api/v1/admin/employees/${someId}`, { lastName: "X" }],
    ["DELETE", `/api/v1/admin/employees/${someId}`, undefined],
    ["POST", `/api/v1/admin/users/${someId}/unlock`, undefined],
    ["PUT", "/api/v1/admin/settings/max-failed-attempts", { maxFailedAttempts: 1 }],
  ];

  it.each(adminApis)("一般社員で %s %s → 403", async (method, path, body) => {
    const employee = new Client();
    await employee.login("EMP001", PASSWORD);
    const res = await employee.request(method, path, { body });
    expect(res.status).toBe(403);
  });

  it.each(adminApis)("未ログインで %s %s → 401", async (method, path, body) => {
    const res = await new Client().request(method, path, { body });
    expect(res.status).toBe(401);
  });
});
