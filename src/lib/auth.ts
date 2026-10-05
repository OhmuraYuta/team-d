import { NextRequest, NextResponse } from "next/server";
import { TOKEN_COOKIE_NAME, verifyJwt } from "./jwt";
import { ErrorResponse, JwtCustomPayload } from "./types/auth";

/**
 * リクエストからJWTトークンを取り出して検証し、ユーザー情報を返します。
 * Cookie (token) または Authorization: Bearer <token> の両方に対応します。
 */
export async function getAuthUser(request: NextRequest): Promise<JwtCustomPayload | null> {
  let token = request.cookies.get(TOKEN_COOKIE_NAME)?.value;

  if (!token) {
    const authHeader = request.headers.get("authorization");
    if (authHeader) {
      token = authHeader.trim();
      // "Bearer " または "bearer " を複数回あっても除去
      token = token.replace(/^(Bearer\s+)+/i, "").trim();
      // "token=" がついていたら除去
      token = token.replace(/^token=/i, "").trim();
      // 前後のクォートを除去
      token = token.replace(/^["']|["']$/g, "").trim();
    }
  }

  if (!token) {
    console.warn(
      "[Auth] No token found in Cookie or Authorization header. AuthHeader:",
      request.headers.get("authorization")
    );
    return null;
  }

  const verified = await verifyJwt(token);
  if (!verified) {
    console.warn(
      "[Auth] Token verification failed for token:",
      token.length > 20 ? token.substring(0, 15) + "..." : token
    );
  }
  return verified;
}

export type AuthResult =
  | { user: JwtCustomPayload; errorResponse: null }
  | { user: null; errorResponse: NextResponse<ErrorResponse> };

/**
 * 管理者（ADMIN）権限を要求します。
 * 未認証の場合は 401、管理者権限がない場合は 403 の NextResponse を返します。
 */
export async function requireAdmin(request: NextRequest): Promise<AuthResult> {
  const user = await getAuthUser(request);

  if (!user) {
    return {
      user: null,
      errorResponse: NextResponse.json<ErrorResponse>(
        {
          success: false,
          error: "UNAUTHORIZED",
          message: "認証が必要です。ログインしてください。",
        },
        { status: 401 }
      ),
    };
  }

  if (user.role !== "ADMIN") {
    return {
      user: null,
      errorResponse: NextResponse.json<ErrorResponse>(
        {
          success: false,
          error: "FORBIDDEN",
          message: "管理者権限が必要です。",
        },
        { status: 403 }
      ),
    };
  }

  return { user, errorResponse: null };
}
