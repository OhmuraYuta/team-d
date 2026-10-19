/**
 * 仕様: AI_SPECIFICATION.md 4.1「POST /auth/login」, 5.1「ログイン画面」, 6.1「ロックロジック」
 *       docs/openapi.yaml /auth/login
 */
import { decodeJwt } from "jose";
import { describe, expect, it } from "vitest";
import { pool } from "@/lib/db";
import { accountState, insertEmployee, login, PASSWORD, tokenSetCookie, UUID_V7 } from "../helpers";

const LOCKED_BODY = {
  success: false,
  error: "ACCOUNT_LOCKED",
  message: "アカウントがロックされています。管理者に問い合わせてください。",
};

describe("[4.1] POST /auth/login 成功時", () => {
  it("200 を返し、レスポンスは { success: true, user: { id, employeeId, lastName, firstName, role } } の形", async () => {
    const id = await insertEmployee({
      loginId: "EMP001",
      lastName: "大村",
      firstName: "悠太",
      role: "ADMIN",
    });
    const res = await login("EMP001", PASSWORD);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      user: { id, employeeId: "EMP001", lastName: "大村", firstName: "悠太", role: "ADMIN" },
    });
  });

  it("user.id は UUIDv7", async () => {
    await insertEmployee({ loginId: "EMP001" });
    const { user } = await (await login("EMP001", PASSWORD)).json();
    expect(user.id).toMatch(UUID_V7);
  });

  it("JWT を token という名前の Cookie で返す（openapi: Set-Cookie: token=...）", async () => {
    await insertEmployee({ loginId: "EMP001" });
    const res = await login("EMP001", PASSWORD);
    expect(tokenSetCookie(res)).toBeDefined();
  });

  it("[6.1] Cookie は HttpOnly・SameSite=Lax・Path=/・Max-Age=1800（30分）", async () => {
    await insertEmployee({ loginId: "EMP001" });
    const cookie = tokenSetCookie(await login("EMP001", PASSWORD))!;
    expect(cookie).toMatch(/;\s*HttpOnly/i);
    expect(cookie).toMatch(/;\s*SameSite=Lax/i);
    expect(cookie).toMatch(/;\s*Path=\//i);
    expect(cookie).toMatch(/;\s*Max-Age=1800/i);
  });

  it("[6.1] JWT の有効期限は発行から30分", async () => {
    await insertEmployee({ loginId: "EMP001" });
    const token = tokenSetCookie(await login("EMP001", PASSWORD))!
      .split(";")[0]
      .slice("token=".length);
    const { iat, exp } = decodeJwt(token);
    expect(exp! - iat!).toBe(30 * 60);
  });

  it("[6.1] JWT のペイロードに id・社員ID(login_id)・role を含め、パスワード等の機密情報を含めない", async () => {
    const id = await insertEmployee({ loginId: "EMP001", role: "EMPLOYEE" });
    const token = tokenSetCookie(await login("EMP001", PASSWORD))!
      .split(";")[0]
      .slice("token=".length);
    const payload = decodeJwt(token);

    expect(payload.id).toBe(id);
    expect(Object.values(payload)).toContain("EMP001");
    expect(payload.role).toBe("EMPLOYEE");
    const text = JSON.stringify(payload).toLowerCase();
    expect(text).not.toContain("password");
    expect(text).not.toContain(PASSWORD.toLowerCase());
  });
});

describe("[4.1] POST /auth/login 失敗時", () => {
  it("パスワード間違いは 200 にならず、Cookie も発行しない", async () => {
    await insertEmployee({ loginId: "EMP001" });
    const res = await login("EMP001", "wrong-password");
    expect(res.status).not.toBe(200);
    expect(tokenSetCookie(res)).toBeUndefined();
  });

  it("存在しない社員IDは 200 にならず、Cookie も発行しない", async () => {
    const res = await login("NOBODY", PASSWORD);
    expect(res.status).not.toBe(200);
    expect(tokenSetCookie(res)).toBeUndefined();
  });

  // openapi では required だが、エラー時のステータスは定義されていないので「4xx で Cookie なし」まで確認する
  it("[openapi] employeeId・password は必須。欠けていたら 4xx で Cookie も発行しない", async () => {
    await insertEmployee({ loginId: "EMP001" });
    for (const res of [await login("", PASSWORD), await login("EMP001", "")]) {
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(tokenSetCookie(res)).toBeUndefined();
    }
  });
});

