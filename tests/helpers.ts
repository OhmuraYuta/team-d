import bcrypt from "bcryptjs";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest, NextResponse } from "next/server";
import { uuidv7 } from "uuidv7";
import { POST as loginRoute } from "@/app/api/v1/auth/login/route";
import { pool } from "@/lib/db";
import { config as middlewareConfig, proxy } from "@/proxy";

// ---------------------------------------------------------------------------
// リクエストの送信（ミドルウェア → Route Handler を本物の Next.js と同じ順で通す）
// ---------------------------------------------------------------------------

// ルートごとに params の形（{ id: string } など）が違うため、ここでは any で受ける
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (req: NextRequest, ctx: { params: Promise<any> }) => Promise<Response>;

export interface RequestOptions {
  method?: string;
  body?: unknown;
  rawBody?: string;
  cookie?: string;
  headers?: Record<string, string>;
}

export function makeRequest(path: string, options: RequestOptions = {}): NextRequest {
  const { method = "GET", body, rawBody, cookie, headers = {} } = options;
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
}

/** ミドルウェアが「先へ進めてよい」と判断したか（NextResponse.next() には x-middleware-next が付く） */
export const isPassThrough = (res: Response) => res.headers.get("x-middleware-next") === "1";

/**
 * Next.js と同じく、matcher に当てはまるパスだけミドルウェアを実行する。
 * 当てはまらなければミドルウェアは動かない（= 素通り）。
 */
export async function runMiddleware(req: NextRequest): Promise<Response> {
  const matches = unstable_doesMiddlewareMatch({ config: middlewareConfig, url: req.url });
  return matches ? proxy(req) : NextResponse.next();
}

/**
 * APIを呼び出す。ミドルウェアで止められたらそのレスポンスを、通過したら Route Handler のレスポンスを返す。
 * ミドルウェアが付けた Set-Cookie（スライディングセッション等）も最終レスポンスに引き継ぐ。
 */
export async function send(
  handler: Handler,
  path: string,
  options: RequestOptions & { params?: Record<string, string> } = {}
): Promise<Response> {
  const req = makeRequest(path, options);
  const mw = await runMiddleware(req);
  if (!isPassThrough(mw)) return mw;

  const res = await handler(req, { params: Promise.resolve(options.params ?? {}) });
  for (const cookie of mw.headers.getSetCookie()) res.headers.append("set-cookie", cookie);
  return res;
}

// ---------------------------------------------------------------------------
// テストデータ（DBに直接入れる）
// ---------------------------------------------------------------------------

// bcrypt はわざと遅いアルゴリズム。テストを速くするため、ハッシュは1回だけ作って使い回す
export const PASSWORD = "SecurePassword123";
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

export async function insertMaster(
  table: "departments" | "locations" | "positions" | "skills" | "credentials",
  name: string
): Promise<string> {
  const id = uuidv7();
  await pool.query(`INSERT INTO ${table} (id, name) VALUES ($1, $2)`, [id, name]);
  return id;
}

export async function insertSeat(seat: {
  locationId: string;
  floor: string;
  seatCode: string;
  x: number;
  y: number;
}): Promise<string> {
  const id = uuidv7();
  await pool.query(
    `INSERT INTO seats (id, location_id, floor, seat_code, x, y) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, seat.locationId, seat.floor, seat.seatCode, seat.x, seat.y]
  );
  return id;
}

export interface EmployeeSeed {
  loginId: string;
  lastName?: string;
  firstName?: string;
  email?: string;
  role?: "EMPLOYEE" | "ADMIN";
  departmentId?: string;
  locationId?: string;
  positionId?: string;
  seatId?: string;
  photoUrl?: string;
  selfPR?: string;
  hobbyInfo?: string;
  isLocked?: boolean;
  failedAttempts?: number;
  skillIds?: string[];
  credentialIds?: string[];
  experiences?: {
    projectName: string;
    roleDescription?: string;
    startDate?: string;
    endDate?: string;
  }[];
}

export async function insertEmployee(e: EmployeeSeed): Promise<string> {
  const id = uuidv7();
  await pool.query(
    `INSERT INTO employees (id, login_id, password_hash, last_name, first_name, email, role,
       department_id, location_id, position_id, seat_id, photo_url, self_pr, hobby_info,
       is_locked, failed_attempts)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [
      id,
      e.loginId,
      PASSWORD_HASH,
      e.lastName ?? "テスト",
      e.firstName ?? "太郎",
      e.email ?? `${e.loginId.toLowerCase()}@example.com`,
      e.role ?? "EMPLOYEE",
      e.departmentId ?? null,
      e.locationId ?? null,
      e.positionId ?? null,
      e.seatId ?? null,
      e.photoUrl ?? null,
      e.selfPR ?? null,
      e.hobbyInfo ?? null,
      e.isLocked ?? false,
      e.failedAttempts ?? 0,
    ]
  );
  for (const skillId of e.skillIds ?? []) {
    await pool.query(`INSERT INTO employee_skills VALUES ($1, $2)`, [id, skillId]);
  }
  for (const credentialId of e.credentialIds ?? []) {
    await pool.query(`INSERT INTO employee_credentials VALUES ($1, $2)`, [id, credentialId]);
  }
  for (const x of e.experiences ?? []) {
    await pool.query(
      `INSERT INTO employee_experiences (id, employee_id, project_name, role_description, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        uuidv7(),
        id,
        x.projectName,
        x.roleDescription ?? null,
        x.startDate ?? null,
        x.endDate ?? null,
      ]
    );
  }
  return id;
}

/** 実際にログインAPIを叩き、次のリクエストで使う Cookie ヘッダー値を返す */
export async function loginAs(loginId: string, password = PASSWORD): Promise<string> {
  const res = await login(loginId, password);
  if (res.status !== 200) throw new Error(`${loginId} でログインできません (status ${res.status})`);
  return cookieHeader(res);
}

export function login(employeeId: string, password: string): Promise<Response> {
  return send(loginRoute, "/api/v1/auth/login", { method: "POST", body: { employeeId, password } });
}

/** DBから社員のアカウント状態を読む */
export async function accountState(loginId: string) {
  const { rows } = await pool.query(
    `SELECT failed_attempts, is_locked, locked_at FROM employees WHERE login_id = $1`,
    [loginId]
  );
  return rows[0] as
    { failed_attempts: number; is_locked: boolean; locked_at: Date | null } | undefined;
}

// ---------------------------------------------------------------------------
// 判定用
// ---------------------------------------------------------------------------

/** UUIDv7 か（3ブロック目の先頭が 7 = バージョン7、4ブロック目の先頭が 8〜b = RFC 9562 の variant） */
export const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Set-Cookie の中から token Cookie を取り出す */
export function tokenSetCookie(res: Response): string | undefined {
  return res.headers.getSetCookie().find((c) => c.startsWith("token="));
}

/** "token=xxx; Path=/; ..." → "token=xxx"（次のリクエストの Cookie ヘッダーに使う形） */
export function cookieHeader(res: Response): string {
  const setCookie = tokenSetCookie(res);
  if (!setCookie) throw new Error("レスポンスに token Cookie がありません");
  return setCookie.split(";")[0];
}
