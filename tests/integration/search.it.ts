/**
 * 結合テスト: 社員検索・社員詳細（本物のサーバーに HTTP でクエリを送る）
 * 日本語のクエリ文字列がブラウザと同じ形 (URLエンコード) で届き、DB の検索結果が仕様の形で返るかを確認する。
 * 仕様: AI_SPECIFICATION.md 4.2「GET /employees」「GET /employees/:id」 / openapi.yaml /employees
 */
import { beforeAll, describe, expect, it } from "vitest";
import { uuidv7 } from "uuidv7";
import {
  db,
  insertEmployee,
  insertMaster,
  insertSeat,
  PASSWORD,
  resetDatabase,
} from "./support/db";
import { Client } from "./support/http";

const user = new Client();
const ids: Record<string, string> = {};

beforeAll(async () => {
  await resetDatabase();
  ids.dev = await insertMaster("departments", "技術開発部");
  ids.sales = await insertMaster("departments", "営業部");
  ids.center = await insertMaster("locations", "技術センター");
  ids.hq = await insertMaster("locations", "本社");
  ids.chief = await insertMaster("positions", "チーフエンジニア");
  ids.manager = await insertMaster("positions", "課長");
  ids.react = await insertMaster("skills", "React");
  ids.ts = await insertMaster("skills", "TypeScript");
  ids.ap = await insertMaster("credentials", "応用情報技術者");
  ids.aws = await insertMaster("credentials", "AWS SAP");
  ids.seat = await insertSeat({
    locationId: ids.center,
    floor: "3F",
    seatCode: "A-12",
    x: 25,
    y: 12,
  });

  // 仕様書 4.2 のレスポンス例と同じ社員
  ids.ohmura = await insertEmployee({
    loginId: "EMP001",
    lastName: "大村",
    firstName: "悠太",
    departmentId: ids.dev,
    locationId: ids.center,
    positionId: ids.chief,
    seatId: ids.seat,
    skillIds: [ids.react, ids.ts],
  });
  await db.query(
    `UPDATE employees SET email = 'yuta.ohmura@example.com', photo_url = '/images/emp001.jpg',
       self_pr = 'フルスタックでのシステム開発が得意です。', hobby_info = 'キャンプ、サイクリング'
     WHERE id = $1`,
    [ids.ohmura]
  );
  await db.query(`INSERT INTO employee_credentials VALUES ($1, $2), ($1, $3)`, [
    ids.ohmura,
    ids.ap,
    ids.aws,
  ]);
  await db.query(
    `INSERT INTO employee_experiences (id, employee_id, project_name, role_description, start_date, end_date)
     VALUES ($1, $2, '新製品制御システム開発', 'リード開発者', '2025-04-01', '2026-03-31')`,
    [uuidv7(), ids.ohmura]
  );

  ids.aoki = await insertEmployee({
    loginId: "EMP002",
    lastName: "青木",
    firstName: "大隼",
    departmentId: ids.dev,
    locationId: ids.hq,
    positionId: ids.manager,
    skillIds: [ids.react],
  });
  await db.query(`UPDATE employees SET hobby_info = '釣り' WHERE id = $1`, [ids.aoki]);
  await db.query(`INSERT INTO employee_credentials VALUES ($1, $2)`, [ids.aoki, ids.ap]);
  await db.query(
    `INSERT INTO employee_experiences (id, employee_id, project_name) VALUES ($1, $2, '社内ポータル刷新')`,
    [uuidv7(), ids.aoki]
  );

  await insertEmployee({
    loginId: "EMP010",
    lastName: "大森",
    firstName: "花子",
    departmentId: ids.sales,
    locationId: ids.hq,
  });
  await user.login("EMP002", PASSWORD);
});

/** URLSearchParams でエンコードして送る（ブラウザのフォーム送信と同じ形） */
async function search(params: [string, string][] = []) {
  const qs = new URLSearchParams(params).toString();
  const res = await user.get(`/api/v1/employees${qs ? `?${qs}` : ""}`);
  expect(res.status).toBe(200);
  return res.body as { totalCount: number; results: { employeeId: string }[] };
}
const found = (body: { results: { employeeId: string }[] }) =>
  body.results.map((r) => r.employeeId).sort();

