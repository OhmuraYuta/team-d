import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { uuidv7 } from "uuidv7";
import { pool, query } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ErrorResponse } from "@/lib/types/auth";
import { EmployeeCreateInput, EmployeeCreateResponse } from "@/lib/types/employee";

export async function POST(request: NextRequest) {
  // 1. 管理者認可チェック
  const authResult = await requireAdmin(request);
  if (authResult.errorResponse) {
    return authResult.errorResponse;
  }

  // 2. リクエストボディのパース
  let body: EmployeeCreateInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ErrorResponse>(
      {
        success: false,
        error: "BAD_REQUEST",
        message: "リクエストボディが不正です。",
      },
      { status: 400 }
    );
  }

  const {
    loginId,
    password,
    lastName,
    firstName,
    email,
    role = "EMPLOYEE",
    departmentId = null,
    locationId = null,
    positionId = null,
    seatId = null,
    photoUrl = null,
    selfPR = null,
    hobbyInfo = null,
    skills = [],
    credentials = [],
    experiences = [],
  } = body;

  // 3. 必須フィールドの検証
  if (!loginId || typeof loginId !== "string" || loginId.trim() === "") {
    return NextResponse.json<ErrorResponse>(
      {
        success: false,
        error: "BAD_REQUEST",
        message: "社員ID(loginId)は必須です。",
      },
      { status: 400 }
    );
  }

  if (!password || typeof password !== "string" || password.trim() === "") {
    return NextResponse.json<ErrorResponse>(
      {
        success: false,
        error: "BAD_REQUEST",
        message: "パスワードは必須です。",
      },
      { status: 400 }
    );
  }

  if (!lastName || typeof lastName !== "string" || lastName.trim() === "") {
    return NextResponse.json<ErrorResponse>(
      {
        success: false,
        error: "BAD_REQUEST",
        message: "姓(lastName)は必須です。",
      },
      { status: 400 }
    );
  }

  if (!firstName || typeof firstName !== "string" || firstName.trim() === "") {
    return NextResponse.json<ErrorResponse>(
      {
        success: false,
        error: "BAD_REQUEST",
        message: "名(firstName)は必須です。",
      },
      { status: 400 }
    );
  }

  if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json<ErrorResponse>(
      {
        success: false,
        error: "BAD_REQUEST",
        message: "有効なメールアドレスを入力してください。",
      },
      { status: 400 }
    );
  }

  if (role !== "EMPLOYEE" && role !== "ADMIN") {
    return NextResponse.json<ErrorResponse>(
      {
        success: false,
        error: "BAD_REQUEST",
        message: "ロールは 'EMPLOYEE' または 'ADMIN' である必要があります。",
      },
      { status: 400 }
    );
  }

  try {
    // 4. 重複チェック (login_id, email)
    const duplicateCheck = await query<{ login_id: string; email: string }>(
      `SELECT login_id, email FROM employees WHERE login_id = $1 OR email = $2`,
      [loginId.trim(), email.trim()]
    );

    if (duplicateCheck.rows.length > 0) {
      const existing = duplicateCheck.rows[0];
      if (existing.login_id === loginId.trim()) {
        return NextResponse.json<ErrorResponse>(
          {
            success: false,
            error: "CONFLICT",
            message: "指定された社員ID(loginId)は既に使用されています。",
          },
          { status: 409 }
        );
      }
      return NextResponse.json<ErrorResponse>(
        {
          success: false,
          error: "CONFLICT",
          message: "指定されたメールアドレスは既に使用されています。",
        },
        { status: 409 }
      );
    }

    // 座席の重複チェック
    if (seatId) {
      const seatCheck = await query(`SELECT id FROM employees WHERE seat_id = $1`, [seatId]);
      if (seatCheck.rows.length > 0) {
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

    // 5. DB トランザクション処理
    const newEmployeeId = uuidv7();
    const passwordHash = await bcrypt.hash(password, 10);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 社員基本情報の登録
      await client.query(
        `INSERT INTO employees (
          id, login_id, password_hash, last_name, first_name, email, role,
          department_id, location_id, position_id, seat_id,
          photo_url, self_pr, hobby_info
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11,
          $12, $13, $14
        )`,
        [
          newEmployeeId,
          loginId.trim(),
          passwordHash,
          lastName.trim(),
          firstName.trim(),
          email.trim(),
          role,
          departmentId || null,
          locationId || null,
          positionId || null,
          seatId || null,
          photoUrl || null,
          selfPR || null,
          hobbyInfo || null,
        ]
      );

      // スキル情報の登録
      if (Array.isArray(skills) && skills.length > 0) {
        for (const skillId of skills) {
          if (skillId) {
            await client.query(
              `INSERT INTO employee_skills (employee_id, skill_id)
               VALUES ($1, $2)
               ON CONFLICT (employee_id, skill_id) DO NOTHING`,
              [newEmployeeId, skillId]
            );
          }
        }
      }

      // 資格情報の登録
      if (Array.isArray(credentials) && credentials.length > 0) {
        for (const credentialId of credentials) {
          if (credentialId) {
            await client.query(
              `INSERT INTO employee_credentials (employee_id, credential_id)
               VALUES ($1, $2)
               ON CONFLICT (employee_id, credential_id) DO NOTHING`,
              [newEmployeeId, credentialId]
            );
          }
        }
      }

      // 業務経験・プロジェクト履歴の登録
      if (Array.isArray(experiences) && experiences.length > 0) {
        for (const exp of experiences) {
          if (exp && exp.projectName) {
            const expId = uuidv7();
            await client.query(
              `INSERT INTO employee_experiences (
                id, employee_id, project_name, role_description, start_date, end_date
              ) VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                expId,
                newEmployeeId,
                exp.projectName.trim(),
                exp.roleDescription?.trim() || null,
                exp.startDate || null,
                exp.endDate || null,
              ]
            );
          }
        }
      }

      await client.query("COMMIT");
    } catch (dbError: unknown) {
      await client.query("ROLLBACK");

      // 外部キー制約違反 (23503)
      if (
        typeof dbError === "object" &&
        dbError !== null &&
        "code" in dbError &&
        (dbError as { code: string }).code === "23503"
      ) {
        return NextResponse.json<ErrorResponse>(
          {
            success: false,
            error: "BAD_REQUEST",
            message: "指定された部署、拠点、役職、座席、スキル、または資格が存在しません。",
          },
          { status: 400 }
        );
      }

      throw dbError;
    } finally {
      client.release();
    }

    return NextResponse.json<EmployeeCreateResponse>(
      {
        success: true,
        id: newEmployeeId,
        message: "社員を登録しました。",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Employee registration error:", error);
    return NextResponse.json<ErrorResponse>(
      {
        success: false,
        error: "INTERNAL_SERVER_ERROR",
        message: "サーバー内部エラーが発生しました。",
      },
      { status: 500 }
    );
  }
}
