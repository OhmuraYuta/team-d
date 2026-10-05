// 認証系API（AI_SPECIFICATION.md 4.1）
import type { ErrorResponse, LoginRequest, LoginSuccessResponse } from "@/lib/types";
import { API_BASE, USE_MOCK, withMock } from "./client";
import { mockLogin } from "./mock/handlers";

/**
 * POST /auth/login
 * 成功/失敗のどちらもレスポンスボディで返す（403ロック等も throw せず判定できるようにする）。
 */
export async function login(req: LoginRequest): Promise<LoginSuccessResponse | ErrorResponse> {
  return withMock(
    () => mockLogin(req),
    async () => {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      return (await res.json()) as LoginSuccessResponse | ErrorResponse;
    }
  );
}

/**
 * ログアウト。Cookie（JWT）の失効はサーバー側で行う想定。
 * 注: ログアウト用エンドポイントは仕様書に未定義のためバックエンドと要調整。
 * モック時はクライアント状態のクリアのみ（auth-context 側で実施）。
 */
export async function logout(): Promise<void> {
  if (USE_MOCK) return;
  await fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {
    /* エンドポイント未実装時も握りつぶす */
  });
}
