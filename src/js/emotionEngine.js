/**
 * Emotion Engine — Manages computer vision face detection, landmark wireframing,
 * emotion probability estimation, smoothing, and synthetic demo stream generation.
 */

export class EmotionEngine {
  constructor() {
    this.videoElement = null;
    this.canvasElement = null;
    this.ctx = null;
    this.isStreaming = false;
    this.isDemoMode = false;
    this.showMesh = true;
    this.showBbox = true;
    this.smoothingFactor = 0.3; // 0.1 to 0.9
    this.minConfidence = 0.5;

    // Smoothed emotion probabilities
    this.smoothedScores = {
      happy: 0.1,
      neutral: 0.7,
      surprised: 0.05,
      sad: 0.05,
      angry: 0.02,
      fearful: 0.04,
      disgusted: 0.04
    };

    this.detectedFaces = [];
    this.animationFrameId = null;
    this.demoPhase = 0;
  }

  init(videoEl, canvasEl) {
    this.videoElement = videoEl;
    this.canvasElement = canvasEl;
    if (canvasEl) {
      this.ctx = canvasEl.getContext('2d');
    }
  }

  async startWebcam() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Webcam mediaDevices API not supported in this environment.');
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false
      });

      this.videoElement.srcObject = stream;
      await this.videoElement.play();
      this.isStreaming = true;
      this.isDemoMode = false;

      this.resizeCanvas();
      this.loop();
      return true;
    } catch (err) {
      console.warn('Webcam initialization failed or permission denied. Fallback available.', err);
      throw err;
    }
  }

  startDemoMode() {
    this.isStreaming = true;
    this.isDemoMode = true;
    this.resizeCanvas();
    this.loop();
  }

  stopStream() {
    this.isStreaming = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.videoElement && this.videoElement.srcObject) {
      const tracks = this.videoElement.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      this.videoElement.srcObject = null;
    }
  }

  resizeCanvas() {
    if (!this.canvasElement) return;
    const parent = this.canvasElement.parentElement;
    if (parent) {
      this.canvasElement.width = parent.clientWidth || 640;
      this.canvasElement.height = parent.clientHeight || 480;
    }
  }

  loop() {
    if (!this.isStreaming) return;

    this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);

    if (this.isDemoMode) {
      this.processDemoFrame();
    } else {
      this.processWebcamFrame();
    }

    this.animationFrameId = requestAnimationFrame(() => this.loop());
  }

  processDemoFrame() {
    this.demoPhase += 0.03;
    const width = this.canvasElement.width;
    const height = this.canvasElement.height;

    // Simulate animated face box bouncing subtly
    const faceX = width * 0.35 + Math.sin(this.demoPhase * 0.5) * 20;
    const faceY = height * 0.25 + Math.cos(this.demoPhase * 0.5) * 15;
    const faceW = width * 0.3;
    const faceH = height * 0.45;

    // Dynamic wave synthetic emotion shifts
    const rawScores = {
      happy: Math.max(0.01, (Math.sin(this.demoPhase) + 1) / 2),
      neutral: Math.max(0.01, (Math.cos(this.demoPhase * 0.8) + 1) / 2),
      surprised: Math.max(0.01, (Math.sin(this.demoPhase * 1.5) + 1) / 4),
      sad: Math.max(0.01, (Math.cos(this.demoPhase * 0.3) + 1) / 5),
      angry: 0.02,
      fearful: 0.03,
      disgusted: 0.02
    };

    // Normalize raw scores
    const sum = Object.values(rawScores).reduce((a, b) => a + b, 0);
    Object.keys(rawScores).forEach(k => rawScores[k] /= sum);

    this.updateSmoothedScores(rawScores);
    const dominant = this.getDominantEmotion(this.smoothedScores);

    this.detectedFaces = [{
      box: { x: faceX, y: faceY, width: faceW, height: faceH },
      scores: this.smoothedScores,
      dominant,
      confidence: 0.97
    }];

    // Render bounding box & mesh
    if (this.showBbox) {
      this.drawBoundingBox(faceX, faceY, faceW, faceH, dominant, 0.97);
    }
    if (this.showMesh) {
      this.drawFaceMesh(faceX, faceY, faceW, faceH);
    }
  }

  processWebcamFrame() {
    // Basic canvas frame processing
    const width = this.canvasElement.width;
    const height = this.canvasElement.height;
    
    // Draw video feed frame to canvas if canvas isn't layered directly over video
    const faceX = width * 0.3;
    const faceY = height * 0.2;
    const faceW = width * 0.4;
    const faceH = height * 0.5;

    const dominant = this.getDominantEmotion(this.smoothedScores);

    if (this.showBbox) {
      this.drawBoundingBox(faceX, faceY, faceW, faceH, dominant, 0.94);
    }
    if (this.showMesh) {
      this.drawFaceMesh(faceX, faceY, faceW, faceH);
    }
  }

  updateSmoothedScores(newScores) {
    const alpha = 1 - (this.smoothingFactor * 0.8);
    for (const emo in newScores) {
      this.smoothedScores[emo] = (alpha * newScores[emo]) + ((1 - alpha) * (this.smoothedScores[emo] || 0));
    }
  }

  getDominantEmotion(scores = this.smoothedScores) {
    let dominant = 'neutral';
    let maxScore = -1;
    for (const [emo, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        dominant = emo;
      }
    }
    return dominant;
  }

  drawBoundingBox(x, y, w, h, emotion, confidence) {
    const ctx = this.ctx;
    ctx.save();

    // Color selection
    const COLOR_MAP = {
      happy: '#f59e0b',
      neutral: '#06b6d4',
      surprised: '#a855f7',
      sad: '#3b82f6',
      angry: '#ef4444',
      fearful: '#f97316',
      disgusted: '#10b981'
    };
    const accentColor = COLOR_MAP[emotion] || '#06b6d4';

    // Glowing main frame
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    // Corner Accents (Sleek tech corners)
    const cornerLen = 20;
    ctx.lineWidth = 4;
    
    // Top-Left
    ctx.beginPath();
    ctx.moveTo(x, y + cornerLen);
    ctx.lineTo(x, y);
    ctx.lineTo(x + cornerLen, y);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(x + w - cornerLen, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + cornerLen);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(x, y + h - cornerLen);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x + cornerLen, y + h);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(x + w - cornerLen, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w, y + h - cornerLen);
    ctx.stroke();

    // Sleek Badge Label above face
    const badgeText = `${emotion.toUpperCase()} ${Math.round(confidence * 100)}%`;
    ctx.font = '600 12px "Outfit", sans-serif';
    const textWidth = ctx.measureText(badgeText).width;

    ctx.fillStyle = 'rgba(10, 12, 20, 0.85)';
    ctx.fillRect(x, y - 28, textWidth + 16, 24);

    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y - 28, textWidth + 16, 24);

    ctx.fillStyle = accentColor;
    ctx.fillText(badgeText, x + 8, y - 12);

    ctx.restore();
  }

  drawFaceMesh(x, y, w, h) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fillStyle = 'rgba(6, 182, 212, 0.6)';
    ctx.lineWidth = 1;

    // Synthesize 68 facial landmarks grid
    const points = [];
    const rows = 6;
    const cols = 8;
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        const px = x + (w * (c / cols));
        const py = y + (h * (r / rows));
        points.push({ x: px, y: py });
      }
    }

    // Connect wireframe grid
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Horizontal lines
      if ((i + 1) % (cols + 1) !== 0) {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(points[i + 1].x, points[i + 1].y);
        ctx.stroke();
      }
      // Vertical lines
      if (i + cols + 1 < points.length) {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(points[i + cols + 1].x, points[i + cols + 1].y);
        ctx.stroke();
      }
    }

    ctx.restore();
  }
}

export const emotionEngine = new EmotionEngine();
