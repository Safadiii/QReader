/**
 * Rings the customer's phone from the tracking page.
 *
 * Browsers only let a page make sound after the user has tapped something, so
 * `enable()` must be called from a tap. It plays a short preview, which both
 * proves to the customer that sound works and unlocks later playback.
 *
 * Limits of a web page: this only rings while the page stays open. An <audio>
 * element is used (not Web Audio) because on iPhone it still plays when the
 * side switch is set to silent.
 */

const RATE = 22050;
const LOOP_SECONDS = 2.6;
const PREVIEW_MS = 1050;

/** A bright two-note "ring-ring", then a pause, as 16-bit mono WAV. */
function makeRingWav(): Blob {
  const count = Math.floor(RATE * LOOP_SECONDS);
  const pcm = new Int16Array(count);
  const bursts = [0, 0.5];
  for (let i = 0; i < count; i++) {
    const t = i / RATE;
    let v = 0;
    for (const start of bursts) {
      const bt = t - start;
      if (bt < 0 || bt > 0.42) continue;
      const attack = Math.min(1, bt / 0.008);
      const decay = Math.exp(-bt * 5);
      const tremolo = 0.75 + 0.25 * Math.sin(2 * Math.PI * 22 * bt);
      v +=
        attack * decay * tremolo *
        (0.5 * Math.sin(2 * Math.PI * 1318.5 * bt) + 0.35 * Math.sin(2 * Math.PI * 1760 * bt) + 0.15 * Math.sin(2 * Math.PI * 2637 * bt));
    }
    pcm[i] = Math.max(-1, Math.min(1, v * 0.9)) * 32767;
  }

  const header = new DataView(new ArrayBuffer(44));
  const text = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) header.setUint8(offset + i, s.charCodeAt(i));
  };
  text(0, "RIFF");
  header.setUint32(4, 36 + pcm.byteLength, true);
  text(8, "WAVEfmt ");
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true); // PCM
  header.setUint16(22, 1, true); // mono
  header.setUint32(24, RATE, true);
  header.setUint32(28, RATE * 2, true);
  header.setUint16(32, 2, true);
  header.setUint16(34, 16, true);
  text(36, "data");
  header.setUint32(40, pcm.byteLength, true);
  return new Blob([header, pcm], { type: "audio/wav" });
}

export class Ringer {
  private url = URL.createObjectURL(makeRingWav());
  private audio = new Audio(this.url);
  private ringing = false;
  private previewTimer: ReturnType<typeof setTimeout> | undefined;
  private buzzTimer: ReturnType<typeof setInterval> | undefined;
  private wakeLock: WakeLockSentinel | null = null;
  private wantAwake = false;

  constructor() {
    this.audio.preload = "auto";
    document.addEventListener("visibilitychange", this.onVisible);
  }

  /** Call from a tap. Rejects if the browser refuses to play sound. */
  async enable() {
    this.audio.loop = false;
    this.audio.currentTime = 0;
    await this.audio.play();
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => {
      if (this.ringing) return;
      this.audio.pause();
      this.audio.currentTime = 0;
    }, PREVIEW_MS);
    this.wantAwake = true;
    void this.keepAwake();
  }

  /** Whether the screen is being kept on (needs HTTPS and a supporting browser). */
  get staysAwake() {
    return this.wakeLock !== null;
  }

  disable() {
    this.stop();
    clearTimeout(this.previewTimer);
    this.audio.pause();
    this.wantAwake = false;
    void this.wakeLock?.release().catch(() => undefined);
    this.wakeLock = null;
  }

  ring() {
    if (this.ringing) return;
    this.ringing = true;
    clearTimeout(this.previewTimer);
    this.audio.loop = true;
    this.audio.currentTime = 0;
    void this.audio.play().catch(() => undefined);
    const buzz = () => navigator.vibrate?.([350, 150, 350]);
    buzz();
    this.buzzTimer = setInterval(buzz, LOOP_SECONDS * 1000);
  }

  stop() {
    if (!this.ringing) return;
    this.ringing = false;
    this.audio.pause();
    this.audio.currentTime = 0;
    clearInterval(this.buzzTimer);
    navigator.vibrate?.(0);
  }

  dispose() {
    this.disable();
    document.removeEventListener("visibilitychange", this.onVisible);
    URL.revokeObjectURL(this.url);
  }

  private async keepAwake() {
    if (!this.wantAwake || this.wakeLock || !("wakeLock" in navigator)) return;
    try {
      const lock = await navigator.wakeLock.request("screen");
      lock.addEventListener("release", () => {
        if (this.wakeLock === lock) this.wakeLock = null;
      });
      this.wakeLock = lock;
    } catch {
      // Low battery mode, or the browser said no: the page still works.
    }
  }

  // The browser drops the wake lock whenever the page is hidden.
  private onVisible = () => {
    if (document.visibilityState === "visible") void this.keepAwake();
  };
}
