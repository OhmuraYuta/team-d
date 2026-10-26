import bcrypt from "bcryptjs";
import { Pool } from "pg";
import { uuidv7 } from "uuidv7";
import { afterAll } from "vitest";
import { DATABASE_URL } from "./env";

/**
 * テストデータを直接DBに入れるためのヘルパー。
 * 結合テストの主役はHTTPなので、DBを直接触るのは「前提データの準備」と「結果の裏取り」だけにする。
 */
export const db = new Pool({ connectionString: DATABASE_URL });
afterAll(() => db.end());

export const PASSWORD = "SecurePassword123";
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

/** 全テーブルを空にして初期設定だけ入れる（各テストファイルの最初に呼ぶ） */
export async function resetDatabase() {
  await db.query(`
    TRUNCATE thank_you_messages, employee_experiences, employee_credentials, employee_skills,
             employees, seats, skills, credentials, departments, locations, positions, system_settings
    CASCADE;
    INSERT INTO system_settings (key, value) VALUES ('max_failed_attempts', '5');
  `);
}

export async function insertMaster(
  table: "departments" | "locations" | "positions" | "skills" | "credentials",
  name: string
): Promise<string> {
  const id = uuidv7();
  await db.query(`INSERT INTO ${table} (id, name) VALUES ($1, $2)`, [id, name]);
  return id;
}

export async function insertSeat(s: {
  locationId: string;
  floor: string;
  seatCode: string;
  x: number;
  y: number;
}): Promise<string> {
  const id = uuidv7();
  await db.query(
    `INSERT INTO seats (id, location_id, floor, seat_code, x, y) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, s.locationId, s.floor, s.seatCode, s.x, s.y]
  );
  return id;
}

export async function insertEmployee(e: {
  loginId: string;
  lastName: string;
  firstName: string;
  role?: "EMPLOYEE" | "ADMIN";
  departmentId?: string;
  locationId?: string;
  positionId?: string;
  seatId?: string;
  skillIds?: string[];
}): Promise<string> {
  const id = uuidv7();
  await db.query(
    `INSERT INTO employees (id, login_id, password_hash, last_name, first_name, email, role,
       department_id, location_id, position_id, seat_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id,
      e.loginId,
      PASSWORD_HASH,
      e.lastName,
      e.firstName,
      `${e.loginId.toLowerCase()}@example.com`,
      e.role ?? "EMPLOYEE",
      e.departmentId ?? null,
      e.locationId ?? null,
      e.positionId ?? null,
      e.seatId ?? null,
    ]
  );
  for (const skillId of e.skillIds ?? []) {
    await db.query(`INSERT INTO employee_skills VALUES ($1, $2)`, [id, skillId]);
  }
  return id;
}
