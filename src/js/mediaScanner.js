/**
 * Media Scanner — Processes offline user-uploaded images and videos, runs real
 * face-api.js neural network inference per detected face, and renders accurate
 * per-face emotion distribution overlays and crop gallery cards.
 */

import { loadModels } from './modelLoader.js';
import { UNCERTAIN_BELOW } from './faceTracker.js';

// Shared with the live engine: models load once, from this app's own files.
const getFaceapi = () => loadModels();

const EMOTION_COLORS = {
  happy:     '#00ff87',
  neutral:   '#38bdf8',
  surprised: '#c084fc',
  sad:       '#60a5fa',
  angry:     '#ff4757',
  fearful:   '#ff9f43',
  disgusted: '#10b981'
};

function getDominant(expressions) {
  let best = 'neutral', bestScore = 0;
  for (const [emo, score] of Object.entries(expressions)) {
    if (score > bestScore) { bestScore = score; best = emo; }
  }
  return { emotion: best, conf: bestScore };
}

export class MediaScanner {
  constructor() {
    this.dropzoneEl = null;
    this.resultsEl = null;
    this.imagePreviewEl = null;
    this.videoPreviewEl = null;
    this.canvasOverlayEl = null;
    this.cropGalleryEl = null;
    this.currentFile = null;
    this._analyzing = false;
    this._analyzingVideo = false;
  }

  init(elements) {
    this.dropzoneEl = elements.dropzone;
    this.resultsEl = elements.results;
    this.imagePreviewEl = elements.imagePreview;
    this.videoPreviewEl = elements.videoPreview;
    this.canvasOverlayEl = elements.canvasOverlay;
    this.cropGalleryEl = elements.cropGallery;
  }

  processFile(file) {
    if (!file) return;
    this.currentFile = file;

    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');

    if (!isImage && !isVideo) {
      alert('Please upload a valid image or video file.');
      return;
    }

    this.dropzoneEl.classList.add('hidden');
    this.resultsEl.classList.remove('hidden');

    if (isImage) {
      this.processImage(file);
    } else if (isVideo) {
      this.processVideo(file);
    }
  }

