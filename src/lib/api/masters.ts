// マスタ・座席の参照API。
// 注: 部署/拠点/役職/座席の一覧取得は AI_SPECIFICATION.md のAPI節に明記がないため、
// 実API側のパスは暫定。バックエンドと要調整（検索フォームやフロアマップで必要）。
import type { MasterItem, Seat } from "@/lib/types";
import { apiFetch, toQueryString, withMock } from "./client";
import {
  mockGetDepartments,
  mockGetLocations,
  mockGetPositions,
  mockGetSeats,
} from "./mock/handlers";

export async function getDepartments(): Promise<MasterItem[]> {
  return withMock(
    () => mockGetDepartments(),
    () => apiFetch<MasterItem[]>("/departments")
  );
}

export async function getLocations(): Promise<MasterItem[]> {
  return withMock(
    () => mockGetLocations(),
    () => apiFetch<MasterItem[]>("/locations")
  );
}

export async function getPositions(): Promise<MasterItem[]> {
  return withMock(
    () => mockGetPositions(),
    () => apiFetch<MasterItem[]>("/positions")
  );
}

/** 拠点・フロアで座席を絞り込む（フロアマップ・座席管理で使用）。 */
export async function getSeats(locationId?: string, floor?: string): Promise<Seat[]> {
  return withMock(
    () => mockGetSeats(locationId, floor),
    () => apiFetch<Seat[]>(`/seats${toQueryString({ locationId, floor })}`)
  );
}
