/** PKCE for OAuth (RFC 7636): a random verifier and its S256 challenge. */
import { createHash, randomBytes } from "node:crypto";

export function newVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export function challengeFor(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}
