import { NextRequest, NextResponse } from "next/server";
import type { QueryResultRow } from "pg";
import { query } from "@/lib/db";
import type { ErrorResponse } from "@/lib/types/auth";

interface EmployeeExperience {
  projectName: string;
  roleDescription: string | null;
  startDate: string | null;
  endDate: string | null;
}

interface EmployeeSeat {
  id: string;
  seatCode: string;
  floor: string;
  x: number;
  y: number;
}

interface EmployeeDetailRow extends QueryResultRow {
  id: string;
  employee_id: string;
  last_name: string;
  first_name: string;
  email: string;
  department: string;
  location: string;
  position: string;
  photo_url: string;
  skills: string[];
  credentials: string[];
  experiences: EmployeeExperience[];
  self_pr: string;
  hobby_info: string;
  seat_id: string | null;
  seat_code: string | null;
  floor: string | null;
  x: number | null;
  y: number | null;
}

const uuidV7Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!uuidV7Pattern.test(id)) {
    return NextResponse.json<ErrorResponse>(
      {
        success: false,
        error: "NOT_FOUND",
        message: "指定された社員が見つかりません。",
      },
      { status: 404 }
    );
  }

  try {
    const result = await query<EmployeeDetailRow>(
      `SELECT
        e.id,
        e.login_id AS employee_id,
        e.last_name,
        e.first_name,
        e.email,
        COALESCE(d.name, '') AS department,
        COALESCE(l.name, '') AS location,
        COALESCE(p.name, '') AS position,
        COALESCE(e.photo_url, '') AS photo_url,
        COALESCE((
          SELECT json_agg(s.name ORDER BY s.name)
          FROM employee_skills es
          JOIN skills s ON s.id = es.skill_id
          WHERE es.employee_id = e.id
        ), '[]'::json) AS skills,
        COALESCE((
          SELECT json_agg(c.name ORDER BY c.name)
          FROM employee_credentials ec
          JOIN credentials c ON c.id = ec.credential_id
          WHERE ec.employee_id = e.id
        ), '[]'::json) AS credentials,
        COALESCE((
          SELECT json_agg(
            json_build_object(
              'projectName', ee.project_name,
              'roleDescription', ee.role_description,
              'startDate', TO_CHAR(ee.start_date, 'YYYY-MM-DD'),
              'endDate', TO_CHAR(ee.end_date, 'YYYY-MM-DD')
            )
            ORDER BY ee.start_date DESC NULLS LAST, ee.id
          )
          FROM employee_experiences ee
          WHERE ee.employee_id = e.id
        ), '[]'::json) AS experiences,
        COALESCE(e.self_pr, '') AS self_pr,
        COALESCE(e.hobby_info, '') AS hobby_info,
        seat.id AS seat_id,
        seat.seat_code,
        seat.floor,
        seat.x,
        seat.y
      FROM employees e
      LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN locations l ON l.id = e.location_id
      LEFT JOIN positions p ON p.id = e.position_id
      LEFT JOIN seats seat ON seat.id = e.seat_id
      WHERE e.id = $1`,
      [id]
    );

    const employee = result.rows[0];
    if (!employee) {
      return NextResponse.json<ErrorResponse>(
        {
          success: false,
          error: "NOT_FOUND",
          message: "指定された社員が見つかりません。",
        },
        { status: 404 }
      );
    }

    const seat: EmployeeSeat | undefined = employee.seat_id
      ? {
          id: employee.seat_id,
          seatCode: employee.seat_code!,
          floor: employee.floor!,
          x: employee.x!,
          y: employee.y!,
        }
      : undefined;

    return NextResponse.json({
      id: employee.id,
      employeeId: employee.employee_id,
      lastName: employee.last_name,
      firstName: employee.first_name,
      email: employee.email,
      department: employee.department,
      location: employee.location,
      position: employee.position,
      photoUrl: employee.photo_url,
      skills: employee.skills,
      credentials: employee.credentials,
      experiences: employee.experiences,
      selfPR: employee.self_pr,
      hobbyInfo: employee.hobby_info,
      ...(seat ? { seat } : {}),
    });
  } catch (error) {
    console.error("Employee detail error:", error);
    return NextResponse.json<ErrorResponse>(
      {
        success: false,
        error: "INTERNAL_SERVER_ERROR",
        message: "社員詳細情報の取得に失敗しました。",
      },
      { status: 500 }
    );
  }
}
