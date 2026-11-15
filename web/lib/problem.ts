import "server-only";

/** Turns a backend error reply into one readable line for the screen. */
export async function problem(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}));
  const detail = body.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0]) {
    return String(detail[0].msg).replace(/^Value error, /, "");
  }
  return `Request failed (${res.status}).`;
}
