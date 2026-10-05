import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { ErrorResponse } from "@/lib/types/auth";

interface UpdateMaxFailedAttemptsRequest {
  maxFailedAttempts?: unknown;
}

export async function PUT(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (authResult.errorResponse) return authResult.errorResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ErrorResponse>(
      {
        success: false,
        error: "BAD_REQUEST",
        message: "リクエストボディが不正です。",
      },
      { status: 400 }
    );
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json<ErrorResponse>(
      {
        success: false,
        error: "BAD_REQUEST",
        message: "リクエストボディが不正です。",
      },
      { status: 400 }
    );
  }

  const { maxFailedAttempts } = body as UpdateMaxFailedAttemptsRequest;
  if (
    typeof maxFailedAttempts !== "number" ||
    !Number.isSafeInteger(maxFailedAttempts) ||
    maxFailedAttempts < 1
  ) {
    return NextResponse.json<ErrorResponse>(
      {
        success: false,
        error: "BAD_REQUEST",
        message: "maxFailedAttemptsには1以上の整数を指定してください。",
      },
      { status: 400 }
    );
  }

  try {
    await query(
      `INSERT INTO system_settings (key, value)
       VALUES ('max_failed_attempts', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [String(maxFailedAttempts)]
    );

    return NextResponse.json({
      success: true,
      maxFailedAttempts,
      message: "ログイン失敗許容回数を変更しました。",
    });
  } catch (error) {
    console.error("Max failed attempts update error:", error);
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
