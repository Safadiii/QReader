import * as THREE from "three";
import {
  DEPTH,
  PANEL,
  generateFoilMaps,
  paintLabel,
  type FoilLabel,
  type FoilMaps,
} from "./textures";

export type { FoilLabel };

/** Where the QR card sits inside the stage, in CSS pixels. */
export type FoilLayout = {
  width: number;
  height: number;
  /** Centre of the QR card, measured from the stage's top-left corner. */
  cx: number;
  cy: number;
  cardSize: number;
};

export type PlayCallbacks = {
  /** The foil now fully covers the card: safe to hide the DOM card. */
  onCovered?: () => void;
  /** The pouch has let go and is falling. */
  onFalling?: () => void;
};

/* Timeline, in seconds from the moment of the scan. */
const T_COVER_START = 0.08;
const T_COVER_END = 0.92;
const T_VAC_START = 0.86;
const T_VAC_END = 1.5;
const T_DROP = 2.45;
const T_ANTICIPATE = 0.22;
const GRAVITY = 5200; // px / s^2
const LOOSE = 0.18; // how crumpled the bag is before the air is pulled out

/* Arrival timeline (customer's phone), in seconds from the start of the fall. */
const A_LAND = 0.62; // reaches the centre
const A_SETTLE = 1.25; // the bounce has died down
const A_RELEASE = 1.55; // air goes back in, the foil loosens
const A_OPEN = 1.9; // the seam parts
const A_DONE = 2.9;

export type ArriveCallbacks = {
  /** The foil is about to open: show whatever it was hiding. */
  onOpening?: () => void;
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t: number) => {
  const c1 = 1.9;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * A dark studio with a few bright, hard-edged light cards. Chrome has no
 * colour of its own: it only looks like metal when it has these to reflect.
 */
function buildStudio(renderer: THREE.WebGLRenderer) {
  const studio = new THREE.Scene();
  studio.background = new THREE.Color().setRGB(0.05, 0.053, 0.06, THREE.LinearSRGBColorSpace);

  const card = (
    w: number,
    h: number,
    pos: [number, number, number],
    rgb: [number, number, number],
  ) => {
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
    mat.color.setRGB(rgb[0], rgb[1], rgb[2], THREE.LinearSRGBColorSpace);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(...pos);
    mesh.lookAt(0, 0, 0);
    studio.add(mesh);
    return mesh;
  };

  // Big soft card straight ahead: this is what the flat panel reflects,
  // so the printed name sits on bright silver instead of a black mirror.
  card(11, 7.5, [0, 0.6, 9], [0.92, 0.94, 0.98]);

  // Window with bars, up and to the left: the hard glints on the creases.
  const win = new THREE.Group();
  const paneMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
  paneMat.color.setRGB(4.4, 4.3, 4.1, THREE.LinearSRGBColorSpace);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 3; j++) {
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 1.2), paneMat);
      pane.position.set((i - 1.5) * 1.3, (j - 1) * 1.47, 0);
      win.add(pane);
    }
  }
  win.position.set(-6, 4.6, 4.6);
  win.lookAt(0, 0, 0);
  studio.add(win);

  card(1.3, 6.5, [7, 1.4, 3], [1.5, 1.75, 2.2]); // cool strip, right
  card(1.1, 5.5, [-7.5, -2, 2.5], [1.9, 1.7, 1.45]); // faintly warm strip, left
  card(9, 1.5, [0, 7, 2.5], [2.3, 2.3, 2.35]); // top strip
  card(5, 2, [3, -6, 3], [0.5, 0.52, 0.56]); // low bounce
  card(4.5, 7, [-8.5, 1, 5], [0.62, 0.64, 0.68]); // broad soft fill, left
  card(6, 3.2, [6, -4.5, 6], [0.7, 0.72, 0.78]); // broad soft fill, low right
  card(12, 12, [0, -7, 0], [0.09, 0.09, 0.1]); // floor

  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(studio, 0.006);
  pmrem.dispose();
  studio.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
  return target;
}

/** The maps are the same for every pouch, so build them once per page. */
let mapsPromise: Promise<FoilMaps> | null = null;

