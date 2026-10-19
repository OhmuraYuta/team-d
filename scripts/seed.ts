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

    console.log("Inserting floor map seats...");
    const seatDefinitions = [
      // 本社 1F
      { locationId: locHqId, floor: "1F", seatCode: "A-01", x: 20, y: 25 },
      { locationId: locHqId, floor: "1F", seatCode: "A-02", x: 35, y: 25 },
      { locationId: locHqId, floor: "1F", seatCode: "A-03", x: 50, y: 25 },
      { locationId: locHqId, floor: "1F", seatCode: "B-01", x: 20, y: 60 },
      { locationId: locHqId, floor: "1F", seatCode: "B-02", x: 35, y: 60 },
      { locationId: locHqId, floor: "1F", seatCode: "B-03", x: 50, y: 60 },
      // 本社 2F
      { locationId: locHqId, floor: "2F", seatCode: "C-01", x: 25, y: 30 },
      { locationId: locHqId, floor: "2F", seatCode: "C-02", x: 40, y: 30 },
      { locationId: locHqId, floor: "2F", seatCode: "C-03", x: 55, y: 30 },
      { locationId: locHqId, floor: "2F", seatCode: "D-01", x: 25, y: 65 },
      { locationId: locHqId, floor: "2F", seatCode: "D-02", x: 40, y: 65 },
      { locationId: locHqId, floor: "2F", seatCode: "D-03", x: 55, y: 65 },
      // 技術センター 3F
      { locationId: locTechId, floor: "3F", seatCode: "A-12", x: 25, y: 20 },
      { locationId: locTechId, floor: "3F", seatCode: "A-13", x: 40, y: 20 },
      { locationId: locTechId, floor: "3F", seatCode: "A-14", x: 55, y: 20 },
      { locationId: locTechId, floor: "3F", seatCode: "B-01", x: 25, y: 60 },
      { locationId: locTechId, floor: "3F", seatCode: "B-02", x: 40, y: 60 },
      { locationId: locTechId, floor: "3F", seatCode: "B-03", x: 55, y: 60 },
    ].map((seat) => ({ ...seat, id: uuidv7() }));

    const seatParams = seatDefinitions.flatMap((seat) => [
      seat.id,
      seat.locationId,
      seat.floor,
      seat.seatCode,
      seat.x,
      seat.y,
    ]);
    const seatValues = seatDefinitions
      .map((_, index) => {
        const offset = index * 6;
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`;
      })
      .join(", ");
    await client.query(
      `INSERT INTO seats (id, location_id, floor, seat_code, x, y) VALUES ${seatValues}`,
      seatParams
    );
    const seatIdByCode = new Map(seatDefinitions.map((seat) => [seat.seatCode, seat.id]));

    console.log("Inserting employees...");
    const passAdmin = await bcrypt.hash("SecurePassword123", 10);
    const passEmp = await bcrypt.hash("Password123!", 10);

    const empAdminId = uuidv7();
    const empRegularId = uuidv7();

    await client.query(
      `INSERT INTO employees (
        id, login_id, password_hash, last_name, first_name, email, role,
        department_id, location_id, position_id, seat_id, failed_attempts, is_locked
      ) VALUES
      ($1, 'EMP001', $2, '大村', '悠太', 'yuta.ohmura@example.com', 'ADMIN', $3, $4, $5, $6, 0, FALSE),
      ($7, 'EMP002', $8, '青木', '大隼', 'hiroto.aoki@example.com', 'EMPLOYEE', $9, $10, $11, $12, 0, FALSE)`,
      [
        empAdminId,
        passAdmin,
        deptTechId,
        locTechId,
        posChiefId,
        seatIdByCode.get("A-12"),
        empRegularId,
        passEmp,
        deptTechId,
        locTechId,
        posStaffId,
        seatIdByCode.get("A-13"),
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
