/**
 * Emotion Engine — real-time multi-face emotion recognition.
 *
 * Pipeline (all in the browser, nothing leaves the device):
 *   1. face-api.js TinyFaceDetector finds faces in the video frame.
 *   2. FaceLandmark68Net gives the 68-point landmarks used for the mesh overlay.
 *   3. FaceExpressionNet scores the 7 emotions per face.
 *   4. FaceTracker matches faces across frames (by box overlap) and smooths scores per person.
 *
 * If the models are not loaded, no analysis is shown. There is deliberately no
 * heuristic fallback: a brightness-based guess is not emotion recognition and
 * would present made-up results as real ones.
 */

import { loadModels, getModelStatus } from './modelLoader.js';
import { FaceTracker, EMOTIONS, UNCERTAIN_BELOW, dominantOf } from './faceTracker.js';

const COLOR_MAP = {
  happy: '#f59e0b',
  neutral: '#06b6d4',
  surprised: '#a855f7',
  sad: '#3b82f6',
  angry: '#ef4444',
  fearful: '#f97316',
  disgusted: '#10b981'
};

// 68-point landmark index ranges (iBUG layout used by face-api.js)
const LANDMARK_GROUPS = [
  { from: 0, to: 16, closed: false },   // jaw
  { from: 17, to: 21, closed: false },  // right brow
  { from: 22, to: 26, closed: false },  // left brow
  { from: 27, to: 35, closed: false },  // nose
  { from: 36, to: 41, closed: true },   // right eye
  { from: 42, to: 47, closed: true },   // left eye
  { from: 48, to: 59, closed: true },   // outer mouth
  { from: 60, to: 67, closed: true }    // inner mouth
];

function pickScores(expressions) {
  return Object.fromEntries(EMOTIONS.map((e) => [e, (expressions && expressions[e]) || 0]));
}

export class EmotionEngine {
  constructor() {
    this.videoElement = null;
    this.canvasElement = null;
    this.ctx = null;

    this.isStreaming = false;
    this.isDemoMode = false;
    this.showMesh = true;
    this.showBbox = true;

    this.minConfidence = 0.5;     // face-detector score threshold
    this.uncertainBelow = UNCERTAIN_BELOW; // emotion confidence under this is shown as "unsure"
    this.detectorInputSize = 320;

    this.tracker = new FaceTracker({ smoothing: 0.6 });
    this.faceapi = null;
    this.detectedFaces = [];
    this.animationFrameId = null;
    this.demoPhase = 0;

    // real measurements, shown in the UI
    this.stats = { fps: 0, latencyMs: 0 };
    this._lastFrameTs = 0;
  }

  /** 0 = no smoothing … 0.9 = very slow. The weight on a new frame is (1 - factor). */
  get smoothingFactor() {
    return this.tracker.smoothing;
  }

  set smoothingFactor(value) {
    this.tracker.smoothing = Math.min(0.9, Math.max(0, Number(value) || 0));
  }

  get modelsReady() {
    return this.faceapi !== null;
  }

  async init(videoEl, canvasEl) {
    this.videoElement = videoEl;
    this.canvasElement = canvasEl;
    if (canvasEl) {
      this.ctx = canvasEl.getContext('2d');
    }
    return this.loadModelsInBackground();
  }

  async loadModelsInBackground() {
    if (typeof window === 'undefined') return null;
    try {
      this.faceapi = await loadModels();
    } catch {
      this.faceapi = null; // status is already 'error'; the UI shows it and offers a retry
    }
    return this.faceapi;
  }

  getModelStatus() {
    return getModelStatus();
  }

