import { describe, it, expect, beforeEach } from 'vitest';
import { AnalyticsEngine } from '../src/js/analyticsEngine.js';

describe('AnalyticsEngine Unit Test Suite', () => {
  let analytics;

  beforeEach(() => {
    analytics = new AnalyticsEngine();
  });

  it('should correctly calculate high positivity score for happy scores', () => {
    const scores = { happy: 0.9, neutral: 0.05, surprised: 0.05, sad: 0, angry: 0, fearful: 0, disgusted: 0 };
    const score = analytics.calculatePositivityScore(scores);
    expect(score).toBeGreaterThanOrEqual(85);
  });

  it('should correctly calculate low positivity score for sad & angry scores', () => {
    const scores = { happy: 0, neutral: 0.05, surprised: 0, sad: 0.7, angry: 0.25, fearful: 0, disgusted: 0 };
    const score = analytics.calculatePositivityScore(scores);
    expect(score).toBeLessThanOrEqual(40);
  });

  it('should add reading to history and shift oldest when capacity exceeded', () => {
    analytics.maxDataPoints = 3;
    analytics.addReading({ happy: 0.8 }, 'happy');
    analytics.addReading({ happy: 0.7 }, 'happy');
    analytics.addReading({ neutral: 0.9 }, 'neutral');
    expect(analytics.history.length).toBe(3);

    analytics.addReading({ surprised: 0.9 }, 'surprised');
    expect(analytics.history.length).toBe(3);
    expect(analytics.history[2].dominant).toBe('surprised');
  });

  it('should compute emotional stability accurately', () => {
    for (let i = 0; i < 10; i++) {
      analytics.addReading({ happy: 0.8, neutral: 0.2 }, 'happy');
    }
    const stability = analytics.getEmotionalStability();
    expect(stability).toBeGreaterThanOrEqual(90);
  });

  it('should export clean structured CSV format', () => {
    analytics.addReading({ happy: 0.8, neutral: 0.2 }, 'happy');
    const csv = analytics.exportAsCSV();
    expect(csv).toContain('Timestamp,Time,Dominant');
    expect(csv).toContain('happy');
  });

  it('should export clean JSON format', () => {
    analytics.addReading({ neutral: 0.9 }, 'neutral');
    const jsonStr = analytics.exportAsJSON();
    const parsed = JSON.parse(jsonStr);
    expect(parsed.appName).toBe('EmotiSync');
    expect(parsed.history.length).toBe(1);
  });
});
