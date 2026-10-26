/**
 * 結合テスト: 画面の流れ（本物のブラウザ → 画面 → 実API → DB）
 *   トップ画面で検索 → 社員詳細 → ありがとうを伝える → 座席を確認する → フロアマップ
 * 仕様: AI_SPECIFICATION.md 5.2「トップ画面」, 5.3「社員詳細画面」, 5.4「フロアマップ画面」, 6.2
 *
 * 仕様書に書かれていないため、次のように判断している（変わったらここを直す）:
 *  - トップ画面の URL は `/`（ルート）とする。社員詳細・フロアマップは URL ではなく、仕様にある操作でたどる
 *  - 検索フォームの各項目は、仕様 5.2 の項目名（姓・名・部署…）をラベルとして探す。送信は Enter キーで行う
 *  - 社員詳細へは、検索結果に表示された社員名をクリックして移動する
 *  - 「ありがとうを伝える」は、テキストエリアを含むフォームの中のボタンで送信する
 *  - 仕様に文言があるもの（「ありがとうを伝える」「座席を確認する」）は、その文言で探す
 *
 * 2026-10 時点では src/app にトップ（仮画面）とログイン画面しかないため、これらのテストは失敗する。
 */
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  db,
  insertEmployee,
  insertMaster,
  insertSeat,
  PASSWORD,
  resetDatabase,
} from "./support/db";
import { BASE_URL } from "./support/env";

let browser: Browser;
let page: Page;
const ids: Record<string, string> = {};

beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});

beforeEach(async () => {
  await resetDatabase();
  ids.dev = await insertMaster("departments", "技術開発部");
  ids.center = await insertMaster("locations", "技術センター");
  ids.chief = await insertMaster("positions", "チーフエンジニア");
  ids.react = await insertMaster("skills", "React");
  ids.ap = await insertMaster("credentials", "応用情報技術者");
  ids.seat = await insertSeat({
    locationId: ids.center,
    floor: "3F",
    seatCode: "A-12",
    x: 25,
    y: 12,
  });
  ids.ohmura = await insertEmployee({
    loginId: "EMP001",
    lastName: "大村",
    firstName: "悠太",
    departmentId: ids.dev,
    locationId: ids.center,
    positionId: ids.chief,
    seatId: ids.seat,
    skillIds: [ids.react],
  });
  await db.query(
    `UPDATE employees SET photo_url = '/images/emp001.jpg',
       self_pr = 'フルスタックでのシステム開発が得意です。', hobby_info = 'キャンプ、サイクリング'
     WHERE id = $1`,
    [ids.ohmura]
  );
  await db.query(`INSERT INTO employee_credentials VALUES ($1, $2)`, [ids.ohmura, ids.ap]);
  await db.query(
    `INSERT INTO employee_experiences (id, employee_id, project_name, role_description, start_date)
     VALUES (gen_random_uuid(), $1, '新製品制御システム開発', 'リード開発者', '2025-04-01')`,
    [ids.ohmura]
  );
  ids.aoki = await insertEmployee({ loginId: "EMP002", lastName: "青木", firstName: "大隼" });

  // ログイン画面の操作は screens.it.ts で確認済みなので、ここではAPIでログインして Cookie をブラウザに入れる
  const context = await browser.newContext();
  const login = await context.request.post(`${BASE_URL}/api/v1/auth/login`, {
    data: { employeeId: "EMP002", password: PASSWORD },
  });
  expect(login.status()).toBe(200);
  page = await context.newPage();
  page.setDefaultTimeout(5000); // 画面が無いときに1件30秒待たないようにする
});

async function openTop() {
  await page.goto(`${BASE_URL}/`);
}

async function searchByLastName(lastName: string) {
  await page.getByLabel("姓").fill(lastName);
  await page.getByLabel("姓").press("Enter");
}

async function openDetailOfOhmura() {
  await openTop();
  await searchByLastName("大村");
  await page
    .getByText(/大村\s*悠太/)
    .first()
    .click();
  await page.getByText("ありがとうを伝える").waitFor(); // 社員詳細画面にしかない要素
}

