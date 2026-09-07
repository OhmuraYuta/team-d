import { SignJWT, jwtVerify } from "jose";
import { JwtCustomPayload } from "./types/auth";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not set in environment variables");
}

const encodedSecret = new TextEncoder().encode(JWT_SECRET);

export const TOKEN_COOKIE_NAME = "token";
export const TOKEN_MAX_AGE_SECONDS = 30 * 60; // 30分 (1800秒)

/**
 * JWT トークンを生成して署名します (有効期間: 30分)
 */
export async function signJwt(payload: JwtCustomPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(encodedSecret);
}

/**
 * JWT トークンを検証し、ペイロードを取り出します
 */
export async function verifyJwt(token: string): Promise<JwtCustomPayload | null> {
  try {
    const { payload } = await jwtVerify(token, encodedSecret);
    return payload as unknown as JwtCustomPayload;
  } catch {
    return null;
  }
}
