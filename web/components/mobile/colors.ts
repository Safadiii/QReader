/** Car colours the customer can pick, so staff spot the car at a glance. */
export const CAR_COLORS = [
  { key: "white", hex: "#f5f5f2", tr: "Beyaz", en: "White" },
  { key: "black", hex: "#17171a", tr: "Siyah", en: "Black" },
  { key: "grey", hex: "#8a8d91", tr: "Gri", en: "Grey" },
  { key: "silver", hex: "#c9ccd1", tr: "Gümüş", en: "Silver" },
  { key: "red", hex: "#d1342b", tr: "Kırmızı", en: "Red" },
  { key: "blue", hex: "#2858b8", tr: "Mavi", en: "Blue" },
  { key: "green", hex: "#2f7d4f", tr: "Yeşil", en: "Green" },
  { key: "yellow", hex: "#f0c22e", tr: "Sarı", en: "Yellow" },
  { key: "orange", hex: "#e4772e", tr: "Turuncu", en: "Orange" },
  { key: "brown", hex: "#7a5236", tr: "Kahverengi", en: "Brown" },
] as const;

export const colorOf = (key: string | null | undefined) => CAR_COLORS.find((c) => c.key === key) ?? null;
