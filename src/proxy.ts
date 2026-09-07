import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const origin = request.headers.get("origin");

  // CORS設定用のヘッダー
  const headers = new Headers();
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
  } else {
    headers.set("Access-Control-Allow-Origin", "*");
  }
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept"
  );
  headers.set("Access-Control-Max-Age", "86400");

  // OPTIONS プリフライトリクエストの処理
  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers,
    });
  }

  // 通常のリクエストを継続
  const response = NextResponse.next();
  headers.forEach((value, key) => {
    response.headers.set(key, value);
  });

  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
