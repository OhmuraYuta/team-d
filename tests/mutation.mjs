// ミューテーションテスト: 「テストがバグをちゃんと見つけられるか」を確かめる。
//
// ソースコードにわざとバグ（ミュータント）を1つずつ入れて全テストを実行し、
// 新たに失敗するテストが出れば「検出」、1件も出なければ「見逃し」と判定する。
// 見逃しがあれば、そのバグを捕まえるテストが足りていないということ。
//
// 実行: npm run db:up したあと npm run test:mutation
// 各バグを入れたあとは、必ず元のファイル内容を書き戻す（途中で Ctrl+C しても戻す）。
import { spawn } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** [説明, ファイル, 置換前, 置換後]。置換前の文字列はファイル内に1か所だけあること */
const MUTATIONS = [
  [
    "ロックが5回目でなく6回目にかかる",
    "src/app/api/v1/auth/login/route.ts",
    "failed_attempts + 1 >= $1 THEN TRUE",
    "failed_attempts + 1 > $1 THEN TRUE",
  ],
  [
    "ログイン成功で失敗回数をリセットしない",
    "src/app/api/v1/auth/login/route.ts",
    "SET failed_attempts = 0, updated_at",
    "SET failed_attempts = failed_attempts, updated_at",
  ],
  [
    "ロック中でもログインできる",
    "src/app/api/v1/auth/login/route.ts",
    "if (user.is_locked) {",
    "if (false) {",
  ],
  [
    "Cookie が HttpOnly でない",
    "src/app/api/v1/auth/login/route.ts",
    "httpOnly: true",
    "httpOnly: false",
  ],
  [
    "本番でも Secure を付けない",
    "src/app/api/v1/auth/login/route.ts",
    'secure: process.env.NODE_ENV === "production"',
    "secure: false",
  ],
  ["JWT の期限が60分", "src/lib/jwt.ts", '"30m"', '"60m"'],
  ["一般社員でも管理者APIを使える", "src/lib/auth.ts", 'user.role !== "ADMIN"', "false"],
  [
    "未ログインでもAPIを通す",
    "src/proxy.ts",
    "const user = token ? await verifyJwt(token) : null;",
    "const user = token ? await verifyJwt(token) : { id: 'x' };",
  ],
  [
    "検索条件が AND でなく OR",
    "src/app/api/v1/employees/route.ts",
    'conditions.join(" AND ")',
    'conditions.join(" OR ")',
  ],
  [
    "姓の検索が部分一致でなく完全一致",
    "src/app/api/v1/employees/route.ts",
    'if (lastName) addPartialMatch("e.last_name", lastName);',
    "if (lastName) conditions.push(`e.last_name = ${addParam(lastName)}`);",
  ],
  [
    "社員IDの検索が完全一致でなく部分一致",
    "src/app/api/v1/employees/route.ts",
    "if (employeeId) conditions.push(`e.login_id = ${addParam(employeeId)}`);",
    'if (employeeId) addPartialMatch("e.login_id", employeeId);',
  ],
  [
    "社員詳細に座席を返さない",
    "src/app/api/v1/employees/[id]/route.ts",
    "...(seat ? { seat } : {}),",
    "",
  ],
  [
    "ロック解除で失敗回数を戻さない",
    "src/app/api/v1/admin/users/[id]/unlock/route.ts",
    "failed_attempts = 0,",
    "failed_attempts = failed_attempts,",
  ],
  [
    "回数設定を保存しない（常に5）",
    "src/app/api/v1/admin/settings/max-failed-attempts/route.ts",
    "[String(maxFailedAttempts)]",
    '["5"]',
  ],
  [
    "パスワードを平文で保存",
    "src/app/api/v1/admin/employees/route.ts",
    "await bcrypt.hash(password, 10)",
    "password",
  ],
  [
    "メッセージがある社員を削除できない",
    "src/app/api/v1/admin/employees/[id]/route.ts",
    '"DELETE FROM thank_you_messages WHERE sender_id = $1 OR receiver_id = $1"',
    '"SELECT $1::uuid"',
  ],
  [
    "姓のインデックスが無い",
    "db/init/01_schema.sql",
    "CREATE INDEX idx_employees_last_name ON employees (last_name);",
    "",
  ],
  [
    "座標の 0〜100 制約が無い",
    "db/init/01_schema.sql",
    "x INTEGER NOT NULL CHECK (x BETWEEN 0 AND 100),",
    "x INTEGER NOT NULL,",
  ],
  [
    "役職IDで絞り込まない",
    "src/app/api/v1/employees/route.ts",
    "if (positionId) conditions.push(`e.position_id = ${addParam(positionId)}`);",
    "",
  ],
  [
    "座席一覧をフロアで絞り込まない",
    "src/app/api/v1/seats/route.ts",
    "if (floor) conditions.push(`s.floor = ${addParam(floor)}`);",
    "",
  ],
  [
    "座席一覧に割当社員を返さない",
    "src/app/api/v1/seats/route.ts",
    "employee: seat.employee,",
    "employee: null,",
  ],
  // 注: seats/route.ts 内の認証チェックを外すミュータントは入れていない。
  // ミドルウェア (proxy.ts) が先に 401 を返すため外から見た動きが変わらない「等価ミュータント」で、
  // 仕様に基づくテストでは原理的に検出できない（検出できる必要もない）。
];