describe("[5.2] トップ画面", () => {
  it("社員簡易検索フォームに、姓・名・部署・拠点・スキル・資格・役職の項目がある", async () => {
    await openTop();
    for (const label of ["姓", "名", "部署", "拠点", "スキル", "資格", "役職"]) {
      await expect(
        page.getByLabel(label, { exact: true }).count(),
        `「${label}」の入力項目`
      ).resolves.toBeGreaterThan(0);
    }
  });

  it("[6.2] 姓で検索すると、3秒以内に結果（実DBの社員）が表示される", async () => {
    await openTop();
    const start = Date.now();
    await searchByLastName("大村");
    await page
      .getByText(/大村\s*悠太/)
      .first()
      .waitFor({ timeout: 3000 });
    expect(Date.now() - start).toBeLessThan(3000);
  });

  it("ありがとうメッセージのタイムラインに、最新5件が表示され、6件目以前は表示されない", async () => {
    for (let i = 1; i <= 6; i++) {
      await db.query(
        `INSERT INTO thank_you_messages (id, sender_id, receiver_id, content, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, TIMESTAMP '2026-10-01 09:00' + ($4 || ' minutes')::interval)`,
        [ids.aoki, ids.ohmura, `タイムライン確認メッセージ${i}`, i]
      );
    }
    await openTop();
    for (let i = 2; i <= 6; i++) {
      await page.getByText(`タイムライン確認メッセージ${i}`).waitFor();
    }
    await expect(page.getByText("タイムライン確認メッセージ1").count()).resolves.toBe(0);
  });
});

describe("[5.3] 社員詳細画面", () => {
  it("検索結果から開くと、基本情報・スキル/資格・過去プロジェクト・自己PR・趣味が表示される", async () => {
    await openDetailOfOhmura();
    for (const text of [
      "大村",
      "悠太",
      "技術開発部",
      "チーフエンジニア",
      "React",
      "応用情報技術者",
      "新製品制御システム開発",
      "フルスタックでのシステム開発が得意です。",
      "キャンプ、サイクリング",
    ]) {
      await expect(page.getByText(text).first().isVisible(), `「${text}」`).resolves.toBe(true);
    }
  });

  it("顔写真が表示される", async () => {
    await openDetailOfOhmura();
    await expect(page.locator('img[src*="emp001.jpg"]').count()).resolves.toBeGreaterThan(0);
  });

  it("「ありがとうを伝える」フォームから送ると、メッセージがDBに保存され、トップのタイムラインに出る", async () => {
    await openDetailOfOhmura();
    const form = page.locator("form", { has: page.locator("textarea") });
    await form.locator("textarea").fill("画面から送ったお礼です");
    await form.getByRole("button").click();

    // 実APIを通ってDBに保存されたか（送信者=ログイン中の青木さん、受信者=大村さん）
    const deadline = Date.now() + 3000;
    let rows: { sender_id: string; receiver_id: string }[] = [];
    while (Date.now() < deadline && rows.length === 0) {
      rows = (
        await db.query(`SELECT sender_id, receiver_id FROM thank_you_messages WHERE content = $1`, [
          "画面から送ったお礼です",
        ])
      ).rows;
      if (rows.length === 0) await page.waitForTimeout(100);
    }
    expect(rows).toEqual([{ sender_id: ids.aoki, receiver_id: ids.ohmura }]);

    await openTop();
    await page.getByText("画面から送ったお礼です").waitFor();
  });
});

describe("[5.4] フロアマップ画面", () => {
  it("社員詳細の「座席を確認する」から移動すると、拠点・フロアの選択と、その社員の座席番号・名前が表示される", async () => {
    await openDetailOfOhmura();
    await page
      .getByRole("button", { name: "座席を確認する" })
      .or(page.getByRole("link", { name: "座席を確認する" }))
      .click();

    // 拠点・フロア選択のドロップダウン
    await page.getByRole("combobox").first().waitFor();
    // 座席強調: 座席番号と名前のポップアップ
    await page.getByText("A-12").first().waitFor();
    await expect(page.getByText(/大村/).first().isVisible()).resolves.toBe(true);
  });

  it("フロアマップの拠点の選択肢に、DBの拠点（技術センター）がある", async () => {
    await openDetailOfOhmura();
    await page
      .getByRole("button", { name: "座席を確認する" })
      .or(page.getByRole("link", { name: "座席を確認する" }))
      .click();
    await page.getByRole("combobox").first().waitFor();
    const options = await page.locator("option, [role=option]").allTextContents();
    expect(options.join(" ")).toContain("技術センター");
  });
});
