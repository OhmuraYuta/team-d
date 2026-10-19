/**
 * 仕様: docs/openapi.yaml /locations, /seats（components: Location, FloorMapSeat）
 *       AI_SPECIFICATION.md 5.4「フロアマップ画面（拠点・フロア選択、座席強調）」, 3「seats.x/y は割合% 0〜100」
 */
import { beforeEach, describe, expect, it } from "vitest";
import { GET as locationsRoute } from "@/app/api/v1/locations/route";
import { GET as seatsRoute } from "@/app/api/v1/seats/route";
import { pool } from "@/lib/db";
import { insertEmployee, insertMaster, insertSeat, loginAs, send } from "../helpers";

let cookie: string;
let ids: Record<string, string>;

beforeEach(async () => {
  const center = await insertMaster("locations", "技術センター");
  const hq = await insertMaster("locations", "本社");
  const a12 = await insertSeat({ locationId: center, floor: "3F", seatCode: "A-12", x: 25, y: 12 });
  const a13 = await insertSeat({ locationId: center, floor: "3F", seatCode: "A-13", x: 30, y: 12 });
  const b01 = await insertSeat({ locationId: center, floor: "4F", seatCode: "B-01", x: 0, y: 100 });
  const h01 = await insertSeat({ locationId: hq, floor: "1F", seatCode: "H-01", x: 50, y: 50 });
  const ohmura = await insertEmployee({
    loginId: "EMP001",
    lastName: "大村",
    firstName: "悠太",
    seatId: a12,
  });
  ids = { center, hq, a12, a13, b01, h01, ohmura };
  cookie = await loginAs("EMP001");
});

type Seat = { id: string; seatCode: string };
const codes = (body: Seat[]) => body.map((s) => s.seatCode).sort();

async function seats(qs = "") {
  const res = await send(seatsRoute, `/api/v1/seats${qs}`, { cookie });
  return { status: res.status, body: await res.json() };
}

describe("[openapi] GET /locations（拠点一覧）", () => {
  it("200 で全拠点を { id, name } の配列で返す", async () => {
    const res = await send(locationsRoute, "/api/v1/locations", { cookie });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: ids.center, name: "技術センター" }),
        expect.objectContaining({ id: ids.hq, name: "本社" }),
      ])
    );
  });

  it("拠点が無ければ空配列", async () => {
    await pool.query("TRUNCATE locations CASCADE");
    const res = await send(locationsRoute, "/api/v1/locations", { cookie });
    expect(await res.json()).toEqual([]);
  });

  it("未ログインは 401", async () => {
    expect((await send(locationsRoute, "/api/v1/locations")).status).toBe(401);
  });
});

describe("[openapi] GET /seats（座席一覧）", () => {
  it("拠点とフロアで絞り込める（技術センター 3F → A-12, A-13）", async () => {
    const { status, body } = await seats(`?locationId=${ids.center}&floor=3F`);
    expect(status).toBe(200);
    expect(codes(body)).toEqual(["A-12", "A-13"]);
  });

  it("各座席は必須項目 { id, locationId, floor, seatCode, x, y, employee } を持つ", async () => {
    const { body } = await seats(`?locationId=${ids.center}&floor=3F`);
    const a12 = body.find((s: Seat) => s.seatCode === "A-12");
    expect(a12).toMatchObject({
      id: ids.a12,
      locationId: ids.center,
      floor: "3F",
      seatCode: "A-12",
      x: 25,
      y: 12,
    });
    expect(a12).toHaveProperty("employee");
  });

  it("割当社員がいる座席は employee に { id, employeeId, lastName, firstName } が入る", async () => {
    const { body } = await seats(`?locationId=${ids.center}&floor=3F`);
    const a12 = body.find((s: Seat) => s.seatCode === "A-12");
    expect(a12.employee).toMatchObject({
      id: ids.ohmura,
      employeeId: "EMP001",
      lastName: "大村",
      firstName: "悠太",
    });
  });

  it("未割当の座席は employee が null", async () => {
    const { body } = await seats(`?locationId=${ids.center}&floor=3F`);
    expect(body.find((s: Seat) => s.seatCode === "A-13").employee).toBeNull();
  });

  it("フロアを省略すると、指定拠点の全フロアの座席を返す（3F と 4F）", async () => {
    expect(codes((await seats(`?locationId=${ids.center}`)).body)).toEqual([
      "A-12",
      "A-13",
      "B-01",
    ]);
  });

  it("拠点を省略すると、全拠点が対象", async () => {
    expect(codes((await seats()).body)).toEqual(["A-12", "A-13", "B-01", "H-01"]);
  });

  it("座標は割合% のまま返す（端の 0 と 100 も扱える）", async () => {
    const { body } = await seats(`?locationId=${ids.center}&floor=4F`);
    expect(body[0]).toMatchObject({ seatCode: "B-01", x: 0, y: 100 });
  });

  it("該当する座席が無ければ空配列", async () => {
    expect((await seats(`?locationId=${ids.hq}&floor=9F`)).body).toEqual([]);
  });

  it("locationId が UUID でなければ 400（クエリパラメーターが不正）", async () => {
    expect((await seats("?locationId=abc")).status).toBe(400);
  });

  it("未ログインは 401", async () => {
    expect((await send(seatsRoute, "/api/v1/seats")).status).toBe(401);
  });
});

describe("[3] 座席の座標は割合% (0〜100)", () => {
  it.each([
    [101, 50],
    [50, -1],
  ])("x=%i, y=%i の座席は保存できない", async (x, y) => {
    await expect(
      insertSeat({ locationId: ids.center, floor: "5F", seatCode: "Z-01", x, y })
    ).rejects.toThrow();
  });
});
