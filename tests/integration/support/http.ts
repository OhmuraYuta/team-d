import { BASE_URL } from "./env";

/**
 * ブラウザのように Cookie を覚えて、次のリクエストに自動で付ける HTTP クライアント。
 * 1人のユーザー = 1つの Client。ログインすると token Cookie を保持し、以降のリクエストで送る。
 */
export class Client {
  private cookies = new Map<string, string>();

  async request(
    method: string,
    path: string,
    options: { body?: unknown; headers?: Record<string, string> } = {}
    // レスポンスの形はAPIごとに違い、テストで自由に読みたいので any にしている
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<{ status: number; body: any; headers: Headers }> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      redirect: "manual", // リダイレクトは自動で追わず、テストで確認する
      headers: {
        "content-type": "application/json",
        ...(this.cookies.size > 0 ? { cookie: this.cookieHeader() } : {}),
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    this.storeCookies(res);
    const text = await res.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      /* JSON でない（HTML など）ならそのまま文字列 */
    }
    return { status: res.status, body, headers: res.headers };
  }

  get = (path: string) => this.request("GET", path);
  post = (path: string, body?: unknown) => this.request("POST", path, { body });
  put = (path: string, body?: unknown) => this.request("PUT", path, { body });
  delete = (path: string) => this.request("DELETE", path);

  /** ログインAPIを呼ぶ。成功すれば token Cookie がこの Client に保存される */
  login(employeeId: string, password: string) {
    return this.post("/api/v1/auth/login", { employeeId, password });
  }

  /** 保持している token の値（Bearer 認証のテスト用） */
  get token(): string | undefined {
    return this.cookies.get("token");
  }

  private cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  private storeCookies(res: Response) {
    for (const setCookie of res.headers.getSetCookie()) {
      const [pair, ...attrs] = setCookie.split(";");
      const [name, ...rest] = pair.split("=");
      const value = rest.join("=");
      const expired = attrs.some((a) => /max-age=0/i.test(a)) || value === "";
      if (expired) this.cookies.delete(name.trim());
      else this.cookies.set(name.trim(), value);
    }
  }
}
