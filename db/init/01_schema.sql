-- フロンティア精機 社員情報活用システム DBスキーマ
-- AI_SPECIFICATION.md 「3. Database Schema」の DDL に準拠
-- ID はすべて UUIDv7（アプリケーション側で生成）

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
    seat_id UUID UNIQUE, -- 外部キー (1席1人想定)

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

-- 検索パフォーマンス用インデックス (AI_SPECIFICATION.md 6.2)
CREATE INDEX idx_employees_last_name ON employees (last_name);
CREATE INDEX idx_employees_first_name ON employees (first_name);
CREATE INDEX idx_employees_department_id ON employees (department_id);
CREATE INDEX idx_employees_location_id ON employees (location_id);
