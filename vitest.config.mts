import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // tsconfig.json の "@/*" → "./src/*" と同じ別名をテストでも使えるようにする
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    env: {
      JWT_SECRET: "test-secret-for-unit-tests-only",
      // 開発用DB(teamd_dev)を汚さないよう、テスト専用DB(teamd_test)を使う
      DATABASE_URL: "postgresql://teamd:teamd@localhost:5432/teamd_test",
      // フロントのAPI呼び出しをモックではなく実APIモードにする（画面テスト用）
      NEXT_PUBLIC_USE_MOCK: "false",
    },
    // テスト開始前に1回だけ teamd_test（プロジェクトのスキーマ）と teamd_spec（仕様書のDDL）を作り直す
    globalSetup: ["tests/support/global-setup.ts"],
    setupFiles: ["tests/support/setup.ts"],
    // 全テストファイルが同じDBを使うので、並列実行するとデータがぶつかる。1ファイルずつ順番に実行する
    fileParallelism: false,
    testTimeout: 20000,
  },
});
