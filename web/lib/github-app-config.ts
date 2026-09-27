/** The GitHub App's configuration, or null when private repository access is not set up. */
import "server-only";
import { normalisePem } from "./github-app";

export const INSTALL_COOKIE = "sleeve_github_install";
export const INSTALL_PATH = "/connect/github";

export function githubAppConfig() {
  const appId = process.env.GITHUB_APP_ID;
  const slug = process.env.GITHUB_APP_SLUG;
  const key = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !slug || !key) return null;
  return { appId, slug, privateKey: normalisePem(key) };
}
