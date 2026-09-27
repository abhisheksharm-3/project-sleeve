/**
 * One-click Supabase setup, shared by its routes and action. The Management API token lives
 * only in a sealed, httpOnly cookie scoped to /connect/supabase for ten minutes; it is never
 * written to the database.
 */
import "server-only";
import { siteUrl } from "./site-url";

export const CONNECT_COOKIE = "sleeve_supabase_connect";
export const CONNECT_PATH = "/connect/supabase";
export const CONNECT_TTL_SECONDS = 600;

export type PendingConnect = { verifier: string; state: string; projectId: string; userId: string };
export type ActiveConnect = { token: string; projectId: string; userId: string };

export function connectConfig() {
  const clientId = process.env.SUPABASE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.SUPABASE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri: `${siteUrl()}${CONNECT_PATH}/callback` };
}

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: CONNECT_PATH,
  maxAge: CONNECT_TTL_SECONDS,
};
