// @vitest-environment jsdom
/**
 * 仕様: AI_SPECIFICATION.md 5.1「ログイン画面」, 4.1「POST /auth/login」
 * サーバー側のロック判定は auth-login.test.ts で確認済み。
 * ここでは「APIが仕様どおりのレスポンスを返したとき、画面が仕様どおりに表示するか」を確認する。
 */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ImgHTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "@/app/login/page";
import { AuthProvider } from "@/lib/auth-context";

// Next.js 専用の部品は jsdom では動かないので、最低限の代役に差し替える
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("next/image", () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) => {
    const { fill, alt = "", ...rest } = props;
    void fill; // next/image 専用の属性なので <img> には渡さない
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt} {...rest} />;
  },
}));

/** 仕様 4.1 のレスポンス */
const LOCKED_403 = {
  success: false,
  error: "ACCOUNT_LOCKED",
  message: "アカウントがロックされています。管理者に問い合わせてください。",
};

const fetchMock = vi.fn();
// 画面は「実APIモード」(NEXT_PUBLIC_USE_MOCK=false, vitest.config.mts で設定) で動かし、
// サーバーの代わりに fetch を差し替えて仕様 4.1 のレスポンスを返す
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

function renderPage() {
  render(
    <AuthProvider>
      <LoginPage />
    </AuthProvider>
  );
  const user = userEvent.setup();
  return {
    user,
    async submit(employeeId: string, password: string) {
      await user.type(screen.getByLabelText("社員ID"), employeeId);
      await user.type(screen.getByLabelText("パスワード"), password);
      await user.click(screen.getByRole("button", { name: "ログイン" }));
    },
  };
}

describe("[5.1] ログイン画面の要素", () => {
  it("社員ID入力欄がある", () => {
    renderPage();
    expect(screen.getByLabelText("社員ID")).toBeInstanceOf(HTMLInputElement);
  });

  it("パスワード入力欄があり、入力内容が見えない（type=password）", () => {
    renderPage();
    expect(screen.getByLabelText("パスワード")).toHaveProperty("type", "password");
  });

  it("ログインボタンがある", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "ログイン" })).toBeTruthy();
  });
});

describe("[5.1][4.1] ログイン操作", () => {
  it("入力した社員ID・パスワードを POST /api/v1/auth/login に JSON で送る", async () => {
    respond(200, {
      success: true,
      user: { id: "x", employeeId: "EMP001", lastName: "大村", firstName: "悠太", role: "ADMIN" },
    });
    const { submit } = renderPage();
    await submit("EMP001", "SecurePassword123");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/auth/login");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ employeeId: "EMP001", password: "SecurePassword123" });
  });

  it("ログインに失敗したら、エラー表示エリアにエラーが表示される", async () => {
    respond(401, {
      success: false,
      error: "INVALID_CREDENTIALS",
      message: "社員IDまたはパスワードが正しくありません。",
    });
    const { submit } = renderPage();
    await submit("EMP001", "wrong");
    expect(await screen.findByText("社員IDまたはパスワードが正しくありません。")).toBeTruthy();
  });

  it("アカウントがロックされたら「アカウントがロックされました。管理者に連絡してください」と表示する", async () => {
    respond(403, LOCKED_403);
    const { submit } = renderPage();
    await submit("EMP001", "wrong");
    expect(
      await screen.findByText(/アカウントがロックされました。管理者に連絡してください/)
    ).toBeTruthy();
  });
});
