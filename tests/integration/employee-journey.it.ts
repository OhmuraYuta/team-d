/**
 * 結合テスト: 一般社員の1日（複数のAPIを順番に使う業務の流れ）
 *   ログイン → 社員検索 → 社員詳細 → フロアマップで座席を確認 → ありがとうメッセージ送信 → タイムラインに表示
 * 前のステップのレスポンスの値（IDなど）を次のステップで使うので、API同士のつながりを確認できる。
 * 仕様: AI_SPECIFICATION.md 4.2, 4.3, 5.2〜5.4 / openapi.yaml /locations, /seats
 */
import { beforeAll, describe, expect, it } from "vitest";
import { insertEmployee, insertMaster, insertSeat, PASSWORD, resetDatabase } from "./support/db";
import { Client } from "./support/http";

const me = new Client(); // 青木さん（一般社員）としてログインするブラウザ
const ids: Record<string, string> = {};

beforeAll(async () => {
  await resetDatabase();
  const dev = await insertMaster("departments", "技術開発部");
  const center = await insertMaster("locations", "技術センター");
  await insertMaster("locations", "本社");
  const chief = await insertMaster("positions", "チーフエンジニア");
  const react = await insertMaster("skills", "React");
  const seatA12 = await insertSeat({
    locationId: center,
    floor: "3F",
    seatCode: "A-12",
    x: 25,
    y: 12,
  });
  await insertSeat({ locationId: center, floor: "3F", seatCode: "A-13", x: 40, y: 12 });

  await insertEmployee({
    loginId: "EMP001",
    lastName: "大村",
    firstName: "悠太",
    departmentId: dev,
    locationId: center,
    positionId: chief,
    seatId: seatA12,
    skillIds: [react],
  });
  await insertEmployee({
    loginId: "EMP002",
    lastName: "青木",
    firstName: "大隼",
    departmentId: dev,
  });
  Object.assign(ids, { dev, center, seatA12 });
});

describe("一般社員: 同僚を探して、席を確認し、お礼を伝える", () => {
  it("1. ログインする", async () => {
    const res = await me.login("EMP002", PASSWORD);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ employeeId: "EMP002", role: "EMPLOYEE" });
  });

  it("2. スキル「React」と部署で検索すると、大村さんが見つかる", async () => {
    const res = await me.get(`/api/v1/employees?skill=React&departmentId=${ids.dev}`);
    expect(res.status).toBe(200);
    expect(res.body.totalCount).toBe(1);
    expect(res.body.results[0]).toMatchObject({ lastName: "大村", department: "技術開発部" });
    ids.ohmura = res.body.results[0].id; // 検索結果のIDを次のステップで使う
  });

  it("3. 検索結果のIDで社員詳細を開くと、スキルと座席が表示される", async () => {
    const res = await me.get(`/api/v1/employees/${ids.ohmura}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      employeeId: "EMP001",
      position: "チーフエンジニア",
      skills: ["React"],
      seat: { id: ids.seatA12, seatCode: "A-12", floor: "3F", x: 25, y: 12 },
    });
    ids.seatId = res.body.seat.id;
  });

  it("4. [5.4]「座席を確認する」: 拠点一覧から技術センターを選べる", async () => {
    const res = await me.get("/api/v1/locations");
    expect(res.status).toBe(200);
    expect(res.body.map((l: { name: string }) => l.name).sort()).toEqual(["技術センター", "本社"]);
    const center = res.body.find((l: { name: string }) => l.name === "技術センター");
    expect(center.id).toBe(ids.center);
  });

  it("5. [5.4] 詳細の座席と同じ拠点・フロアのマップで、その座席に大村さんが座っている", async () => {
    const res = await me.get(`/api/v1/seats?locationId=${ids.center}&floor=3F`);
    expect(res.status).toBe(200);
    const seat = res.body.find((s: { id: string }) => s.id === ids.seatId);
    expect(seat, "社員詳細の seat.id がフロアマップに無い").toBeDefined();
    expect(seat).toMatchObject({ seatCode: "A-12", x: 25, y: 12 });
    expect(seat.employee).toMatchObject({ id: ids.ohmura, lastName: "大村", firstName: "悠太" });
    // 同じフロアの空席は employee: null
    expect(res.body.find((s: { seatCode: string }) => s.seatCode === "A-13").employee).toBeNull();
  });

  it("6. [4.3] 大村さんにありがとうメッセージを送る", async () => {
    const res = await me.post("/api/v1/messages", {
      receiverId: ids.ohmura,
      content: "レビューありがとうございました！",
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    ids.messageId = res.body.messageId;
  });

  it("7. [4.3][5.2] トップのタイムラインに、送信者=自分・受信者=大村さんで表示される", async () => {
    const res = await me.get("/api/v1/messages/latest");
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({
      id: ids.messageId,
      senderName: "青木 大隼",
      receiverId: ids.ohmura,
      receiverName: "大村 悠太",
      content: "レビューありがとうございました！",
    });
  });

  it("8. 受け取った大村さんがログインしても、同じメッセージがタイムラインに見える", async () => {
    const ohmura = new Client();
    await ohmura.login("EMP001", PASSWORD);
    const res = await ohmura.get("/api/v1/messages/latest");
    expect(res.body.map((m: { id: string }) => m.id)).toContain(ids.messageId);
  });
});
