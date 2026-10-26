/**
 * 仕様: AI_SPECIFICATION.md 4.3「ありがとうメッセージ」, 2「ロールと権限（一般社員: メッセージの送信・閲覧）」
 *       docs/openapi.yaml /messages, /messages/latest
 */
import { beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/lib/db";
import { insertEmployee, loginAs, send, UUID_V7 } from "../helpers";

type Route = Parameters<typeof send>[0];

/**
 * ルートファイルを読み込む。まだ作られていなければ、何が足りないかが分かるメッセージで失敗させる。
 * （静的 import だとファイルが無い時点でこのファイルの全テストが読み込みエラーになるため、動的 import にしている）
 */
async function loadRoute(path: string, method: "GET" | "POST"): Promise<Route> {
  let mod: Record<string, Route>;
  try {
    mod = await import(/* @vite-ignore */ path);
  } catch {
    throw new Error(`未実装: ${path}.ts が存在しません`);
  }
  if (!mod[method]) throw new Error(`未実装: ${path}.ts に ${method} がありません`);
  return mod[method];
}
const postMessages = () => loadRoute("@/app/api/v1/messages/route", "POST");
const getLatest = () => loadRoute("@/app/api/v1/messages/latest/route", "GET");

let senderId: string;
let receiverId: string;
let cookie: string;

beforeEach(async () => {
  senderId = await insertEmployee({ loginId: "EMP001", lastName: "大村", firstName: "悠太" });
  receiverId = await insertEmployee({ loginId: "EMP002", lastName: "青木", firstName: "大隼" });
  cookie = await loginAs("EMP001");
});

describe("[4.3] POST /messages", () => {
  it("201 と { success: true, messageId: UUIDv7 } を返す", async () => {
    const res = await send(await postMessages(), "/api/v1/messages", {
      method: "POST",
      cookie,
      body: { receiverId, content: "ありがとうございました！" },
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ success: true, messageId: expect.stringMatching(UUID_V7) });
  });

  it("送信者はログイン中のユーザーとしてDBに保存される", async () => {
    const res = await send(await postMessages(), "/api/v1/messages", {
      method: "POST",
      cookie,
      body: { receiverId, content: "助かりました" },
    });
    const { messageId } = await res.json();
    const { rows } = await pool.query("SELECT * FROM thank_you_messages WHERE id = $1", [
      messageId,
    ]);
    expect(rows[0]).toMatchObject({
      sender_id: senderId,
      receiver_id: receiverId,
      content: "助かりました",
    });
  });

  it("[openapi] receiverId・content は必須。欠けていたら 4xx でDBに保存しない", async () => {
    const route = await postMessages();
    for (const body of [{ content: "x" }, { receiverId }, { receiverId, content: "" }]) {
      const res = await send(route, "/api/v1/messages", { method: "POST", cookie, body });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    }
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM thank_you_messages");
    expect(rows[0].n).toBe(0);
  });

  it("未ログインでは送信できない（401）", async () => {
    const res = await send(await postMessages(), "/api/v1/messages", {
      method: "POST",
      body: { receiverId, content: "x" },
    });
    expect(res.status).toBe(401);
  });
});

describe("[4.3] GET /messages/latest", () => {
  it("最新5件を新しい順で、仕様の形 { id, senderId, senderName, receiverId, receiverName, content, createdAt } で返す", async () => {
    for (let i = 1; i <= 7; i++) {
      await pool.query(
        `INSERT INTO thank_you_messages (id, sender_id, receiver_id, content, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, TIMESTAMP '2026-06-29 17:00:00' + ($4 || ' minutes')::interval)`,
        [senderId, receiverId, `メッセージ${i}`, i]
      );
    }
    const res = await send(await getLatest(), "/api/v1/messages/latest", { cookie });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body).toHaveLength(5);
    expect(body.map((m: { content: string }) => m.content)).toEqual([
      "メッセージ7",
      "メッセージ6",
      "メッセージ5",
      "メッセージ4",
      "メッセージ3",
    ]);
    expect(body[0]).toEqual({
      id: expect.any(String),
      senderId,
      senderName: "大村 悠太",
      receiverId,
      receiverName: "青木 大隼",
      content: "メッセージ7",
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
    });
  });

  it("メッセージが無ければ空配列", async () => {
    const res = await send(await getLatest(), "/api/v1/messages/latest", { cookie });
    expect(await res.json()).toEqual([]);
  });

  it("[6.1] 未ログインでは見られない（401）", async () => {
    const res = await send(await getLatest(), "/api/v1/messages/latest");
    expect(res.status).toBe(401);
  });
});
