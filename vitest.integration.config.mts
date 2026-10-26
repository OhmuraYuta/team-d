import { defineConfig } from "vitest/config";

/**
 * 結合テスト用の設定（npm run test:integration）。
 * 本物の Next.js サーバー (next build → next start) をポート 3100 で起動し、HTTP 経由でテストする。
 * 単体・仕様テスト (vitest.config.mts, *.test.ts) とは別ファイル・別拡張子 (*.it.ts) にして混ざらないようにしている。
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.it.ts"],
    globalSetup: ["tests/integration/support/global-setup.ts"],
    // 全ファイルが同じサーバー・同じDBを使うので、1ファイルずつ順番に実行する
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 300_000, // next build に時間がかかるため
  },
});
