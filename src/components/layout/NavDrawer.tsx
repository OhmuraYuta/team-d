"use client";

import { useEffect } from "react";
import { NavList } from "./NavList";

interface NavDrawerProps {
  open: boolean;
  onClose: () => void;
}

/**
 * スマホ用のナビゲーションドロワー（Figma「ハンバーガーメニュー」準拠）。
 * 右からスライドインする紺色のパネル。左側の余白をタップでも閉じられる。
 */
export function NavDrawer({ open, onClose }: NavDrawerProps) {
  // ドロワー表示中は背面のスクロールを止める
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Escape で閉じる
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        aria-label="メニューを閉じる"
        onClick={onClose}
        className="absolute inset-0 bg-black/20"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="メニュー"
        className="absolute inset-y-0 right-0 flex w-1/2 min-w-[200px] flex-col bg-sidebar shadow-card"
      >
        <div className="flex h-[51px] items-center justify-end px-4">
          <button
            type="button"
            onClick={onClose}
            aria-label="メニューを閉じる"
            className="flex size-10 items-center justify-center text-2xl text-white"
          >
            ×
          </button>
        </div>
        <NavList onNavigate={onClose} />
      </div>
    </div>
  );
}
