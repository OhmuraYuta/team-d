import { NextRequest, NextResponse } from "next/server";
import { uuidv7 } from "uuidv7";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import { ErrorResponse } from "@/lib/types/auth";
import { EmployeeExperienceInput } from "@/lib/types/employee";

type EmployeeUpdateInput = {
  lastName?: string;
  firstName?: string;
  email?: string;
  role?: "EMPLOYEE" | "ADMIN";
  departmentId?: string | null;
  locationId?: string | null;
  positionId?: string | null;
  seatId?: string | null;
  photoUrl?: string | null;
  selfPR?: string | null;
  hobbyInfo?: string | null;
  skills?: string[];
  credentials?: string[];
  experiences?: EmployeeExperienceInput[];
};

type EmployeeColumn =
  | "last_name"
  | "first_name"
  | "email"
  | "role"
  | "department_id"
  | "location_id"
  | "position_id"
  | "seat_id"
  | "photo_url"
  | "self_pr"
  | "hobby_info";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const allowedFields = new Set([
  "lastName",
  "firstName",
  "email",
  "role",
  "departmentId",
  "locationId",
  "positionId",
  "seatId",
  "photoUrl",
  "selfPR",
  "hobbyInfo",
  "skills",
  "credentials",
  "experiences",
]);

function badRequest(message: string) {
  return NextResponse.json<ErrorResponse>(
    { success: false, error: "BAD_REQUEST", message },
    { status: 400 }
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isDatabaseError(error: unknown): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error;
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAdmin(request);
  if (authResult.errorResponse) return authResult.errorResponse;

  const { id } = await params;
  if (!uuidPattern.test(id)) {
    return badRequest("社員IDは有効なUUIDで指定してください。");
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return badRequest("リクエストボディが不正です。");
  }

  if (!isRecord(rawBody))
    return badRequest("リクエストボディはJSONオブジェクトで指定してください。");

  const unknownFields = Object.keys(rawBody).filter((field) => !allowedFields.has(field));
  if (unknownFields.length > 0) {
    return badRequest(`更新できない項目が含まれています: ${unknownFields.join(", ")}`);
  }
  if (Object.keys(rawBody).length === 0)
    return badRequest("更新する項目を1つ以上指定してください。");

  const body = rawBody as EmployeeUpdateInput;
  const has = (key: keyof EmployeeUpdateInput) => Object.hasOwn(rawBody, key);
  const updates: { column: EmployeeColumn; value: string | null }[] = [];

  const requiredTextFields = [
    ["lastName", "last_name", "姓(lastName)"],
    ["firstName", "first_name", "名(firstName)"],
  ] as const;
  for (const [field, column, label] of requiredTextFields) {
    if (!has(field)) continue;
    const value = body[field];
    if (typeof value !== "string" || value.trim() === "") {
      return badRequest(`${label}は空でない文字列で指定してください。`);
    }
    updates.push({ column, value: value.trim() });
  }

  if (has("email")) {
    if (typeof body.email !== "string" || !emailPattern.test(body.email.trim())) {
      return badRequest("有効なメールアドレスを入力してください。");
    }
    updates.push({ column: "email", value: body.email.trim() });
  }

  if (has("role")) {
    if (body.role !== "EMPLOYEE" && body.role !== "ADMIN") {
      return badRequest("ロールは 'EMPLOYEE' または 'ADMIN' である必要があります。");
    }
    updates.push({ column: "role", value: body.role });
  }

  const uuidFields = [
    ["departmentId", "department_id", "部署ID"],
    ["locationId", "location_id", "拠点ID"],
    ["positionId", "position_id", "役職ID"],
    ["seatId", "seat_id", "座席ID"],
  ] as const;
  for (const [field, column, label] of uuidFields) {
    if (!has(field)) continue;
    const value = body[field];
    if (value !== null && (typeof value !== "string" || !uuidPattern.test(value))) {
      return badRequest(`${label}はUUIDまたはnullで指定してください。`);
    }
    updates.push({ column, value: value as string | null });
  }

  const nullableTextFields = [
    ["photoUrl", "photo_url"],
    ["selfPR", "self_pr"],
    ["hobbyInfo", "hobby_info"],
  ] as const;
  for (const [field, column] of nullableTextFields) {
    if (!has(field)) continue;
    const value = body[field];
    if (value !== null && typeof value !== "string") {
      return badRequest(`${field}は文字列またはnullで指定してください。`);
    }
    updates.push({ column, value: typeof value === "string" ? value.trim() || null : null });
  }

  for (const field of ["skills", "credentials"] as const) {
    if (!has(field)) continue;
    const values = body[field];
    if (
      !Array.isArray(values) ||
      values.some((value) => typeof value !== "string" || !uuidPattern.test(value))
    ) {
      return badRequest(`${field}はUUID文字列の配列で指定してください。`);
    }
  }

  if (has("experiences")) {
    if (
      !Array.isArray(body.experiences) ||
      body.experiences.some((experience) => {
        if (!isRecord(experience)) return true;
        if (typeof experience.projectName !== "string" || experience.projectName.trim() === "")
          return true;
        if (
          experience.roleDescription !== undefined &&
          experience.roleDescription !== null &&
          typeof experience.roleDescription !== "string"
        ) {
          return true;
        }
        return ["startDate", "endDate"].some((field) => {
          const value = experience[field];
          return (
            value !== undefined &&
            value !== null &&
            (typeof value !== "string" || !isValidDate(value))
          );
        });
      })
    ) {
      return badRequest("experiencesの形式が不正です。日付はYYYY-MM-DD形式で指定してください。");
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const employee = await client.query("SELECT id FROM employees WHERE id = $1 FOR UPDATE", [id]);
    if (employee.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json<ErrorResponse>(
        { success: false, error: "NOT_FOUND", message: "指定された社員が見つかりません。" },
        { status: 404 }
      );
    }

    if (has("email")) {
      const duplicate = await client.query(
        "SELECT id FROM employees WHERE email = $1 AND id <> $2",
        [body.email!.trim(), id]
      );
      if (duplicate.rowCount && duplicate.rowCount > 0) {
        await client.query("ROLLBACK");
        return NextResponse.json<ErrorResponse>(
          {
            success: false,
            error: "CONFLICT",
            message: "指定されたメールアドレスは既に使用されています。",
          },
          { status: 409 }
        );
      }
    }

    if (has("seatId") && body.seatId !== null) {
      const duplicate = await client.query(
        "SELECT id FROM employees WHERE seat_id = $1 AND id <> $2",
        [body.seatId, id]
      );
      if (duplicate.rowCount && duplicate.rowCount > 0) {
        await client.query("ROLLBACK");
        return NextResponse.json<ErrorResponse>(
          {
            success: false,
            error: "CONFLICT",
            message: "指定された座席は既に他の社員に割り当てられています。",
          },
          { status: 409 }
        );
      }
    }

    if (updates.length > 0) {
      const setClause = updates.map(({ column }, index) => `${column} = $${index + 1}`).join(", ");
      await client.query(
        `UPDATE employees SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $${updates.length + 1}`,
        [...updates.map(({ value }) => value), id]
      );
    }

    if (has("skills")) {
      await client.query("DELETE FROM employee_skills WHERE employee_id = $1", [id]);
      for (const skillId of body.skills!) {
        await client.query("INSERT INTO employee_skills (employee_id, skill_id) VALUES ($1, $2)", [
          id,
          skillId,
        ]);
      }
    }

    if (has("credentials")) {
      await client.query("DELETE FROM employee_credentials WHERE employee_id = $1", [id]);
      for (const credentialId of body.credentials!) {
        await client.query(
          "INSERT INTO employee_credentials (employee_id, credential_id) VALUES ($1, $2)",
          [id, credentialId]
        );
      }
    }

    if (has("experiences")) {
      await client.query("DELETE FROM employee_experiences WHERE employee_id = $1", [id]);
      for (const experience of body.experiences!) {
        await client.query(
          `INSERT INTO employee_experiences (
            id, employee_id, project_name, role_description, start_date, end_date
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            uuidv7(),
            id,
            experience.projectName.trim(),
            experience.roleDescription?.trim() || null,
            experience.startDate || null,
            experience.endDate || null,
          ]
        );
      }
    }

    await client.query("COMMIT");
    return NextResponse.json({ success: true, id, message: "社員情報を更新しました。" });
  } catch (error) {
    await client.query("ROLLBACK");

    if (isDatabaseError(error)) {
      if (error.code === "23503") {
        return badRequest("指定された部署、拠点、役職、座席、スキル、または資格が存在しません。");
      }
      if (error.code === "23505") {
        return NextResponse.json<ErrorResponse>(
          { success: false, error: "CONFLICT", message: "社員情報が他のデータと重複しています。" },
          { status: 409 }
        );
      }
    }

    console.error("Employee update error:", error);
    return NextResponse.json<ErrorResponse>(
      {
        success: false,
        error: "INTERNAL_SERVER_ERROR",
        message: "サーバー内部エラーが発生しました。",
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
