/**
 * Staff sessions: a signed cookie, checked on the server for every staff page
 * and staff API route. The cookie holds who is signed in and for which store;
 * the signature (HMAC-SHA256 with SESSION_SECRET) means it cannot be forged
 * or edited in the browser.
 */

export const SESSION_COOKIE = "qr_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type Session = {
  userId: string;
  storeId: string;
  name: string;
  role: string;
  /** Expiry, in seconds since 1970. */
  exp: number;
};

const encoder = new TextEncoder();

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromBase64Url = (text: string) =>
  Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function signingKey() {
  const secret = process.env.SESSION_SECRET ?? "";
  if (secret.length < 32) return null; // not configured: nobody can sign in
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

/** Returns the cookie value for a new session, or null if SESSION_SECRET is not set. */
export async function createSession(who: Omit<Session, "exp">) {
  const key = await signingKey();
  if (!key) return null;
  const session: Session = { ...who, exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS };
  const payload = toBase64Url(encoder.encode(JSON.stringify(session)));
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function readSession(value: string | undefined): Promise<Session | null> {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  const key = await signingKey();
  if (!payload || !signature || !key) return null;
  try {
    const valid = await crypto.subtle.verify("HMAC", key, fromBase64Url(signature), encoder.encode(payload));
    if (!valid) return null;
    const session = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as Session;
    return session.exp > Date.now() / 1000 ? session : null;
  } catch {
    return null;
  }
}

/** The signed-in staff member for a request, or null. */
export function sessionFrom(request: Request) {
  const cookies = request.headers.get("cookie") ?? "";
  const match = cookies.split(/;\s*/).find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  return readSession(match?.slice(SESSION_COOKIE.length + 1));
}

/** A Set-Cookie header value. Pass null to sign out. */
export function sessionCookie(value: string | null, request: Request) {
  // Secure cookies need HTTPS, which local development does not have.
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  const life = value ? MAX_AGE_SECONDS : 0;
  return `${SESSION_COOKIE}=${value ?? ""}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${life}${secure}`;
}
