import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { isUuid } from "@/lib/backend";

/*
 * The printed QR for shops without an iPad. One poster per store: its address
 * carries the store id plus a signature (HMAC with SESSION_SECRET), so nobody
 * can make an address for another store. Nothing is stored on a server.
 */

const sign = (storeId: string) => {
  const secret = process.env.SESSION_SECRET ?? "";
  if (secret.length < 32) return null;
  return createHmac("sha256", secret).update(`poster:${storeId}`).digest("hex").slice(0, 24);
};

/** The path segment for a store's poster, or null when SESSION_SECRET is not set. */
export function posterToken(storeId: string) {
  const mac = sign(storeId);
  return mac ? `${storeId.replace(/-/g, "")}${mac}` : null;
}

/** The store a poster address belongs to, or null if it was not made by this server. */
export function readPosterToken(token: string) {
  if (!/^[0-9a-f]{56}$/i.test(token)) return null;
  const hex = token.slice(0, 32).toLowerCase();
  const storeId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  const want = sign(storeId);
  if (!want || !isUuid(storeId)) return null;
  const a = Buffer.from(token.slice(32).toLowerCase());
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b) ? storeId : null;
}
