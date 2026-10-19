// マスタ・座席の参照API。
// 拠点・座席一覧APIは docs/openapi.yaml の定義に準拠。
import type { FloorMapSeat, MasterItem } from "@/lib/types";
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
export async function getSeats(locationId?: string, floor?: string): Promise<FloorMapSeat[]> {
  return withMock(
    () => mockGetSeats(locationId, floor),
    () => apiFetch<FloorMapSeat[]>(`/seats${toQueryString({ locationId, floor })}`)
  );
}
