/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/utils";

export interface AvatarProps {
  src?: string | null;
  /** 画像が無い場合に表示するイニシャルの元（姓名など） */
  name: string;
  className?: string;
  size?: number;
}

/** 顔写真アバター。画像URLが無ければ頭文字のフォールバックを表示する。 */
export function Avatar({ src, name, className, size = 40 }: AvatarProps) {
  const initial = name.trim().charAt(0) || "?";
  const dimension = { width: size, height: size };

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        style={dimension}
        className={cn("rounded-full border border-border object-cover", className)}
      />
    );
  }

  return (
    <span
      style={dimension}
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-primary/10 font-semibold text-primary",
        className
      )}
      aria-label={name}
    >
      {initial}
    </span>
  );
}
