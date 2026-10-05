"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AuthUser } from "@/lib/types";
import { logout as apiLogout } from "@/lib/api/auth";
import { USE_MOCK } from "@/lib/api/client";

const STORAGE_KEY = "teamd:mockUser";

interface AuthContextValue {
  /** ログイン中のユーザー。未ログインは null。 */
  user: AuthUser | null;
  /** 初期復元が完了したか（未完了の間はガード側でローディング表示に使う） */
  isReady: boolean;
  /** ログイン成功時に呼ぶ。ユーザーを保持する。 */
  signIn: (user: AuthUser) => void;
  /** ログアウト。サーバー側Cookie失効（実API時）とクライアント状態のクリア。 */
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * 現在ログインユーザーを保持する最小のクライアント状態。
 * 実API時は HttpOnly Cookie の JWT が真実であり、認証・認可の本体は
 * 大村さんの認証API + middleware.ts 側で行う。ここは role によるUI出し分け等に使う。
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // モック時はセッションストレージからログイン状態を復元（リロード対策）。
    // 実API時は Cookie が真実。現在ユーザー取得（/auth/me 等）はバックエンドと要調整。
    // SSRとハイドレーションを一致させるため、初期描画後（effect内）に一度だけ反映する。
    // この一度きりの外部ストア同期は意図的なので set-state-in-effect ルールを無効化する。
    /* eslint-disable react-hooks/set-state-in-effect */
    if (USE_MOCK) {
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (raw) setUser(JSON.parse(raw) as AuthUser);
      } catch {
        /* 破損データは無視 */
      }
    }
    setIsReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const signIn = (u: AuthUser) => {
    setUser(u);
    if (USE_MOCK) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(u));
  };

  const signOut = async () => {
    await apiLogout();
    setUser(null);
    if (USE_MOCK) sessionStorage.removeItem(STORAGE_KEY);
  };

  return (
    <AuthContext.Provider value={{ user, isReady, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth は AuthProvider の内側で使用してください。");
  }
  return ctx;
}
