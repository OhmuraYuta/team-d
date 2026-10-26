"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { NavList } from "./NavList";
import { NavDrawer } from "./NavDrawer";

/**
 * アプリ共通のシェル（Figmaデザイン準拠）。
 * - 上部バー（紺 #1A2B4A / 高さ51px）: 左にロゴ、スマホのみ右にハンバーガー
 * - PC（lg以上）: 左に幅200pxの固定サイドバー
 * - スマホ（lg未満）: サイドバーは隠し、ハンバーガーからドロワーを開く
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* 上部バー */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-[51px] items-center justify-between bg-sidebar pr-2 pl-[10px]">
        <Link href="/" className="flex items-center" aria-label="ホームへ">
          <img
            src="/images/logo.png"
            alt="社員情報活用システム"
            className="h-[38px] w-auto sm:h-[42px]"
          />
        </Link>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="メニューを開く"
          aria-expanded={drawerOpen}
          className="flex size-11 flex-col items-center justify-center gap-[5px] lg:hidden"
        >
          <span className="block h-[2px] w-6 bg-white" />
          <span className="block h-[2px] w-6 bg-white" />
          <span className="block h-[2px] w-6 bg-white" />
        </button>
      </header>

      {/* PCサイドバー */}
      <aside className="fixed inset-y-0 top-[51px] left-0 z-30 hidden w-[200px] bg-sidebar lg:block">
        <NavList />
      </aside>

      {/* スマホ用ドロワー */}
      <NavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* メイン */}
      <main className="flex-1 pt-[51px] lg:pl-[200px]">
        <div className="mx-auto w-full max-w-[1260px] px-4 py-5 lg:px-8 lg:py-6">{children}</div>
      </main>
    </div>
  );
}
