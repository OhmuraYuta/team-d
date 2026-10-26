// アプリ共通のナビゲーション定義。PCサイドバーとスマホのドロワーで共有する。
// Figmaデザイン（トップ画面のサイドバー / スマホのハンバーガーメニュー）準拠。

export interface NavItem {
  label: string;
  href: string;
  /** public 配下の書き出しアイコン（白） */
  icon: string;
  /** 管理者のみ表示する項目か（AI_SPECIFICATION.md 2. ロールと権限） */
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "ホーム", href: "/", icon: "/images/icons/nav-home.svg" },
  { label: "社員検索", href: "/employees", icon: "/images/icons/nav-search.svg" },
  { label: "フロアマップ", href: "/floor-map", icon: "/images/icons/nav-floormap.svg" },
  { label: "管理者メニュー", href: "/admin", icon: "/images/icons/nav-admin.svg", adminOnly: true },
];
