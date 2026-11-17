import { storeProxy } from "@/lib/store-proxy";

/** How phone orders may be collected: anyone on staff can read it, managers change it. */
export async function GET(request: Request) {
  return storeProxy(request, "staff", "/mobile-orders");
}

export async function PUT(request: Request) {
  const b = await request.json().catch(() => null);
  if (!b) return Response.json({ error: "Invalid request." }, { status: 422 });
  return storeProxy(request, "manager", "/mobile-orders", {
    method: "PUT",
    body: {
      enabled: Boolean(b.enabled),
      collect_enabled: Boolean(b.collect_enabled),
      car_enabled: Boolean(b.car_enabled),
      table_enabled: Boolean(b.table_enabled),
      table_count: Math.max(0, Math.min(200, Math.round(Number(b.table_count) || 0))),
      hours_mode: b.hours_mode === "custom" ? "custom" : "always",
      opens: String(b.opens ?? "08:00"),
      closes: String(b.closes ?? "22:00"),
    },
  });
}
