export type Status = "pending" | "preparing" | "ready" | "collected" | "cancelled";

export type Order = {
  id: string;
  order_number: number;
  order_date: string;
  status: Status;
  created_at: string;
  ready_at: string | null;
  completed_at: string | null;
  customer_coming_at: string | null;
  customer_seen_at: string | null;
  scanned_at: string | null;
  ring_requested_at: string | null;
};
