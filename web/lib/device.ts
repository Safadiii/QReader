/**
 * A secret this phone keeps, so its loyalty card is its own. It is never shown, and the server
 * stores only a hash of it per store. Clearing the browser's data starts a new card.
 */
const KEY = "qreader-device";
let fallback: string | null = null;

export function deviceSecret(): string {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && saved.length >= 16) return saved;
    const made = randomHex();
    localStorage.setItem(KEY, made);
    return made;
  } catch {
    // Storage blocked (private mode): the card lasts as long as this page does.
    return (fallback ??= randomHex());
  }
}

function randomHex() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Keeps a secret the server sent back, in case the browser wiped this page's own copy. */
export function rememberDevice(secret: string) {
  try {
    if (localStorage.getItem(KEY) !== secret) localStorage.setItem(KEY, secret);
  } catch {
    fallback = secret;
  }
}
