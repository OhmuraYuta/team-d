import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";

// ログイン後の画面はすべてこのシェル（サイドバー / ハンバーガー）の中に入る。
// /login はこのグループの外にあるためシェルは適用されない。
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
