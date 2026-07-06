# AI-Ready System Specification: Employee Information Portal (フロンティア精機)

本ドキュメントは、AIコード生成エージェントが「フロンティア精機 社員情報活用システム」を実装するための技術仕様書です。本仕様書をコンテキストとして読み込ませることで、DB設計、API実装、UI構築をスムーズに行うことができます。

---

## 1. System Overview & Technology Stack (システム概要・技術スタック)

- **Target System**: 社員情報一元管理、社員検索、座席フロア表示、サンクスメッセージ送信機能を持つWebアプリケーション。
- **Target Scale**: アクティブ社員数 約800名。
- **Tech Stack**:
  - **Frontend**: Next.js (App Router) + TypeScript + TailwindCSS
  - **Backend**: Next.js
  - **Database**: Postgres

---

## 2. Roles & Permissions (ロールと権限)

システムには以下の2つのロール（Role）が存在します。

| ロール名 | ID | 権限範囲 |
| :--- | :--- | :--- |
| **一般社員** | `EMPLOYEE` | 自身のプロフィールの閲覧、他社員の検索・詳細閲覧、フロアマップ表示、ありがとうメッセージの送信・閲覧、自身のパスワード変更 |
| **管理者** | `ADMIN` | 一般社員の権限に加え、ユーザーの追加・削除、アカウントロック解除、ログイン試行回数の設定変更、全社員情報のCRUD（登録・更新・削除） |

---

## 3. Database Schema (データモデル・DB設計)

以下に、システムが必要とするテーブル構造のSQL定義（DDL）を示します。
IDにはすべて**UUIDv7**を使用します。アプリケーション（Next.js/TypeScript）側で生成します。

