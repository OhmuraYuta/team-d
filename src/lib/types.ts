// API・ドメインの共通型定義。
// リクエスト/レスポンスの形は AI_SPECIFICATION.md「4. API Endpoints」および
// docs/openapi.yaml に準拠する。全画面でこの型を共有する。

/** ロール（AI_SPECIFICATION.md 2. Roles & Permissions） */
export type Role = "EMPLOYEE" | "ADMIN";

/** ログイン成功時などに返る最小のユーザー情報（JWTペイロード相当） */
export interface AuthUser {
  id: string; // UUIDv7
  employeeId: string; // login_id（例: EMP001）
  lastName: string;
  firstName: string;
  role: Role;
}

/** 社員検索結果の1件（GET /employees の results 要素） */
export interface EmployeeSummary {
  id: string;
  employeeId: string;
  lastName: string;
  firstName: string;
  department: string | null;
  location: string | null;
  position: string | null;
  email: string;
  photoUrl: string | null;
  /**
   * 検索結果テーブルの「主なスキル」「資格」列で使用（Figmaデザイン準拠）。
   * 注: AI_SPECIFICATION.md 4.2 の GET /employees のレスポンス例には含まれていない。
   * バックエンドと要調整。実APIが返さない場合に備え、利用側は空配列フォールバックすること。
   */
  skills?: string[];
  credentials?: string[];
}

/** 業務経験・プロジェクト履歴 */
export interface EmployeeExperience {
  projectName: string;
  roleDescription: string | null;
  startDate: string | null; // ISO date (YYYY-MM-DD)
  endDate: string | null;
}

/** 座席情報 */
export interface Seat {
  id: string;
  seatCode: string; // 例: 'A-12'
  floor: string; // 例: '3F'
  x: number; // フロアマップ上のX座標
  y: number; // フロアマップ上のY座標
}

/** 社員詳細（GET /employees/:id） */
export interface EmployeeDetail {
  id: string;
  employeeId: string;
  lastName: string;
  firstName: string;
  email: string;
  department: string | null;
  location: string | null;
  position: string | null;
  photoUrl: string | null;
  skills: string[];
  credentials: string[];
  experiences: EmployeeExperience[];
  selfPR: string | null;
  hobbyInfo: string | null;
  seat: Seat | null;
}

/** ありがとうメッセージ（GET /messages/latest の要素） */
export interface ThankYouMessage {
  id: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  receiverName: string;
  content: string;
  createdAt: string; // ISO datetime
}

// ---- 検索まわり ----

/** GET /employees のクエリパラメータ（AND条件） */
export interface EmployeeSearchParams {
  employeeId?: string; // 完全一致
  lastName?: string; // 部分一致
  firstName?: string; // 部分一致
  departmentId?: string; // 完全一致
  locationId?: string; // 完全一致
  skill?: string; // 部分一致
  credential?: string; // 部分一致
  project?: string; // 部分一致
  hobby?: string; // 部分一致

  // --- 以下は Figmaデザインの検索条件フォームにあるが、仕様書のクエリパラメータに
  //     定義が無い項目。バックエンドと要調整。 ---
  email?: string; // 社内メール（部分一致）
  experience?: string; // 業務経験（部分一致）
  positionId?: string; // 役職（完全一致）

  // --- ページネーション（デザインに表示件数・ページ送りがあるが仕様書に定義が無い） ---
  page?: number; // 1始まり
  limit?: number; // 1ページあたりの件数
}

/** GET /employees のレスポンス */
export interface EmployeeSearchResult {
  totalCount: number;
  results: EmployeeSummary[];
}

// ---- 認証まわり ----

export interface LoginRequest {
  employeeId: string;
  password: string;
}

/** POST /auth/login 成功レスポンス */
export interface LoginSuccessResponse {
  success: true;
  user: AuthUser;
}

/** エラーレスポンス（ロック等） */
export interface ErrorResponse {
  success: false;
  error: string; // 例: 'ACCOUNT_LOCKED'
  message: string;
}

// ---- メッセージ送信 ----

export interface SendMessageRequest {
  receiverId: string;
  content: string;
}

export interface SendMessageResponse {
  success: true;
  messageId: string;
}

// ---- マスタ（検索フォームのドロップダウン等で使用） ----
// 注: AI_SPECIFICATION.md のAPI節にはマスタ取得エンドポイントの明記がないため、
// フロント都合の暫定的な形。バックエンドと要調整（下記 admin 系も同様）。

export interface MasterItem {
  id: string;
  name: string;
}

// ---- 管理者機能（座席管理・社員管理で使用） ----

export interface SeatInput {
  locationId: string;
  floor: string;
  seatCode: string;
  x: number;
  y: number;
}

export interface EmployeeInput {
  loginId: string;
  lastName: string;
  firstName: string;
  email: string;
  role: Role;
  departmentId?: string | null;
  locationId?: string | null;
  positionId?: string | null;
  seatId?: string | null;
  photoUrl?: string | null;
  selfPR?: string | null;
  hobbyInfo?: string | null;
}

/** 管理画面の社員一覧行（ロック状態を含む） */
export interface AdminEmployeeRow extends EmployeeSummary {
  role: Role;
  isLocked: boolean;
  failedAttempts: number;
}
