import { describe, it, expect, beforeEach } from 'vitest';
import { EmotionEngine } from '../src/js/emotionEngine.js';

const scores = (over = {}) => ({ happy: 0, neutral: 0, surprised: 0, sad: 0, angry: 0, fearful: 0, disgusted: 0, ...over });
const face = (id, w, h, over = {}) => {
  const s = scores(over);
  const dominant = Object.entries(s).sort((a, b) => b[1] - a[1])[0][0];
  return { id, box: { x: 0, y: 0, width: w, height: h }, scores: s, dominant, emotionConfidence: s[dominant] };
};

describe('EmotionEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new EmotionEngine();
  });

  it('picks the dominant emotion', () => {
    expect(engine.getDominantEmotion(scores({ neutral: 0.7, surprised: 0.2, happy: 0.1 }))).toBe('neutral');
  });

  it('clamps the smoothing factor to a safe range', () => {
    engine.smoothingFactor = 5;
    expect(engine.smoothingFactor).toBe(0.9);
    engine.smoothingFactor = -1;
    expect(engine.smoothingFactor).toBe(0);
    engine.smoothingFactor = 0.4;
    expect(engine.smoothingFactor).toBe(0.4);
  });

  it('returns no primary face (null) when nobody is in frame — never a made-up neutral', () => {
    expect(engine.getPrimaryFace()).toBeNull();
  });

  it('uses the largest face as the primary subject', () => {
    engine.detectedFaces = [face(1, 50, 50, { happy: 0.9 }), face(2, 200, 200, { sad: 0.8 }), face(3, 80, 80, { angry: 0.7 })];
    expect(engine.getPrimaryFace().id).toBe(2);
  });

  it('flags low-confidence results as uncertain', () => {
    expect(engine.isUncertain(face(1, 10, 10, { neutral: 0.3, sad: 0.25 }))).toBe(true);
    expect(engine.isUncertain(face(1, 10, 10, { happy: 0.9 }))).toBe(false);
    expect(engine.isUncertain(null)).toBe(false);
  });

  it('shows nothing (no guessed emotion) when the models are not loaded', async () => {
    engine.videoElement = { readyState: 4, videoWidth: 640, videoHeight: 480 };
    engine.canvasElement = { width: 640, height: 480 };
    engine.faceapi = null;
    engine.detectedFaces = [face(1, 100, 100, { happy: 1 })]; // stale from before
    await engine.processWebcamFrame();
    expect(engine.detectedFaces).toEqual([]);
  });

  it('maps video coordinates to the canvas exactly as object-fit: cover does', () => {
    // 16:9 camera shown in a square container: scaled by height, cropped left/right
    engine.videoElement = { videoWidth: 1280, videoHeight: 720 };
    engine.canvasElement = { width: 400, height: 400 };
    const { scale, ox, oy } = engine.coverTransform();
    expect(scale).toBeCloseTo(400 / 720, 6);
    expect(ox).toBeCloseTo((400 - 1280 * (400 / 720)) / 2, 6);
    expect(oy).toBeCloseTo(0, 6);
    // the video's centre must land on the canvas centre
    expect(640 * scale + ox).toBeCloseTo(200, 6);
    expect(360 * scale + oy).toBeCloseTo(200, 6);
  });

  it('covers when the container is wider than the video (crops top/bottom)', () => {
    engine.videoElement = { videoWidth: 640, videoHeight: 480 };
    engine.canvasElement = { width: 800, height: 400 };
    const { scale, ox, oy } = engine.coverTransform();
    expect(scale).toBeCloseTo(800 / 640, 6);
    expect(ox).toBeCloseTo(0, 6);
    expect(oy).toBeCloseTo((400 - 480 * (800 / 640)) / 2, 6);
  });
});
