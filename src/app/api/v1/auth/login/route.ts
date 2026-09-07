import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { query } from "@/lib/db";
import { signJwt, TOKEN_COOKIE_NAME, TOKEN_MAX_AGE_SECONDS } from "@/lib/jwt";
import {
  AuthUser,
  ErrorResponse,
  LoginRequestBody,
  LoginSuccessResponse,
  Role,
} from "@/lib/types/auth";

interface EmployeeDbRow {
  id: string;
  login_id: string;
  password_hash: string;
  last_name: string;
  first_name: string;
  role: Role;
  failed_attempts: number;
  is_locked: boolean;
}

interface SettingDbRow {
  value: string;
}

export async function POST(request: NextRequest) {
  try {
    let body: LoginRequestBody;
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

    const { employeeId, password } = body;

    if (
      !employeeId ||
      typeof employeeId !== "string" ||
      !password ||
      typeof password !== "string"
    ) {
      return NextResponse.json<ErrorResponse>(
        {
          success: false,
          error: "BAD_REQUEST",
          message: "社員IDとパスワードは必須です。",
        },
        { status: 400 }
      );
    }

    // ユーザー検索
    const userResult = await query<EmployeeDbRow>(
      `SELECT id, login_id, password_hash, last_name, first_name, role, failed_attempts, is_locked
       FROM employees
       WHERE login_id = $1`,
      [employeeId]
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json<ErrorResponse>(
        {
          success: false,
          error: "INVALID_CREDENTIALS",
          message: "社員IDまたはパスワードが正しくありません。",
        },
        { status: 401 }
      );
    }

    const user = userResult.rows[0];

    // アカウントロック確認
    if (user.is_locked) {
      return NextResponse.json<ErrorResponse>(
        {
          success: false,
          error: "ACCOUNT_LOCKED",
          message: "アカウントがロックされています。管理者に問い合わせてください。",
        },
        { status: 403 }
      );
    }

    // パスワード検証
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      // ログイン試行回数上限の取得 (デフォルト: 5)
      let maxAttempts = 5;
      const settingsResult = await query<SettingDbRow>(
        `SELECT value FROM system_settings WHERE key = 'max_failed_attempts'`
      );
      if (settingsResult.rows.length > 0) {
        const parsed = parseInt(settingsResult.rows[0].value, 10);
        if (!isNaN(parsed) && parsed > 0) {
          maxAttempts = parsed;
        }
      }

      // アトミックに failed_attempts をインクリメントし、閾値到達時はロックも同時に設定
      const updateResult = await query<{ failed_attempts: number; is_locked: boolean }>(
        `UPDATE employees
         SET failed_attempts = failed_attempts + 1,
             is_locked = CASE WHEN failed_attempts + 1 >= $1 THEN TRUE ELSE is_locked END,
             locked_at = CASE WHEN failed_attempts + 1 >= $1 THEN CURRENT_TIMESTAMP ELSE locked_at END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING failed_attempts, is_locked`,
        [maxAttempts, user.id]
      );

      const updated = updateResult.rows[0];

      if (updated.is_locked) {
        return NextResponse.json<ErrorResponse>(
          {
            success: false,
            error: "ACCOUNT_LOCKED",
            message: "アカウントがロックされています。管理者に問い合わせてください。",
          },
          { status: 403 }
        );
      } else {
        return NextResponse.json<ErrorResponse>(
          {
            success: false,
            error: "INVALID_CREDENTIALS",
            message: "社員IDまたはパスワードが正しくありません。",
          },
          { status: 401 }
        );
      }
    }

    // 認証成功: 失敗試行回数をリセット
    if (user.failed_attempts > 0) {
      await query(
        `UPDATE employees
         SET failed_attempts = 0, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [user.id]
      );
    }

    // JWT 発行
    const token = await signJwt({
      id: user.id,
      employeeId: user.login_id,
      role: user.role,
    });

    const authUser: AuthUser = {
      id: user.id,
      employeeId: user.login_id,
      lastName: user.last_name,
      firstName: user.first_name,
      role: user.role,
    };

    const response = NextResponse.json<LoginSuccessResponse>(
      {
        success: true,
        token,
        user: authUser,
      },
      { status: 200 }
    );

    // HttpOnly Cookie の設定
    response.cookies.set({
      name: TOKEN_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: TOKEN_MAX_AGE_SECONDS,
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json<ErrorResponse>(
      {
        success: false,
        error: "INTERNAL_SERVER_ERROR",
        message: "サーバー内部でエラーが発生しました。",
      },
      { status: 500 }
    );
  }
}
