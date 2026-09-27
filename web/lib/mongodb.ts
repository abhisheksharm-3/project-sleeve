/**
 * MongoDB Atlas targets. Only Atlas SRV strings on *.mongodb.net are accepted, so the
 * server never opens a database connection to an address a user chose. The string holds a
 * password: it is stored as the target's secret, and only the host is ever shown.
 */

export type AtlasTarget = { uri: string; host: string };

const ATLAS_HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.mongodb\.net$/;

export function parseAtlasUri(raw: string): AtlasTarget | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "mongodb+srv:" || url.port) return null;
  if (!url.username || !url.password) return null;
  const host = url.hostname.toLowerCase();
  if (!ATLAS_HOST.test(host)) return null;
  return { uri: raw.trim(), host };
}

/** Opens a connection, runs `ping`, and closes it; throws the driver's reason on failure. */
export async function atlasPing(uri: string, timeoutMs: number): Promise<void> {
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: timeoutMs,
    connectTimeoutMS: timeoutMs,
    appName: "projectsleeve",
  });
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
  } finally {
    await client.close().catch(() => {});
  }
}

/** Driver errors in words; the connection string is never repeated back. */
export function diagnoseAtlas(message: string): string {
  if (/auth|authentication|bad auth/i.test(message))
    return "Atlas rejected that username or password. Check the database user in Database Access.";
  if (/ENOTFOUND|querySrv/i.test(message))
    return "No Atlas cluster answers at that address. Copy the connection string from Connect, Drivers.";
  if (/timed out|Server selection|ETIMEDOUT|ECONNREFUSED/i.test(message))
    return "Could not reach the cluster. In Atlas Network Access, allow connections from anywhere (0.0.0.0/0); our checks do not come from a fixed address.";
  return "Could not connect to the cluster. Check the connection string and the database user.";
}
