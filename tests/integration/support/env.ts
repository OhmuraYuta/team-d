/** 結合テストの接続先。開発環境 (teamd_dev / ポート3000) とぶつからない値にしている */
export const PORT = 3100;
export const BASE_URL = `http://localhost:${PORT}`;
export const DATABASE_URL = "postgresql://teamd:teamd@localhost:5432/teamd_it";
export const ADMIN_DATABASE_URL = "postgresql://teamd:teamd@localhost:5432/teamd_dev";

/** テスト用サーバーに渡す環境変数（.env.local より優先される） */
export const SERVER_ENV = {
  DATABASE_URL,
  JWT_SECRET: "integration-test-secret-not-for-production",
  NEXT_PUBLIC_USE_MOCK: "false", // 画面からも実APIを呼ぶ
  PORT: String(PORT),
};
