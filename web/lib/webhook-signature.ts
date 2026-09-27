/** GitHub webhook signatures: HMAC-SHA256 of the raw body, compared in constant time. */
import { createHmac, timingSafeEqual } from "node:crypto";

export function validSignature(body: string, header: string | null, secret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(body).digest("hex")}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
