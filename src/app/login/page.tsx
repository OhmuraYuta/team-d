"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button, Field, Input } from "@/components/ui";
import { login } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ResultModal } from "./_components/ResultModal";

type ModalState = { type: "success" } | { type: "error"; message: string } | null;

/**
 * ログイン画面（Figma 03-01 / 03-02 / 03-03 準拠）。
 * PC（lg以上）: 左に斜めカットの建物写真+ロゴ、右にログインカード。
 * スマホ（lg未満）: ヒーローを隠し、中央にカードのみ。
 * 認証はモックAPI（login）+ 認証コンテキスト（useAuth）に接続。
 */
export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await login({ employeeId, password });
      if (res.success) {
        signIn(res.user);
        setModal({ type: "success" });
      } else {
        setModal({ type: "error", message: res.message });
      }
    } catch {
      setModal({
        type: "error",
        message: "通信エラーが発生しました。時間をおいて再度お試しください。",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 lg:justify-end lg:px-0 lg:pr-[9%]">
      {/* 左：ヒーロー（PCのみ）。斜めカットは clip-path で表現し、写真はそのまま使用 */}
      <div
        className="absolute inset-y-0 left-0 hidden w-[56%] lg:block"
        style={{ clipPath: "polygon(0 0, 100% 0, 82% 100%, 0 100%)" }}
        aria-hidden
      >
        <Image src="/images/login/building.png" alt="" fill sizes="56vw" className="object-cover" />
        <div className="absolute top-1/2 left-[6%] w-[62%] max-w-[520px] -translate-y-1/2">
          <Image
            src="/images/logo.png"
            alt="社員情報活用システム"
            width={673}
            height={132}
            className="h-auto w-full"
          />
        </div>
      </div>

      {/* 右：ログインカード */}
      <div className="relative z-10 w-full max-w-[360px] lg:max-w-[440px]">
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-6 rounded-lg bg-card px-8 py-10 shadow-card sm:px-10"
        >
          <h1 className="text-center text-2xl font-medium text-foreground">ログイン</h1>

          <div className="flex flex-col gap-4">
            <Field label="社員ID" htmlFor="employeeId">
              <Input
                id="employeeId"
                name="employeeId"
                autoComplete="username"
                placeholder="社員IDを入力してください"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                required
              />
            </Field>
            <Field label="パスワード" htmlFor="password">
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="パスワードを入力してください"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
          </div>

          <div className="flex justify-center pt-2">
            <Button
              type="submit"
              isLoading={submitting}
              className="w-full max-w-[250px] font-bold shadow-card"
            >
              ログイン
            </Button>
          </div>
        </form>
      </div>

      {/* 結果モーダル */}
      {modal?.type === "success" && (
        <ResultModal
          variant="success"
          title="ログイン成功"
          message="ログインに成功しました。"
          actionLabel="次へ"
          onAction={() => router.push("/")}
        />
      )}
      {modal?.type === "error" && (
        <ResultModal
          variant="error"
          title="エラー"
          message={modal.message}
          actionLabel="戻る"
          onAction={() => setModal(null)}
        />
      )}
    </main>
  );
}
