// ありがとうメッセージAPI（AI_SPECIFICATION.md 4.3）
import type { SendMessageRequest, SendMessageResponse, ThankYouMessage } from "@/lib/types";
import { apiFetch, withMock } from "./client";
import { mockGetLatestMessages, mockSendMessage } from "./mock/handlers";

/** GET /messages/latest （トップページ用の最新5件） */
export async function getLatestMessages(): Promise<ThankYouMessage[]> {
  return withMock(
    () => mockGetLatestMessages(),
    () => apiFetch<ThankYouMessage[]>("/messages/latest")
  );
}

/**
 * POST /messages
 * @param senderId 送信者ID。モック時のみ使用（実APIでは Cookie の JWT から送信者を特定するため無視される）。
 */
export async function sendMessage(
  req: SendMessageRequest,
  senderId?: string
): Promise<SendMessageResponse> {
  return withMock(
    () => mockSendMessage(senderId ?? "", req),
    () =>
      apiFetch<SendMessageResponse>("/messages", {
        method: "POST",
        body: JSON.stringify(req),
      })
  );
}
