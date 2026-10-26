/**
 * 仕様: AI_SPECIFICATION.md 6.1「セッション管理とセキュリティ」「セッション持続時間 (タイムアウト30分)」
 *       AGENTS.md 3「認証・認可はミドルウェアで一元管理」
 */
import { decodeJwt, SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as searchEmployees } from "@/app/api/v1/employees/route";
import {
  insertEmployee,
  isPassThrough,
  login,
  loginAs,
  makeRequest,
  PASSWORD,
  runMiddleware,
  send,
  tokenSetCookie,
} from "../helpers";

/** 残り有効期限を指定して、正しい秘密鍵で署名したトークンを作る（時間を進める代わり） */
async function tokenExpiringIn(seconds: number, role: "EMPLOYEE" | "ADMIN" = "EMPLOYEE") {
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    id: "01900000-0000-7000-8000-000000000002",
    employeeId: "EMP001",
    role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now - (30 * 60 - seconds))
    .setExpirationTime(now + seconds)
    .sign(new TextEncoder().encode(process.env.JWT_SECRET));
  return `token=${token}`;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("[6.1] 保護されたAPIの認証", () => {
  it("Cookie なしでAPIを呼ぶと 401", async () => {
    const res = await send(searchEmployees, "/api/v1/employees");
    expect(res.status).toBe(401);
  });

  it("ログインして得た Cookie を付ければAPIを呼べる", async () => {
    await insertEmployee({ loginId: "EMP001" });
    const cookie = await loginAs("EMP001");
    expect((await send(searchEmployees, "/api/v1/employees", { cookie })).status).toBe(200);
  });

  it("でたらめなトークンは 401", async () => {
    const res = await send(searchEmployees, "/api/v1/employees", { cookie: "token=abc.def.ghi" });
    expect(res.status).toBe(401);
  });

  it("別の秘密鍵で署名された（偽造）トークンは 401", async () => {
    const forged = await new SignJWT({ id: "x", employeeId: "EMP001", role: "ADMIN" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("30m")
      .sign(new TextEncoder().encode("attacker-secret"));
    const res = await send(searchEmployees, "/api/v1/employees", { cookie: `token=${forged}` });
    expect(res.status).toBe(401);
  });

  it("有効期限が切れたトークンは 401", async () => {
    const res = await send(searchEmployees, "/api/v1/employees", {
      cookie: await tokenExpiringIn(-1),
    });
    expect(res.status).toBe(401);
  });

  it("[openapi bearerAuth] Authorization: Bearer <JWT> でも認証できる", async () => {
    await insertEmployee({ loginId: "EMP001" });
    const token = (await loginAs("EMP001")).slice("token=".length);
    const res = await send(searchEmployees, "/api/v1/employees", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });

  it("[openapi bearerAuth] Bearer でも、期限切れのトークンは 401", async () => {
    const token = (await tokenExpiringIn(-1)).slice("token=".length);
    const res = await send(searchEmployees, "/api/v1/employees", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });

  it("ログインAPI自体は未認証でも呼べる", async () => {
    const res = await runMiddleware(makeRequest("/api/v1/auth/login", { method: "POST" }));
    expect(isPassThrough(res)).toBe(true);
  });
});

describe("[6.1] Cookie の Secure 属性は本番環境のみ", () => {
  it("開発環境では Secure を付けない（http://localhost で動かすため）", async () => {
    await insertEmployee({ loginId: "EMP001" });
    expect(tokenSetCookie(await login("EMP001", PASSWORD))).not.toMatch(/;\s*Secure/i);
  });

  it("本番環境 (NODE_ENV=production) では Secure を付ける", async () => {
    await insertEmployee({ loginId: "EMP001" });
    vi.stubEnv("NODE_ENV", "production");
    expect(tokenSetCookie(await login("EMP001", PASSWORD))).toMatch(/;\s*Secure/i);
  });
});

describe("[6.1] タイムアウト: 最後の操作から30分で自動ログアウト（Cookieを削除・失効）", () => {
  it("期限切れのトークンでアクセスしたら、token Cookie を削除する Set-Cookie を返す", async () => {
    const res = await runMiddleware(
      makeRequest("/api/v1/employees", { cookie: await tokenExpiringIn(-1) })
    );
    const setCookie = tokenSetCookie(res);
    expect(setCookie, "token Cookie を削除する Set-Cookie が返っていない").toBeDefined();
    // 削除 = 値が空、または Max-Age=0 / 過去の Expires
    expect(setCookie).toMatch(/^token=;|Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  });
});

describe("[6.1] スライディングセッション（残り15分未満なら30分に延長した新しいJWTを再設定）", () => {
  it("残り10分のトークンでAPIを呼ぶと、新しい token Cookie が発行される", async () => {
    const res = await runMiddleware(
      makeRequest("/api/v1/employees", { cookie: await tokenExpiringIn(10 * 60) })
    );
    expect(isPassThrough(res)).toBe(true);
    expect(tokenSetCookie(res), "新しい token Cookie が発行されていない").toBeDefined();
  });

  it("再発行されたトークンの有効期限は「今から30分後」で、ユーザー情報は引き継がれる", async () => {
    const res = await runMiddleware(
      makeRequest("/api/v1/employees", { cookie: await tokenExpiringIn(5 * 60, "ADMIN") })
    );
    const setCookie = tokenSetCookie(res);
    expect(setCookie, "新しい token Cookie が発行されていない").toBeDefined();

    const payload = decodeJwt(setCookie!.split(";")[0].slice("token=".length));
    const remaining = payload.exp! - Math.floor(Date.now() / 1000);
    expect(remaining).toBeGreaterThan(29 * 60);
    expect(remaining).toBeLessThanOrEqual(30 * 60);
    expect(payload).toMatchObject({ employeeId: "EMP001", role: "ADMIN" });
  });

  it("再発行された Cookie も HttpOnly・SameSite=Lax", async () => {
    const res = await runMiddleware(
      makeRequest("/api/v1/employees", { cookie: await tokenExpiringIn(10 * 60) })
    );
    const setCookie = tokenSetCookie(res);
    expect(setCookie, "新しい token Cookie が発行されていない").toBeDefined();
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
  });
});

describe("[6.1] 画面遷移時の認証（未認証ならリダイレクト）", () => {
  it("未ログインでトップ画面 / を開くとログイン画面へリダイレクトされる", async () => {
    const res = await runMiddleware(makeRequest("/"));
    expect(res.status, "リダイレクトされず、そのまま画面が表示される").toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  it("ログイン画面 /login は未ログインでも表示できる（リダイレクトループしない）", async () => {
    const res = await runMiddleware(makeRequest("/login"));
    expect(isPassThrough(res)).toBe(true);
  });

  it("ログイン済みならトップ画面を表示できる", async () => {
    await insertEmployee({ loginId: "EMP001" });
    const res = await runMiddleware(makeRequest("/", { cookie: await loginAs("EMP001") }));
    expect(isPassThrough(res)).toBe(true);
  });
});
