import { NextRequest, NextResponse } from "next/server";
import { TOKEN_COOKIE_NAME, verifyJwt } from "@/lib/jwt";

function getCorsHeaders(request: NextRequest): Headers {
  const origin = request.headers.get("origin");
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
  return headers;
}

function withCorsHeaders(response: NextResponse, headers: Headers): NextResponse {
  headers.forEach((value, key) => response.headers.set(key, value));
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const corsHeaders = getCorsHeaders(request);

  if (request.method === "OPTIONS") {
    return withCorsHeaders(new NextResponse(null, { status: 204 }), corsHeaders);
  }

  // ログインAPIは未認証でも利用可能にする。
  const isLoginRequest = pathname === "/api/v1/auth/login";
  if (isLoginRequest) {
    const response = NextResponse.next();
    return withCorsHeaders(response, corsHeaders);
  }

  const cookieToken = request.cookies.get(TOKEN_COOKIE_NAME)?.value;
  const authorization = request.headers.get("authorization");
  const bearerToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const token = cookieToken || bearerToken;
  const user = token ? await verifyJwt(token) : null;

  if (!user) {
    const response = NextResponse.json(
      {
        success: false,
        error: "UNAUTHORIZED",
        message: "認証が必要です。ログインしてください。",
      },
      { status: 401 }
    );
    return withCorsHeaders(response, corsHeaders);
  }

  const response = NextResponse.next();
  return withCorsHeaders(response, corsHeaders);
}

export const config = {
  matcher: ["/api/:path*"],
};
