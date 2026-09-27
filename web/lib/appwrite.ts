/** Addresses the one heartbeat row an Appwrite project keeps for us. */

/**
 * The suggested table name and the fixed row id. The database and table ids are the user's
 * own: the free plan allows one database, and Appwrite generates a table's id unless it is
 * edited, so both are pasted from the Console rather than assumed.
 */
export const APPWRITE_TABLE_NAME = "heartbeats";
export const APPWRITE_ROW_ID = "sleeve";
export const APPWRITE_COLUMN = "beat";

/**
 * The upsert URL for the heartbeat row, or null unless the endpoint is Appwrite Cloud.
 * Only Cloud pauses free projects, and pinning the host keeps the key from being sent to
 * anywhere else.
 */
export function appwriteRowUrl(
  endpoint: string,
  databaseId: string,
  tableId: string,
): string | null {
  if (!isAppwriteId(databaseId) || !isAppwriteId(tableId)) return null;
  let url: URL;
  try {
    url = new URL(endpoint.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !/^([a-z0-9-]+\.)?cloud\.appwrite\.io$/.test(url.hostname))
    return null;
  return `https://${url.hostname}/v1/tablesdb/${databaseId.trim()}/tables/${tableId.trim()}/rows/${APPWRITE_ROW_ID}`;
}

/** Appwrite ids: up to 36 characters of a-z, A-Z, 0-9, period, hyphen and underscore. */
export function isAppwriteId(id: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/.test(id.trim());
}