export class FoilScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(26, 1, 10, 10000);
  private pouch = new THREE.Group();
  private mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private material: THREE.MeshStandardMaterial;
  private clipLeft = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
  private clipRight = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
  private env: THREE.WebGLRenderTarget;
  private maps: FoilMaps;
  private colorCanvas: HTMLCanvasElement;
  private ormCanvas: HTMLCanvasElement;
  private colorTex: THREE.CanvasTexture;
  private ormTex: THREE.CanvasTexture;
  private layout: FoilLayout = { width: 1, height: 1, cx: 0, cy: 0, cardSize: 1 };
  private raf = 0;
  private disposed = false;

  private constructor(canvas: HTMLCanvasElement, maps: FoilMaps) {
    this.maps = maps;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.localClippingEnabled = true;
    this.renderer = renderer;

    this.env = buildStudio(renderer);
    this.scene.environment = this.env.texture;

    const tex = (source: HTMLCanvasElement, srgb: boolean) => {
      const t = new THREE.CanvasTexture(source);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      return t;
    };

    const blank = () => {
      const c = document.createElement("canvas");
      c.width = maps.size;
      c.height = maps.size;
      return c;
    };
    this.colorCanvas = blank();
    this.ormCanvas = blank();
    this.colorCanvas.getContext("2d")!.putImageData(maps.baseColor, 0, 0);
    this.ormCanvas.getContext("2d")!.putImageData(maps.baseOrm, 0, 0);
    this.colorTex = tex(this.colorCanvas, true);
    this.ormTex = tex(this.ormCanvas, false);

    this.material = new THREE.MeshStandardMaterial({
      map: this.colorTex,
      roughnessMap: this.ormTex,
      metalnessMap: this.ormTex,
      metalness: 1,
      roughness: 1,
      normalMap: tex(maps.normal, false),
      normalScale: new THREE.Vector2(0, 0),
      displacementMap: tex(maps.displacement, false),
      displacementScale: 0,
      // On recent three.js, envMapIntensity only applies when the material
      // holds the map itself, not just scene.environment.
      envMap: this.env.texture,
      envMapIntensity: 1,
      transparent: true,
      clippingPlanes: [this.clipLeft, this.clipRight],
      clipIntersection: true,
    });

    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 240, 240), this.material);
    this.mesh.frustumCulled = false;
    this.pouch.add(this.mesh);
    this.pouch.visible = false;
    this.scene.add(this.pouch);
  }

  /**
   * Generates the foil maps and compiles everything, ready for an instant start.
   * Returns null if `isCancelled` turns true while the maps are being built, so
   * a remount never ends up with two renderers fighting over one canvas.
   */
  static async create(
    canvas: HTMLCanvasElement,
    isCancelled: () => boolean = () => false,
  ): Promise<FoilScene | null> {
    const started = performance.now();
    mapsPromise ??= generateFoilMaps(1024);
    const maps = await mapsPromise;
    if (isCancelled()) return null;
    const foil = new FoilScene(canvas, maps);
    foil.warmUp();
    performance.measure("foil-ready", { start: started, end: performance.now() });
    return foil;
  }

  private warmUp() {
    const m = this.material;
    for (const t of [m.map, m.roughnessMap, m.normalMap, m.displacementMap]) {
      if (t) this.renderer.initTexture(t);
    }
    this.renderer.compile(this.scene, this.camera);
  }

  /** Size of the square foil plane for a given card size. */
  private get planeSize() {
    return this.layout.cardSize / PANEL;
  }

  setLayout(layout: FoilLayout) {
    this.layout = layout;
    const { width, height } = layout;
    this.renderer.setSize(width, height, false);
    const cam = this.camera;
    cam.aspect = width / height;
    // Sit far enough back that 1 world unit is 1 CSS pixel at z = 0.
    const dist = height / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    cam.position.set(0, 0, dist);
    cam.near = dist * 0.2;
    cam.far = dist * 3;
    cam.updateProjectionMatrix();
  }

  setLabel(label: FoilLabel) {
    paintLabel(this.maps, this.colorCanvas, this.ormCanvas, label);
    this.colorTex.needsUpdate = true;
    this.ormTex.needsUpdate = true;
  }

  /**
   * Poses the pouch for a moment `t` (seconds after the scan) and draws it.
   * Returns how far it has fallen and whether it has left the screen.
   */
  private draw(t: number, spin: number) {
    const { width, height, cx, cy } = this.layout;
    const size = this.planeSize;
    const homeX = cx - width / 2;
    const homeY = height / 2 - cy;

    /* wrap: two flaps close over the card from the sides */
    const cover = easeInOut(seg(t, T_COVER_START, T_COVER_END));
    const gap = cover >= 1 ? -1e5 : (1 - cover) * size * 0.5;
    this.clipLeft.constant = homeX - gap;
    this.clipRight.constant = -(homeX + gap);

    /* vacuum: the air goes out, the foil snaps tight and crumples */
    const vacT = seg(t, T_VAC_START, T_VAC_END);
    const vac = lerp(LOOSE, 1, easeOutBack(vacT));
    this.material.displacementScale = DEPTH * vac;
    this.material.normalScale.setScalar(Math.min(vac, 1.12));
    const loose = lerp(1.13, 1, easeOut(vacT));
    this.mesh.scale.set(size * loose, size * loose, size);

    let x = homeX;
    let y = homeY;
    let rotX = lerp(-0.32, 0, easeOut(seg(t, T_COVER_START, T_VAC_END)));
    let rotY = 0;
    let rotZ = 0;
    let yaw = 0.34 * Math.sin(t * 1.9 + 0.6);

    /* hold: breathe a little so the reflections keep moving */
    const held = Math.max(0, t - T_VAC_END);
    y += Math.sin(held * 3.1) * 3;
    rotY += Math.sin(held * 2.3) * 0.045;

    /* drop: a small lift, then gravity takes it */
    let falling = false;
    const td = t - T_DROP;
    if (td > 0) {
      const lift = easeOut(seg(td, 0, T_ANTICIPATE));
      y += lift * 18;
      rotZ += spin * lift * -0.035;
      const tf = td - T_ANTICIPATE;
      if (tf > 0) {
        falling = true;
        y -= 0.5 * GRAVITY * tf * tf;
        x += spin * 60 * tf;
        rotZ += spin * 1.15 * tf;
        rotX += 0.9 * tf;
        yaw += tf * 1.4;
      }
    }

    this.pouch.position.set(x, y, 0);
    this.pouch.rotation.set(rotX, rotY, rotZ);
    this.scene.environmentRotation.set(0.1 * Math.sin(t * 1.3), yaw, 0);
    this.material.envMapRotation.copy(this.scene.environmentRotation);
    this.renderer.render(this.scene, this.camera);

    return { falling, gone: y + size < -height / 2 };
  }

  /** Runs wrap -> vacuum -> hold -> drop. Resolves once the pouch has left the screen. */
  play(callbacks: PlayCallbacks = {}): Promise<void> {
    cancelAnimationFrame(this.raf);
    const spin = Math.random() < 0.5 ? -1 : 1;
    let covered = false;
    let fallingSent = false;
    this.pouch.visible = true;

    return new Promise((resolve) => {
      const start = performance.now();
      const frame = (now: number) => {
        if (this.disposed) return resolve();
        const t = (now - start) / 1000;
        const { falling, gone } = this.draw(t, spin);

        if (!covered && t >= T_COVER_END) {
          covered = true;
          callbacks.onCovered?.();
        }
        if (falling && !fallingSent) {
          fallingSent = true;
          callbacks.onFalling?.();
        }
        if (gone) {
          this.pouch.visible = false;
          this.renderer.clear();
          return resolve();
        }
        this.raf = requestAnimationFrame(frame);
      };
      this.raf = requestAnimationFrame(frame);
    });
  }

  /**
   * The reverse of `draw`: the sealed pouch drops in from above, lands on the
   * card's spot, loosens, and parts down the middle to show what is inside.
   * Returns true once it has fully opened.
   */
  private drawArrive(t: number, spin: number) {
    const { width, height, cx, cy } = this.layout;
    const size = this.planeSize;
    const homeX = cx - width / 2;
    const homeY = height / 2 - cy;

    /* unwrap: the two halves pull apart from the centre seam */
    const open = easeInOut(seg(t, A_OPEN, A_DONE));
    const gap = open <= 0 ? -1e5 : open * size * 0.62;
    this.clipLeft.constant = homeX - gap;
    this.clipRight.constant = -(homeX + gap);
    this.material.opacity = 1 - seg(t, A_DONE - 0.3, A_DONE);

    /* release: the vacuum lets go and the foil relaxes */
    const release = easeOut(seg(t, A_RELEASE, A_OPEN + 0.3));
    const vac = lerp(1, LOOSE, release);
    this.material.displacementScale = DEPTH * vac;
    this.material.normalScale.setScalar(vac);
    const loose = lerp(1, 1.13, release);
    this.mesh.scale.set(size * loose, size * loose, size);

    /* fall: starts just above the top edge and speeds up like a dropped thing */
    const p = seg(t, 0, A_LAND);
    const air = 1 - p;
    let x = homeX + spin * 36 * air;
    let y = lerp(height / 2 + size * 0.75, homeY, p * p);
    const rotX = -0.85 * air + lerp(0, -0.24, release);
    let rotY = 0;
    let rotZ = spin * 0.95 * air;

    /* landing: a couple of quick, fading bounces */
    const tb = t - A_LAND;
    if (tb > 0) {
      const damp = Math.exp(-tb * 6.5);
      y += Math.abs(Math.sin(tb * 11)) * 44 * damp;
      rotZ += spin * 0.07 * Math.sin(tb * 11) * damp;
      x += spin * 5 * Math.sin(tb * 9) * damp;
    }

    /* hold: breathe a little so the reflections keep moving */
    const held = Math.max(0, t - A_SETTLE);
    y += Math.sin(held * 3.1) * 3 * (1 - open);
    rotY += Math.sin(held * 2.3) * 0.045;

    this.pouch.position.set(x, y, 0);
    this.pouch.rotation.set(rotX, rotY, rotZ);
    this.scene.environmentRotation.set(0.1 * Math.sin(t * 1.3), 0.34 * Math.sin(t * 1.9 + 0.6) + air * 1.3, 0);
    this.material.envMapRotation.copy(this.scene.environmentRotation);
    this.renderer.render(this.scene, this.camera);

    return t >= A_DONE;
  }

  /** Runs fall -> land -> loosen -> unwrap. Resolves once the foil is gone. */
  playArrive(callbacks: ArriveCallbacks = {}): Promise<void> {
    cancelAnimationFrame(this.raf);
    const spin = Math.random() < 0.5 ? -1 : 1;
    let openingSent = false;
    this.pouch.visible = true;

    return new Promise((resolve) => {
      const start = performance.now();
      const frame = (now: number) => {
        if (this.disposed) return resolve();
        const t = (now - start) / 1000;
        const done = this.drawArrive(t, spin);
        if (!openingSent && t >= A_RELEASE) {
          openingSent = true;
          callbacks.onOpening?.();
        }
        if (done) {
          this.pouch.visible = false;
          this.material.opacity = 1;
          this.renderer.clear();
          return resolve();
        }
        this.raf = requestAnimationFrame(frame);
      };
      this.raf = requestAnimationFrame(frame);
    });
  }

  /** Dev helper: one frozen moment of the arrival (see `?freeze=` on /track). */
  freezeArriveAt(seconds: number) {
    cancelAnimationFrame(this.raf);
    this.pouch.visible = true;
    this.drawArrive(seconds, 1);
  }

  /** Dev helper: draws one frozen moment of the timeline (see `?freeze=` on /display). */
  freezeAt(seconds: number) {
    cancelAnimationFrame(this.raf);
    this.pouch.visible = true;
    this.draw(seconds, 1);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    const m = this.material;
    for (const t of [m.map, m.roughnessMap, m.normalMap, m.displacementMap]) t?.dispose();
    m.dispose();
    this.mesh.geometry.dispose();
    this.env.dispose();
    this.renderer.dispose();
  }
}
