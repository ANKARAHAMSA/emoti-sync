import { describe, it, expect, beforeEach } from 'vitest';
import { AnalyticsEngine } from '../src/js/analyticsEngine.js';

describe('AnalyticsEngine', () => {
  let analytics;

  beforeEach(() => {
    analytics = new AnalyticsEngine();
  });

  it('scores happy as highly positive', () => {
    const score = analytics.calculatePositivityScore({ happy: 0.9, neutral: 0.05, surprised: 0.05, sad: 0, angry: 0, fearful: 0, disgusted: 0 });
    expect(score).toBeGreaterThanOrEqual(85);
  });

  it('scores sad & angry as low positivity', () => {
    const score = analytics.calculatePositivityScore({ happy: 0, neutral: 0.05, surprised: 0, sad: 0.7, angry: 0.25, fearful: 0, disgusted: 0 });
    expect(score).toBeLessThanOrEqual(40);
  });

  it('keeps a rolling window for the chart but the FULL session for export', () => {
    analytics.maxDataPoints = 3;
    for (let i = 0; i < 10; i++) analytics.addReading({ happy: 0.8 }, 'happy');
    expect(analytics.history.length).toBe(3);
    expect(analytics.sessionLog.length).toBe(10);
    expect(analytics.exportAsCSV().split('\n').length).toBe(1 + 10); // header + every reading
    expect(JSON.parse(analytics.exportAsJSON()).history.length).toBe(10);
  });

  it('caps the session log so memory cannot grow without bound', () => {
    analytics.maxSessionPoints = 5;
    for (let i = 0; i < 20; i++) analytics.addReading({ happy: 0.8 }, 'happy');
    expect(analytics.sessionLog.length).toBe(5);
  });

  it('reports no stability until there is enough data (no invented default)', () => {
    expect(analytics.getEmotionalStability()).toBeNull();
    for (let i = 0; i < 4; i++) analytics.addReading({ happy: 0.8 }, 'happy');
    expect(analytics.getEmotionalStability()).toBeNull();
    analytics.addReading({ happy: 0.8 }, 'happy');
    expect(analytics.getEmotionalStability()).not.toBeNull();
  });

  it('reports no peak emotion when nothing has been recorded', () => {
    expect(analytics.getPeakEmotion()).toBeNull();
  });

  it('computes high stability for steady readings and low stability for swings', () => {
    for (let i = 0; i < 10; i++) analytics.addReading({ happy: 0.8, neutral: 0.2 }, 'happy');
    expect(analytics.getEmotionalStability()).toBeGreaterThanOrEqual(90);

    const swingy = new AnalyticsEngine();
    for (let i = 0; i < 10; i++) {
      swingy.addReading(i % 2 ? { happy: 1 } : { angry: 1 }, i % 2 ? 'happy' : 'angry');
    }
    expect(swingy.getEmotionalStability()).toBeLessThan(40); // no artificial floor
  });

  it('computes the session-wide peak emotion and its share', () => {
    ['happy', 'happy', 'happy', 'sad'].forEach((e) => analytics.addReading({ [e]: 0.9 }, e));
    const peak = analytics.getPeakEmotion();
    expect(peak.emotion).toBe('Happy');
    expect(peak.share).toBeCloseTo(0.75, 5);
  });

  it('uses the same CSV header whether or not there is data', () => {
    const emptyHeader = analytics.exportAsCSV().split('\n')[0];
    analytics.addReading({ happy: 0.8, neutral: 0.2 }, 'happy');
    const csv = analytics.exportAsCSV();
    expect(csv.split('\n')[0]).toBe(emptyHeader);
    expect(csv).toContain('Timestamp,Time,Dominant,PositivityIndex');
    expect(csv).toContain('happy');
  });

  it('exports structured JSON', () => {
    analytics.addReading({ neutral: 0.9 }, 'neutral');
    const parsed = JSON.parse(analytics.exportAsJSON());
    expect(parsed.appName).toBe('EmotiSync');
    expect(parsed.history.length).toBe(1);
    expect(parsed.summary.totalReadings).toBe(1);
  });

  it('clears both the window and the session log', () => {
    analytics.addReading({ happy: 1 }, 'happy');
    analytics.clearHistory();
    expect(analytics.history.length).toBe(0);
    expect(analytics.sessionLog.length).toBe(0);
    expect(analytics.getPeakEmotion()).toBeNull();
  });
});
