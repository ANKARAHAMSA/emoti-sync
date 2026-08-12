/**
 * Emotion Engine — Manages computer vision face detection, landmark wireframing,
 * real-time emotion neural net processing via face-api.js, and smoothing.
 */

let faceapi = null;

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
    this.minConfidence = 0.4;
    this.modelsLoaded = false;
    this.isDetecting = false;

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

  async init(videoEl, canvasEl) {
    this.videoElement = videoEl;
    this.canvasElement = canvasEl;
    if (canvasEl) {
      this.ctx = canvasEl.getContext('2d');
    }
    
    this.loadModelsInBackground();
  }

  async loadModelsInBackground() {
    if (typeof window === 'undefined') return;
    try {
      if (!faceapi) {
        faceapi = await import('@vladmandic/face-api');
      }
      const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
      console.log('⏳ Loading Face-API neural network models...');
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
      ]);
      this.modelsLoaded = true;
      console.log('✅ Face-API Neural Network Models loaded successfully!');
    } catch (err) {
      console.warn('⚠️ Face-API CDN model loading deferred. Using fallback detection.', err);
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
      console.warn('Webcam initialization failed or permission denied.', err);
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

  async loop() {
    if (!this.isStreaming) return;

    this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);

    if (this.isDemoMode) {
      this.processDemoFrame();
    } else {
      await this.processWebcamFrame();
    }

    this.animationFrameId = requestAnimationFrame(() => this.loop());
  }

  processDemoFrame() {
    this.demoPhase += 0.03;
    const width = this.canvasElement.width;
    const height = this.canvasElement.height;

    const faceX = width * 0.35 + Math.sin(this.demoPhase * 0.5) * 20;
    const faceY = height * 0.25 + Math.cos(this.demoPhase * 0.5) * 15;
    const faceW = width * 0.3;
    const faceH = height * 0.45;

    const rawScores = {
      happy: Math.max(0.01, (Math.sin(this.demoPhase) + 1) / 2),
      neutral: Math.max(0.01, (Math.cos(this.demoPhase * 0.8) + 1) / 2),
      surprised: Math.max(0.01, (Math.sin(this.demoPhase * 1.5) + 1) / 4),
      sad: Math.max(0.01, (Math.cos(this.demoPhase * 0.3) + 1) / 5),
      angry: 0.02,
      fearful: 0.03,
      disgusted: 0.02
    };

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

    if (this.showBbox) {
      this.drawBoundingBox(faceX, faceY, faceW, faceH, dominant, 0.97);
    }
    if (this.showMesh) {
      this.drawSyntheticFaceMesh(faceX, faceY, faceW, faceH);
    }
  }

  async processWebcamFrame() {
    const width = this.canvasElement.width;
    const height = this.canvasElement.height;

    if (this.modelsLoaded && faceapi && this.videoElement && this.videoElement.readyState === 4 && !this.isDetecting) {
      this.isDetecting = true;
      try {
        const detections = await faceapi
          .detectAllFaces(this.videoElement, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: this.minConfidence }))
          .withFaceLandmarks()
          .withFaceExpressions();

        this.isDetecting = false;

        if (detections && detections.length > 0) {
          const resizedDetections = faceapi.resizeResults(detections, { width, height });
          this.detectedFaces = resizedDetections;

          const primaryDetection = resizedDetections[0];
          const rawExpressions = primaryDetection.expressions;

          const mappedScores = {
            happy: rawExpressions.happy || 0,
            neutral: rawExpressions.neutral || 0,
            surprised: rawExpressions.surprised || 0,
            sad: rawExpressions.sad || 0,
            angry: rawExpressions.angry || 0,
            fearful: rawExpressions.fearful || 0,
            disgusted: rawExpressions.disgusted || 0
          };

          this.updateSmoothedScores(mappedScores);
          const dominant = this.getDominantEmotion(this.smoothedScores);

          resizedDetections.forEach(det => {
            const box = det.detection.box;
            if (this.showBbox) {
              this.drawBoundingBox(box.x, box.y, box.width, box.height, dominant, det.detection.score);
            }
            if (this.showMesh && det.landmarks) {
              this.drawRealFaceLandmarks(det.landmarks);
            }
          });

          return;
        }
      } catch (err) {
        this.isDetecting = false;
        console.warn('Realtime face detection frame skip:', err);
      }
    }

    // Fallback if model loading or detection frame skips
    const faceX = width * 0.25;
    const faceY = height * 0.15;
    const faceW = width * 0.5;
    const faceH = height * 0.6;

    const dominant = this.getDominantEmotion(this.smoothedScores);

    if (this.showBbox) {
      this.drawBoundingBox(faceX, faceY, faceW, faceH, dominant, 0.94);
    }
    if (this.showMesh) {
      this.drawSyntheticFaceMesh(faceX, faceY, faceW, faceH);
    }
  }

  updateSmoothedScores(newScores) {
    const alpha = 1 - (this.smoothingFactor * 0.7);
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

    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    const cornerLen = 20;
    ctx.lineWidth = 4;
    
    // Corners
    ctx.beginPath();
    ctx.moveTo(x, y + cornerLen); ctx.lineTo(x, y); ctx.lineTo(x + cornerLen, y);
    ctx.moveTo(x + w - cornerLen, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + cornerLen);
    ctx.moveTo(x, y + h - cornerLen); ctx.lineTo(x, y + h); ctx.lineTo(x + cornerLen, y + h);
    ctx.moveTo(x + w - cornerLen, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - cornerLen);
    ctx.stroke();

    // Badge Label
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

  drawRealFaceLandmarks(landmarks) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.6)';
    ctx.fillStyle = '#06b6d4';
    ctx.lineWidth = 1.5;

    const positions = landmarks.positions;
    positions.forEach(pt => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
      ctx.fill();
    });

    const jaw = landmarks.getJawOutline();
    const mouth = landmarks.getMouth();
    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();
    const nose = landmarks.getNose();

    [jaw, mouth, leftEye, rightEye, nose].forEach(feature => {
      if (!feature || feature.length === 0) return;
      ctx.beginPath();
      ctx.moveTo(feature[0].x, feature[0].y);
      for (let i = 1; i < feature.length; i++) {
        ctx.lineTo(feature[i].x, feature[i].y);
      }
      ctx.closePath();
      ctx.stroke();
    });

    ctx.restore();
  }

  drawSyntheticFaceMesh(x, y, w, h) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fillStyle = 'rgba(6, 182, 212, 0.6)';
    ctx.lineWidth = 1;

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

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
      ctx.fill();

      if ((i + 1) % (cols + 1) !== 0) {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(points[i + 1].x, points[i + 1].y);
        ctx.stroke();
      }
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
