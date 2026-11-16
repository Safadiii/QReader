import { loyaltyProxy } from "@/lib/loyalty-proxy";

/** The stamp card's settings: anyone on staff can read them, managers change them. */
export async function GET(request: Request) {
  return loyaltyProxy(request, "staff", "");
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) return Response.json({ error: "Invalid request." }, { status: 422 });
  return loyaltyProxy(request, "manager", "", {
    method: "PUT",
    body: {
      enabled: Boolean(body.enabled),
      stamps_required: Number(body.stamps_required),
      reward_name: String(body.reward_name ?? ""),
    },
  });
}
