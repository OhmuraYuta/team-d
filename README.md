# フロンティア精機 社員情報活用システム (team-d)

本プロジェクトは、フロンティア精機株式会社の社員情報一元管理、社員検索、座席フロア表示、サンクスメッセージ送信機能を提供するWebアプリケーションです。

## AI開発用仕様書
本プロジェクトのシステム設計・API定義・データベーススキーマ・ロジックの要件は、AI向けに最適化された以下の仕様書に記述されています。

- **AI用システム仕様書**: [AI_SPECIFICATION.md](file:///Users/ohmurayuta/projects/team-d/AI_SPECIFICATION.md)

AIエージェントが本プロジェクトで実装作業を行う際は、必ず上記の [AI_SPECIFICATION.md](file:///Users/ohmurayuta/projects/team-d/AI_SPECIFICATION.md) を読み込み、それに従ってコードを生成してください。

## 開発環境

### 必要なツール
- Node.js 20 以上 / npm
- Docker Desktop（Postgres 用）

### 初回セットアップ
```bash
# 1. 依存パッケージのインストール
npm install

# 2. 環境変数ファイルの作成（JWT_SECRET は独自の値に変更すること）
cp .env.example .env.local

# 3. データベースの起動（初回起動時に db/init/ のスキーマが自動投入される）
npm run db:up

# 4. 開発サーバーの起動 → http://localhost:3000
npm run dev
```

### 技術スタック
- Next.js (App Router) + TypeScript + TailwindCSS
- PostgreSQL 16（Docker Compose、接続情報: `teamd/teamd@localhost:5432/teamd_dev`）
- 主要ライブラリ: `pg`（DB接続）, `uuidv7`（ID生成）, `jose`（JWT）, `bcryptjs`（パスワードハッシュ）

### DB 操作コマンド
| コマンド | 内容 |
| :--- | :--- |
| `npm run db:up` | Postgres コンテナを起動 |
| `npm run db:down` | コンテナを停止 |
| `npm run db:reset` | データを全消去してスキーマを再投入 |
| `npm run db:psql` | psql でデータベースに接続 |

スキーマは [db/init/01_schema.sql](db/init/01_schema.sql) にあり、AI_SPECIFICATION.md の DDL に準拠しています。スキーマを変更した場合は `npm run db:reset` で反映してください。