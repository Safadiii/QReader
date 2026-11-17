import { storeProxy } from "@/lib/store-proxy";

/** The digital menu: anyone on staff can read it, managers change it. */
export async function GET(request: Request) {
  return storeProxy(request, "staff", "/menu");
}

export async function PUT(request: Request) {
  const b = await request.json().catch(() => null);
  if (!b || !Array.isArray(b.items)) return Response.json({ error: "Invalid request." }, { status: 422 });
  return storeProxy(request, "manager", "/menu", {
    method: "PUT",
    body: {
      enabled: Boolean(b.enabled),
      currency: String(b.currency ?? "₺").slice(0, 4),
      note: String(b.note ?? "").slice(0, 200),
      items: b.items.slice(0, 300).map((i: Record<string, unknown>) => ({
        id: typeof i.id === "string" ? i.id : null,
        category: String(i.category ?? "").slice(0, 40),
        name: String(i.name ?? "").slice(0, 80),
        description: String(i.description ?? "").slice(0, 200),
        price_cents: Math.max(0, Math.round(Number(i.price_cents) || 0)),
        available: i.available !== false,
      })),
    },
  });
}
