/**
 * UI Orchestrator — Binds DOM elements, handles navigation tabs, updates gauges,
 * renders Chart.js mood timeline, modal dialogs, export triggers, and toast notifications.
 */

import { emotionEngine } from './emotionEngine.js';
import { ambientEngine, EMOTION_THEMES } from './ambientEngine.js';
import { analyticsEngine } from './analyticsEngine.js';
import { audioEngine } from './audioEngine.js';
import { mediaScanner } from './mediaScanner.js';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

export class UIController {
  constructor() {
    this.sessionStartTime = Date.now();
    this.chartInstance = null;
    this.fpsFrameCount = 0;
    this.lastFpsCalcTime = Date.now();
    this.currentFps = 30;
  }

  init() {
    this.bindNavigation();
    this.bindControls();
    this.bindScanner();
    this.initChart();
    this.startTelemetryTimer();
    
    // Auto-start synthetic demo mode for smooth instant out-of-the-box preview
    const videoEl = document.getElementById('webcamVideo');
    const canvasEl = document.getElementById('overlayCanvas');
    emotionEngine.init(videoEl, canvasEl);

    // Try camera access silently or prepare standby
    this.attemptAutoCamera();
  }

  async attemptAutoCamera() {
    const standbyEl = document.getElementById('cameraStandby');
    try {
      await emotionEngine.startWebcam();
      if (standbyEl) standbyEl.classList.add('hidden');
      this.showToast('Webcam feed initialized', 'success');
    } catch (e) {
      // Keep standby active so user can click Initialize Camera or Run Synthetic Demo
      if (standbyEl) standbyEl.classList.remove('hidden');
    }
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
    // Camera Standby Buttons
    document.getElementById('btnStartCamera')?.addEventListener('click', async () => {
      try {
        await emotionEngine.startWebcam();
        document.getElementById('cameraStandby')?.classList.add('hidden');
        this.showToast('Live camera feed active', 'success');
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
          { label: 'Happy', borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', data: [], tension: 0.4, fill: true },
          { label: 'Neutral', borderColor: '#06b6d4', backgroundColor: 'rgba(6, 182, 212, 0.1)', data: [], tension: 0.4, fill: true },
          { label: 'Surprised', borderColor: '#a855f7', backgroundColor: 'rgba(168, 85, 247, 0.1)', data: [], tension: 0.4, fill: true },
          { label: 'Sad', borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', data: [], tension: 0.4, fill: true }
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
    setInterval(() => {
      this.updateTelemetryData();
      this.updateSessionDuration();
    }, 500); // 2Hz Telemetry Update Loop
  }

  updateTelemetryData() {
    const scores = emotionEngine.smoothedScores;
    const dominant = emotionEngine.getDominantEmotion(scores);
    const theme = ambientEngine.applyTheme(dominant);
    audioEngine.updateMood(dominant);

    // Update 7 Meter Bars
    for (const [emo, score] of Object.entries(scores)) {
      const pct = Math.round(score * 100);
      const barEl = document.getElementById(`bar-${emo}`);
      const pctEl = document.getElementById(`pct-${emo}`);
      if (barEl) barEl.style.width = `${pct}%`;
      if (pctEl) pctEl.textContent = `${pct}%`;
    }

    // Hero Emotion Card
    const heroTitle = document.getElementById('heroEmotionTitle');
    const heroEmoji = document.getElementById('heroEmojiBox');
    const heroQuote = document.getElementById('heroVibeQuote');
    const heroPill = document.getElementById('dominantConfPill');

    if (heroTitle) heroTitle.textContent = dominant;
    if (heroEmoji) heroEmoji.textContent = theme.emoji;
    if (heroQuote) heroQuote.textContent = theme.quote;
    if (heroPill) heroPill.textContent = `${Math.round((scores[dominant] || 0.9) * 100)}%`;

    // Add reading to analytics
    const reading = analyticsEngine.addReading(scores, dominant, scores[dominant] || 0.95);

    // Update Quick Telemetry
    document.getElementById('primaryEmotionTag').textContent = dominant;
    document.getElementById('positivityScoreVal').textContent = `${reading.positivity}%`;
    document.getElementById('faceCountVal').textContent = emotionEngine.isStreaming ? '1 Face' : '0';

    // Update Chart
    if (this.chartInstance) {
      const labels = analyticsEngine.history.map(h => h.timeLabel);
      this.chartInstance.data.labels = labels;
      this.chartInstance.data.datasets[0].data = analyticsEngine.history.map(h => Math.round((h.scores.happy || 0) * 100));
      this.chartInstance.data.datasets[1].data = analyticsEngine.history.map(h => Math.round((h.scores.neutral || 0) * 100));
      this.chartInstance.data.datasets[2].data = analyticsEngine.history.map(h => Math.round((h.scores.surprised || 0) * 100));
      this.chartInstance.data.datasets[3].data = analyticsEngine.history.map(h => Math.round((h.scores.sad || 0) * 100));
      this.chartInstance.update();
    }

    // Update Analytics Tab Metrics
    document.getElementById('stabilityVal').textContent = `${analyticsEngine.getEmotionalStability()}%`;
    const peak = analyticsEngine.getPeakEmotion();
    document.getElementById('peakEmotionVal').textContent = peak.emotion;
    document.getElementById('peakConfidenceVal').textContent = peak.confidence;

    // FPS calculation
    this.fpsFrameCount++;
    const now = Date.now();
    if (now - this.lastFpsCalcTime >= 1000) {
      this.currentFps = Math.min(60, this.fpsFrameCount * 2);
      this.fpsFrameCount = 0;
      this.lastFpsCalcTime = now;
      document.getElementById('fpsVal').textContent = this.currentFps;
    }
  }

  updateSessionDuration() {
    const elapsedSec = Math.floor((Date.now() - this.sessionStartTime) / 1000);
    const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
    const secs = String(elapsedSec % 60).padStart(2, '0');
    const durationEl = document.getElementById('sessionDuration');
    if (durationEl) durationEl.textContent = `${mins}:${secs}`;
  }

  openSnapshotModal() {
    const canvas = document.getElementById('overlayCanvas');
    const snapshotImg = document.getElementById('snapshotImgPreview');
    const snapshotJson = document.getElementById('snapshotJsonPre');
    const downloadBtn = document.getElementById('btnDownloadSnapshot');
    const modal = document.getElementById('snapshotModal');

    if (canvas && snapshotImg) {
      const dataUrl = canvas.toDataURL('image/png');
      snapshotImg.src = dataUrl;
      if (downloadBtn) downloadBtn.href = dataUrl;
    }

    const currentScores = emotionEngine.smoothedScores;
    const dominant = emotionEngine.getDominantEmotion(currentScores);

    const snapshotData = {
      timestamp: new Date().toISOString(),
      dominantEmotion: dominant,
      scores: currentScores,
      stabilityIndex: analyticsEngine.getEmotionalStability(),
      positivityIndex: analyticsEngine.calculatePositivityScore(currentScores)
    };

    if (snapshotJson) {
      snapshotJson.textContent = JSON.stringify(snapshotData, null, 2);
    }

    modal?.classList.remove('hidden');
  }

  exportData() {
    const csvContent = analyticsEngine.exportAsCSV();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `emotisync-session-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.showToast('Session CSV telemetry exported!', 'success');
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
