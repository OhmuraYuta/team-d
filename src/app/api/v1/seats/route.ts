import { NextRequest, NextResponse } from "next/server";
import type { QueryResultRow } from "pg";
import { getAuthUser } from "@/lib/auth";
import { query } from "@/lib/db";
import type { ErrorResponse } from "@/lib/types/auth";

interface FloorMapEmployee {
  id: string;
  employeeId: string;
  lastName: string;
  firstName: string;
}

interface FloorMapSeatRow extends QueryResultRow {
  id: string;
  location_id: string;
  floor: string;
  seat_code: string;
  x: number;
  y: number;
  employee: FloorMapEmployee | null;
}

const uuidV7Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json<ErrorResponse>(
      {
        success: false,
        error: "UNAUTHORIZED",
        message: "認証が必要です。ログインしてください。",
      },
      { status: 401 }
    );
  }

  const locationId = request.nextUrl.searchParams.get("locationId")?.trim() || undefined;
  const floor = request.nextUrl.searchParams.get("floor")?.trim() || undefined;

  if (locationId && !uuidV7Pattern.test(locationId)) {
    return NextResponse.json<ErrorResponse>(
      {
        success: false,
        error: "BAD_REQUEST",
        message: "locationIdには有効なUUIDv7を指定してください。",
      },
      { status: 400 }
    );
  }

  if (floor && floor.length > 50) {
    return NextResponse.json<ErrorResponse>(
      {
        success: false,
        error: "BAD_REQUEST",
        message: "floorは50文字以内で指定してください。",
      },
      { status: 400 }
    );
  }

  const conditions: string[] = [];
  const params: string[] = [];
  const addParam = (value: string) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (locationId) conditions.push(`s.location_id = ${addParam(locationId)}`);
  if (floor) conditions.push(`s.floor = ${addParam(floor)}`);

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const result = await query<FloorMapSeatRow>(
      `SELECT
         s.id,
         s.location_id,
         s.floor,
         s.seat_code,
         s.x,
         s.y,
         CASE
           WHEN e.id IS NULL THEN NULL
           ELSE json_build_object(
             'id', e.id,
             'employeeId', e.login_id,
             'lastName', e.last_name,
             'firstName', e.first_name
           )
         END AS employee
       FROM seats s
       LEFT JOIN employees e ON e.seat_id = s.id
       ${whereClause}
       ORDER BY s.location_id, s.floor, s.seat_code, s.id`,
      params
    );

    return NextResponse.json(
      result.rows.map((seat) => ({
        id: seat.id,
        locationId: seat.location_id,
        floor: seat.floor,
        seatCode: seat.seat_code,
        x: seat.x,
        y: seat.y,
        employee: seat.employee,
      }))
    );
  } catch (error) {
    console.error("Seat list error:", error);
    return NextResponse.json<ErrorResponse>(
      {
        success: false,
        error: "INTERNAL_SERVER_ERROR",
        message: "座席一覧の取得に失敗しました。",
      },
      { status: 500 }
    );
  }
}
