import { cn } from "@/lib/utils";

export interface SpinnerProps {
  className?: string;
  /** スクリーンリーダー向けラベル */
  label?: string;
}

/** ローディング表示（仕様書 6.2: 検索時のローディングアニメーション必須）。 */
export function Spinner({ className, label = "読み込み中" }: SpinnerProps) {
  return (
    <span role="status" aria-live="polite">
      <span
        className={cn(
          "inline-block size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary",
          className
        )}
        aria-hidden
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** 画面中央にスピナーを出す全面ローディング。 */
export function LoadingOverlay({ label }: { label?: string }) {
  return (
    <div className="flex w-full items-center justify-center py-16">
      <Spinner className="size-8" label={label} />
    </div>
  );
}
