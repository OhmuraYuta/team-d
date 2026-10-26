/**
 * 結合テスト: 本物のブラウザ (Chromium) で画面を操作する
 *   画面 (React) → 実API (NEXT_PUBLIC_USE_MOCK=false でビルド) → ミドルウェア → DB までを、ユーザーと同じ操作で確認する
 * 仕様: AI_SPECIFICATION.md 5.1「ログイン画面」, 6.1「画面遷移時の認証」「HttpOnly Cookie」
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
  // テストごとに新しい「シークレットウィンドウ」を使い、Cookie を前のテストから持ち越さない
  page = await (await browser.newContext()).newPage();
});

async function openLogin() {
  await page.goto(`${BASE_URL}/login`);
}

async function submit(employeeId: string, password: string) {
  await page.getByLabel("社員ID").fill(employeeId);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();
}

/** ブラウザに token Cookie が保存されるまで待つ（ログインAPIの応答待ち） */
async function waitForTokenCookie() {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const cookie = (await page.context().cookies()).find((c) => c.name === "token");
    if (cookie) return cookie;
    await page.waitForTimeout(100);
  }
  return undefined;
}

describe("[5.1] ログイン画面の要素", () => {
  it("社員ID入力欄・パスワード入力欄（入力が隠れる）・ログインボタンがある", async () => {
    await openLogin();
    await expect(page.getByLabel("社員ID").isEditable()).resolves.toBe(true);
    await expect(page.getByLabel("パスワード").getAttribute("type")).resolves.toBe("password");
    await expect(page.getByRole("button", { name: "ログイン" }).isEnabled()).resolves.toBe(true);
  });
});

describe("[5.1][6.1] 画面からログインすると、実APIで認証され HttpOnly Cookie が保存される", () => {
  it("正しい社員ID・パスワードでログインすると、ブラウザに token Cookie (HttpOnly・SameSite=Lax) が保存される", async () => {
    await openLogin();
    await submit("EMP001", PASSWORD);
    const cookie = await waitForTokenCookie();
    expect(cookie, "token Cookie が保存されていない").toBeDefined();
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe("Lax");
  });

  it("HttpOnly なので、画面の JavaScript からはトークンを読めない", async () => {
    await openLogin();
    await submit("EMP001", PASSWORD);
    await waitForTokenCookie();
    expect(await page.evaluate(() => document.cookie)).not.toContain("token=");
  });

  it("ログイン後は、同じブラウザから保護されたAPIを呼べる（Cookie が自動で送られる）", async () => {
    await openLogin();
    expect(await page.evaluate(async () => (await fetch("/api/v1/employees")).status)).toBe(401);
    await submit("EMP001", PASSWORD);
    await waitForTokenCookie();
    expect(await page.evaluate(async () => (await fetch("/api/v1/employees")).status)).toBe(200);
  });
});

describe("[5.1] エラー表示エリア", () => {
  it("パスワードを間違えると、画面にエラーが表示され、Cookie は保存されない", async () => {
    await openLogin();
    await submit("EMP001", "wrong-password");
    await page.getByText("社員IDまたはパスワードが正しくありません").waitFor();
    expect((await page.context().cookies()).find((c) => c.name === "token")).toBeUndefined();
  });

  it("5回連続で失敗すると「アカウントがロックされました。管理者に連絡してください」と表示される", async () => {
    await openLogin();
    for (let i = 0; i < 5; i++) {
      await submit("EMP001", "wrong-password");
      await page.getByRole("button", { name: "戻る" }).waitFor();
      if (i < 4) await page.getByRole("button", { name: "戻る" }).click();
    }
    const shown = await page.getByRole("dialog").textContent();
    expect(shown).toContain("アカウントがロックされました。管理者に連絡してください");
  });
});

describe("[6.1] 画面遷移時の認証", () => {
  it("未ログインでトップ画面 / を開くと、ログイン画面へリダイレクトされる", async () => {
    await page.goto(`${BASE_URL}/`);
    expect(new URL(page.url()).pathname).toBe("/login");
  });

  it("ログイン済みなら、トップ画面 / をそのまま開ける", async () => {
    await openLogin();
    await submit("EMP001", PASSWORD);
    await waitForTokenCookie();
    await page.goto(`${BASE_URL}/`);
    expect(new URL(page.url()).pathname).toBe("/");
  });
});
