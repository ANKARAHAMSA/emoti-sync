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

  it('should apply exponential smoothing correctly to emotion scores', () => {
    engine.smoothingFactor = 0.5;
    engine.smoothedScores = { happy: 0.0, neutral: 1.0, surprised: 0, sad: 0, angry: 0, fearful: 0, disgusted: 0 };

    const newScores = { happy: 1.0, neutral: 0, surprised: 0, sad: 0, angry: 0, fearful: 0, disgusted: 0 };
    engine.updateSmoothedScores(newScores);

    // Alpha = 1 - (0.5 * 0.8) = 0.6
    // Smoothed happy = 0.6 * 1.0 + 0.4 * 0.0 = 0.6
    expect(engine.smoothedScores.happy).toBeGreaterThan(0.4);
  });
});
