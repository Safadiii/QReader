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
const PREVIEW_MS = 1500;

export type AlertSound = "pager" | "marimba" | "crystal" | "classic";

type Note = { start: number; length: number; freqs: [number, number][]; decay: number; tremolo?: number };

/** Each sound is a short phrase, then a pause, looped. */
const SOUNDS: Record<AlertSound, Note[]> = {
  // A bright two-burst "ring-ring".
  pager: [0, 0.5].map((start) => ({
    start,
    length: 0.42,
    freqs: [[1318.5, 0.5], [1760, 0.35], [2637, 0.15]],
    decay: 5,
    tremolo: 22,
  })),
  // Four soft, woody notes climbing a chord.
  marimba: [523.25, 659.25, 783.99, 1046.5].map((f, i) => ({
    start: i * 0.19,
    length: 0.5,
    freqs: [[f, 0.75], [f * 4, 0.18], [f * 10, 0.05]],
    decay: 9,
  })),
  // Three high glassy bells that ring out.
  crystal: [2093, 2637, 3136].map((f, i) => ({
    start: i * 0.26,
    length: 1.1,
    freqs: [[f, 0.55], [f * 1.003, 0.3], [f * 2.76, 0.12]],
    decay: 3.2,
  })),
  // An old telephone bell: two tones beating against each other.
  classic: [0, 0.62].map((start) => ({
    start,
    length: 0.5,
    freqs: [[440, 0.5], [480, 0.5]],
    decay: 0.6,
    tremolo: 20,
  })),
};

/** Synthesises the chosen sound as 16-bit mono WAV, so no audio files are needed. */
function makeRingWav(kind: AlertSound): Blob {
  const count = Math.floor(RATE * LOOP_SECONDS);
  const pcm = new Int16Array(count);
  const notes = SOUNDS[kind] ?? SOUNDS.pager;
  for (let i = 0; i < count; i++) {
    const t = i / RATE;
    let v = 0;
    for (const note of notes) {
      const bt = t - note.start;
      if (bt < 0 || bt > note.length) continue;
      const attack = Math.min(1, bt / 0.008);
      const release = Math.min(1, (note.length - bt) / 0.02);
      const tremolo = note.tremolo ? 0.75 + 0.25 * Math.sin(2 * Math.PI * note.tremolo * bt) : 1;
      let tone = 0;
      for (const [freq, gain] of note.freqs) tone += gain * Math.sin(2 * Math.PI * freq * bt);
      v += attack * release * Math.exp(-bt * note.decay) * tremolo * tone;
    }
    pcm[i] = Math.max(-1, Math.min(1, v * 0.85)) * 32767;
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

/** Plays a sound once, for the settings screen. Call from a tap. */
export function previewSound(kind: AlertSound) {
  const url = URL.createObjectURL(makeRingWav(kind));
  const audio = new Audio(url);
  audio.addEventListener("ended", () => URL.revokeObjectURL(url));
  void audio.play().catch(() => URL.revokeObjectURL(url));
}

export class Ringer {
  private url: string;
  private audio: HTMLAudioElement;
  private ringing = false;
  private previewTimer: ReturnType<typeof setTimeout> | undefined;
  private buzzTimer: ReturnType<typeof setInterval> | undefined;
  private wakeLock: WakeLockSentinel | null = null;
  private wantAwake = false;

  constructor(kind: AlertSound = "pager") {
    this.url = URL.createObjectURL(makeRingWav(kind));
    this.audio = new Audio(this.url);
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
