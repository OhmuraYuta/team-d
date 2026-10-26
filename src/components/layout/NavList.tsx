"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, type NavItem } from "./nav-items";

interface NavListProps {
  /** 項目クリック時に呼ぶ（スマホのドロワーを閉じる用途） */
  onNavigate?: () => void;
  items?: NavItem[];
}

/**
 * ナビゲーション項目のリスト。PCサイドバーとスマホのドロワーで共通利用する。
 * 1行50px・アイコン16px・ラベル14px medium、選択中は背景 --sidebar-active（Figma準拠）。
 */
export function NavList({ onNavigate, items = NAV_ITEMS }: NavListProps) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col">
      {items.map((item) => {
        const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex h-[50px] items-center gap-3 px-5 text-sm font-medium text-white transition",
              isActive ? "bg-sidebar-active" : "hover:bg-sidebar-active/60"
            )}
          >
            <img src={item.icon} alt="" width={16} height={16} className="size-4 shrink-0" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
