// モックAPIの応答ロジック。data.ts のデータから仕様書のレスポンス形を組み立てる。
// 実APIが揃うまでのフロント開発用。副作用（送信・ロック解除等）はメモリ上のみ。

import { uuidv7 } from "uuidv7";
import type {
  AdminEmployeeRow,
  AuthUser,
  EmployeeDetail,
  EmployeeSearchParams,
  EmployeeSearchResult,
  EmployeeSummary,
  ErrorResponse,
  LoginRequest,
  LoginSuccessResponse,
  MasterItem,
  Seat,
  SendMessageRequest,
  SendMessageResponse,
  ThankYouMessage,
} from "@/lib/types";
import {
  departmentById,
  locationById,
  mockDepartments,
  mockEmployees,
  mockLocations,
  mockPositions,
  mockSeats,
  positionById,
  seatById,
  type MockEmployee,
} from "./data";
import { fullName } from "@/lib/utils";

// ---- レスポンスビルダー ----
function toSummary(e: MockEmployee): EmployeeSummary {
  return {
    id: e.id,
    employeeId: e.employeeId,
    lastName: e.lastName,
    firstName: e.firstName,
    department: e.departmentId ? (departmentById.get(e.departmentId)?.name ?? null) : null,
    location: e.locationId ? (locationById.get(e.locationId)?.name ?? null) : null,
    position: e.positionId ? (positionById.get(e.positionId)?.name ?? null) : null,
    email: e.email,
    photoUrl: e.photoUrl,
    skills: e.skills,
    credentials: e.credentials,
  };
}

function toDetail(e: MockEmployee): EmployeeDetail {
  const seat = e.seatId ? seatById.get(e.seatId) : undefined;
  return {
    ...toSummary(e),
    skills: e.skills,
    credentials: e.credentials,
    experiences: e.experiences,
    selfPR: e.selfPR,
    hobbyInfo: e.hobbyInfo,
    seat: seat
      ? { id: seat.id, seatCode: seat.seatCode, floor: seat.floor, x: seat.x, y: seat.y }
      : null,
  };
}

function toAdminRow(e: MockEmployee): AdminEmployeeRow {
  return { ...toSummary(e), role: e.role, isLocked: e.isLocked, failedAttempts: e.failedAttempts };
}

function toAuthUser(e: MockEmployee): AuthUser {
  return {
    id: e.id,
    employeeId: e.employeeId,
    lastName: e.lastName,
    firstName: e.firstName,
    role: e.role,
  };
}

// ---- メッセージ（メモリ上に保持。送信で追記される） ----
function seedMessages(): ThankYouMessage[] {
  const [ohmura, aoki, sato, tanaka] = mockEmployees;
  const pairs: Array<[MockEmployee, MockEmployee, string, string]> = [
    [
      aoki,
      ohmura,
      "プロジェクトのサポートありがとうございました！助かりました。",
      "2026-06-29T17:00:00Z",
    ],
    [sato, aoki, "急な依頼に対応いただき感謝です。", "2026-06-29T12:30:00Z"],
    [tanaka, sato, "資料作成ありがとうございました。", "2026-06-28T09:15:00Z"],
    [ohmura, tanaka, "ライン改善の提案、とても参考になりました。", "2026-06-27T18:45:00Z"],
    [aoki, sato, "レビューありがとうございました！", "2026-06-27T10:00:00Z"],
  ];
  return pairs.map(([sender, receiver, content, createdAt]) => ({
    id: uuidv7(),
    senderId: sender.id,
    senderName: fullName(sender.lastName, sender.firstName),
    receiverId: receiver.id,
    receiverName: fullName(receiver.lastName, receiver.firstName),
    content,
    createdAt,
  }));
}

const messages: ThankYouMessage[] = seedMessages();

// ---- 認証 ----
export function mockLogin(req: LoginRequest): LoginSuccessResponse | ErrorResponse {
  const emp = mockEmployees.find((e) => e.employeeId === req.employeeId);
  if (emp?.isLocked) {
    return {
      success: false,
      error: "ACCOUNT_LOCKED",
      message: "アカウントがロックされています。管理者に問い合わせてください。",
    };
  }
  if (!emp || emp.password !== req.password) {
    return {
      success: false,
      error: "INVALID_CREDENTIALS",
      message: "社員IDまたはパスワードが正しくありません。",
    };
  }
  return { success: true, user: toAuthUser(emp) };
}

