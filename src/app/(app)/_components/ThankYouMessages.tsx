"use client";

import { useEffect, useState } from "react";
import { getLatestMessages } from "@/lib/api";
import type { ThankYouMessage } from "@/lib/types";
import { Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * ありがとうメッセージ（AI_SPECIFICATION.md 5.2 / Figmaデザイン準拠）。
 * PC: 最新5件を横並びのセルで表示。スマホ: 1件ずつ + ドットインジケータ。
 * 仕様書どおりフェードインのマイクロアニメーションを伴って表示する。
 */
export function ThankYouMessages() {
  const [messages, setMessages] = useState<ThankYouMessage[] | null>(null);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    let active = true;
    getLatestMessages()
      .then((list) => {
        if (active) setMessages(list);
      })
      .catch(() => {
        if (active) setMessages([]);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="rounded-lg border border-input bg-card shadow-card">
      <div className="flex items-center justify-between px-3 py-2.5">
        <h2 className="text-base">ありがとうメッセージ</h2>
        <span className="text-xs">表示件数：{messages?.length ?? 5}件</span>
      </div>

      {messages === null ? (
        <div className="flex h-[52px] items-center justify-center border-t border-input">
          <Spinner className="size-5" label="メッセージを読み込み中" />
        </div>
      ) : messages.length === 0 ? (
        <p className="border-t border-input px-3 py-4 text-xs text-muted-foreground">
          まだメッセージがありません。
        </p>
      ) : (
        <>
          {/* PC: 横並び */}
          <ul className="hidden border-t border-input lg:flex">
            {messages.map((m) => (
              <li
                key={m.id}
                className="flex h-[52px] flex-1 animate-fade-in items-center justify-center gap-5 border-r border-input px-2 last:border-r-0"
              >
                <MessageCell message={m} />
              </li>
            ))}
          </ul>

          {/* スマホ: 1件ずつ + ドット */}
          <div className="border-t border-input lg:hidden">
            <div
              className="flex h-[64px] animate-fade-in items-center gap-5 px-4"
              key={messages[current]?.id}
            >
              <MessageCell message={messages[current]} />
            </div>
            <div className="flex items-center justify-center gap-2 pb-2.5">
              {messages.map((m, i) => (
                <button
                  key={m.id}
                  type="button"
                  aria-label={`${i + 1}件目のメッセージを表示`}
                  aria-current={i === current}
                  onClick={() => setCurrent(i)}
                  className={cn(
                    "size-2 rounded-full transition",
                    i === current ? "bg-primary" : "bg-input"
                  )}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function MessageCell({ message }: { message: ThankYouMessage }) {
  return (
    <>
      <div className="flex shrink-0 items-center gap-2.5">
        <span className="h-[43px] w-[50px] shrink-0 rounded-[5px] bg-[#d9d9d9]" aria-hidden />
        <span className="text-[10px] whitespace-nowrap">{message.senderName}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10px]">{message.receiverName}へ</p>
        <p className="truncate text-[8px] text-muted-foreground">{message.content}</p>
      </div>
    </>
  );
}
