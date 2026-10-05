import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { ErrorResponse } from "@/lib/types/auth";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAdmin(request);
  if (authResult.errorResponse) return authResult.errorResponse;

  const { id } = await params;
  if (!uuidPattern.test(id)) {
    return NextResponse.json<ErrorResponse>(
      {
        success: false,
        error: "BAD_REQUEST",
        message: "社員IDは有効なUUIDで指定してください。",
      },
      { status: 400 }
    );
  }

  try {
    const result = await query<{ id: string }>(
      `UPDATE employees
       SET is_locked = FALSE,
           failed_attempts = 0,
           locked_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id`,
      [id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json<ErrorResponse>(
        {
          success: false,
          error: "NOT_FOUND",
          message: "指定された社員が見つかりません。",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, message: "アカウントロックを解除しました。" });
  } catch (error) {
    console.error("Account unlock error:", error);
    return NextResponse.json<ErrorResponse>(
      {
        success: false,
        error: "INTERNAL_SERVER_ERROR",
        message: "サーバー内部エラーが発生しました。",
      },
      { status: 500 }
    );
  }
}
