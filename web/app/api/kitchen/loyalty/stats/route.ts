import { loyaltyProxy } from "@/lib/loyalty-proxy";

/** Numbers for the Extras page. Managers and the owner. */
export async function GET(request: Request) {
  return loyaltyProxy(request, "manager", "/stats");
}
