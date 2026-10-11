// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const okNet = () => ({ loadFromUri: vi.fn().mockResolvedValue(undefined) });
const scores = (over = {}) => ({ happy: 0, neutral: 0, surprised: 0, sad: 0, angry: 0, fearful: 0, disgusted: 0, ...over });
const makeFace = (over, extra = {}) => {
  const s = scores(over);
  const dominant = Object.entries(s).sort((a, b) => b[1] - a[1])[0][0];
  return { id: 1, box: { x: 0, y: 0, width: 100, height: 100 }, scores: s, dominant, emotionConfidence: s[dominant], detectionScore: 0.99, ...extra };
};
const text = (id) => document.getElementById(id).textContent;

async function boot({ failModels = false } = {}) {
  vi.resetModules();
  vi.doMock('@vladmandic/face-api', () => ({
    nets: {
      tinyFaceDetector: failModels ? { loadFromUri: vi.fn().mockRejectedValue(new Error('404')) } : okNet(),
      faceLandmark68Net: okNet(),
      faceExpressionNet: okNet()
    }
  }));
  const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
  document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '');
  HTMLCanvasElement.prototype.getContext = () => null; // jsdom has no canvas
  const { uiController } = await import('../src/js/ui.js');
  const { emotionEngine } = await import('../src/js/emotionEngine.js');
  const { analyticsEngine } = await import('../src/js/analyticsEngine.js');
  uiController.init();
  await vi.waitFor(() => expect(document.getElementById('engineStatusText').textContent).not.toBe('Loading emotion models…'));
  return { ui: uiController, engine: emotionEngine, analytics: analyticsEngine };
}

describe('UI wiring (jsdom smoke test)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    try {
      const { uiController } = await import('../src/js/ui.js');
      uiController.stopTelemetryTimer();
    } catch {}
  });

  it('shows the real model status instead of a hard-coded "ready"', async () => {
    await boot();
    expect(text('engineStatusText')).toBe('Local engine ready');
    expect(document.querySelector('#engineStatusBadge .status-dot').classList.contains('green')).toBe(true);
  });

  it('reports a model-loading failure in the header, with a retry hint', async () => {
    await boot({ failModels: true });
    expect(text('engineStatusText')).toMatch(/Could not load emotion models.*retry/);
    expect(document.querySelector('#engineStatusBadge .status-dot').classList.contains('red')).toBe(true);
    expect(document.getElementById('engineStatusBadge').classList.contains('is-error')).toBe(true);
  });

  it('shows an honest empty state (and records nothing) when streaming with no face', async () => {
    const { ui, engine, analytics } = await boot();
    engine.isStreaming = true;
    engine.detectedFaces = [];
    ui.updateTelemetryData();
    expect(text('heroEmotionTitle')).toBe('No face detected');
    expect(text('primaryEmotionTag')).toBe('—');
    expect(text('positivityScoreVal')).toBe('—');
    expect(text('pct-happy')).toBe('0%');
    expect(analytics.sessionLog.length).toBe(0);
  });

  it('displays and records a real face', async () => {
    const { ui, engine, analytics } = await boot();
    engine.isStreaming = true;
    engine.detectedFaces = [makeFace({ happy: 0.9, neutral: 0.1 })];
    ui.updateTelemetryData();
    expect(text('heroEmotionTitle')).toBe('happy');
    expect(text('primaryEmotionTag')).toBe('happy');
    expect(text('pct-happy')).toBe('90%');
    expect(text('dominantConfPill')).toBe('90%');
    expect(analytics.sessionLog.length).toBe(1);
    expect(analytics.sessionLog[0].dominant).toBe('happy');
    expect(text('peakEmotionVal')).toBe('Happy');
  });

  it('marks a low-confidence result as unsure', async () => {
    const { ui, engine } = await boot();
    engine.isStreaming = true;
    engine.detectedFaces = [makeFace({ neutral: 0.4, sad: 0.3, happy: 0.3 })];
    ui.updateTelemetryData();
    expect(text('heroEmotionTitle')).toBe('neutral?');
    expect(text('heroVibeQuote')).toMatch(/Low confidence/);
  });

  it('lists every tracked face when several are present', async () => {
    const { ui, engine } = await boot();
    engine.isStreaming = true;
    engine.detectedFaces = [makeFace({ happy: 0.9 }, { id: 1 }), makeFace({ sad: 0.8 }, { id: 2, box: { x: 300, y: 0, width: 50, height: 50 } })];
    ui.updateTelemetryData();
    expect(document.getElementById('multiFaceContainer').classList.contains('hidden')).toBe(false);
    expect(document.querySelectorAll('.multi-face-card').length).toBe(2);
    expect(text('faceCountVal')).toBe('2 Faces');
    expect(text('heroEmotionTitle')).toBe('happy'); // the larger face is the primary subject
  });

  it('does not record the synthetic demo as real session data', async () => {
    const { ui, engine, analytics } = await boot();
    engine.isStreaming = true;
    engine.isDemoMode = true;
    engine.detectedFaces = [makeFace({ happy: 0.92 })];
    ui.updateTelemetryData();
    expect(text('heroEmotionTitle')).toBe('happy');
    expect(analytics.sessionLog.length).toBe(0);
  });

  it('shows measured FPS and latency, and "—" when not live', async () => {
    const { ui, engine } = await boot();
    engine.isStreaming = true;
    engine.stats = { fps: 14.6, latencyMs: 41.2 };
    engine.detectedFaces = [];
    ui.updateTelemetryData();
    expect(text('fpsVal')).toBe('15');
    expect(text('latencyVal')).toBe('41ms');
    expect(text('footerLatency')).toBe('41ms');

    engine.isStreaming = false;
    ui.updateTelemetryData();
    expect(text('fpsVal')).toBe('—');
    expect(text('latencyVal')).toBe('—');
  });

  it('has no invented analytics before any data exists, and no fake "Focus Index"', async () => {
    const { ui } = await boot();
    ui.updateTelemetryData();
    expect(text('stabilityVal')).toBe('—');
    expect(text('peakEmotionVal')).toBe('—');
    expect(document.getElementById('focusIndexVal')).toBeNull();
  });

  it('refuses to export an empty session instead of downloading an empty file', async () => {
    const { ui } = await boot();
    ui.exportData();
    expect(document.getElementById('toastContainer').textContent).toMatch(/No readings recorded yet/);
  });

  it('starts the sliders at the engine\'s real defaults', async () => {
    const { engine } = await boot();
    expect(document.getElementById('smoothSlider').value).toBe(String(Math.round(engine.smoothingFactor * 10)));
    expect(text('smoothVal')).toBe(engine.smoothingFactor.toFixed(1));
    expect(text('confVal')).toBe(`${Math.round(engine.minConfidence * 100)}%`);
  });
});
