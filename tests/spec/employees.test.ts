/**
 * 仕様: AI_SPECIFICATION.md 4.2「社員検索・詳細」, 6.2「検索パフォーマンス」
 *       docs/openapi.yaml /employees, /employees/{id}
 */
import { beforeEach, describe, expect, it } from "vitest";
import { uuidv7 } from "uuidv7";
import { GET as searchRoute } from "@/app/api/v1/employees/route";
import { GET as detailRoute } from "@/app/api/v1/employees/[id]/route";
import { pool } from "@/lib/db";
import { insertEmployee, insertMaster, insertSeat, loginAs, send } from "../helpers";

// ---- テストデータ（毎テスト前に作り直す） ----
let cookie: string;
let ids: Record<string, string>;

beforeEach(async () => {
  const dev = await insertMaster("departments", "技術開発部");
  const sales = await insertMaster("departments", "営業部");
  const center = await insertMaster("locations", "技術センター");
  const hq = await insertMaster("locations", "本社");
  const chief = await insertMaster("positions", "チーフエンジニア");
  const manager = await insertMaster("positions", "課長");
  const react = await insertMaster("skills", "React");
  const ts = await insertMaster("skills", "TypeScript");
  const excel = await insertMaster("skills", "Excel");
  const ap = await insertMaster("credentials", "応用情報技術者");
  const aws = await insertMaster("credentials", "AWS SAP");
  const seat = await insertSeat({
    locationId: center,
    floor: "3F",
    seatCode: "A-12",
    // 座標は割合% (0〜100)。値は仕様書 4.2 のレスポンス例と同じ
    x: 25,
    y: 12,
  });

  const ohmura = await insertEmployee({
    loginId: "EMP001",
    lastName: "大村",
    firstName: "悠太",
    email: "yuta.ohmura@example.com",
    departmentId: dev,
    locationId: center,
    positionId: chief,
    seatId: seat,
    photoUrl: "/images/emp001.jpg",
    selfPR: "フルスタックでのシステム開発が得意です。",
    hobbyInfo: "キャンプ、サイクリング",
    skillIds: [react, ts],
    credentialIds: [ap, aws],
    experiences: [
      {
        projectName: "新製品制御システム開発",
        roleDescription: "リード開発者",
        startDate: "2025-04-01",
        endDate: "2026-03-31",
      },
    ],
  });
  const aoki = await insertEmployee({
    loginId: "EMP002",
    lastName: "青木",
    firstName: "大隼",
    departmentId: dev,
    locationId: hq,
    hobbyInfo: "釣り",
    skillIds: [react],
    credentialIds: [ap],
    experiences: [{ projectName: "社内ポータル刷新" }],
  });
  const omori = await insertEmployee({
    loginId: "EMP010",
    lastName: "大森",
    firstName: "花子",
    departmentId: sales,
    locationId: hq,
    positionId: manager,
    skillIds: [excel],
  });

  ids = {
    dev,
    sales,
    center,
    hq,
    chief,
    manager,
    react,
    ts,
    excel,
    ap,
    aws,
    seat,
    ohmura,
    aoki,
    omori,
  };
  cookie = await loginAs("EMP002");
});

async function search(qs = "") {
  const res = await send(searchRoute, `/api/v1/employees${qs}`, { cookie });
  return { status: res.status, body: await res.json() };
}
const found = (body: { results: { employeeId: string }[] }) =>
  body.results.map((r) => r.employeeId).sort();

