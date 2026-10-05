"use client";

import Link from "next/link";
import type { EmployeeSummary } from "@/lib/types";
import { LoadingOverlay } from "@/components/ui";
import { cn } from "@/lib/utils";

interface SearchResultsProps {
  results: EmployeeSummary[];
  totalCount: number;
  loading: boolean;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
}

const LIMIT_OPTIONS = [6, 10, 20, 50];

/**
 * 検索結果テーブル（Figmaデザイン準拠）。
 * PC: 社員ID / 氏名 / 部署 / 役職 / 拠点 / 主なスキル / 資格
 * スマホ: 社員ID / 氏名 / 部署 の3列に省略
 * 仕様書 6.2 によりローディング表示を必須とする。
 */
export function SearchResults({
  results,
  totalCount,
  loading,
  page,
  limit,
  onPageChange,
  onLimitChange,
}: SearchResultsProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  // 実APIが page / limit を無視して全件返す場合に備え、クライアント側でも切り出す
  const rows = results.length > limit ? results.slice((page - 1) * limit, page * limit) : results;

  return (
    <section className="rounded-lg border border-input bg-card shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 lg:px-5">
        <div className="flex items-center gap-5">
          <h2 className="text-[15px]">検索結果</h2>
          <span className="text-xs text-black/50">{totalCount}件</span>
        </div>
        <div className="flex items-center gap-4 lg:gap-[30px]">
          <label className="flex items-center gap-1 text-xs">
            表示件数：
            <select
              value={limit}
              onChange={(e) => onLimitChange(Number(e.target.value))}
              className="rounded-[5px] border border-input bg-transparent py-1.5 pr-1 pl-2.5 text-[10px]"
            >
              {LIMIT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}件
                </option>
              ))}
            </select>
          </label>
          <Pagination page={page} totalPages={totalPages} onChange={onPageChange} compact />
        </div>
      </div>

      {loading ? (
        <div className="border-t border-input">
          <LoadingOverlay label="検索中" />
        </div>
      ) : rows.length === 0 ? (
        <p className="border-t border-input px-5 py-10 text-center text-sm text-muted-foreground">
          条件に一致する社員が見つかりませんでした。
        </p>
      ) : (
        <>
          {/* PC: フル列のテーブル */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-y border-input bg-skill-bg text-left">
                  <Th className="w-[110px]">社員ID</Th>
                  <Th className="w-[180px]">氏名</Th>
                  <Th className="w-[150px]">部署</Th>
                  <Th className="w-[90px]">役職</Th>
                  <Th className="w-[110px]">拠点</Th>
                  <Th>主なスキル</Th>
                  <Th className="w-[230px]">資格</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="h-[60px] border-b border-input">
                    <Td>{e.employeeId}</Td>
                    <Td>
                      <Link
                        href={`/employees/${e.id}`}
                        className="flex items-center gap-2.5 hover:underline"
                      >
                        <span
                          className="h-[34px] w-[40px] shrink-0 rounded-[5px] bg-[#d9d9d9]"
                          aria-hidden
                        />
                        <span>
                          {e.lastName}　{e.firstName}
                        </span>
                      </Link>
                    </Td>
                    <Td className="text-[10px] whitespace-pre-line">{e.department ?? "-"}</Td>
                    <Td className="text-xs">{e.position ?? "-"}</Td>
                    <Td className="text-xs">{e.location ?? "-"}</Td>
                    <Td>
                      <SkillTags skills={e.skills} />
                    </Td>
                    <Td className="text-[10px] leading-relaxed">
                      {(e.credentials ?? []).length === 0
                        ? "-"
                        : (e.credentials ?? []).map((c) => <div key={c}>{c}</div>)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* スマホ: 3列に省略 */}
          <div className="overflow-x-auto lg:hidden">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-y border-input bg-skill-bg text-left">
                  <Th>社員ID</Th>
                  <Th>氏名</Th>
                  <Th>部署</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="border-b border-input">
                    <Td className="text-xs">{e.employeeId}</Td>
                    <Td>
                      <Link
                        href={`/employees/${e.id}`}
                        className="flex items-center gap-2 hover:underline"
                      >
                        <span
                          className="h-[34px] w-[40px] shrink-0 rounded-[5px] bg-[#d9d9d9]"
                          aria-hidden
                        />
                        <span className="text-xs">
                          {e.lastName}　{e.firstName}
                        </span>
                      </Link>
                    </Td>
                    <Td className="text-[10px] whitespace-pre-line">{e.department ?? "-"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-center py-4">
            <Pagination page={page} totalPages={totalPages} onChange={onPageChange} />
          </div>
        </>
      )}
    </section>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn("px-3 py-2.5 text-sm font-normal", className)}>{children}</th>;
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-3 py-2 align-middle", className)}>{children}</td>;
}

/** スキルタグ。4件以上は「…」で省略（Figma準拠） */
function SkillTags({ skills }: { skills?: string[] }) {
  const list = skills ?? [];
  if (list.length === 0) return <span className="text-xs">-</span>;
  const shown = list.slice(0, 3);
  return (
    <span className="flex flex-wrap items-center gap-2.5">
      {shown.map((s) => (
        <span
          key={s}
          className="rounded-[5px] bg-skill-bg px-2.5 py-1.5 text-xs font-bold text-skill-text"
        >
          {s}
        </span>
      ))}
      {list.length > shown.length && <span className="text-xs text-muted-foreground">…</span>}
    </span>
  );
}

/** 書き出しSVGのキャレット。next=true で右向きに反転させる。 */
function Caret({ next = false }: { next?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/images/icons/caret-left.svg"
      alt=""
      width={16}
      height={16}
      className={cn("size-4", next && "rotate-180")}
    />
  );
}

function Pagination({
  page,
  totalPages,
  onChange,
  compact = false,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
  compact?: boolean;
}) {
  const btn =
    "flex size-6 items-center justify-center rounded-[5px] border border-input text-sm disabled:opacity-40";

  if (compact) {
    return (
      <div className="flex items-center gap-[3px]">
        <button
          type="button"
          className={btn}
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          aria-label="前のページ"
        >
          <Caret />
        </button>
        <span className="flex size-6 items-center justify-center rounded-[5px] bg-primary text-sm text-primary-foreground">
          {page}
        </span>
        <span className="px-0.5 text-xs text-muted-foreground">/</span>
        <span className="flex size-6 items-center justify-center rounded-[5px] border border-input text-sm">
          {totalPages}
        </span>
        <button
          type="button"
          className={btn}
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="次のページ"
        >
          <Caret next />
        </button>
      </div>
    );
  }

  // ページ番号を省略付きで組み立てる（1 2 3 4 5 … 最終）
  const pages: Array<number | "ellipsis"> = [];
  const maxShown = 5;
  if (totalPages <= maxShown + 1) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    for (let i = 1; i <= maxShown; i++) pages.push(i);
    pages.push("ellipsis");
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center gap-[5px]">
      <button
        type="button"
        className={btn}
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="前のページ"
      >
        <Caret />
      </button>
      {pages.map((p, i) =>
        p === "ellipsis" ? (
          <span key={`e-${i}`} className="px-1 text-xs text-muted-foreground">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === page ? "page" : undefined}
            className={cn(
              "flex size-6 items-center justify-center rounded-[5px] border text-sm",
              p === page
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-card"
            )}
          >
            {p}
          </button>
        )
      )}
      <button
        type="button"
        className={btn}
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="次のページ"
      >
        <Caret next />
      </button>
    </div>
  );
}