```sql
-- 1. 部署テーブル
CREATE TABLE departments (
    id UUID PRIMARY KEY, -- UUIDv7
    name VARCHAR(255) NOT NULL UNIQUE
);

-- 2. 拠点テーブル
CREATE TABLE locations (
    id UUID PRIMARY KEY, -- UUIDv7
    name VARCHAR(255) NOT NULL UNIQUE
);

-- 3. 役職テーブル
CREATE TABLE positions (
    id UUID PRIMARY KEY, -- UUIDv7
    name VARCHAR(255) NOT NULL UNIQUE
);

-- 3.5. 座席テーブル (座席番号単位で管理)
CREATE TABLE seats (
    id UUID PRIMARY KEY, -- UUIDv7
    location_id UUID NOT NULL,
    floor VARCHAR(50) NOT NULL, -- 例: '3F'
    seat_code VARCHAR(50) NOT NULL, -- 座席番号 (例: 'A-01')
    x INTEGER NOT NULL, -- フロアマップ上のX座標 (割合%)
    y INTEGER NOT NULL, -- フロアマップ上のY座標 (割合%)
    UNIQUE (location_id, floor, seat_code),
    FOREIGN KEY(location_id) REFERENCES locations(id) ON DELETE CASCADE
);

-- 4. 社員情報・ユーザー認証テーブル
CREATE TABLE employees (
    id UUID PRIMARY KEY, -- UUIDv7
    login_id VARCHAR(255) NOT NULL UNIQUE, -- ログイン用の社員ID（例: EMP001）
    password_hash VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    first_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    role VARCHAR(255) NOT NULL DEFAULT 'EMPLOYEE', -- 'EMPLOYEE' or 'ADMIN'
    
    -- 所属・勤務地・座席
    department_id UUID,
    location_id UUID,
    position_id UUID,
    seat_id UUID UNIQUE, -- 外部キー (1席1人想定。フリーアドレスの場合はUNIQUEを外すことも可)
    
    -- プロフィール情報
    photo_url TEXT, -- 顔写真画像URL
    self_pr TEXT, -- 自己PR
    hobby_info TEXT, -- 趣味情報
    
    -- アカウント状態
    failed_attempts INTEGER DEFAULT 0,
    is_locked BOOLEAN DEFAULT FALSE,
    locked_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY(department_id) REFERENCES departments(id),
    FOREIGN KEY(location_id) REFERENCES locations(id),
    FOREIGN KEY(position_id) REFERENCES positions(id),
    FOREIGN KEY(seat_id) REFERENCES seats(id) ON DELETE SET NULL
);

-- 5. スキル・資格テーブル (多対多のためのマスタ)
CREATE TABLE skills (
    id UUID PRIMARY KEY, -- UUIDv7
    name VARCHAR(255) NOT NULL UNIQUE
);

CREATE TABLE credentials ( -- 資格
    id UUID PRIMARY KEY, -- UUIDv7
    name VARCHAR(255) NOT NULL UNIQUE
);

-- 6. 社員-スキル中間テーブル
CREATE TABLE employee_skills (
    employee_id UUID,
    skill_id UUID,
    PRIMARY KEY (employee_id, skill_id),
    FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY(skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

-- 7. 社員-資格中間テーブル
CREATE TABLE employee_credentials (
    employee_id UUID,
    credential_id UUID,
    PRIMARY KEY (employee_id, credential_id),
    FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY(credential_id) REFERENCES credentials(id) ON DELETE CASCADE
);

-- 8. 業務経験・プロジェクト履歴テーブル
CREATE TABLE employee_experiences (
    id UUID PRIMARY KEY, -- UUIDv7
    employee_id UUID NOT NULL,
    project_name VARCHAR(255) NOT NULL, -- プロジェクト名・業務内容
    role_description VARCHAR(255), -- 役割
    start_date DATE,
    end_date DATE,
    FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

-- 9. ありがとうメッセージテーブル
CREATE TABLE thank_you_messages (
    id UUID PRIMARY KEY, -- UUIDv7
    sender_id UUID NOT NULL,
    receiver_id UUID NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(sender_id) REFERENCES employees(id),
    FOREIGN KEY(receiver_id) REFERENCES employees(id)
);

-- 10. システム設定テーブル (ログイン試行回数など)
CREATE TABLE system_settings (
    key VARCHAR(255) PRIMARY KEY,
    value VARCHAR(255) NOT NULL
);

-- 初期設定登録: 最大ログイン失敗許容回数を5回に設定
INSERT INTO system_settings (key, value) VALUES ('max_failed_attempts', '5');
```

---

## 4. API Endpoints (API設計)

すべてのAPIのベースURLは `/api/v1` とします。リクエスト/レスポンスは `application/json` 形式です。

### 4.1 認証系

#### `POST /auth/login`
- **概要**: ユーザー認証。
- **Request Body**:
  ```json
  {
    "employeeId": "EMP001",
    "password": "SecurePassword123"
  }
  ```
- **Response (Success 200)**: クライアントへ **HttpOnly Cookie** としてJWTを設定し、レスポンスを返却。セッションの有効期限は30分。
  ```json
  {
    "success": true,
    "user": {
      "id": "01907d72-b7b5-7798-8cd3-4927b233a0c2",
      "employeeId": "EMP001",
      "lastName": "大村",
      "firstName": "悠太",
      "role": "ADMIN"
    }
  }
  ```
- **Response (Locked 403)**: アカウントロック状態。
  ```json
  {
    "success": false,
    "error": "ACCOUNT_LOCKED",
    "message": "アカウントがロックされています。管理者に問い合わせてください。"
  }
  ```

---

### 4.2 社員検索・詳細

#### `GET /employees`
- **概要**: 社員情報の検索（AND条件）。
- **Query Parameters**:
  - `lastName` (部分一致)
  - `firstName` (部分一致)
  - `departmentId` (完全一致、UUIDv7値)
  - `locationId` (完全一致、UUIDv7値)
  - `skill` (部分一致またはUUIDv7値のリスト)
  - `credential` (部分一致またはUUIDv7値のリスト)
  - `project` (過去担当プロジェクト名、部分一致)
  - `hobby` (趣味、部分一致)