describe("[4.2] GET /employees の各検索条件が、HTTP越しに正しく効く", () => {
  it("条件なしなら全社員。totalCount は件数と一致", async () => {
    const body = await search();
    expect(found(body)).toEqual(["EMP001", "EMP002", "EMP010"]);
    expect(body.totalCount).toBe(3);
  });

  it("employeeId は完全一致", async () => {
    expect(found(await search([["employeeId", "EMP001"]]))).toEqual(["EMP001"]);
    expect(found(await search([["employeeId", "EMP00"]]))).toEqual([]);
  });

  it("lastName は部分一致（日本語）", async () => {
    expect(found(await search([["lastName", "大"]]))).toEqual(["EMP001", "EMP010"]);
  });

  it("firstName は部分一致（日本語）", async () => {
    expect(found(await search([["firstName", "隼"]]))).toEqual(["EMP002"]);
  });

  it("departmentId は完全一致（UUIDv7）", async () => {
    expect(found(await search([["departmentId", ids.dev]]))).toEqual(["EMP001", "EMP002"]);
  });

  it("locationId は完全一致（UUIDv7）", async () => {
    expect(found(await search([["locationId", ids.hq]]))).toEqual(["EMP002", "EMP010"]);
  });

  it("positionId は完全一致（UUIDv7）", async () => {
    expect(found(await search([["positionId", ids.chief]]))).toEqual(["EMP001"]);
  });

  it("skill は部分一致", async () => {
    expect(found(await search([["skill", "script"]]))).toEqual(["EMP001"]);
  });

  it("skill は UUIDv7 値でも検索できる", async () => {
    expect(found(await search([["skill", ids.react]]))).toEqual(["EMP001", "EMP002"]);
  });

  // 「UUIDv7値のリスト」の形式と AND/OR は仕様に明記がない。
  // tests/spec/employees.test.ts と同じく「同名パラメータの繰り返し」「全部を持つ社員 (AND)」と解釈する
  it("skill は UUIDv7 値のリストで検索でき、全スキルを持つ社員だけを返す", async () => {
    expect(
      found(
        await search([
          ["skill", ids.react],
          ["skill", ids.ts],
        ])
      )
    ).toEqual(["EMP001"]);
  });

  it("credential は部分一致（日本語）", async () => {
    expect(found(await search([["credential", "応用"]]))).toEqual(["EMP001", "EMP002"]);
  });

  it("credential は UUIDv7 値でも検索できる", async () => {
    expect(found(await search([["credential", ids.aws]]))).toEqual(["EMP001"]);
  });

  it("credential は UUIDv7 値のリストで検索でき、全資格を持つ社員だけを返す", async () => {
    expect(
      found(
        await search([
          ["credential", ids.ap],
          ["credential", ids.aws],
        ])
      )
    ).toEqual(["EMP001"]);
  });

  it("project は過去担当プロジェクト名の部分一致（日本語）", async () => {
    expect(found(await search([["project", "刷新"]]))).toEqual(["EMP002"]);
  });

  it("hobby は趣味の部分一致（日本語・読点を含む値）", async () => {
    expect(found(await search([["hobby", "キャンプ、サイ"]]))).toEqual(["EMP001"]);
  });

  it("複数条件は AND", async () => {
    expect(
      found(
        await search([
          ["lastName", "大"],
          ["departmentId", ids.dev],
          ["skill", "React"],
        ])
      )
    ).toEqual(["EMP001"]);
  });

  it("該当なしなら { totalCount: 0, results: [] }", async () => {
    expect(await search([["lastName", "存在しない"]])).toEqual({ totalCount: 0, results: [] });
  });
});

describe("[4.2] レスポンスの形が仕様どおり", () => {
  it("GET /employees の results の各要素は、仕様の9項目", async () => {
    const body = await search([["employeeId", "EMP001"]]);
    expect(body).toEqual({
      totalCount: 1,
      results: [
        {
          id: ids.ohmura,
          employeeId: "EMP001",
          lastName: "大村",
          firstName: "悠太",
          department: "技術開発部",
          location: "技術センター",
          position: "チーフエンジニア",
          email: "yuta.ohmura@example.com",
          photoUrl: "/images/emp001.jpg",
        },
      ],
    });
  });

  it("GET /employees/:id は、仕様のレスポンス例と同じ項目・値を返す", async () => {
    const res = await user.get(`/api/v1/employees/${ids.ohmura}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: ids.ohmura,
      employeeId: "EMP001",
      lastName: "大村",
      firstName: "悠太",
      email: "yuta.ohmura@example.com",
      department: "技術開発部",
      location: "技術センター",
      position: "チーフエンジニア",
      photoUrl: "/images/emp001.jpg",
      skills: expect.arrayContaining(["React", "TypeScript"]),
      credentials: expect.arrayContaining(["応用情報技術者", "AWS SAP"]),
      experiences: [
        {
          projectName: "新製品制御システム開発",
          roleDescription: "リード開発者",
          startDate: "2025-04-01",
          endDate: "2026-03-31",
        },
      ],
      selfPR: "フルスタックでのシステム開発が得意です。",
      hobbyInfo: "キャンプ、サイクリング",
      seat: { id: ids.seat, seatCode: "A-12", floor: "3F", x: 25, y: 12 },
    });
  });

  it("[openapi] 存在しない社員の UUIDv7 を指定したら 404", async () => {
    expect((await user.get(`/api/v1/employees/${uuidv7()}`)).status).toBe(404);
  });
});
