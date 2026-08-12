import { describe, it, expect, beforeEach } from 'vitest';
import { EmotionEngine } from '../src/js/emotionEngine.js';

describe('EmotionEngine Unit Test Suite', () => {
  let engine;

  beforeEach(() => {
    engine = new EmotionEngine();
  });

  it('should calculate dominant emotion accurately', () => {
    const scores = { happy: 0.1, neutral: 0.7, surprised: 0.2, sad: 0, angry: 0, fearful: 0, disgusted: 0 };
    const dominant = engine.getDominantEmotion(scores);
    expect(dominant).toBe('neutral');
  });

  it('should apply exponential smoothing correctly to multi-face emotion scores', () => {
    engine.smoothingFactor = 0.5;
    engine.smoothFaceScores(0, { happy: 0.0, neutral: 1.0, surprised: 0, sad: 0, angry: 0, fearful: 0, disgusted: 0 });

    const newScores = { happy: 1.0, neutral: 0, surprised: 0, sad: 0, angry: 0, fearful: 0, disgusted: 0 };
    const smoothed = engine.smoothFaceScores(0, newScores);

    expect(smoothed.happy).toBeGreaterThan(0.4);
  });
});
