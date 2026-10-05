import { Badge, Card, CardContent } from "@/components/ui";
import { USE_MOCK } from "@/lib/api/client";

// 暫定のランディング（プレースホルダ）。
// 本来のトップ画面（社員検索フォーム + ありがとうメッセージタイムライン）は
// feature/top-screen ブランチ（6.1.2）で実装する。
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-4 py-16">
      <div className="text-center">
        <p className="text-sm font-semibold tracking-wide text-primary">フロンティア精機</p>
        <h1 className="mt-2 text-3xl font-bold text-foreground sm:text-4xl">
          社員情報活用システム
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          社員検索・詳細閲覧、座席フロア表示、ありがとうメッセージ送信のための社内ポータル。
        </p>
      </div>

      <Card className="w-full">
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">フロントエンド基盤</span>
            <Badge variant="success">準備完了</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">API接続モード</span>
            <Badge variant={USE_MOCK ? "accent" : "primary"}>{USE_MOCK ? "モック" : "実API"}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            各画面（ログイン / トップ / 社員詳細 / フロアマップ /
            座席管理）は個別ブランチで実装します。
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
