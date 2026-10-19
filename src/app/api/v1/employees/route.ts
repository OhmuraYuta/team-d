import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ErrorResponse } from "@/lib/types/auth";

interface EmployeeSearchRow {
  id: string | null;
  employee_id: string | null;
  last_name: string | null;
  first_name: string | null;
  department: string | null;
  location: string | null;
  position: string | null;
  email: string | null;
  photo_url: string | null;
  total_count: number;
}

const uuidV7Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getQueryParam(request: NextRequest, name: string): string | undefined {
  const value = request.nextUrl.searchParams.get(name)?.trim();
  return value ? value : undefined;
}

export async function GET(request: NextRequest) {
  const employeeId = getQueryParam(request, "employeeId");
  const lastName = getQueryParam(request, "lastName");
  const firstName = getQueryParam(request, "firstName");
  const departmentId = getQueryParam(request, "departmentId");
  const locationId = getQueryParam(request, "locationId");
  const positionId = getQueryParam(request, "positionId");
  const skill = getQueryParam(request, "skill");
  const credential = getQueryParam(request, "credential");
  const project = getQueryParam(request, "project");
  const hobby = getQueryParam(request, "hobby");

  for (const [name, value] of [
    ["departmentId", departmentId],
    ["locationId", locationId],
    ["positionId", positionId],
  ] as const) {
    if (value && !uuidV7Pattern.test(value)) {
      return NextResponse.json<ErrorResponse>(
        {
          success: false,
          error: "BAD_REQUEST",
          message: `${name}には有効なUUIDv7を指定してください。`,
        },
        { status: 400 }
      );
    }
  }

  const conditions: string[] = [];
  const params: string[] = [];
  const addParam = (value: string) => {
    params.push(value);
    return `$${params.length}`;
  };
  const addPartialMatch = (column: string, value: string) => {
    const parameter = addParam(value);
    conditions.push(`${column} ILIKE '%' || ${parameter} || '%'`);
  };

  if (employeeId) conditions.push(`e.login_id = ${addParam(employeeId)}`);
  if (lastName) addPartialMatch("e.last_name", lastName);
  if (firstName) addPartialMatch("e.first_name", firstName);
  if (departmentId) conditions.push(`e.department_id = ${addParam(departmentId)}`);
  if (locationId) conditions.push(`e.location_id = ${addParam(locationId)}`);
  if (positionId) conditions.push(`e.position_id = ${addParam(positionId)}`);

  if (skill) {
    const parameter = addParam(skill);
    conditions.push(
      `EXISTS (
        SELECT 1
        FROM employee_skills es
        JOIN skills s ON s.id = es.skill_id
        WHERE es.employee_id = e.id
          AND (s.name ILIKE '%' || ${parameter} || '%' OR LOWER(s.id::text) = LOWER(${parameter}))
      )`
    );
  }

  if (credential) {
    const parameter = addParam(credential);
    conditions.push(
      `EXISTS (
        SELECT 1
        FROM employee_credentials ec
        JOIN credentials c ON c.id = ec.credential_id
        WHERE ec.employee_id = e.id
          AND (c.name ILIKE '%' || ${parameter} || '%' OR LOWER(c.id::text) = LOWER(${parameter}))
      )`
    );
  }

  if (project) {
    conditions.push(
      `EXISTS (
        SELECT 1
        FROM employee_experiences ee
        WHERE ee.employee_id = e.id
          AND ee.project_name ILIKE '%' || ${addParam(project)} || '%'
      )`
    );
  }
  if (hobby) addPartialMatch("e.hobby_info", hobby);

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const result = await query<EmployeeSearchRow>(
      `WITH filtered_employees AS (
        SELECT
          e.id,
          e.login_id AS employee_id,
          e.last_name,
          e.first_name,
          COALESCE(d.name, '') AS department,
          COALESCE(l.name, '') AS location,
          COALESCE(p.name, '') AS position,
          e.email,
          COALESCE(e.photo_url, '') AS photo_url
        FROM employees e
        LEFT JOIN departments d ON d.id = e.department_id
        LEFT JOIN locations l ON l.id = e.location_id
        LEFT JOIN positions p ON p.id = e.position_id
        ${whereClause}
      ), employee_count AS (
        SELECT COUNT(*)::int AS total_count FROM filtered_employees
      )
      SELECT
        employee_count.total_count,
        filtered_employees.id,
        filtered_employees.employee_id,
        filtered_employees.last_name,
        filtered_employees.first_name,
        filtered_employees.department,
        filtered_employees.location,
        filtered_employees.position,
        filtered_employees.email,
        filtered_employees.photo_url
      FROM employee_count
      LEFT JOIN filtered_employees ON TRUE
      ORDER BY filtered_employees.last_name NULLS LAST,
        filtered_employees.first_name NULLS LAST,
        filtered_employees.employee_id NULLS LAST`,
      params
    );

    const totalCount = result.rows[0]?.total_count ?? 0;
    const results = result.rows
      .filter((row) => row.id !== null)
      .map((row) => ({
        id: row.id,
        employeeId: row.employee_id,
        lastName: row.last_name,
        firstName: row.first_name,
        department: row.department,
        location: row.location,
        position: row.position,
        email: row.email,
        photoUrl: row.photo_url,
      }));

    return NextResponse.json({ totalCount, results });
  } catch (error) {
    console.error("Employee search error:", error);
    return NextResponse.json<ErrorResponse>(
      {
        success: false,
        error: "INTERNAL_SERVER_ERROR",
        message: "社員情報の検索に失敗しました。",
      },
      { status: 500 }
    );
  }
}
