import { createHash } from "node:crypto";
import { getEnv } from "./env.server";

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Salted hash of the client address, for rate limiting. The address itself is never stored. */
export function rateLimitKey(request: Request): string {
  return sha256(`${getEnv().hashSalt}:rl:${clientIp(request)}`);
}

/**
 * Anonymous visit identifier that changes every day and cannot be reversed.
 * Nothing is stored on the visitor's device, so it needs no cookie consent.
 */
export function sessionHash(request: Request, day: string): string {
  const ua = request.headers.get("user-agent") ?? "";
  return sha256(`${getEnv().hashSalt}:${day}:${clientIp(request)}:${ua}`).slice(0, 32);
}
