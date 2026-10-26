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
  it("1. [4.1] ログインする", async () => {
    const res = await me.login("EMP002", PASSWORD);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ employeeId: "EMP002", role: "EMPLOYEE" });
    ids.me = res.body.user.id;
  });

  it("2. [4.2][5.2] スキル「React」（部分一致）と部署（完全一致）の AND で検索すると、大村さんが見つかる", async () => {
    const res = await me.get(`/api/v1/employees?skill=React&departmentId=${ids.dev}`);
    expect(res.status).toBe(200);
    expect(res.body.totalCount).toBe(1);
    expect(res.body.results[0]).toMatchObject({ lastName: "大村", department: "技術開発部" });
    ids.ohmura = res.body.results[0].id; // 検索結果のIDを次のステップで使う
  });

  it("3. [4.2][5.3] 検索結果のIDで社員詳細を開くと、スキルと座席が表示される", async () => {
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

  it("5. [5.4][openapi /seats] 詳細の座席と同じ拠点・フロアのマップで、その座席（座席番号・座標）に大村さんがいる", async () => {
    const res = await me.get(`/api/v1/seats?locationId=${ids.center}&floor=3F`);
    expect(res.status).toBe(200);
    const seat = res.body.find((s: { id: string }) => s.id === ids.seatId);
    expect(seat, "社員詳細の seat.id がフロアマップに無い").toBeDefined();
    expect(seat).toMatchObject({ seatCode: "A-12", x: 25, y: 12 });
    expect(seat.employee).toMatchObject({ id: ids.ohmura, lastName: "大村", firstName: "悠太" });
    // 同じフロアの空席は employee: null
    expect(res.body.find((s: { seatCode: string }) => s.seatCode === "A-13").employee).toBeNull();
  });

  it("6. [4.3][5.3] 社員詳細から大村さんにありがとうメッセージを送ると 201、messageId は UUIDv7", async () => {
    const res = await me.post("/api/v1/messages", {
      receiverId: ids.ohmura,
      content: "レビューありがとうございました！",
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      success: true,
      messageId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-/),
    });
    ids.messageId = res.body.messageId;
  });

  it("7. [4.3][5.2] トップのタイムラインに、送信者=自分・受信者=大村さんで表示される", async () => {
    const res = await me.get("/api/v1/messages/latest");
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({
      id: ids.messageId,
      senderId: ids.me,
      senderName: "青木 大隼",
      receiverId: ids.ohmura,
      receiverName: "大村 悠太",
      content: "レビューありがとうございました！",
    });
  });

  it("8. [5.2] タイムラインは全社員共通: 受け取った大村さんのトップにも同じメッセージが出る", async () => {
    const ohmura = new Client();
    await ohmura.login("EMP001", PASSWORD);
    const res = await ohmura.get("/api/v1/messages/latest");
    expect(res.body.map((m: { id: string }) => m.id)).toContain(ids.messageId);
  });

  it("9. [4.3][5.2] さらに5件送ると、タイムラインには新しい5件だけが新しい順に並ぶ", async () => {
    for (let i = 1; i <= 5; i++) {
      await new Promise((r) => setTimeout(r, 20)); // 送信時刻に差をつける
      const res = await me.post("/api/v1/messages", {
        receiverId: ids.ohmura,
        content: `追加${i}`,
      });
      expect(res.status).toBe(201);
    }
    const res = await me.get("/api/v1/messages/latest");
    expect(res.body.map((m: { content: string }) => m.content)).toEqual([
      "追加5",
      "追加4",
      "追加3",
      "追加2",
      "追加1",
    ]);
    expect(res.body.map((m: { id: string }) => m.id)).not.toContain(ids.messageId);
  });
});
