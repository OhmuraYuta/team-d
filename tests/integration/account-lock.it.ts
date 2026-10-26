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

describe("5回失敗でロック → 管理者が解除", () => {
  it("1. 4回までは「IDまたはパスワードが違う」エラーで、ロックされない", async () => {
    for (let i = 1; i <= 4; i++) {
      const res = await tryLogin("wrong");
      expect(res.body.error, `${i}回目`).not.toBe("ACCOUNT_LOCKED");
    }
  });

  it("2. 5回目でロックされ、403 ACCOUNT_LOCKED", async () => {
    const res = await tryLogin("wrong");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("ACCOUNT_LOCKED");
  });

  it("3. ロック中は正しいパスワードでもログインできない", async () => {
    const res = await tryLogin(PASSWORD);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("ACCOUNT_LOCKED");
  });

  it("4. ロック中のユーザーは、ログイン済みの他の社員からは普通に検索・閲覧できる", async () => {
    const res = await admin.get(`/api/v1/employees/${tanakaId}`);
    expect(res.status).toBe(200);
  });

  it("5. 管理者がロックを解除する", async () => {
    const res = await admin.post(`/api/v1/admin/users/${tanakaId}/unlock`);
    expect(res.status).toBe(200);
  });

  it("6. 解除後は正しいパスワードでログインでき、そのまま検索も使える", async () => {
    const tanaka = new Client();
    expect((await tanaka.login("EMP001", PASSWORD)).status).toBe(200);
    expect((await tanaka.get("/api/v1/employees")).status).toBe(200);
  });
});

describe("管理者が上限を3回に変更 → 3回でロック", () => {
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