- **Response (200)**:
  ```json
  {
    "totalCount": 1,
    "results": [
      {
        "id": "01907d72-b7b5-7798-8cd3-4927b233a0c2",
        "employeeId": "EMP001",
        "lastName": "大村",
        "firstName": "悠太",
        "department": "技術開発部",
        "location": "技術センター",
        "position": "チーフエンジニア",
        "email": "yuta.ohmura@example.com"
      }
    ]
  }
  ```

#### `GET /employees/:id`
- **概要**: 社員詳細情報の取得（`:id` は UUIDv7）。
- **Response (200)**:
  ```json
  {
    "id": "01907d72-b7b5-7798-8cd3-4927b233a0c2",
    "employeeId": "EMP001",
    "lastName": "大村",
    "firstName": "悠太",
    "email": "yuta.ohmura@example.com",
    "department": "技術開発部",
    "location": "技術センター",
    "position": "チーフエンジニア",
    "photoUrl": "/images/emp001.jpg",
    "skills": ["React", "TypeScript", "Node.js"],
    "credentials": ["応用情報技術者", "AWS SAP"],
    "experiences": [
      {
        "projectName": "新製品制御システム開発",
        "roleDescription": "リード開発者",
        "startDate": "2025-04-01",
        "endDate": "2026-03-31"
      }
    ],
    "selfPR": "フルスタックでのシステム開発が得意です。",
    "hobbyInfo": "キャンプ、サイクリング",
    "seat": {
      "id": "01907d74-e3ba-7abc-bcde-555555555555",
      "seatCode": "A-12",
      "floor": "3F",
      "x": 250,
      "y": 120
    }
  }
  ```

---

### 4.3 ありがとうメッセージ

#### `POST /messages`
- **概要**: メッセージ送信。
- **Request Body**:
  ```json
  {
    "receiverId": "01907d72-f12a-7abc-bcde-1234567890ab",
    "content": "プロジェクトのサポートありがとうございました！助かりました。"
  }
  ```
- **Response (201)**:
  ```json
  { "success": true, "messageId": "01907d73-12ab-7cde-8901-abcdef012345" }
  ```

#### `GET /messages/latest`
- **概要**: トップページ用の最新メッセージ5件の取得。
- **Response (200)**:
  ```json
  [
    {
      "id": "01907d73-12ab-7cde-8901-abcdef012345",
      "senderId": "01907d72-b7b5-7798-8cd3-4927b233a0c2",
      "senderName": "大村 悠太",
      "receiverId": "01907d72-f12a-7abc-bcde-1234567890ab",
      "receiverName": "青木 大隼",
      "content": "プロジェクトのサポートありがとうございました！",
      "createdAt": "2026-06-29T17:00:00Z"
    }
  ]
  ```

---

### 4.4 管理者機能

#### `POST /admin/employees` (新規登録) / `PUT /admin/employees/:id` (更新) / `DELETE /admin/employees/:id` (削除)
- **概要**: 人事部（管理者）による社員情報の制御。

#### `POST /admin/users/:id/unlock`
- **概要**: 指定した社員のアカウントロックを解除する。失敗回数を0にリセット。

#### `PUT /admin/settings/max-failed-attempts`
- **概要**: ログイン失敗許容回数の変更設定。


---

## 5. Screen & UI Specifications (画面仕様)

すべての画面はレスポンシブWebデザイン（PC、タブレット、スマートフォン）に対応すること。

### 5.1 ログイン画面
- **要素**: 社員ID入力欄、パスワード入力欄、ログインボタン、エラー表示エリア。
- **仕様**:
  - 連続して設定回数（デフォルト5回）ログインに失敗した場合、画面に「アカウントがロックされました。管理者に連絡してください」と表示し、アカウントを `is_locked = TRUE` に設定。

