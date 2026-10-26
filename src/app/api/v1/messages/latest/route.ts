import { NextRequest, NextResponse } from "next/server";
import type { QueryResultRow } from "pg";
import { getAuthUser } from "@/lib/auth";
import { query } from "@/lib/db";
import type { ErrorResponse } from "@/lib/types/auth";

interface LatestMessageRow extends QueryResultRow {
  id: string;
  sender_id: string;
  sender_name: string;
  receiver_id: string;
  receiver_name: string;
  content: string;
  created_at: Date;
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json<ErrorResponse>(
      {
        success: false,
        error: "UNAUTHORIZED",
        message: "認証が必要です。ログインしてください。",
      },
      { status: 401 }
    );
  }

  try {
    const result = await query<LatestMessageRow>(
      `SELECT
         m.id,
         m.sender_id,
         concat_ws(' ', sender.last_name, sender.first_name) AS sender_name,
         m.receiver_id,
         concat_ws(' ', receiver.last_name, receiver.first_name) AS receiver_name,
         m.content,
         m.created_at AT TIME ZONE 'UTC' AS created_at
       FROM thank_you_messages m
       JOIN employees sender ON sender.id = m.sender_id
       JOIN employees receiver ON receiver.id = m.receiver_id
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT 5`
    );

    return NextResponse.json(
      result.rows.map((message) => ({
        id: message.id,
        senderId: message.sender_id,
        senderName: message.sender_name,
        receiverId: message.receiver_id,
        receiverName: message.receiver_name,
        content: message.content,
        createdAt: new Date(message.created_at).toISOString(),
      }))
    );
  } catch (error) {
    console.error("Latest message list error:", error);
    return NextResponse.json<ErrorResponse>(
      {
        success: false,
        error: "INTERNAL_SERVER_ERROR",
        message: "メッセージ一覧の取得に失敗しました。",
      },
      { status: 500 }
    );
  }
}
