/** The store's settings as the backend returns them (also sent to the customer's phone). */
export type Language = "tr" | "en";
export type AlertSound = "pager" | "marimba" | "crystal" | "classic";
export type ThemeName = "graphite" | "amber" | "espresso" | "ocean" | "forest" | "plum" | "wine" | "paper";
export type LinkKind = "menu" | "instagram" | "tiktok" | "snapchat" | "x" | "website" | "map";
export type AssetKind = "logo" | "background" | "banner";

export type Design = {
  store_id: string;
  name: string;
  default_language: Language;
  alert_sound: AlertSound;
  alert_title_tr: string | null;
  alert_text_tr: string | null;
  alert_title_en: string | null;
  alert_text_en: string | null;
  ask_rating: boolean;
  google_min_stars: number;
  google_review_url: string | null;
  theme: ThemeName;
  brand_color: string | null;
  card_color: string | null;
  number_color: string | null;
  links: Partial<Record<LinkKind, string>>;
  banner_url: string | null;
  assets: Partial<Record<AssetKind, string>>;
};

type Palette = { label: string; bg: string; ink: string; muted: string; card: string; number: string; accent: string };

export const THEMES: Record<ThemeName, Palette> = {
  graphite: { label: "Graphite", bg: "#0a0b0d", ink: "#eceef1", muted: "#8d929b", card: "#f3f4f6", number: "#0b0c0e", accent: "#7fe6ae" },
  amber: { label: "Amber", bg: "#1a1206", ink: "#f6efe2", muted: "#a3957c", card: "#fff4dc", number: "#2a1a02", accent: "#f5b83d" },
  espresso: { label: "Espresso", bg: "#17100c", ink: "#f2ebe5", muted: "#a08d80", card: "#efe3d6", number: "#2b1a10", accent: "#d9a273" },
  ocean: { label: "Ocean", bg: "#06131f", ink: "#e6f0f8", muted: "#7f95a8", card: "#e8f3fb", number: "#062238", accent: "#5cc2f2" },
  forest: { label: "Forest", bg: "#08150f", ink: "#e7f1ea", muted: "#819989", card: "#e9f4ea", number: "#0b2a18", accent: "#7fd69a" },
  plum: { label: "Plum", bg: "#150b1a", ink: "#f1e8f5", muted: "#9c88a6", card: "#f3e8f7", number: "#2a1034", accent: "#c89bf0" },
  wine: { label: "Wine", bg: "#1a070b", ink: "#f7e9eb", muted: "#a8868b", card: "#f8e7e9", number: "#3a0d17", accent: "#f08a9b" },
  paper: { label: "Paper", bg: "#f2efe9", ink: "#1a1a1a", muted: "#6b6860", card: "#ffffff", number: "#111111", accent: "#1f7a4d" },
};

export const LINK_KINDS: { kind: LinkKind; label: string; placeholder: string }[] = [
  { kind: "menu", label: "Menü · Menu", placeholder: "https://…" },
  { kind: "instagram", label: "Instagram", placeholder: "https://instagram.com/…" },
  { kind: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@…" },
  { kind: "snapchat", label: "Snapchat", placeholder: "https://snapchat.com/add/…" },
  { kind: "x", label: "X", placeholder: "https://x.com/…" },
  { kind: "website", label: "Web sitesi · Website", placeholder: "https://…" },
  { kind: "map", label: "Harita · Map", placeholder: "https://maps.google.com/…" },
];

/** Black or white, whichever reads better on `hex`. */
export function readableOn(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#0a0b0d" : "#ffffff";
}

/** The theme with the store's own colours laid over it. */
export function designColors(design: Pick<Design, "theme" | "brand_color" | "card_color" | "number_color">) {
  const theme = THEMES[design.theme] ?? THEMES.graphite;
  const accent = design.brand_color ?? theme.accent;
  return {
    ...theme,
    card: design.card_color ?? theme.card,
    number: design.number_color ?? theme.number,
    accent,
    onAccent: readableOn(accent),
  };
}

/** CSS variables for the order page (see track.css). */
export function designStyle(design: Design): React.CSSProperties {
  const c = designColors(design);
  return {
    "--bg": c.bg,
    "--ink": c.ink,
    "--muted": c.muted,
    "--paper": c.card,
    "--paper-ink": c.number,
    "--ok": c.accent,
    "--on-ok": c.onAccent,
  } as React.CSSProperties;
}

export function assetUrl(design: Design, kind: AssetKind) {
  const version = design.assets[kind];
  return version ? `/api/assets/${design.store_id}/${kind}?v=${version}` : null;
}

/** Fills {number} and {venue} in the store's own alert text. */
export function fillTemplate(text: string, number: number, venue: string) {
  return text.replaceAll("{number}", String(number)).replaceAll("{venue}", venue);
}
