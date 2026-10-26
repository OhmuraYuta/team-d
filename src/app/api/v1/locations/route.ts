import { NextRequest, NextResponse } from "next/server";
import type { QueryResultRow } from "pg";
import { getAuthUser } from "@/lib/auth";
import { query } from "@/lib/db";
import type { ErrorResponse } from "@/lib/types/auth";

interface LocationRow extends QueryResultRow {
  id: string;
  name: string;
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
    const result = await query<LocationRow>(
      `SELECT id, name
       FROM locations
       ORDER BY name, id`
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Location list error:", error);
    return NextResponse.json<ErrorResponse>(
      {
        success: false,
        error: "INTERNAL_SERVER_ERROR",
        message: "拠点一覧の取得に失敗しました。",
      },
      { status: 500 }
    );
  }
}
