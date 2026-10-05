// 管理者機能API（AI_SPECIFICATION.md 4.4）。
// 一覧・ロック解除はモックを完全実装。CRUD/設定変更は実APIのパスに沿った薄いラッパで、
// モック時は成功レスポンスを返す（詳細な永続化は座席管理・社員管理の画面ブランチで拡充）。
import { uuidv7 } from "uuidv7";
import type { AdminEmployeeRow, EmployeeInput, SeatInput } from "@/lib/types";
import { apiFetch, withMock } from "./client";
import { mockGetAdminEmployees, mockUnlockUser } from "./mock/handlers";

/** 管理画面の全社員一覧（ロック状態を含む）。 */
export async function getAdminEmployees(): Promise<AdminEmployeeRow[]> {
  return withMock(
    () => mockGetAdminEmployees(),
    () => apiFetch<AdminEmployeeRow[]>("/admin/employees")
  );
}

/** POST /admin/users/:id/unlock アカウントロック解除（失敗回数リセット）。 */
export async function unlockUser(id: string): Promise<{ success: boolean }> {
  return withMock(
    () => mockUnlockUser(id),
    () => apiFetch<{ success: boolean }>(`/admin/users/${id}/unlock`, { method: "POST" })
  );
}

/** POST /admin/employees 新規社員登録。 */
export async function createEmployee(input: EmployeeInput): Promise<{ id: string }> {
  return withMock(
    () => ({ id: uuidv7() }),
    () =>
      apiFetch<{ id: string }>("/admin/employees", {
        method: "POST",
        body: JSON.stringify(input),
      })
  );
}

/** PUT /admin/employees/:id 社員情報更新。 */
export async function updateEmployee(
  id: string,
  input: Partial<EmployeeInput>
): Promise<{ success: boolean }> {
  return withMock(
    () => ({ success: true }),
    () =>
      apiFetch<{ success: boolean }>(`/admin/employees/${id}`, {
        method: "PUT",
        body: JSON.stringify(input),
      })
  );
}

/** DELETE /admin/employees/:id 社員削除。 */
export async function deleteEmployee(id: string): Promise<{ success: boolean }> {
  return withMock(
    () => ({ success: true }),
    () => apiFetch<{ success: boolean }>(`/admin/employees/${id}`, { method: "DELETE" })
  );
}

/** PUT /admin/settings/max-failed-attempts ログイン失敗許容回数の変更。 */
export async function updateMaxFailedAttempts(value: number): Promise<{ success: boolean }> {
  return withMock(
    () => ({ success: true }),
    () =>
      apiFetch<{ success: boolean }>("/admin/settings/max-failed-attempts", {
        method: "PUT",
        body: JSON.stringify({ value }),
      })
  );
}

// ---- 座席マスタ管理（座席管理画面 5.5）。実APIパスは暫定、バックと要調整。 ----

export async function createSeat(input: SeatInput): Promise<{ id: string }> {
  return withMock(
    () => ({ id: uuidv7() }),
    () => apiFetch<{ id: string }>("/admin/seats", { method: "POST", body: JSON.stringify(input) })
  );
}

export async function updateSeat(
  id: string,
  input: Partial<SeatInput>
): Promise<{ success: boolean }> {
  return withMock(
    () => ({ success: true }),
    () =>
      apiFetch<{ success: boolean }>(`/admin/seats/${id}`, {
        method: "PUT",
        body: JSON.stringify(input),
      })
  );
}

export async function deleteSeat(id: string): Promise<{ success: boolean }> {
  return withMock(
    () => ({ success: true }),
    () => apiFetch<{ success: boolean }>(`/admin/seats/${id}`, { method: "DELETE" })
  );
}
