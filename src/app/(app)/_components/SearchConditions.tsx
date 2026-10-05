"use client";

import { useEffect, useState } from "react";
import { getDepartments, getLocations, getPositions } from "@/lib/api";
import type { EmployeeSearchParams, MasterItem } from "@/lib/types";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

interface SearchConditionsProps {
  onSearch: (params: EmployeeSearchParams) => void;
}

/** フォームの初期値（空文字 = 条件なし） */
const EMPTY = {
  lastName: "",
  firstName: "",
  employeeId: "",
  departmentId: "",
  locationId: "",
  positionId: "",
  email: "",
  experience: "",
  project: "",
  skill: "",
  credential: "",
  hobby: "",
};

type FormState = typeof EMPTY;

/**
 * 検索条件フォーム（Figmaデザイン準拠、折りたたみ可能）。
 * 部署・拠点・役職はマスタAPIから選択肢を取得する。
 */
export function SearchConditions({ onSearch }: SearchConditionsProps) {
  const [open, setOpen] = useState(true);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [departments, setDepartments] = useState<MasterItem[]>([]);
  const [locations, setLocations] = useState<MasterItem[]>([]);
  const [positions, setPositions] = useState<MasterItem[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([getDepartments(), getLocations(), getPositions()])
      .then(([d, l, p]) => {
        if (!active) return;
        setDepartments(d);
        setLocations(l);
        setPositions(p);
      })
      .catch(() => {
        /* 選択肢が取れなくてもフォーム自体は使えるようにする */
      });
    return () => {
      active = false;
    };
  }, []);

  const update = (key: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSearch = () => {
    // 空文字は条件から除外して送る
    const params: EmployeeSearchParams = Object.fromEntries(
      Object.entries(form).filter(([, v]) => v !== "")
    );
    onSearch(params);
  };

  const handleClear = () => {
    setForm(EMPTY);
    onSearch({});
  };

  return (
    <section className="rounded-lg border border-input bg-card shadow-card">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-1 items-center gap-3 lg:flex-none">
          <h2 className="text-base whitespace-nowrap">検索条件</h2>
          {/* スマホはヘッダーにボタンを置く（Figma準拠） */}
          <div className="flex flex-1 justify-end gap-2 lg:hidden">
            <Button size="sm" onClick={handleSearch} className="min-w-[96px] font-bold">
              検索する
            </Button>
            <Button size="sm" onClick={handleClear} className="min-w-[96px] font-bold">
              クリア
            </Button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "検索条件を閉じる" : "検索条件を開く"}
          className="flex size-8 items-center justify-center text-muted-foreground"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/icons/caret-down.svg"
            alt=""
            width={12}
            height={12}
            className={cn("size-3 transition-transform", open && "rotate-180")}
          />
        </button>
      </div>

      {open && (
        <div className="border-t border-input px-4 py-4">
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <Field label="姓">
              <TextInput
                value={form.lastName}
                onChange={(v) => update("lastName", v)}
                placeholder="例) 山田"
              />
            </Field>
            <Field label="名">
              <TextInput
                value={form.firstName}
                onChange={(v) => update("firstName", v)}
                placeholder="例) 太郎"
              />
            </Field>
            <Field label="社員ID">
              <TextInput
                value={form.employeeId}
                onChange={(v) => update("employeeId", v)}
                placeholder="例) E00000"
              />
            </Field>
            <Field label="部署">
              <Select
                value={form.departmentId}
                onChange={(v) => update("departmentId", v)}
                options={departments}
              />
            </Field>
            <Field label="拠点">
              <Select
                value={form.locationId}
                onChange={(v) => update("locationId", v)}
                options={locations}
              />
            </Field>
            <Field label="役職">
              <Select
                value={form.positionId}
                onChange={(v) => update("positionId", v)}
                options={positions}
              />
            </Field>
            <Field label="社内メール">
              <TextInput
                value={form.email}
                onChange={(v) => update("email", v)}
                placeholder="例) taro.yamaga@company.co.jp"
              />
            </Field>
            <Field label="業務経験">
              <TextInput
                value={form.experience}
                onChange={(v) => update("experience", v)}
                placeholder="例) 要件定義、設計"
              />
            </Field>
            <Field label="過去担当プロジェクト" className="xl:col-span-2">
              <TextInput
                value={form.project}
                onChange={(v) => update("project", v)}
                placeholder="例) 基幹システム刷新プロジェクト"
              />
            </Field>
            <Field label="スキル">
              <TextInput
                value={form.skill}
                onChange={(v) => update("skill", v)}
                placeholder="例) Java、 Python"
              />
            </Field>
            <Field label="資格">
              <TextInput
                value={form.credential}
                onChange={(v) => update("credential", v)}
                placeholder="例) 基本情報技術者試験"
              />
            </Field>
            <Field label="趣味情報">
              <TextInput
                value={form.hobby}
                onChange={(v) => update("hobby", v)}
                placeholder="例) ランニング、旅行"
              />
            </Field>
          </div>

          {/* PCは下部にボタン */}
          <div className="mt-5 hidden justify-end gap-3 lg:flex">
            <Button onClick={handleClear} variant="outline" className="min-w-[120px] font-bold">
              クリア
            </Button>
            <Button onClick={handleSearch} className="min-w-[120px] font-bold shadow-card">
              検索する
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-2.5", className)}>
      <span className="text-xs">{label}</span>
      {children}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-input px-2.5 py-2.5 text-[10px] placeholder:text-black/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    />
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: MasterItem[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2.5 text-[10px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <option value="">選択してください</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
