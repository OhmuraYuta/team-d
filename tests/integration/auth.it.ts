/**
 * 結合テスト: 認証・認可・セッション（本物の Next.js サーバー + ミドルウェア + DB を HTTP で叩く）
 * 仕様: AI_SPECIFICATION.md 2「ロールと権限」, 4.1「POST /auth/login」, 6.1「セッション管理とセキュリティ」
 *       docs/openapi.yaml securitySchemes (cookieAuth / bearerAuth), 各APIの 401/403
 */
import { decodeJwt, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { insertEmployee, PASSWORD, resetDatabase } from "./support/db";
import { SERVER_ENV } from "./support/env";
import { Client } from "./support/http";

let employeeId: string;

beforeAll(async () => {
  await resetDatabase();
  await insertEmployee({ loginId: "ADM001", lastName: "管理", firstName: "者", role: "ADMIN" });
  employeeId = await insertEmployee({ loginId: "EMP001", lastName: "一般", firstName: "社員" });
});

const tokenCookie = (res: { headers: Headers }) =>
  res.headers.getSetCookie().find((c) => c.startsWith("token="));

/** サーバーと同じ秘密鍵で、残り有効期限を指定したトークンを作る（30分待つ代わり） */
async function tokenExpiringIn(seconds: number) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ id: employeeId, employeeId: "EMP001", role: "EMPLOYEE" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now - (30 * 60 - seconds))
    .setExpirationTime(now + seconds)
    .sign(new TextEncoder().encode(SERVER_ENV.JWT_SECRET));
}

describe("[4.1][6.1] ログインで JWT を HttpOnly Cookie として受け取り、以降のAPIで使える", () => {
  it("ログインすると token Cookie が届き、次のリクエストで自動送信されて保護されたAPIを使える", async () => {
    const user = new Client();
    expect((await user.login("EMP001", PASSWORD)).status).toBe(200);
    expect(user.token, "Set-Cookie で token が届いていない").toBeDefined();
    expect((await user.get("/api/v1/employees")).status).toBe(200);
  });

  it("Cookie は HttpOnly・SameSite=Lax・有効期限30分 (Max-Age=1800)", async () => {
    const cookie = tokenCookie(await new Client().login("EMP001", PASSWORD))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Max-Age=1800/i);
  });

  it("本番モード (next start) では Cookie に Secure が付く", async () => {
    expect(tokenCookie(await new Client().login("EMP001", PASSWORD))).toMatch(/Secure/i);
  });

  it("JWT のペイロードに id・社員ID・role を含み、パスワードを含まない", async () => {
    const user = new Client();
    await user.login("EMP001", PASSWORD);
    const payload = decodeJwt(user.token!);
    expect(payload.id).toBe(employeeId);
    expect(Object.values(payload)).toContain("EMP001");
    expect(payload.role).toBe("EMPLOYEE");
    expect(JSON.stringify(payload)).not.toContain(PASSWORD);
  });

  it("[openapi bearerAuth] 同じトークンを Authorization: Bearer で送っても使える", async () => {
    const user = new Client();
    await user.login("EMP001", PASSWORD);
    const res = await new Client().request("GET", "/api/v1/employees", {
      headers: { authorization: `Bearer ${user.token}` },
    });
    expect(res.status).toBe(200);
  });
});

describe("[6.1] 保護されたAPIは、未認証なら 401", () => {
  const protectedApis = [
    "/api/v1/employees",
    "/api/v1/employees/01900000-0000-7000-8000-000000000001",
    "/api/v1/locations",
    "/api/v1/seats",
    "/api/v1/messages/latest",
  ];

  it.each(protectedApis)(
    "未ログインで GET %s → 401（openapi の ErrorResponse 形式）",
    async (path) => {
      const res = await new Client().get(path);
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({
        success: false,
        error: expect.any(String),
        message: expect.any(String),
      });
    }
  );

  it("偽造したトークン（別の秘密鍵で署名）は 401", async () => {
    const forged = await new SignJWT({ id: employeeId, employeeId: "EMP001", role: "ADMIN" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("30m")
      .sign(new TextEncoder().encode("attacker-secret"));
    const res = await new Client().request("GET", "/api/v1/employees", {
      headers: { cookie: `token=${forged}` },
    });
    expect(res.status).toBe(401);
  });

  it("有効期限が切れたトークンは 401", async () => {
    const res = await new Client().request("GET", "/api/v1/employees", {
      headers: { cookie: `token=${await tokenExpiringIn(-1)}` },
    });
    expect(res.status).toBe(401);
  });
});

describe("[6.1] セッション持続時間（タイムアウト30分・スライディングセッション）", () => {
  it("期限切れのトークンでアクセスすると、token Cookie を削除する Set-Cookie が返る", async () => {
    const res = await new Client().request("GET", "/api/v1/employees", {
      headers: { cookie: `token=${await tokenExpiringIn(-1)}` },
    });
    const cookie = tokenCookie(res);
    expect(cookie, "token Cookie を削除する Set-Cookie が返っていない").toBeDefined();
    expect(cookie).toMatch(/^token=;|Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  });

  it("残り15分未満のトークンでAPIを使うと、有効期限を30分に更新した新しい token Cookie が返る", async () => {
    const res = await new Client().request("GET", "/api/v1/employees", {
      headers: { cookie: `token=${await tokenExpiringIn(10 * 60)}` },
    });
    expect(res.status).toBe(200);
    const cookie = tokenCookie(res);
    expect(cookie, "新しい token Cookie が発行されていない").toBeDefined();

    const { exp } = decodeJwt(cookie!.split(";")[0].slice("token=".length));
    const remaining = exp! - Math.floor(Date.now() / 1000);
    expect(remaining).toBeGreaterThan(29 * 60);
    expect(remaining).toBeLessThanOrEqual(30 * 60);
  });

  it("延長された Cookie を使い続ければ、元のトークンの期限を過ぎても操作を続けられる", async () => {
    const user = new Client();
    const first = await user.request("GET", "/api/v1/employees", {
      headers: { cookie: `token=${await tokenExpiringIn(5)}` }, // 残り5秒
    });
    expect(tokenCookie(first), "新しい token Cookie が発行されていない").toBeDefined();
    await new Promise((r) => setTimeout(r, 6000)); // 元のトークンの期限切れを待つ
    expect((await user.get("/api/v1/employees")).status).toBe(200); // Client は新しい Cookie を送る
  }, 15_000);
});

describe("[2][6.1] 権限: 管理者機能に一般社員がアクセスすると 403", () => {
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
    expect((await employee.request(method, path, { body })).status).toBe(403);
  });

  it.each(adminApis)("未ログインで %s %s → 401", async (method, path, body) => {
    expect((await new Client().request(method, path, { body })).status).toBe(401);
  });

  it("[2] 一般社員は、自身のプロフィールを閲覧できる", async () => {
    const employee = new Client();
    const login = await employee.login("EMP001", PASSWORD);
    const res = await employee.get(`/api/v1/employees/${login.body.user.id}`);
    expect(res.status).toBe(200);
    expect(res.body.employeeId).toBe("EMP001");
  });
});