describe("[6.1] ロックロジック（デフォルト上限5回）", () => {
  it("すでにロック中のユーザーは、正しいパスワードでも即座に 403 ACCOUNT_LOCKED", async () => {
    await insertEmployee({ loginId: "EMP001", isLocked: true });
    const res = await login("EMP001", PASSWORD);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual(LOCKED_BODY);
    expect(tokenSetCookie(res)).toBeUndefined();
  });

  it("ロック中のユーザーへの試行は「即座にエラー」なので、失敗回数は増えない", async () => {
    await insertEmployee({ loginId: "EMP001", isLocked: true, failedAttempts: 5 });
    await login("EMP001", "wrong-password");
    expect((await accountState("EMP001"))!.failed_attempts).toBe(5);
  });

  it("パスワード不一致のたびに failed_attempts が 1 ずつ増える", async () => {
    await insertEmployee({ loginId: "EMP001" });
    for (let i = 1; i <= 3; i++) {
      await login("EMP001", "wrong-password");
      expect((await accountState("EMP001"))!.failed_attempts).toBe(i);
    }
  });

  it("4回失敗まではロックされず、正しいパスワードでログインできる", async () => {
    await insertEmployee({ loginId: "EMP001" });
    for (let i = 0; i < 4; i++) await login("EMP001", "wrong-password");
    expect((await accountState("EMP001"))!.is_locked).toBe(false);
    expect((await login("EMP001", PASSWORD)).status).toBe(200);
  });

  it("5回目の失敗で 403 ACCOUNT_LOCKED を返し、is_locked=TRUE・locked_at=現在時刻 になる", async () => {
    await insertEmployee({ loginId: "EMP001" });
    for (let i = 0; i < 4; i++) await login("EMP001", "wrong-password");

    const res = await login("EMP001", "wrong-password");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual(LOCKED_BODY);

    const state = (await accountState("EMP001"))!;
    expect(state.is_locked).toBe(true);
    expect(state.locked_at).not.toBeNull();
    // DBの現在時刻との差が数秒以内であること
    const { rows } = await pool.query(
      "SELECT EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - $1::timestamp)) AS diff",
      [state.locked_at]
    );
    expect(Math.abs(Number(rows[0].diff))).toBeLessThan(10);
  });

  it("ロックされた後は、正しいパスワードでもログインできない", async () => {
    await insertEmployee({ loginId: "EMP001" });
    for (let i = 0; i < 5; i++) await login("EMP001", "wrong-password");
    expect((await login("EMP001", PASSWORD)).status).toBe(403);
  });

  it("[5.1]「連続して」失敗した場合のみロック: 途中でログインに成功したら回数は数え直し", async () => {
    await insertEmployee({ loginId: "EMP001" });
    for (let i = 0; i < 4; i++) await login("EMP001", "wrong-password");
    expect((await login("EMP001", PASSWORD)).status).toBe(200);
    for (let i = 0; i < 4; i++) await login("EMP001", "wrong-password");
    expect((await accountState("EMP001"))!.is_locked).toBe(false);
  });

  it("ある社員の失敗は、他の社員の失敗回数に影響しない", async () => {
    await insertEmployee({ loginId: "EMP001" });
    await insertEmployee({ loginId: "EMP002" });
    for (let i = 0; i < 5; i++) await login("EMP001", "wrong-password");
    expect(await accountState("EMP002")).toMatchObject({ failed_attempts: 0, is_locked: false });
    expect((await login("EMP002", PASSWORD)).status).toBe(200);
  });
});
