/** Who may see cross-user aggregates. Configured, never stored in a table a client can write. */
import "server-only";

export function isAdmin(userId: string): boolean {
  return (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .includes(userId);
}