  async startWebcam() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Webcam mediaDevices API not supported in this environment.');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false
    });

    this.videoElement.srcObject = stream;
    await this.videoElement.play();
    this.tracker.reset();
    this.detectedFaces = [];
    this.isStreaming = true;
    this.isDemoMode = false;

    this.resizeCanvas();
    this.loop();
    return true;
  }

  async toggleWebcam() {
    if (this.isStreaming) {
      this.stopStream();
      return false;
    }
    await this.startWebcam();
    return true;
  }

  startDemoMode() {
    this.tracker.reset();
    this.isStreaming = true;
    this.isDemoMode = true;
    this.resizeCanvas();
    this.loop();
  }

  stopStream() {
    this.isStreaming = false;
    this.isDemoMode = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.videoElement) {
      if (this.videoElement.srcObject) {
        try {
          this.videoElement.srcObject.getTracks().forEach((track) => track.stop());
        } catch { /* already stopped */ }
        this.videoElement.srcObject = null;
      }
      try {
        this.videoElement.pause();
      } catch { /* not playing */ }
    }
    if (this.ctx && this.canvasElement) {
      this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
    }
    this.tracker.reset();
    this.detectedFaces = [];
    this.stats = { fps: 0, latencyMs: 0 };
    this._lastFrameTs = 0;
  }

  resizeCanvas() {
    if (!this.canvasElement) return;
    const parent = this.canvasElement.parentElement;
    if (parent) {
      this.canvasElement.width = parent.clientWidth || 640;
      this.canvasElement.height = parent.clientHeight || 480;
    }
  }

  /** Keep the canvas matched to its container (window resizes, layout changes). */
  syncCanvasSize() {
    const parent = this.canvasElement && this.canvasElement.parentElement;
    if (!parent) return;
    if (parent.clientWidth && (parent.clientWidth !== this.canvasElement.width || parent.clientHeight !== this.canvasElement.height)) {
      this.resizeCanvas();
    }
  }

  async loop() {
    if (!this.isStreaming) return;

    const now = performance.now();
    if (this._lastFrameTs) {
      const instantFps = 1000 / Math.max(1, now - this._lastFrameTs);
      this.stats.fps = this.stats.fps ? 0.9 * this.stats.fps + 0.1 * instantFps : instantFps;
    }
    this._lastFrameTs = now;

    this.syncCanvasSize();
    this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);

    try {
      if (this.isDemoMode) {
        this.processDemoFrame();
      } else {
        await this.processWebcamFrame();
      }
    } catch (err) {
      console.error('Frame processing failed:', err);
    }

    if (this.isStreaming) {
      this.animationFrameId = requestAnimationFrame(() => this.loop());
    }
  }

  /** Same transform the browser applies to the <video> (object-fit: cover), so overlays line up with faces. */
  coverTransform() {
    const vw = this.videoElement.videoWidth || this.canvasElement.width;
    const vh = this.videoElement.videoHeight || this.canvasElement.height;
    const cw = this.canvasElement.width;
    const ch = this.canvasElement.height;
    const scale = Math.max(cw / vw, ch / vh);
    return { scale, ox: (cw - vw * scale) / 2, oy: (ch - vh * scale) / 2 };
  }

  async detectFaces(source) {
    const fa = this.faceapi;
    const options = new fa.TinyFaceDetectorOptions({
      inputSize: this.detectorInputSize,
      scoreThreshold: this.minConfidence
    });
    const results = await fa.detectAllFaces(source, options).withFaceLandmarks().withFaceExpressions();
    return results.map((r) => ({
      box: { x: r.detection.box.x, y: r.detection.box.y, width: r.detection.box.width, height: r.detection.box.height },
      score: r.detection.score,
      landmarks: r.landmarks,
      scores: pickScores(r.expressions)
    }));
  }

  async processWebcamFrame() {
    const video = this.videoElement;
    if (!video || video.readyState < 2 || !video.videoWidth) return;

    // Models not loaded: show nothing rather than a guess. The UI surfaces the status.
    if (!this.faceapi) {
      this.detectedFaces = [];
      return;
    }

    const t0 = performance.now();
    const detections = await this.detectFaces(video);
    const elapsed = performance.now() - t0;
    this.stats.latencyMs = this.stats.latencyMs ? 0.8 * this.stats.latencyMs + 0.2 * elapsed : elapsed;

    if (!this.isStreaming) return; // stopped while detection was running

    this.detectedFaces = this.tracker.update(detections);
    this.drawFaces();
  }

  drawFaces() {
    const { scale, ox, oy } = this.coverTransform();
    for (const face of this.detectedFaces) {
      const b = face.box;
      if (this.showBbox) {
        this.drawBoundingBox(b.x * scale + ox, b.y * scale + oy, b.width * scale, b.height * scale, face);
      }
      if (this.showMesh && face.landmarks) {
        this.drawLandmarks(face.landmarks.positions, scale, ox, oy);
      }
    }
  }

  // ── Demo mode: clearly labelled synthetic faces; never recorded as real data ──────
  processDemoFrame() {
    this.demoPhase += 0.03;
    const width = this.canvasElement.width;
    const height = this.canvasElement.height;

    const make = (id, x, y, w, h, scores) => {
      const dominant = dominantOf(scores);
      return { id, box: { x, y, width: w, height: h }, scores, dominant, emotionConfidence: scores[dominant], detectionScore: 1, isDemo: true };
    };

    this.detectedFaces = [
      make(1, width * 0.18 + Math.sin(this.demoPhase * 0.5) * 15, height * 0.22 + Math.cos(this.demoPhase * 0.5) * 10, width * 0.32, height * 0.48,
        { happy: 0.92, neutral: 0.05, surprised: 0.02, sad: 0.01, angry: 0, fearful: 0, disgusted: 0 }),
      make(2, width * 0.54 + Math.cos(this.demoPhase * 0.6) * 15, height * 0.25 + Math.sin(this.demoPhase * 0.6) * 10, width * 0.30, height * 0.45,
        { happy: 0.05, neutral: 0.15, surprised: 0.78, sad: 0.01, angry: 0.01, fearful: 0, disgusted: 0 })
    ];

    for (const face of this.detectedFaces) {
      if (this.showBbox) {
        this.drawBoundingBox(face.box.x, face.box.y, face.box.width, face.box.height, face);
      }
      if (this.showMesh) {
        this.drawDemoWireframe(face.box.x, face.box.y, face.box.width, face.box.height);
      }
    }
  }

  // ── Queries ───────────────────────────────────────────────────────────────────────

  /** The largest visible face (the main subject), or null when nobody is in frame. */
  getPrimaryFace() {
    if (!this.detectedFaces.length) return null;
    return this.detectedFaces.reduce((a, b) => (b.box.width * b.box.height > a.box.width * a.box.height ? b : a));
  }

  getDominantEmotion(scores) {
    return dominantOf(scores || {});
  }

  isUncertain(face) {
    return !!face && face.emotionConfidence < this.uncertainBelow;
  }

  // ── Drawing ───────────────────────────────────────────────────────────────────────

  drawBoundingBox(x, y, w, h, face) {
    const ctx = this.ctx;
    ctx.save();

    const accentColor = COLOR_MAP[face.dominant] || '#06b6d4';
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x, y, w, h);

    const cornerLen = Math.min(22, w / 3, h / 3);
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(x, y + cornerLen); ctx.lineTo(x, y); ctx.lineTo(x + cornerLen, y);
    ctx.moveTo(x + w - cornerLen, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + cornerLen);
    ctx.moveTo(x, y + h - cornerLen); ctx.lineTo(x, y + h); ctx.lineTo(x + cornerLen, y + h);
    ctx.moveTo(x + w - cornerLen, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - cornerLen);
    ctx.stroke();

    // The % shown is the EMOTION confidence (not the face-detection score).
    const unsure = this.isUncertain(face);
    const name = unsure ? `${face.dominant.toUpperCase()}?` : face.dominant.toUpperCase();
    const badgeText = `FACE #${face.id}: ${name} ${Math.round(face.emotionConfidence * 100)}%`;
    ctx.font = '700 12px "Outfit", sans-serif';
    const textWidth = ctx.measureText(badgeText).width;
    const badgeY = Math.max(y - 28, 0);

    ctx.fillStyle = 'rgba(10, 12, 20, 0.90)';
    ctx.fillRect(x, badgeY, textWidth + 16, 24);
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, badgeY, textWidth + 16, 24);
    ctx.fillStyle = accentColor;
    ctx.fillText(badgeText, x + 8, badgeY + 16);

    ctx.restore();
  }

  drawLandmarks(positions, scale, ox, oy) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.6)';
    ctx.fillStyle = '#06b6d4';
    ctx.lineWidth = 1.5;

    const pts = positions.map((p) => ({ x: p.x * scale + ox, y: p.y * scale + oy }));
    pts.forEach((pt) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
      ctx.fill();
    });

    for (const g of LANDMARK_GROUPS) {
      if (pts.length <= g.to) continue;
      ctx.beginPath();
      ctx.moveTo(pts[g.from].x, pts[g.from].y);
      for (let i = g.from + 1; i <= g.to; i++) ctx.lineTo(pts[i].x, pts[i].y);
      if (g.closed) ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Decorative grid for the synthetic demo only. It does not represent real landmarks. */
  drawDemoWireframe(x, y, w, h) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.35)';
    ctx.fillStyle = '#06b6d4';
    ctx.lineWidth = 1;
    const rows = 6;
    const cols = 8;
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        const px = x + w * (c / cols);
        const py = y + h * (r / rows);
        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
        ctx.fill();
        if (c < cols) {
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x + w * ((c + 1) / cols), py); ctx.stroke();
        }
        if (r < rows) {
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, y + h * ((r + 1) / rows)); ctx.stroke();
        }
      }
    }
    ctx.restore();
  }
}

export { EMOTIONS };
export const emotionEngine = new EmotionEngine();
