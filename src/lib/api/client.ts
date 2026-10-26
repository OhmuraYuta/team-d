// APIクライアントの基盤。モック/実APIの切替とfetchラッパを提供する。
//
// NEXT_PUBLIC_USE_MOCK=true の間は各エンドポイント関数がモック応答を返す。
// false にすると /api/v1 への実fetchに切り替わる（バックエンドのAPI完成後）。

export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "true";

/** 実APIのベースURL（AI_SPECIFICATION.md 4.） */
export const API_BASE = "/api/v1";

/** 実API呼び出しが非2xxを返したときに投げるエラー。 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown
  ) {
    super(`API error ${status}`);
    this.name = "ApiError";
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * モック/実APIを切り替える。モック時は擬似遅延を挟み、ローディング表示を確認できるようにする。
 * @param mockFn モックの結果を返す関数
 * @param realFn 実APIを呼ぶ関数
 */
export async function withMock<T>(
  mockFn: () => T,
  realFn: () => Promise<T>,
  simulatedDelayMs = 300
): Promise<T> {
  if (USE_MOCK) {
    await delay(simulatedDelayMs);
    return mockFn();
  }
  return realFn();
}

/** JSON前提のfetchラッパ。Cookie（JWT）を送るため credentials: include。 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, body);
  }
  return body as T;
}

/** クエリ文字列を組み立てる（空値は除外。数値も受け付ける）。 */
export function toQueryString(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params)
    .filter((entry) => entry[1] !== undefined && entry[1] !== "")
    .map(([key, value]) => [key, String(value)] as [string, string]);
  const qs = new URLSearchParams(entries).toString();
  return qs ? `?${qs}` : "";
}
