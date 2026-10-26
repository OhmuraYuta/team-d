/**
 * 結合テスト: 本物のブラウザ (Chromium) でログイン画面を操作する
 *   画面 (React) → 実API (NEXT_PUBLIC_USE_MOCK=false でビルド) → DB までを、ユーザーと同じ操作でつなげて確認する
 * 仕様: AI_SPECIFICATION.md 5.1「ログイン画面」, 4.1, 6.1
 */
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertEmployee, PASSWORD, resetDatabase } from "./support/db";
import { BASE_URL } from "./support/env";

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});
beforeEach(async () => {
  await resetDatabase();
  await insertEmployee({ loginId: "EMP001", lastName: "大村", firstName: "悠太" });
  // テストごとに新しいブラウザの「シークレットウィンドウ」を使う（Cookieが前のテストから残らない）
  const context = await browser.newContext();
  page = await context.newPage();
  await page.goto(`${BASE_URL}/login`);
});

async function submit(employeeId: string, password: string) {
  await page.getByLabel("社員ID").fill(employeeId);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();
}

describe("[5.1] ブラウザからのログイン", () => {
  it("正しい社員ID・パスワードで、ログイン成功が表示される", async () => {
    await submit("EMP001", PASSWORD);
    // isVisible() は「今この瞬間」しか見ないので、APIの応答前に調べると失敗する。表示されるまで待つ
    const dialog = page.getByRole("dialog", { name: "ログイン成功" });
    await dialog.waitFor();
    expect(await dialog.textContent()).toContain("ログインに成功しました");
  });

  it("[6.1] ログイン後、ブラウザに HttpOnly の token Cookie が保存され、JavaScript からは読めない", async () => {
    await submit("EMP001", PASSWORD);
    await page.getByRole("dialog", { name: "ログイン成功" }).waitFor();

    const cookie = (await page.context().cookies()).find((c) => c.name === "token");
    expect(cookie, "token Cookie が保存されていない").toBeDefined();
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe("Lax");
    expect(await page.evaluate(() => document.cookie)).not.toContain("token=");
  });

  it("ログイン後は、同じブラウザから保護されたAPIを呼べる（Cookie が自動で送られる）", async () => {
    await submit("EMP001", PASSWORD);
    await page.getByRole("dialog", { name: "ログイン成功" }).waitFor();
    const status = await page.evaluate(async () => (await fetch("/api/v1/employees")).status);
    expect(status).toBe(200);
  });

  it("ログイン前は、同じブラウザから保護されたAPIを呼んでも 401", async () => {
    const status = await page.evaluate(async () => (await fetch("/api/v1/employees")).status);
    expect(status).toBe(401);
  });

  it("パスワードを間違えると、エラーが表示され Cookie は保存されない", async () => {
    await submit("EMP001", "wrong-password");
    const dialog = page.getByRole("dialog", { name: "エラー" });
    await dialog.waitFor();
    expect(await dialog.textContent()).toContain("正しくありません");
    expect((await page.context().cookies()).find((c) => c.name === "token")).toBeUndefined();
  });

  it("[5.1] 5回連続で間違えると、画面でロックされたことが分かる", async () => {
    for (let i = 0; i < 5; i++) {
      await submit("EMP001", "wrong-password");
      const dialog = page.getByRole("dialog", { name: "エラー" });
      await dialog.waitFor();
      if (i < 4) await page.getByRole("button", { name: "戻る" }).click();
    }
    // 文言の細かな違い（4.1 と 5.1）は tests/spec/login-screen.test.tsx で扱っている。
    // ここでは「サーバーのロック判定が画面まで届くこと」を確認する
    expect(await page.getByRole("dialog", { name: "エラー" }).textContent()).toContain("ロック");
  });
});
