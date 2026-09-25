import type {ProgressSnapshot} from './progress_data_types.js';
interface Particle {
  side: number;
  delay: number;
  speed: number;
  lift: number;
  size: number;
  spin: number;
  phase: number;
  color: string;
  streamer: boolean;
}
const COLORS = ['#a0f4d9', '#ffe39a', '#ff93b5', '#bdadff', '#e9fff8'];
const PARTICLE_LIFETIME = 3.6;
const BURST_INTERVAL = 0.9;

/** Optional completion overlay. Call update() from your existing animation loop. */
export class CompletionCelebration {
  private readonly completionMessage: string;
  private readonly seen: Set<string>;
  private activeKey: string | null;
  private startedAt: number | null;
  private particles: Particle[];
  private readonly motion: MediaQueryList;
  private readonly element: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D | null;
  private readonly message: HTMLDivElement;
  private readonly title: HTMLElement;
  private readonly detail: HTMLSpanElement;
  private disposed = false;
  constructor(container: HTMLElement, {message = 'Congrats!'} = {}) {
    if (typeof message !== 'string') {
      throw new TypeError('Completion message must be a string');
    }
    this.completionMessage = message;
    const doc = container.ownerDocument;
    this.seen = new Set();
    this.activeKey = null;
    this.startedAt = null;
    this.particles = [];
    this.motion = doc.defaultView!.matchMedia(
      '(prefers-reduced-motion: reduce)',
    );
    this.element = doc.createElement('div');
    this.element.className = 'pace-celebration';
    this.element.hidden = true;
    Object.assign(this.element.style, {
      position: 'absolute',
      inset: '0',
      zIndex: '3',
      pointerEvents: 'none',
      overflow: 'hidden',
    });
    this.canvas = doc.createElement('canvas');
    this.canvas.setAttribute('aria-hidden', 'true');
    Object.assign(this.canvas.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
    });
    this.context = this.canvas.getContext('2d');
    this.message = doc.createElement('div');
    this.message.setAttribute('role', 'status');
    this.message.setAttribute('aria-live', 'polite');
    Object.assign(this.message.style, {
      position: 'absolute',
      top: '12%',
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'max-content',
      maxWidth: '90%',
      textAlign: 'center',
      padding: '17px 30px',
      overflowWrap: 'anywhere',
      border: '1px solid #bdffe84d',
      borderRadius: '16px',
      background: '#071a24c9',
      boxShadow: '0 8px 50px #040c1833',
      backdropFilter: 'blur(10px)',
      color: '#effff8',
    });
    this.title = doc.createElement('strong');
    Object.assign(this.title.style, {
      display: 'block',
      font: '500 clamp(26px, 4vw, 46px) system-ui, sans-serif',
      letterSpacing: '-1.5px',
    });
    this.detail = doc.createElement('span');
    Object.assign(this.detail.style, {
      display: 'block',
      marginTop: '6px',
      color: '#b8e5d8',
      font: '11px ui-monospace, monospace',
    });
    this.message.append(this.title, this.detail);
    this.element.append(this.canvas, this.message);
    container.append(this.element);
  }

  /** Hide the current effect while retaining run deduplication across reconnects. */
  reset() {
    this.startedAt = null;
    this.particles = [];
    this.activeKey = null;
    this.element.hidden = true;
    this.title.textContent = '';
    this.detail.textContent = '';
  }

  update(
    snapshot: ProgressSnapshot,
    {reduced = false, source = '', now = performance.now()} = {},
  ) {
    if (this.disposed) {
      return;
    }
    const key =
      snapshot.runId != null && snapshot.runId !== ''
        ? JSON.stringify([source, snapshot.runId])
        : null;
    if (snapshot.state !== 'completed' || key == null) {
      if (this.activeKey !== null) {
        this.reset();
      }
      return;
    }
    if (key !== this.activeKey) {
      this.reset();
      this.activeKey = key;
      if (this.seen.has(key)) {
        return;
      }
      this.seen.add(key);
      this.startedAt = now;
      this.element.hidden = false;
      this.title.textContent = this.completionMessage;
      this.title.hidden = this.completionMessage.length === 0;
      this.detail.textContent = `${new Intl.NumberFormat('en-US').format(snapshot.completed)} ${snapshot.unit ?? 'rows'} completed`;
      // Four staggered bursts recycle a fixed pool rather than accumulating particles.
      this.particles = Array.from({length: 280}, (_, i) => {
        const side = i % 2 !== 0 ? 1 : -1;
        return {
          side,
          delay: Math.floor(i / 70) * BURST_INTERVAL,
          speed: 0.28 + Math.random() * 0.48,
          lift: 0.66 + Math.random() * 0.46,
          size: 3 + Math.random() * 5,
          spin: (Math.random() - 0.5) * 12,
          phase: Math.random() * Math.PI * 2,
          color: COLORS[i % COLORS.length],
          streamer: i % 7 === 0,
        };
      });
    }
    if (this.startedAt === null) {
      return;
    }
    const elapsed = Math.max(0, (now - this.startedAt) / 1000);
    const still = reduced || this.motion.matches;
    // If motion is disabled during a burst, discard it rather than replaying later.
    if (still) {
      this.particles = [];
    }
    this.canvas.hidden = still;
    this.message.style.opacity = String(still ? 1 : Math.min(1, elapsed / 0.2));
    this.draw(elapsed);
  }

  draw(elapsed: number) {
    const ctx = this.context;
    if (ctx == null) {
      return;
    }
    const {width, height} = this.element.getBoundingClientRect();
    if (width === 0 || height === 0) {
      return;
    }
    const displayPixelRatio =
      this.element.ownerDocument.defaultView!.devicePixelRatio;
    const ratio = Math.min(
      displayPixelRatio === 0 || Number.isNaN(displayPixelRatio)
        ? 1
        : displayPixelRatio,
      2,
    );
    const w = Math.round(width * ratio);
    const h = Math.round(height * ratio);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    for (const p of this.particles) {
      if (elapsed < p.delay) {
        continue;
      }
      const t = (elapsed - p.delay) % PARTICLE_LIFETIME;
      const flight = (1 - Math.exp(-0.65 * t)) / 0.65;
      const x =
        (p.side < 0 ? 0.015 + p.speed * flight : 0.985 - p.speed * flight) *
        width;
      const y = (0.71 - p.lift * t + 0.31 * t * t) * height;
      ctx.save();
      ctx.globalAlpha = Math.min(1, (PARTICLE_LIFETIME - t) / 0.6);
      ctx.translate(x, y);
      ctx.rotate(p.phase + t * p.spin);
      ctx.fillStyle = p.color;
      ctx.scale(1, 0.3 + Math.abs(Math.cos(t * 7 + p.phase)) * 0.7);
      ctx.fillRect(
        -p.size / 2,
        -p.size / 2,
        p.size,
        p.streamer ? p.size * 3.5 : p.size * 0.65,
      );
      ctx.restore();
    }
    if (this.particles.length > 0) {
      // Striped party cones just inside each edge, aimed toward the center.
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.translate(side < 0 ? 8 : width - 8, height * 0.71 + 14);
        ctx.rotate(side * 0.65);
        ctx.scale(side < 0 ? 1 : -1, 1);
        ctx.fillStyle = '#bdadff';
        ctx.beginPath();
        ctx.moveTo(-10, 28);
        ctx.lineTo(-13, -14);
        ctx.lineTo(17, -3);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#ffe39a';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-11, 5);
        ctx.lineTo(6, 12);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  dispose() {
    this.reset();
    this.seen.clear();
    this.element.remove();
    this.disposed = true;
  }
}
