/** Tailwind クラス名を条件付きで結合する軽量ヘルパー（依存追加なし）。 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/** 社員のフルネーム（姓 名）を組み立てる。 */
export function fullName(lastName: string, firstName: string): string {
  return `${lastName} ${firstName}`;
}
