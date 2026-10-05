// 社員検索・詳細API（AI_SPECIFICATION.md 4.2）
import type { EmployeeDetail, EmployeeSearchParams, EmployeeSearchResult } from "@/lib/types";
import { apiFetch, toQueryString, withMock } from "./client";
import { mockGetEmployee, mockSearchEmployees } from "./mock/handlers";

/** GET /employees （AND条件検索） */
export async function searchEmployees(
  params: EmployeeSearchParams = {}
): Promise<EmployeeSearchResult> {
  return withMock(
    () => mockSearchEmployees(params),
    () => apiFetch<EmployeeSearchResult>(`/employees${toQueryString({ ...params })}`)
  );
}

/** GET /employees/:id 。存在しない場合は null。 */
export async function getEmployee(id: string): Promise<EmployeeDetail | null> {
  return withMock(
    () => mockGetEmployee(id),
    () => apiFetch<EmployeeDetail>(`/employees/${id}`)
  );
}