### 5.2 トップ画面
- **要素**:
  1. **社員簡易検索フォーム**: 姓、名、部署、拠点、スキル、資格、役職などによる複合検索。
  2. **ありがとうメッセージタイムライン**: 最新のメッセージ5件をカード形式でフェードイン等のマイクロアニメーションを伴って自然に表示。
- **デザイン要件**:
  - フロンティア精機の「機械・テクノロジー」をイメージした、洗練されたダークモードまたはクリーンなHSLブルーを基調としたモダンなUI。

### 5.3 社員詳細画面
- **要素**:
  - 社員の基本情報、顔写真、スキル/資格タグ、過去プロジェクトのタイムライン表示、自己PR、趣味情報。
  - **「ありがとうを伝える」送信フォーム**: この画面から直接その社員に対してメッセージを送信できるテキストエリアを設置。
  - **「座席を確認する」ボタン**: クリックすると、その社員の座席が強調されたフロアマップ画面へ遷移。

### 5.4 フロアマップ画面
- **要素**:
  - 拠点・フロア選択（例: 本社 1F, 技術センター 3F など）のドロップダウン。
  - フロアマップ画像（SVGまたは背景画像）。
  - **座席強調**: 社員詳細から遷移した場合、または検索から座席を選択した場合、該当社員がアサインされている座席（座席番号とマップ上の座標 `x`, `y`）にピンや波紋のアニメーションを表示し、座席番号と名前をポップアップ表示。

### 5.5 社員・座席管理画面 (管理者のみ)
- **要素**:
  - 全社員の一覧テーブル。検索、編集、削除ボタン。
  - アカウントがロックされているユーザーには「ロック解除」ボタンを表示。
  - 新規社員登録フォーム（顔写真アップロード機能含む）。
  - 設定変更パネル（ログイン試行可能回数の設定）。
  - **座席管理**: 拠点・フロアごとの座席マスタ（座席番号、フロアマップ上の座標 `x`, `y`）を追加・編集・削除できるインターフェース。

---

## 6. Logic & Non-Functional Requirements (ロジック・非機能要件)

### 6.1 セッション管理とセキュリティ
- **認証方式**: 認証トークンには **JWT (JSON Web Token)** を使用します。
  - ログイン成功時、サーバー側でJWT署名を作成し、クライアントへ **HttpOnly, Secure (本番環境のみ), SameSite=Lax** なクッキー（例: `token`）として返却・保持させます。
  - JWTのペイロードには、ユーザー識別用の `id` (UUIDv7)、`login_id`、および権限管理用の `role` を含めます。パスワードなどの機密情報は含めないでください。
  - すべての保護されたAPIリクエストおよび画面遷移時に、Next.jsのミドルウェア (`middleware.ts`) 等でこのCookieのJWTを検証し、未認証や権限不足（管理者機能に一般社員がアクセスするなど）の場合は適切なエラー（401 Unauthorized / 403 Forbidden）またはリダイレクト処理を行います。
- **セッション持続時間 (タイムアウト30分)**:
  - JWTの有効期限は発行から30分とします。最後のアクティブ操作から30分経過した場合は自動的にログアウト（Cookieを削除・失効）させます。
  - アクティブ操作（APIリクエスト等）が行われた際、JWTの残り有効期限が一定未満（例: 残り15分未満）であれば、有効期限を30分に更新した新しいJWTをCookieに再設定するスライディングセッションの仕組みを取り入れること。
- **ロックロジック**:
  - ログイン試行時, 該当ユーザーがすでに `is_locked = TRUE` の場合は即座にエラー。
  - パスワード不一致の場合、`failed_attempts` をインクリメント。
  - `failed_attempts >= max_failed_attempts` に達した瞬間、`is_locked` を `TRUE` にし、`locked_at` を現在時刻に設定する。

### 6.2 検索パフォーマンス
- 社員検索時のインデックス設計（`last_name`, `first_name`, `department_id`, `location_id` へのインデックス付与）。
- 検索実行時は3秒以内に結果を表示すること（フロントエンドでのローディングアニメーションの表示を必須とする）。
