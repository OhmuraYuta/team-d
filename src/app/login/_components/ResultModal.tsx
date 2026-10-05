"use client";

import { Button } from "@/components/ui";

interface ResultModalProps {
  variant: "success" | "error";
  title: string;
  message: string;
  actionLabel: string;
  onAction: () => void;
}

/**
 * ログイン結果モーダル（成功 / エラー共通）。
 * Figma 03-02（成功）・03-03（エラー）準拠。アイコンは書き出しSVGを使用。
 */
export function ResultModal({ variant, title, message, actionLabel, onAction }: ResultModalProps) {
  const icon =
    variant === "success" ? "/images/login/icon-success.svg" : "/images/login/icon-error.svg";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
    >
      <div className="flex w-full max-w-[440px] flex-col items-center gap-4 rounded-lg bg-card px-8 py-12 text-center shadow-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={icon} alt="" width={72} height={72} className="size-[72px]" />
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-medium text-foreground">{title}</h2>
          <p className="text-sm leading-relaxed text-foreground">{message}</p>
        </div>
        <Button onClick={onAction} className="mt-2 w-full max-w-[300px] font-bold shadow-card">
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}
