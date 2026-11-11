import "server-only";
import { networkInterfaces } from "node:os";

/** This machine's Wi-Fi/Ethernet addresses, e.g. ["192.168.1.110"]. */
export function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && n.family === "IPv4" && !n.internal)
    .map((n) => n!.address);
}

/**
 * The address a customer's phone should open this site at, or null to keep
 * the backend's own tracking URL.
 *
 * Production: leave QREADER_PUBLIC_URL unset and point the backend's
 * TRACKING_BASE_URL at the deployed HTTPS site.
 *
 * Development: the backend's link says "localhost", which on a phone means the
 * phone itself. So we swap in this computer's address on the local network,
 * which any phone on the same Wi-Fi can reach.
 */
export function publicBaseUrl(request: Request): string | null {
  const fixed = process.env.QREADER_PUBLIC_URL?.replace(/\/+$/, "");
  if (fixed) return fixed;
  if (process.env.NODE_ENV !== "development") return null;
  const [ip] = lanAddresses();
  if (!ip) return null;
  const port = new URL(request.url).port;
  return `http://${ip}${port ? `:${port}` : ""}`;
}
