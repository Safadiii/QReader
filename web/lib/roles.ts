/** Owner sees and does everything; manager runs the shop; staff works the orders. */
export type Role = "owner" | "manager" | "staff";

const RANK: Record<Role, number> = { staff: 1, manager: 2, owner: 3 };

export const isRole = (v: unknown): v is Role => v === "owner" || v === "manager" || v === "staff";

/** True when `role` is `min` or senior to it. Unknown roles get nothing. */
export const atLeast = (role: string | null | undefined, min: Role) =>
  isRole(role) && RANK[role] >= RANK[min];

export const ROLE_LABEL: Record<Role, { tr: string; en: string }> = {
  owner: { tr: "Sahip", en: "Owner" },
  manager: { tr: "Yönetici", en: "Manager" },
  staff: { tr: "Personel", en: "Staff" },
};
