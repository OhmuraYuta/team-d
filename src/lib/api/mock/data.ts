// フロントエンド開発用のモックデータ。
// 形は AI_SPECIFICATION.md のレスポンス例に準拠。ID は仕様どおり UUIDv7 で生成する。
// （実APIが揃うまでの暫定データ。バックエンドのシードとは独立。）

import { uuidv7 } from "uuidv7";
import type { EmployeeExperience, MasterItem, Role, Seat } from "@/lib/types";

// ---- マスタ ----
export const mockDepartments: MasterItem[] = [
  { id: uuidv7(), name: "技術開発部" },
  { id: uuidv7(), name: "営業部" },
  { id: uuidv7(), name: "人事部" },
  { id: uuidv7(), name: "製造部" },
];

export const mockLocations: MasterItem[] = [
  { id: uuidv7(), name: "本社" },
  { id: uuidv7(), name: "技術センター" },
];

export const mockPositions: MasterItem[] = [
  { id: uuidv7(), name: "部長" },
  { id: uuidv7(), name: "チーフエンジニア" },
  { id: uuidv7(), name: "主任" },
  { id: uuidv7(), name: "エンジニア" },
  { id: uuidv7(), name: "一般" },
];

// 拠点IDを引きやすいよう別名を用意
const [honsha, techCenter] = mockLocations;

// ---- 座席（拠点・フロアごと） ----
export interface MockSeat extends Seat {
  locationId: string;
}

export const mockSeats: MockSeat[] = [
  { id: uuidv7(), locationId: techCenter.id, floor: "3F", seatCode: "A-12", x: 25, y: 20 },
  { id: uuidv7(), locationId: techCenter.id, floor: "3F", seatCode: "A-13", x: 35, y: 20 },
  { id: uuidv7(), locationId: techCenter.id, floor: "3F", seatCode: "B-01", x: 60, y: 45 },
  { id: uuidv7(), locationId: honsha.id, floor: "1F", seatCode: "C-05", x: 40, y: 60 },
  { id: uuidv7(), locationId: honsha.id, floor: "2F", seatCode: "D-08", x: 70, y: 30 },
];

// ---- 社員（内部的なリッチレコード。ここから各レスポンス形を組み立てる） ----
export interface MockEmployee {
  id: string;
  employeeId: string;
  password: string; // モック認証用（実DBには平文を持たない）
  lastName: string;
  firstName: string;
  email: string;
  role: Role;
  isLocked: boolean;
  failedAttempts: number;
  departmentId: string | null;
  locationId: string | null;
  positionId: string | null;
  seatId: string | null;
  photoUrl: string | null;
  selfPR: string | null;
  hobbyInfo: string | null;
  skills: string[];
  credentials: string[];
  experiences: EmployeeExperience[];
}

export const mockEmployees: MockEmployee[] = [
  {
    id: uuidv7(),
    employeeId: "EMP001",
    password: "SecurePassword123",
    lastName: "大村",
    firstName: "悠太",
    email: "yuta.ohmura@example.com",
    role: "ADMIN",
    isLocked: false,
    failedAttempts: 0,
    departmentId: mockDepartments[0].id,
    locationId: techCenter.id,
    positionId: mockPositions[1].id,
    seatId: mockSeats[0].id,
    photoUrl: null,
    selfPR: "フルスタックでのシステム開発が得意です。",
    hobbyInfo: "キャンプ、サイクリング",
    skills: ["React", "TypeScript", "Node.js"],
    credentials: ["応用情報技術者", "AWS SAP"],
    experiences: [
      {
        projectName: "新製品制御システム開発",
        roleDescription: "リード開発者",
        startDate: "2025-04-01",
        endDate: "2026-03-31",
      },
      {
        projectName: "社内ポータル刷新",
        roleDescription: "アーキテクト",
        startDate: "2024-04-01",
        endDate: "2025-03-31",
      },
    ],
  },
  {
    id: uuidv7(),
    employeeId: "EMP002",
    password: "SecurePassword123",
    lastName: "青木",
    firstName: "大隼",
    email: "hayato.aoki@example.com",
    role: "EMPLOYEE",
    isLocked: false,
    failedAttempts: 0,
    departmentId: mockDepartments[0].id,
    locationId: techCenter.id,
    positionId: mockPositions[3].id,
    seatId: mockSeats[1].id,
    photoUrl: null,
    selfPR: "組み込みからWebまで幅広く対応します。",
    hobbyInfo: "登山、写真",
    skills: ["C++", "Python", "組み込み"],
    credentials: ["基本情報技術者"],
    experiences: [
      {
        projectName: "センサー制御ファームウェア開発",
        roleDescription: "開発担当",
        startDate: "2025-01-01",
        endDate: null,
      },
    ],
  },
  {
    id: uuidv7(),
    employeeId: "EMP003",
    password: "SecurePassword123",
    lastName: "佐藤",
    firstName: "美咲",
    email: "misaki.sato@example.com",
    role: "EMPLOYEE",
    isLocked: false,
    failedAttempts: 0,
    departmentId: mockDepartments[1].id,
    locationId: honsha.id,
    positionId: mockPositions[2].id,
    seatId: mockSeats[3].id,
    photoUrl: null,
    selfPR: "顧客折衝と提案が得意です。",
    hobbyInfo: "ヨガ、料理",
    skills: ["提案営業", "折衝"],
    credentials: ["普通自動車免許"],
    experiences: [
      {
        projectName: "大手製造業向け導入提案",
        roleDescription: "営業担当",
        startDate: "2024-07-01",
        endDate: "2025-06-30",
      },
    ],
  },
  {
    id: uuidv7(),
    employeeId: "EMP004",
    password: "SecurePassword123",
    lastName: "田中",
    firstName: "健",
    email: "ken.tanaka@example.com",
    role: "EMPLOYEE",
    isLocked: false,
    failedAttempts: 0,
    departmentId: mockDepartments[3].id,
    locationId: honsha.id,
    positionId: mockPositions[4].id,
    seatId: mockSeats[4].id,
    photoUrl: null,
    selfPR: "製造ラインの改善に取り組んでいます。",
    hobbyInfo: "釣り",
    skills: ["生産管理", "品質管理"],
    credentials: ["QC検定2級"],
    experiences: [],
  },
  {
    id: uuidv7(),
    employeeId: "EMP005",
    password: "SecurePassword123",
    lastName: "鈴木",
    firstName: "陽子",
    email: "yoko.suzuki@example.com",
    role: "EMPLOYEE",
    isLocked: true, // ロック済みアカウントの例（管理画面のロック解除UI検証用）
    failedAttempts: 5,
    departmentId: mockDepartments[2].id,
    locationId: honsha.id,
    positionId: mockPositions[0].id,
    seatId: null,
    photoUrl: null,
    selfPR: "人事制度の企画を担当しています。",
    hobbyInfo: "読書",
    skills: ["労務", "採用"],
    credentials: ["社会保険労務士"],
    experiences: [],
  },
];

// ---- ルックアップ用マップ ----
export const departmentById = new Map(mockDepartments.map((d) => [d.id, d]));
export const locationById = new Map(mockLocations.map((l) => [l.id, l]));
export const positionById = new Map(mockPositions.map((p) => [p.id, p]));
export const seatById = new Map<string, MockSeat>(mockSeats.map((s) => [s.id, s]));
