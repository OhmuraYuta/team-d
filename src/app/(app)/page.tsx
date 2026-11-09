"use client";

import { useCallback, useEffect, useState } from "react";
import { searchEmployees } from "@/lib/api";
import type { EmployeeSearchParams, EmployeeSummary } from "@/lib/types";
import { ThankYouMessages } from "./_components/ThankYouMessages";
import { SearchConditions } from "./_components/SearchConditions";
import { SearchResults } from "./_components/SearchResults";

/**
 * トップ画面（AI_SPECIFICATION.md 5.2 / Figma「04-01 トップ」準拠）。
 * ありがとうメッセージ + 社員検索フォーム + 検索結果。
 */
export default function TopPage() {
  const [params, setParams] = useState<EmployeeSearchParams>({});
  const [results, setResults] = useState<EmployeeSummary[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(6);

  const runSearch = useCallback(
    async (searchParams: EmployeeSearchParams, nextPage: number, nextLimit: number) => {
      setLoading(true);
      try {
        const res = await searchEmployees({ ...searchParams, page: nextPage, limit: nextLimit });
        setResults(res.results);
        setTotalCount(res.totalCount);
      } catch {
        setResults([]);
        setTotalCount(0);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // 初回表示 + 条件・ページ・表示件数の変更時に検索する。
  // 外部（API）との同期なので effect が適切。runSearch 内の setLoading が
  // 同期的な setState と判定されるが、意図した取得処理のためルールを無効化する。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void runSearch(params, page, limit);
  }, [params, page, limit, runSearch]);

  const handleSearch = (next: EmployeeSearchParams) => {
    setPage(1); // 条件を変えたら1ページ目に戻す
    setParams(next);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <ThankYouMessages />
      <SearchConditions onSearch={handleSearch} />
      <SearchResults
        results={results}
        totalCount={totalCount}
        loading={loading}
        page={page}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={(n) => {
          setLimit(n);
          setPage(1);
        }}
      />
    </div>
  );
}
