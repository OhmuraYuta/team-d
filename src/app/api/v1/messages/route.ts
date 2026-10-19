import { NextRequest, NextResponse } from "next/server";
import type { QueryResultRow } from "pg";
import { uuidv7 } from "uuidv7";
import { getAuthUser } from "@/lib/auth";
import { query } from "@/lib/db";
import type { ErrorResponse } from "@/lib/types/auth";

const uuidV7Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface CreatedMessageRow extends QueryResultRow {
  id: string;
}

function errorResponse(error: string, message: string, status: number) {
  return NextResponse.json<ErrorResponse>(
    { success: false, error, message },
    { status }
  );
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return errorResponse("UNAUTHORIZED", "認証が必要です。ログインしてください。", 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("BAD_REQUEST", "リクエストボディが不正です。", 400);
  }

  if (typeof body !== "object" || body === null) {
    return errorResponse("BAD_REQUEST", "リクエストボディが不正です。", 400);
  }

  const { receiverId, content } = body as Record<string, unknown>;
  if (typeof receiverId !== "string" || !uuidV7Pattern.test(receiverId)) {
    return errorResponse("BAD_REQUEST", "receiverIdには有効なUUIDv7を指定してください。", 400);
  }
  if (typeof content !== "string" || content.trim().length === 0) {
    return errorResponse("BAD_REQUEST", "contentは必須です。", 400);
  }

  const messageId = uuidv7();
  try {
    const result = await query<CreatedMessageRow>(
      `INSERT INTO thank_you_messages (id, sender_id, receiver_id, content)
       SELECT $1, $2, e.id, $4
       FROM employees e
       WHERE e.id = $3
       RETURNING id`,
      [messageId, user.id, receiverId, content.trim()]
    );

    if (result.rowCount === 0) {
      return errorResponse("NOT_FOUND", "送信先の社員が見つかりません。", 404);
    }

    return NextResponse.json({ success: true, messageId }, { status: 201 });
  } catch (error) {
    console.error("Message send error:", error);
    return errorResponse("INTERNAL_SERVER_ERROR", "メッセージの送信に失敗しました。", 500);
  }
}