  processImage(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      this.videoPreviewEl.classList.add('hidden');
      this.imagePreviewEl.classList.remove('hidden');
      this.imagePreviewEl.src = e.target.result;
      this.imagePreviewEl.onload = () => {
        this.analyzeStaticImage(this.imagePreviewEl);
      };
    };
    reader.readAsDataURL(file);
  }

  processVideo(file) {
    const videoUrl = URL.createObjectURL(file);
    this.imagePreviewEl.classList.add('hidden');
    this.videoPreviewEl.classList.remove('hidden');
    this.videoPreviewEl.src = videoUrl;
    this.videoPreviewEl.play();
    const rescan = () => this.analyzeVideoFrame(this.videoPreviewEl);
    this.videoPreviewEl.onloadeddata = rescan;
    this.videoPreviewEl.onseeked = rescan;
    this.videoPreviewEl.onpause = rescan;
  }

  async analyzeStaticImage(imgEl) {
    if (this._analyzing) return;
    this._analyzing = true;

    const ctx = this.canvasOverlayEl.getContext('2d');
    const w = imgEl.naturalWidth || imgEl.clientWidth;
    const h = imgEl.naturalHeight || imgEl.clientHeight;
    this.canvasOverlayEl.width = w;
    this.canvasOverlayEl.height = h;
    ctx.clearRect(0, 0, w, h);
    this.cropGalleryEl.innerHTML = '<p style="color:#64748b;font-size:12px;padding:8px">Analyzing faces…</p>';

    try {
      const fa = await getFaceapi();
      const detections = await fa
        .detectAllFaces(imgEl, new fa.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.35 }))
        .withFaceLandmarks()
        .withFaceExpressions();

      this.cropGalleryEl.innerHTML = '';

      if (!detections || detections.length === 0) {
        this.cropGalleryEl.innerHTML = '<p style="color:#64748b;font-size:12px;padding:8px">No faces detected.</p>';
        this._analyzing = false;
        return;
      }

      detections.forEach((det, idx) => {
        const box = det.detection.box;
        const expr = det.expressions;
        const { emotion, conf } = getDominant(expr);
        const color = EMOTION_COLORS[emotion] || '#00ff87';

        // Draw bounding box with neon glow
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 16;
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.strokeRect(box.x, box.y, box.width, box.height);
        ctx.restore();

        // Label badge above box
        const label = `${emotion.toUpperCase()}${conf < UNCERTAIN_BELOW ? '?' : ''}  ${Math.round(conf * 100)}%`;
        ctx.save();
        ctx.font = 'bold 14px "JetBrains Mono", monospace';
        const textW = ctx.measureText(label).width + 16;
        const badgeY = Math.max(box.y - 30, 0);
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(box.x, badgeY, textW, 26);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(box.x, badgeY, textW, 26);
        ctx.fillStyle = color;
        ctx.fillText(label, box.x + 8, badgeY + 17);
        ctx.restore();

        // Face crop card
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = 80;
        cropCanvas.height = 80;
        const cropCtx = cropCanvas.getContext('2d');
        try {
          cropCtx.drawImage(imgEl, box.x, box.y, box.width, box.height, 0, 0, 80, 80);
        } catch {
          cropCtx.fillStyle = '#1e293b';
          cropCtx.fillRect(0, 0, 80, 80);
        }

        // Build emotion breakdown text (top 3)
        const sorted = Object.entries(expr).sort((a, b) => b[1] - a[1]).slice(0, 3);
        const breakdownHtml = sorted.map(([e, s]) =>
          `<span style="color:${EMOTION_COLORS[e]||'#94a3b8'};font-size:10px">${e} ${Math.round(s*100)}%</span>`
        ).join('  ');

        const card = document.createElement('div');
        card.className = 'face-crop-card';
        card.style.flexDirection = 'column';
        card.style.gap = '6px';
        card.innerHTML = `
          <div style="display:flex;gap:10px;align-items:center">
            <div class="face-crop-thumb"></div>
            <div class="face-crop-meta">
              <span class="emotion-title" style="color:${color};text-transform:capitalize">${emotion}${conf < UNCERTAIN_BELOW ? '?' : ''}</span>
              <span class="confidence-text">${Math.round(conf * 100)}% confidence${conf < UNCERTAIN_BELOW ? ' (unsure)' : ''}</span>
            </div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;padding-left:2px">${breakdownHtml}</div>
        `;
        card.querySelector('.face-crop-thumb').appendChild(cropCanvas);
        this.cropGalleryEl.appendChild(card);
      });
    } catch (err) {
      console.error('Media Scanner analysis failed:', err);
      this.cropGalleryEl.innerHTML = '<p style="color:#ff4757;font-size:12px;padding:8px">Analysis failed — the emotion models could not be loaded. Reload the page and try again.</p>';
    }

    this._analyzing = false;
  }

  async analyzeVideoFrame(videoEl) {
    if (this._analyzingVideo) return;
    this._analyzingVideo = true;
    const ctx = this.canvasOverlayEl.getContext('2d');
    this.canvasOverlayEl.width = videoEl.videoWidth || 640;
    this.canvasOverlayEl.height = videoEl.videoHeight || 480;
    ctx.clearRect(0, 0, this.canvasOverlayEl.width, this.canvasOverlayEl.height);
    this.cropGalleryEl.innerHTML = '<p style="color:#64748b;font-size:12px;padding:8px">Analyzing frame…</p>';

    try {
      const fa = await getFaceapi();
      const detections = await fa
        .detectAllFaces(videoEl, new fa.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.35 }))
        .withFaceLandmarks()
        .withFaceExpressions();

      this.cropGalleryEl.innerHTML = '';

      if (!detections || detections.length === 0) {
        this.cropGalleryEl.innerHTML = '<p style="color:#64748b;font-size:12px;padding:8px">No faces detected in this frame. Pause or seek to another frame to scan it.</p>';
        return;
      }

      detections.forEach((det) => {
        const box = det.detection.box;
        const expr = det.expressions;
        const { emotion, conf } = getDominant(expr);
        const color = EMOTION_COLORS[emotion] || '#00ff87';

        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 16;
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.strokeRect(box.x, box.y, box.width, box.height);
        ctx.restore();

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = 80;
        cropCanvas.height = 80;
        const cropCtx = cropCanvas.getContext('2d');
        try {
          cropCtx.drawImage(videoEl, box.x, box.y, box.width, box.height, 0, 0, 80, 80);
        } catch {
          cropCtx.fillStyle = '#1e293b';
          cropCtx.fillRect(0, 0, 80, 80);
        }

        const card = document.createElement('div');
        card.className = 'face-crop-card';
        card.innerHTML = `
          <div class="face-crop-thumb"></div>
          <div class="face-crop-meta">
            <span class="emotion-title" style="color:${color}">${emotion}${conf < UNCERTAIN_BELOW ? '?' : ''}</span>
            <span class="confidence-text">${Math.round(conf * 100)}% confidence${conf < UNCERTAIN_BELOW ? ' (unsure)' : ''}</span>
          </div>
        `;
        card.querySelector('.face-crop-thumb').appendChild(cropCanvas);
        this.cropGalleryEl.appendChild(card);
      });
    } catch (err) {
      console.error('Video frame analysis failed:', err);
      this.cropGalleryEl.innerHTML = '<p style="color:#ff4757;font-size:12px;padding:8px">Frame analysis failed — the emotion models could not be loaded.</p>';
    } finally {
      this._analyzingVideo = false;
    }
  }

  clearScan() {
    this.currentFile = null;
    this._analyzing = false;
    this.dropzoneEl.classList.remove('hidden');
    this.resultsEl.classList.add('hidden');
    this.cropGalleryEl.innerHTML = '';
    if (this.videoPreviewEl.src) {
      URL.revokeObjectURL(this.videoPreviewEl.src);
      this.videoPreviewEl.src = '';
    }
    this.imagePreviewEl.src = '';
  }
}

export const mediaScanner = new MediaScanner();