describe("[4.2] GET /employees レスポンス形式", () => {
  it("{ totalCount, results[] } を返し、各要素は仕様の9項目", async () => {
    const { status, body } = await search("?employeeId=EMP001");
    expect(status).toBe(200);
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

  it("totalCount は results の件数と一致する", async () => {
    const { body } = await search();
    expect(body.totalCount).toBe(3);
    expect(body.results).toHaveLength(3);
  });

  it("該当なしなら { totalCount: 0, results: [] }", async () => {
    expect((await search("?lastName=存在しない")).body).toEqual({ totalCount: 0, results: [] });
  });
});

describe("[4.2] GET /employees 検索条件", () => {
  it("employeeId は完全一致（EMP00 では EMP001 はヒットしない）", async () => {
    expect(found((await search("?employeeId=EMP001")).body)).toEqual(["EMP001"]);
    expect(found((await search("?employeeId=EMP00")).body)).toEqual([]);
  });

  it("lastName は部分一致（「大」→ 大村・大森）", async () => {
    expect(found((await search(`?lastName=${encodeURIComponent("大")}`)).body)).toEqual([
      "EMP001",
      "EMP010",
    ]);
  });

  it("firstName は部分一致（「隼」→ 大隼）", async () => {
    expect(found((await search(`?firstName=${encodeURIComponent("隼")}`)).body)).toEqual([
      "EMP002",
    ]);
  });

  it("departmentId は完全一致（UUIDv7）", async () => {
    expect(found((await search(`?departmentId=${ids.dev}`)).body)).toEqual(["EMP001", "EMP002"]);
  });

  it("locationId は完全一致（UUIDv7）", async () => {
    expect(found((await search(`?locationId=${ids.hq}`)).body)).toEqual(["EMP002", "EMP010"]);
  });

  it("positionId は完全一致（UUIDv7）", async () => {
    expect(found((await search(`?positionId=${ids.chief}`)).body)).toEqual(["EMP001"]);
    expect(found((await search(`?positionId=${ids.manager}`)).body)).toEqual(["EMP010"]);
  });

  it("positionId も他の条件と AND（課長 かつ 部署=技術開発部 → 該当なし）", async () => {
    const { body } = await search(`?positionId=${ids.manager}&departmentId=${ids.dev}`);
    expect(found(body)).toEqual([]);
  });

  it("skill は名前の部分一致（「script」→ TypeScript を持つ大村）", async () => {
    expect(found((await search("?skill=script")).body)).toEqual(["EMP001"]);
  });

  it("skill は UUIDv7 値でも検索できる", async () => {
    expect(found((await search(`?skill=${ids.react}`)).body)).toEqual(["EMP001", "EMP002"]);
  });

  // 仕様「部分一致またはUUIDv7値のリスト」。検索全体が AND 条件なので、リストの全スキルを持つ社員だけを返すと解釈。
  // 形式は OpenAPI のクエリ配列の既定 (style=form, explode=true) = 同じ名前のパラメータを繰り返す形とした。
  it("skill は UUIDv7 値のリストで検索でき、全スキルを持つ社員だけを返す（React+TS → 大村のみ）", async () => {
    const { body } = await search(`?skill=${ids.react}&skill=${ids.ts}`);
    expect(found(body)).toEqual(["EMP001"]);
  });

  it("credential は名前の部分一致（「AWS」→ 大村）", async () => {
    expect(found((await search("?credential=AWS")).body)).toEqual(["EMP001"]);
  });

  it("credential は UUIDv7 値でも検索できる", async () => {
    expect(found((await search(`?credential=${ids.aws}`)).body)).toEqual(["EMP001"]);
  });

  it("credential は UUIDv7 値のリストで検索でき、全資格を持つ社員だけを返す（応用情報+AWS → 大村のみ）", async () => {
    const { body } = await search(`?credential=${ids.ap}&credential=${ids.aws}`);
    expect(found(body)).toEqual(["EMP001"]);
  });

  it("project は過去担当プロジェクト名の部分一致", async () => {
    expect(found((await search(`?project=${encodeURIComponent("刷新")}`)).body)).toEqual([
      "EMP002",
    ]);
  });

  it("hobby は趣味の部分一致", async () => {
    expect(found((await search(`?hobby=${encodeURIComponent("キャンプ")}`)).body)).toEqual([
      "EMP001",
    ]);
  });

  it("複数条件は AND（部署=技術開発部 かつ 拠点=本社 → 青木だけ）", async () => {
    const { body } = await search(`?departmentId=${ids.dev}&locationId=${ids.hq}`);
    expect(found(body)).toEqual(["EMP002"]);
  });

  it("条件なしなら全社員", async () => {
    expect(found((await search()).body)).toEqual(["EMP001", "EMP002", "EMP010"]);
  });
});

describe("[4.2] GET /employees/:id 社員詳細", () => {
  it("仕様のレスポンス例と同じ形で全項目を返す", async () => {
    const res = await send(detailRoute, `/api/v1/employees/${ids.ohmura}`, {
      cookie,
      params: { id: ids.ohmura },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
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

  it("存在しない社員の UUIDv7 を指定したら 404", async () => {
    const missing = uuidv7();
    const res = await send(detailRoute, `/api/v1/employees/${missing}`, {
      cookie,
      params: { id: missing },
    });
    expect(res.status).toBe(404);
  });

  it("未ログインでは見られない（401）", async () => {
    const res = await send(detailRoute, `/api/v1/employees/${ids.ohmura}`, {
      params: { id: ids.ohmura },
    });
    expect(res.status).toBe(401);
  });
});

describe("[6.2] 検索パフォーマンス", () => {
  // インデックスの有無は schema.test.ts で確認している
  it("社員800名（1章: 想定規模）で、複合条件の検索が3秒以内に返る", async () => {
    await pool.query(
      `INSERT INTO employees (id, login_id, password_hash, last_name, first_name, email, department_id, location_id, hobby_info)
       SELECT gen_random_uuid(), 'BULK' || i, 'x', '山田' || i, '太郎', 'bulk' || i || '@example.com',
              $1, $2, CASE WHEN i % 3 = 0 THEN '登山' ELSE '読書' END
       FROM generate_series(1, 800) AS i`,
      [ids.dev, ids.hq]
    );
    const start = performance.now();
    const { status, body } = await search(
      `?lastName=${encodeURIComponent("山田")}&departmentId=${ids.dev}&hobby=${encodeURIComponent("登山")}`
    );
    const elapsed = performance.now() - start;

    expect(status).toBe(200);
    expect(body.totalCount).toBe(266);
    expect(elapsed).toBeLessThan(3000);
  });
});
