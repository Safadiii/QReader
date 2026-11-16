import "server-only";

/** At most `max` hits per `windowMs` for each key (in memory: fine for one server). */
export function limiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string) => {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) hits.clear();
    return recent.length > max;
  };
}

export const clientKey = (request: Request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
