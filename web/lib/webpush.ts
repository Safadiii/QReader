/** Browser push for the phone page (Android Chrome and other browsers with Push API). */

export type PushState = "unsupported" | "off" | "on" | "denied";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function keyToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration() {
  await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  return navigator.serviceWorker.ready;
}

/** Where this phone stands right now, without asking for anything. */
export async function currentPushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    const sub = await (await registration()).pushManager.getSubscription();
    return sub && Notification.permission === "granted" ? "on" : "off";
  } catch {
    return "unsupported";
  }
}

/** Ask permission, subscribe, and tell the backend. Must run from a tap. */
export async function enablePush(token: string): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";

  const config = await fetch("/api/push/config", { cache: "no-store" }).then((r) => r.json());
  if (!config.vapid_public_key) return "unsupported";

  const reg = await registration();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyToBytes(config.vapid_public_key),
    }));

  const json = sub.toJSON();
  const res = await fetch(`/api/track/${encodeURIComponent(token)}/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "web_push",
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      platform: /iPhone|iPad|iPod/.test(navigator.userAgent) ? "ios" : "android",
    }),
  });
  if (!res.ok) throw new Error("subscribe failed");
  return "on";
}
