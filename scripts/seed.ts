import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { uuidv7 } from "uuidv7";

async function seed() {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL || "postgresql://teamd:teamd@localhost:5432/teamd_dev",
  });

  try {
    console.log("Connecting to database...");
    const client = await pool.connect();

    console.log("Clearing existing data...");
    await client.query(
      "TRUNCATE TABLE thank_you_messages, employee_experiences, employee_credentials, employee_skills, employees, credentials, skills, seats, positions, locations, departments, system_settings CASCADE"
    );

    console.log("Inserting system settings...");
    await client.query(
      "INSERT INTO system_settings (key, value) VALUES ('max_failed_attempts', '5') ON CONFLICT (key) DO UPDATE SET value = '5'"
    );

    console.log("Inserting master data...");
    const deptTechId = uuidv7();
    const deptSalesId = uuidv7();
    const deptHrId = uuidv7();
    await client.query("INSERT INTO departments (id, name) VALUES ($1, $2), ($3, $4), ($5, $6)", [
      deptTechId,
      "技術開発部",
      deptSalesId,
      "営業部",
      deptHrId,
      "人事部",
    ]);

    const locTechId = uuidv7();
    const locHqId = uuidv7();
    await client.query("INSERT INTO locations (id, name) VALUES ($1, $2), ($3, $4)", [
      locTechId,
      "技術センター",
      locHqId,
      "本社",
    ]);

    const posChiefId = uuidv7();
    const posStaffId = uuidv7();
    const posManagerId = uuidv7();
    await client.query("INSERT INTO positions (id, name) VALUES ($1, $2), ($3, $4), ($5, $6)", [
      posChiefId,
      "チーフエンジニア",
      posStaffId,
      "一般社員",
      posManagerId,
      "部長",
    ]);

    console.log("Inserting employees...");
    const passAdmin = await bcrypt.hash("SecurePassword123", 10);
    const passEmp = await bcrypt.hash("Password123!", 10);

    const empAdminId = uuidv7();
    const empRegularId = uuidv7();

    await client.query(
      `INSERT INTO employees (
        id, login_id, password_hash, last_name, first_name, email, role,
        department_id, location_id, position_id, failed_attempts, is_locked
      ) VALUES
      ($1, 'EMP001', $2, '大村', '悠太', 'yuta.ohmura@example.com', 'ADMIN', $3, $4, $5, 0, FALSE),
      ($6, 'EMP002', $7, '青木', '大隼', 'hiroto.aoki@example.com', 'EMPLOYEE', $8, $9, $10, 0, FALSE)`,
      [
        empAdminId,
        passAdmin,
        deptTechId,
        locTechId,
        posChiefId,
        empRegularId,
        passEmp,
        deptTechId,
        locTechId,
        posStaffId,
      ]
    );

    console.log("Seed completed successfully!");
    console.log("Admin user: login_id=EMP001, password=SecurePassword123, role=ADMIN");
    console.log("Employee user: login_id=EMP002, password=Password123!, role=EMPLOYEE");

    client.release();
  } catch (error) {
    console.error("Seeding error:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
