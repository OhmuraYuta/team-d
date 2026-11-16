import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ErrorResponse } from "@/lib/types/auth";

interface EmployeeSearchRow {
  id: string;
  employee_id: string;
  last_name: string;
  first_name: string;
  department: string;
  location: string;
  position: string;
  email: string;
  photo_url: string;
  skills: string[];
  credentials: string[];
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
  const email = getQueryParam(request, "email");
  const departmentId = getQueryParam(request, "departmentId");
  const locationId = getQueryParam(request, "locationId");
  const positionId = getQueryParam(request, "positionId");
  const skill = getQueryParam(request, "skill");
  const credential = getQueryParam(request, "credential");
  const project = getQueryParam(request, "project");
  const hobby = getQueryParam(request, "hobby");
  const pageRaw = getQueryParam(request, "page");
  // 仕様は perPage。フロントが送る limit も後方互換として受ける（perPage優先）。
  const perPageRaw = getQueryParam(request, "perPage") ?? getQueryParam(request, "limit");

  const page = pageRaw === undefined ? 1 : Number(pageRaw);
  const perPage = perPageRaw === undefined ? 20 : Number(perPageRaw);
  // 巨大OFFSETによる負荷防止のため page に上限を設ける（800名規模では十分な余裕）。
  const MAX_PAGE = 10000;
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > MAX_PAGE ||
    !Number.isInteger(perPage) ||
    perPage < 1 ||
    perPage > 100
  ) {
    return NextResponse.json<ErrorResponse>(
      {
        success: false,
        error: "BAD_REQUEST",
        message: `page は1以上${MAX_PAGE}以下の整数、perPage は1以上100以下の整数を指定してください。`,
      },
      { status: 400 }
    );
  }

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
  const params: (string | number)[] = [];
  const addParam = (value: string | number) => {
    params.push(value);
    return `$${params.length}`;
  };
  const escapeLikePattern = (value: string) => value.replace(/([\\%_])/g, "\\$1");
  const addPartialMatch = (column: string, value: string) => {
    const parameter = addParam(escapeLikePattern(value));
    conditions.push(`${column} ILIKE '%' || ${parameter} || '%' ESCAPE '\\'`);
  };

  if (employeeId) conditions.push(`e.login_id = ${addParam(employeeId)}`);
  if (lastName) addPartialMatch("e.last_name", lastName);
  if (firstName) addPartialMatch("e.first_name", firstName);
  if (email) addPartialMatch("e.email", email);
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
    // 件数取得とデータ取得を分離する。JOIN+LIMIT の単一クエリでは範囲外pageで
    // OFFSET が件数行ごと切り捨て totalCount=0 になるため（仕様では本来値を返す想定）。
    const countResult = await query<{ total_count: number }>(
      `SELECT COUNT(*)::int AS total_count
       FROM employees e
       ${whereClause}`,
      params
    );
    const totalCount = countResult.rows[0]?.total_count ?? 0;
    const totalPages = Math.ceil(totalCount / perPage);

    const limitParam = addParam(perPage);
    const offsetParam = addParam((page - 1) * perPage);
    const result = await query<EmployeeSearchRow>(
      `SELECT
        e.id,
        e.login_id AS employee_id,
        e.last_name,
        e.first_name,
        COALESCE(d.name, '') AS department,
        COALESCE(l.name, '') AS location,
        COALESCE(p.name, '') AS position,
        e.email,
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
        ), '[]'::json) AS credentials
      FROM employees e
      LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN locations l ON l.id = e.location_id
      LEFT JOIN positions p ON p.id = e.position_id
      ${whereClause}
      ORDER BY e.last_name NULLS LAST,
        e.first_name NULLS LAST,
        e.login_id NULLS LAST,
        e.id NULLS LAST
      LIMIT ${limitParam} OFFSET ${offsetParam}`,
      params
    );

    const results = result.rows.map((row) => ({
        id: row.id,
        employeeId: row.employee_id,
        lastName: row.last_name,
        firstName: row.first_name,
        department: row.department,
        location: row.location,
        position: row.position,
        email: row.email,
        photoUrl: row.photo_url,
        skills: row.skills,
        credentials: row.credentials,
      }));

    return NextResponse.json({ totalCount, page, perPage, totalPages, results });
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