const reportPath = join(tmpdir(), `teamd-mutation-${process.pid}.json`);

/** 全テストを実行し、失敗したテストの名前の集合を返す */
// execSync（同期）だと実行中は Node が Ctrl+C の処理を一切できないので、spawn（非同期）で待つ
async function failingTests() {
  rmSync(reportPath, { force: true }); // 前回の結果を誤って読まないよう消しておく
  const signal = await new Promise((resolve, reject) => {
    const child = spawn("npx", ["vitest", "run", "--reporter=json", `--outputFile=${reportPath}`], {
      stdio: "ignore",
    });
    child.on("error", reject);
    // 失敗テストがあると終了コードは非0になるが、結果は JSON から読むので気にしない
    child.on("exit", (_code, sig) => resolve(sig));
  });
  if (signal) throw new Error(`テストの実行が ${signal} で止められました`);

  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  if (report.numTotalTests === 0) {
    throw new Error(
      "テストが1件も実行されませんでした。`npm run db:up` で DB を起動しているか確認してください。"
    );
  }
  return new Set(
    report.testResults.flatMap((file) =>
      file.assertionResults.filter((t) => t.status === "failed").map((t) => t.fullName)
    )
  );
}

// 実行中のミュータントを、どんな終わり方をしても元に戻すための記録
let pending = null; // { file, original }
function restore() {
  if (pending) {
    writeFileSync(pending.file, pending.original);
    pending = null;
  }
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    restore();
    console.log("\n中断しました。ファイルは元に戻しています。");
    process.exit(130);
  });
}

// 置換対象が見つからない＝ソースが変わってミュータントが古くなっている。先にまとめて確認する
const stale = MUTATIONS.filter(
  ([, file, from]) => readFileSync(file, "utf8").split(from).length !== 2
);
if (stale.length > 0) {
  console.error(
    "次のミュータントの置換前文字列が、ファイル内にちょうど1か所見つかりません（ソースが変わった可能性）:"
  );
  for (const [label, file] of stale) console.error(`  - ${label} (${file})`);
  console.error("tests/mutation.mjs の MUTATIONS を更新してください。");
  process.exit(2);
}

console.log("基準となるテスト結果を取得中...");
const baseline = await failingTests();
console.log(
  `基準: 失敗 ${baseline.size} 件（バグを入れる前から失敗しているテスト。これらは判定に使わない）\n`
);

const missed = [];
try {
  for (const [label, file, from, to] of MUTATIONS) {
    const original = readFileSync(file, "utf8");
    pending = { file, original };
    writeFileSync(file, original.replace(from, to));

    const newFailures = [...(await failingTests())].filter((name) => !baseline.has(name));
    restore();

    if (newFailures.length === 0) missed.push(label);
    console.log(
      `${newFailures.length > 0 ? "✅ 検出  " : "❌ 見逃し"}  ${label}（新たに失敗: ${newFailures.length}件）`
    );
    if (newFailures.length > 0) console.log(`           例: ${newFailures[0]}`);
  }
} finally {
  restore();
  rmSync(reportPath, { force: true });
}

console.log(`\n${MUTATIONS.length} 個のバグのうち ${MUTATIONS.length - missed.length} 個を検出`);
if (missed.length > 0) {
  console.log("見逃したバグ（これを捕まえるテストを追加すること）:");
  for (const label of missed) console.log(`  - ${label}`);
  process.exit(1);
}
