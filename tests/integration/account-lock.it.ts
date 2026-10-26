/**
 * 結合テスト: アカウントロックと、管理者による解除・設定変更
 *   社員がパスワードを5回間違える → ロック → 管理者が解除 → ログインできる
 *   管理者が上限を3回に変更 → 3回でロックされる
 * 仕様: AI_SPECIFICATION.md 4.1, 4.4, 5.1, 6.1「ロックロジック」
 */
import { beforeAll, describe, expect, it } from "vitest";
import { insertEmployee, PASSWORD, resetDatabase } from "./support/db";
import { Client } from "./support/http";

const admin = new Client();
let tanakaId: string;

beforeAll(async () => {
  await resetDatabase();
  await insertEmployee({ loginId: "ADM001", lastName: "管理", firstName: "者", role: "ADMIN" });
  tanakaId = await insertEmployee({ loginId: "EMP001", lastName: "田中", firstName: "次郎" });
  await admin.login("ADM001", PASSWORD);
});

const tryLogin = (password: string) => new Client().login("EMP001", password);

/** 仕様 4.1「Response (Locked 403)」 */
const LOCKED_BODY = {
  success: false,
  error: "ACCOUNT_LOCKED",
  message: "アカウントがロックされています。管理者に問い合わせてください。",
};

describe("[6.1] デフォルト5回の失敗でロック → [4.4] 管理者が解除", () => {
  it("1. 4回の失敗ではロックされない（ログインは失敗するが ACCOUNT_LOCKED ではない）", async () => {
    for (let i = 1; i <= 4; i++) {
      const res = await tryLogin("wrong");
      expect(res.status, `${i}回目`).not.toBe(200);
      expect(res.body.error, `${i}回目`).not.toBe("ACCOUNT_LOCKED");
    }
  });

  it("2. 5回目の失敗でロックされ、[4.1] の 403 レスポンスが返る", async () => {
    const res = await tryLogin("wrong");
    expect(res.status).toBe(403);
    expect(res.body).toEqual(LOCKED_BODY);
  });

  it("3. ロック中は正しいパスワードでも即座にエラー", async () => {
    const res = await tryLogin(PASSWORD);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("ACCOUNT_LOCKED");
  });

  it("4. [4.4] 管理者がロックを解除する", async () => {
    const res = await admin.post(`/api/v1/admin/users/${tanakaId}/unlock`);
    expect(res.status).toBe(200);
  });

  it("5. [4.4] 解除で失敗回数が0に戻り、正しいパスワードでログインして検索も使える", async () => {
    const tanaka = new Client();
    expect((await tanaka.login("EMP001", PASSWORD)).status).toBe(200);
    expect((await tanaka.get("/api/v1/employees")).status).toBe(200);
  });
});

describe("[4.4] 管理者がログイン失敗許容回数を3回に変更 → 3回でロック", () => {
  it("1. 管理者が失敗許容回数を 3 に変更する", async () => {
    const res = await admin.put("/api/v1/admin/settings/max-failed-attempts", {
      maxFailedAttempts: 3,
    });
    expect(res.status).toBe(200);
    expect(res.body.maxFailedAttempts).toBe(3);
  });

  it("2. 2回失敗してもまだロックされない", async () => {
    for (let i = 0; i < 2; i++) await tryLogin("wrong");
    expect((await tryLogin(PASSWORD)).status).toBe(200); // 成功で回数がリセットされる
  });

  it("3. 3回連続で失敗するとロックされる", async () => {
    await tryLogin("wrong");
    await tryLogin("wrong");
    const third = await tryLogin("wrong");
    expect(third.status).toBe(403);
    expect(third.body.error).toBe("ACCOUNT_LOCKED");
  });
});
