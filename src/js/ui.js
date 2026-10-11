/**
 * UI Orchestrator — Binds DOM elements, handles navigation tabs, updates gauges,
 * renders Chart.js mood timeline, modal dialogs, export triggers, and toast notifications.
 */

import { emotionEngine } from './emotionEngine.js';
import { ambientEngine, EMOTION_THEMES } from './ambientEngine.js';
import { analyticsEngine } from './analyticsEngine.js';
import { audioEngine } from './audioEngine.js';
import { mediaScanner } from './mediaScanner.js';
import { onModelStatus, getModelStatus } from './modelLoader.js';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

export class UIController {
  constructor() {
    this.sessionStartTime = Date.now();
    this.chartInstance = null;
    this.noFaceTicks = 0;
  }

  init() {
    this.bindNavigation();
    this.bindControls();
    this.bindScanner();
    this.initChart();
    this.bindModelStatus();
    this.syncSliderDefaults();
    this.startTelemetryTimer();

    const videoEl = document.getElementById('webcamVideo');
    const canvasEl = document.getElementById('overlayCanvas');
    emotionEngine.init(videoEl, canvasEl);

    // Try camera access silently or prepare standby
    this.attemptAutoCamera();
  }

  /** Header badge + footer show the REAL model state (loading / ready / failed). */
  bindModelStatus() {
    const badge = document.getElementById('engineStatusBadge');
    const dot = badge ? badge.querySelector('.status-dot') : null;
    const text = document.getElementById('engineStatusText');
    const footer = document.getElementById('footerStatusMsg');

    badge?.addEventListener('click', () => {
      if (getModelStatus().state === 'error') emotionEngine.loadModelsInBackground();
    });

    onModelStatus(({ state, message }) => {
      if (dot) {
        dot.classList.remove('green', 'amber', 'red');
        dot.classList.add(state === 'ready' ? 'green' : state === 'error' ? 'red' : 'amber');
      }
      badge?.classList.toggle('is-error', state === 'error');
      if (text) text.textContent = state === 'error' ? `${message} — click to retry` : message;
      if (footer) footer.textContent = state === 'ready' ? 'EmotiSync engine ready — running locally' : message;
      if (state === 'error') {
        this.showToast('Emotion models failed to load. Click the status badge to retry.', 'error');
      }
    });
  }

  /** Make the sliders' labels reflect the engine's actual starting values. */
  syncSliderDefaults() {
    const smooth = document.getElementById('smoothSlider');
    const smoothVal = document.getElementById('smoothVal');
    if (smooth) smooth.value = String(Math.round(emotionEngine.smoothingFactor * 10));
    if (smoothVal) smoothVal.textContent = emotionEngine.smoothingFactor.toFixed(1);

    const conf = document.getElementById('confSlider');
    const confVal = document.getElementById('confVal');
    if (conf) conf.value = String(Math.round(emotionEngine.minConfidence * 100));
    if (confVal) confVal.textContent = `${Math.round(emotionEngine.minConfidence * 100)}%`;
  }

  async attemptAutoCamera() {
    const standbyEl = document.getElementById('cameraStandby');
    try {
      await emotionEngine.startWebcam();
      this.updateCameraToggleUI(true);
    } catch (e) {
      if (standbyEl) standbyEl.classList.remove('hidden');
      this.updateCameraToggleUI(false);
    }
  }

  updateCameraToggleUI(isStreaming) {
    const textEl = document.getElementById('cameraToggleText');
    const iconEl = document.getElementById('cameraToggleIcon');
    const btn = document.getElementById('btnToggleCamera');
    const standbyEl = document.getElementById('cameraStandby');
    const badge = document.getElementById('streamSourceBadge');

    if (isStreaming) {
      if (textEl) textEl.textContent = 'Stop Camera';
      if (iconEl) iconEl.setAttribute('data-lucide', 'video-off');
      if (btn) {
        btn.classList.remove('btn-danger');
        btn.classList.add('btn-secondary');
      }
      if (standbyEl) standbyEl.classList.add('hidden');
      if (badge) badge.textContent = 'Live Webcam Stream';
      this.showToast('Live Camera Stream Active', 'success');
    } else {
      if (textEl) textEl.textContent = 'Start Camera';
      if (iconEl) iconEl.setAttribute('data-lucide', 'video');
      if (btn) {
        btn.classList.add('btn-danger');
        btn.classList.remove('btn-secondary');
      }
      if (standbyEl) standbyEl.classList.remove('hidden');
      if (badge) badge.textContent = 'Stream Paused';
      this.showToast('Camera Stream Paused', 'info');
    }

    if (window.lucide) window.lucide.createIcons();
  }

  bindNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        navButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        document.querySelectorAll('.tab-content').forEach(tab => {
          tab.classList.remove('active');
        });

        const activeTabEl = document.getElementById(`tab-${targetTab}`);
        if (activeTabEl) activeTabEl.classList.add('active');

        if (targetTab === 'analytics' && this.chartInstance) {
          this.chartInstance.resize();
        }
      });
    });
  }

  bindControls() {
    // Start / Stop Camera Toggle Buttons
    document.getElementById('btnToggleCamera')?.addEventListener('click', async () => {
      try {
        const isStreaming = await emotionEngine.toggleWebcam();
        this.updateCameraToggleUI(isStreaming);
      } catch (err) {
        this.showToast('Camera access denied or unavailable', 'error');
      }
    });

    document.getElementById('btnStartCamera')?.addEventListener('click', async () => {
      try {
        await emotionEngine.startWebcam();
        this.updateCameraToggleUI(true);
      } catch (err) {
        this.showToast('Camera permission denied or camera unavailable', 'error');
      }
    });

    document.getElementById('btnStartDemo')?.addEventListener('click', () => {
      emotionEngine.startDemoMode();
      document.getElementById('cameraStandby')?.classList.add('hidden');
      document.getElementById('streamSourceBadge').textContent = 'Synthetic Demo Feed';
      this.showToast('Demo Video Stream Active', 'info');
    });

    document.getElementById('btnSimulateStream')?.addEventListener('click', () => {
      if (emotionEngine.isDemoMode) {
        this.attemptAutoCamera();
      } else {
        emotionEngine.startDemoMode();
        document.getElementById('cameraStandby')?.classList.add('hidden');
        document.getElementById('streamSourceBadge').textContent = 'Synthetic Demo Feed';
        this.showToast('Switched to Demo Stream', 'info');
      }
    });

    // Mesh & Bbox toggles
    const meshBtn = document.getElementById('toggleMeshBtn');
    meshBtn?.addEventListener('click', () => {
      meshBtn.classList.toggle('active');
      emotionEngine.showMesh = meshBtn.classList.contains('active');
    });

    const bboxBtn = document.getElementById('toggleBboxBtn');
    bboxBtn?.addEventListener('click', () => {
      bboxBtn.classList.toggle('active');
      emotionEngine.showBbox = bboxBtn.classList.contains('active');
    });

    // Settings Sliders
    const smoothSlider = document.getElementById('smoothSlider');
    smoothSlider?.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      emotionEngine.smoothingFactor = val / 10;
      document.getElementById('smoothVal').textContent = (val / 10).toFixed(1);
    });

    const confSlider = document.getElementById('confSlider');
    confSlider?.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      emotionEngine.minConfidence = val / 100;
      document.getElementById('confVal').textContent = `${val}%`;
    });

    document.getElementById('ambientSyncCheck')?.addEventListener('change', (e) => {
      ambientEngine.setSyncEnabled(e.target.checked);
    });

    // Soundscape controls
    document.getElementById('btnToggleAudio')?.addEventListener('click', () => {
      const isPlaying = audioEngine.togglePlay();
      const playIcon = document.getElementById('audioPlayIcon');
      const playText = document.getElementById('audioPlayText');
      const pulseRing = document.getElementById('audioPulseRing');

      if (isPlaying) {
        playIcon.setAttribute('data-lucide', 'pause');
        playText.textContent = 'Pause Soundscape';
        pulseRing?.classList.add('playing');
        this.showToast('Mood soundscape enabled', 'success');
      } else {
        playIcon.setAttribute('data-lucide', 'play');
        playText.textContent = 'Enable Mood Soundscape';
        pulseRing?.classList.remove('playing');
        this.showToast('Mood soundscape paused', 'info');
      }
      if (window.lucide) window.lucide.createIcons();
    });

    document.getElementById('masterVolumeSlider')?.addEventListener('input', (e) => {
      audioEngine.setMasterVolume(parseInt(e.target.value, 10));
    });

    // Export & Snapshot Modal
    document.getElementById('btnSnapshot')?.addEventListener('click', () => {
      this.openSnapshotModal();
    });

    document.getElementById('btnCopyJson')?.addEventListener('click', async () => {
      const text = document.getElementById('snapshotJsonPre')?.textContent || '';
      try {
        await navigator.clipboard.writeText(text);
        this.showToast('Telemetry JSON copied', 'success');
      } catch {
        this.showToast('Copy failed — select the text manually', 'error');
      }
    });

    document.getElementById('btnCloseModal')?.addEventListener('click', () => {
      document.getElementById('snapshotModal')?.classList.add('hidden');
    });

    document.getElementById('btnExportLogs')?.addEventListener('click', () => {
      this.exportData();
    });

    document.getElementById('btnClearChart')?.addEventListener('click', () => {
      analyticsEngine.clearHistory();
      if (this.chartInstance) {
        this.chartInstance.data.labels = [];
        this.chartInstance.data.datasets.forEach(ds => ds.data = []);
        this.chartInstance.update();
      }
      this.showToast('Analytics history cleared', 'info');
    });
  }

  bindScanner() {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('mediaFileInput');
    const selectBtn = document.getElementById('btnSelectFile');

    mediaScanner.init({
      dropzone,
      results: document.getElementById('scannerResults'),
      imagePreview: document.getElementById('scanImagePreview'),
      videoPreview: document.getElementById('scanVideoPreview'),
      canvasOverlay: document.getElementById('scanCanvasOverlay'),
      cropGallery: document.getElementById('faceCropList')
    });

    selectBtn?.addEventListener('click', () => fileInput.click());

    fileInput?.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        mediaScanner.processFile(e.target.files[0]);
      }
    });

    dropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = '#06b6d4';
    });

    dropzone?.addEventListener('dragleave', () => {
      dropzone.style.borderColor = 'rgba(255, 255, 255, 0.15)';
    });

    dropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'rgba(255, 255, 255, 0.15)';
      if (e.dataTransfer.files.length > 0) {
        mediaScanner.processFile(e.dataTransfer.files[0]);
      }
    });

    document.getElementById('btnClearScan')?.addEventListener('click', () => {
      mediaScanner.clearScan();
    });
  }

  initChart() {
    const ctx = document.getElementById('emotionTimelineChart')?.getContext('2d');
    if (!ctx) return;

    this.chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          { label: 'Happy', borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', data: [], tension: 0.35, fill: true },
          { label: 'Neutral', borderColor: '#06b6d4', backgroundColor: 'rgba(6, 182, 212, 0.1)', data: [], tension: 0.35, fill: true },
          { label: 'Surprised', borderColor: '#a855f7', backgroundColor: 'rgba(168, 85, 247, 0.1)', data: [], tension: 0.35, fill: true },
          { label: 'Sad', borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', data: [], tension: 0.35, fill: true },
          { label: 'Angry', borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', data: [], tension: 0.35, fill: true },
          { label: 'Fearful', borderColor: '#f97316', backgroundColor: 'rgba(249, 115, 22, 0.1)', data: [], tension: 0.35, fill: true },
          { label: 'Disgusted', borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', data: [], tension: 0.35, fill: true }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        scales: {
          x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9ca3af', font: { family: 'JetBrains Mono', size: 10 } } },
          y: { min: 0, max: 100, grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9ca3af', font: { family: 'JetBrains Mono', size: 10 } } }
        },
        plugins: {
          legend: { labels: { color: '#f3f4f6', font: { family: 'Inter', size: 12 } } }
        }
      }
    });
  }

  startTelemetryTimer() {
    this.stopTelemetryTimer();
    this.telemetryTimerId = setInterval(() => {
      this.updateTelemetryData();
      this.updateSessionDuration();
    }, 500); // 2Hz Telemetry Update Loop
  }

  stopTelemetryTimer() {
    if (this.telemetryTimerId) {
      clearInterval(this.telemetryTimerId);
      this.telemetryTimerId = null;
    }
  }

  updateTelemetryData() {
    if (typeof document === 'undefined') return;
    const engine = emotionEngine;
    const streaming = engine.isStreaming;
    const live = streaming && !engine.isDemoMode;
    const faces = engine.detectedFaces || [];
    const face = engine.getPrimaryFace();

    // Measured performance (not placeholders)
    const fpsText = live && engine.stats.fps ? String(Math.round(engine.stats.fps)) : '—';
    const latText = live && engine.stats.latencyMs ? `${Math.round(engine.stats.latencyMs)}ms` : '—';
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('fpsVal', fpsText);
    set('latencyVal', latText);
    set('footerLatency', latText);

    set('faceCountVal', streaming ? `${faces.length} Face${faces.length === 1 ? '' : 's'}` : '0 Faces');

    if (!face) {
      this.renderNoFace(streaming);
    } else {
      this.noFaceTicks = 0;
      this.renderFace(face, faces);
    }

    this.renderAnalyticsMetrics();
  }

  renderNoFace(streaming) {
    this.noFaceTicks += 1;
    for (const emo of ['happy', 'neutral', 'surprised', 'sad', 'angry', 'fearful', 'disgusted']) {
      const barEl = document.getElementById(`bar-${emo}`);
      const pctEl = document.getElementById(`pct-${emo}`);
      if (barEl) barEl.style.width = '0%';
      if (pctEl) pctEl.textContent = '0%';
    }

    const status = getModelStatus();
    let title = 'Camera off';
    let quote = 'Start the camera to begin';
    if (streaming) {
      if (status.state === 'loading') { title = 'Loading models…'; quote = 'Preparing the local engine'; }
      else if (status.state === 'error') { title = 'Models unavailable'; quote = 'Click the status badge to retry'; }
      else { title = 'No face detected'; quote = 'Face the camera in good lighting'; }
    }
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('heroEmotionTitle', title);
    set('heroEmojiBox', '🫥');
    set('heroVibeQuote', quote);
    set('dominantConfPill', '—');
    set('primaryEmotionTag', '—');
    set('positivityScoreVal', '—');

    document.getElementById('multiFaceContainer')?.classList.add('hidden');

    // relax the ambient aura after a couple of seconds without a face
    if (this.noFaceTicks === 4) ambientEngine.applyTheme('neutral');
  }

  renderFace(face, faces) {
    const scores = face.scores;
    const dominant = face.dominant;
    const unsure = emotionEngine.isUncertain(face);
    const theme = ambientEngine.applyTheme(dominant);
    audioEngine.updateMood(dominant);

    for (const [emo, score] of Object.entries(scores)) {
      const pct = Math.round(score * 100);
      const barEl = document.getElementById(`bar-${emo}`);
      const pctEl = document.getElementById(`pct-${emo}`);
      if (barEl) barEl.style.width = `${pct}%`;
      if (pctEl) pctEl.textContent = `${pct}%`;
    }

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('heroEmotionTitle', unsure ? `${dominant}?` : dominant);
    set('heroEmojiBox', theme.emoji);
    set('heroVibeQuote', unsure ? 'Low confidence — try better lighting' : theme.quote);
    set('dominantConfPill', `${Math.round(face.emotionConfidence * 100)}%`);
    set('primaryEmotionTag', dominant);
    set('positivityScoreVal', `${analyticsEngine.calculatePositivityScore(scores)}%`);

    // Only real detections are recorded (demo mode shows synthetic faces).
    if (!emotionEngine.isDemoMode) {
      analyticsEngine.addReading(scores, dominant, face.emotionConfidence);
      this.updateChart();
    }

    const multiContainer = document.getElementById('multiFaceContainer');
    const multiList = document.getElementById('multiFaceList');
    if (faces.length > 1 && multiContainer && multiList) {
      multiContainer.classList.remove('hidden');
      set('multiFaceBadge', `${faces.length} Tracked`);
      multiList.innerHTML = faces.map((f) => `
        <div class="multi-face-card">
          <span class="face-tag">Face #${f.id}</span>
          <span class="face-emotion-badge">${f.dominant} ${Math.round(f.emotionConfidence * 100)}%</span>
        </div>
      `).join('');
    } else if (multiContainer) {
      multiContainer.classList.add('hidden');
    }
  }

  updateChart() {
    if (!this.chartInstance) return;
    const history = analyticsEngine.history;
    const keys = ['happy', 'neutral', 'surprised', 'sad', 'angry', 'fearful', 'disgusted'];
    this.chartInstance.data.labels = history.map((h) => h.timeLabel);
    keys.forEach((k, i) => {
      this.chartInstance.data.datasets[i].data = history.map((h) => Math.round((h.scores[k] || 0) * 100));
    });
    this.chartInstance.update('none');
  }

  renderAnalyticsMetrics() {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const stability = analyticsEngine.getEmotionalStability();
    set('stabilityVal', stability === null ? '—' : `${stability}%`);
    set('stabilitySub', stability === null ? 'Needs a few seconds of data'
      : stability >= 80 ? 'Steady' : stability >= 60 ? 'Moderate' : 'Fluctuating');

    const peak = analyticsEngine.getPeakEmotion();
    set('peakEmotionVal', peak ? peak.emotion : '—');
    set('peakConfidenceVal', peak ? peak.confidence : 'Waiting for data');
  }

  updateSessionDuration() {
    if (typeof document === 'undefined') return;
    const elapsedSec = Math.floor((Date.now() - this.sessionStartTime) / 1000);
    const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
    const secs = String(elapsedSec % 60).padStart(2, '0');
    const durationEl = document.getElementById('sessionDuration');
    if (durationEl) durationEl.textContent = `${mins}:${secs}`;
  }

  openSnapshotModal() {
    const overlay = document.getElementById('overlayCanvas');
    const video = document.getElementById('webcamVideo');
    const snapshotImg = document.getElementById('snapshotImgPreview');
    const snapshotJson = document.getElementById('snapshotJsonPre');
    const downloadBtn = document.getElementById('btnDownloadSnapshot');
    const modal = document.getElementById('snapshotModal');

    if (overlay && snapshotImg) {
      // Composite the camera frame + overlays so the snapshot shows the face, not just the boxes.
      const out = document.createElement('canvas');
      out.width = overlay.width || 640;
      out.height = overlay.height || 480;
      const octx = out.getContext('2d');
      octx.fillStyle = '#000';
      octx.fillRect(0, 0, out.width, out.height);
      if (video && video.videoWidth && !emotionEngine.isDemoMode) {
        const { scale, ox, oy } = emotionEngine.coverTransform();
        octx.drawImage(video, ox, oy, video.videoWidth * scale, video.videoHeight * scale);
      }
      octx.drawImage(overlay, 0, 0);
      const dataUrl = out.toDataURL('image/png');
      snapshotImg.src = dataUrl;
      if (downloadBtn) downloadBtn.href = dataUrl;
    }

    const faces = (emotionEngine.detectedFaces || []).map((f) => ({
      id: f.id,
      dominantEmotion: f.dominant,
      emotionConfidence: Number(f.emotionConfidence.toFixed(3)),
      scores: Object.fromEntries(Object.entries(f.scores).map(([k, v]) => [k, Number(v.toFixed(3))]))
    }));

    const snapshotData = {
      timestamp: new Date().toISOString(),
      source: emotionEngine.isDemoMode ? 'synthetic-demo' : 'live-camera',
      faces,
      stabilityIndex: analyticsEngine.getEmotionalStability(),
      positivityIndex: faces.length ? analyticsEngine.calculatePositivityScore(emotionEngine.getPrimaryFace().scores) : null
    };

    if (snapshotJson) {
      snapshotJson.textContent = JSON.stringify(snapshotData, null, 2);
    }

    modal?.classList.remove('hidden');
  }

  exportData() {
    if (analyticsEngine.sessionLog.length === 0) {
      this.showToast('No readings recorded yet — start the camera first', 'info');
      return;
    }
    const csvContent = analyticsEngine.exportAsCSV();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `emotisync-session-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.showToast(`Exported ${analyticsEngine.sessionLog.length} readings`, 'success');
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i data-lucide="info"></i><span>${message}</span>`;
    container.appendChild(toast);

    if (window.lucide) window.lucide.createIcons();

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}

export const uiController = new UIController();
