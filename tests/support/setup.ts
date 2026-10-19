import { afterAll, beforeEach, vi } from "vitest";
import { pool } from "@/lib/db";

// 各テストは「空のDB + 初期設定(max_failed_attempts=5)」から始める。前のテストの影響を受けないようにするため
beforeEach(async () => {
  await pool.query(`
    TRUNCATE thank_you_messages, employee_experiences, employee_credentials, employee_skills,
             employees, seats, skills, credentials, departments, locations, positions, system_settings
    CASCADE;
    INSERT INTO system_settings (key, value) VALUES ('max_failed_attempts', '5');
  `);
  // APIが出すエラーログでテスト結果が読みにくくならないよう黙らせる
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterAll(async () => {
  await pool.end();
  globalThis._postgresPool = undefined;
});
