import "server-only";

/*
 * The customer's card secret also lives in a cookie that the server sets. Safari deletes anything a
 * page's own script stores (localStorage, script cookies) after about a week without a visit, but it
 * keeps cookies that arrive in a response header. So the card outlives the browser's cleanup.
 * The cookie is HttpOnly: the page can never read it, only send it back.
 */
const NAME = "qr_card";
const MAX_AGE = 60 * 60 * 24 * 400; // the longest a browser will keep one

const valid = (v: string | undefined | null): v is string => !!v && v.length >= 16 && v.length <= 128 && /^[\w-]+$/.test(v);

/** The secret to use: the cookie's if there is one, otherwise what the page kept itself. */
export function cardSecret(request: Request, fromPage: unknown) {
  const cookies = request.headers.get("cookie") ?? "";
  const match = cookies.split(/;\s*/).find((c) => c.startsWith(`${NAME}=`));
  const cookie = match?.slice(NAME.length + 1);
  if (valid(cookie)) return cookie;
  return valid(typeof fromPage === "string" ? fromPage : null) ? (fromPage as string) : null;
}

/** A Set-Cookie value that keeps the secret for the next 400 days. */
export function cardCookie(secret: string, request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${NAME}=${secret}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure}`;
}
