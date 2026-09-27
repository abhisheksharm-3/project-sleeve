/** API token format and hashing. Pure, so it is tested without a database. */
import { createHash, randomBytes } from "node:crypto";

const PREFIX = "sleeve_";
const SHAPE = /^sleeve_[A-Za-z0-9_-]{43}$/;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A new token, its hash for storage, and the short prefix shown in the token list. */
export function newToken(): { token: string; hash: string; prefix: string } {
  const token = `${PREFIX}${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashToken(token), prefix: token.slice(0, PREFIX.length + 6) };
}

/** The token from an `Authorization: Bearer` header, or null when it is not one of ours. */
export function bearerToken(header: string | null): string | null {
  const token = header?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null;
  return token && SHAPE.test(token) ? token : null;
}