// ---- 社員検索・詳細 ----
export function mockSearchEmployees(params: EmployeeSearchParams): EmployeeSearchResult {
  const includes = (v: string | null, q?: string) =>
    !q || (v ?? "").toLowerCase().includes(q.toLowerCase());

  const results = mockEmployees
    .filter((e) => {
      if (params.employeeId && e.employeeId !== params.employeeId) return false;
      if (params.departmentId && e.departmentId !== params.departmentId) return false;
      if (params.locationId && e.locationId !== params.locationId) return false;
      if (!includes(e.lastName, params.lastName)) return false;
      if (!includes(e.firstName, params.firstName)) return false;
      if (
        params.skill &&
        !e.skills.some((s) => s.toLowerCase().includes(params.skill!.toLowerCase()))
      )
        return false;
      if (
        params.credential &&
        !e.credentials.some((c) => c.toLowerCase().includes(params.credential!.toLowerCase()))
      )
        return false;
      if (
        params.project &&
        !e.experiences.some((x) =>
          x.projectName.toLowerCase().includes(params.project!.toLowerCase())
        )
      )
        return false;
      if (!includes(e.hobbyInfo, params.hobby)) return false;
      if (!includes(e.email, params.email)) return false;
      if (params.positionId && e.positionId !== params.positionId) return false;
      if (
        params.experience &&
        !e.experiences.some((x) =>
          (x.roleDescription ?? "").toLowerCase().includes(params.experience!.toLowerCase())
        )
      )
        return false;
      return true;
    })
    .map(toSummary);

  // ページネーション（デザインの表示件数・ページ送りに対応）。
  // 注: 仕様書に page / limit の定義が無いためフロント都合の暫定。バックエンドと要調整。
  const totalCount = results.length;
  const limit = params.limit;
  if (!limit) return { totalCount, results };
  const page = Math.max(1, params.page ?? 1);
  const start = (page - 1) * limit;
  return { totalCount, results: results.slice(start, start + limit) };
}

export function mockGetEmployee(id: string): EmployeeDetail | null {
  const emp = mockEmployees.find((e) => e.id === id);
  return emp ? toDetail(emp) : null;
}

// ---- メッセージ ----
export function mockGetLatestMessages(): ThankYouMessage[] {
  return [...messages].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 5);
}

export function mockSendMessage(senderId: string, req: SendMessageRequest): SendMessageResponse {
  const sender = mockEmployees.find((e) => e.id === senderId);
  const receiver = mockEmployees.find((e) => e.id === req.receiverId);
  const message: ThankYouMessage = {
    id: uuidv7(),
    senderId,
    senderName: sender ? fullName(sender.lastName, sender.firstName) : "不明",
    receiverId: req.receiverId,
    receiverName: receiver ? fullName(receiver.lastName, receiver.firstName) : "不明",
    content: req.content,
    createdAt: new Date().toISOString(),
  };
  messages.push(message);
  return { success: true, messageId: message.id };
}

// ---- マスタ ----
export function mockGetDepartments(): MasterItem[] {
  return mockDepartments;
}
export function mockGetLocations(): MasterItem[] {
  return mockLocations;
}
export function mockGetPositions(): MasterItem[] {
  return mockPositions;
}

// ---- 座席 ----
export function mockGetSeats(locationId?: string, floor?: string): Seat[] {
  return mockSeats
    .filter((s) => (!locationId || s.locationId === locationId) && (!floor || s.floor === floor))
    .map(({ id, seatCode, floor, x, y }) => ({ id, seatCode, floor, x, y }));
}

// ---- 管理者機能 ----
export function mockGetAdminEmployees(): AdminEmployeeRow[] {
  return mockEmployees.map(toAdminRow);
}

export function mockUnlockUser(id: string): { success: boolean } {
  const emp = mockEmployees.find((e) => e.id === id);
  if (emp) {
    emp.isLocked = false;
    emp.failedAttempts = 0;
  }
  return { success: Boolean(emp) };
}
