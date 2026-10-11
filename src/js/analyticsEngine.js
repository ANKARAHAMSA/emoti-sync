/**
 * Analytics Engine — calculates emotional metrics, stability, and positivity,
 * keeps a short rolling window for the live chart, and a full-session log for export.
 *
 * Only real detections should be recorded (the UI skips frames with no face and demo mode).
 */

const CSV_HEADERS = ['Timestamp', 'Time', 'Dominant', 'PositivityIndex', 'Happy', 'Neutral', 'Surprised', 'Sad', 'Angry', 'Fearful', 'Disgusted'];

export class AnalyticsEngine {
  constructor() {
    this.history = [];            // rolling window shown in the chart / used for stability
    this.maxDataPoints = 60;
    this.sessionLog = [];         // everything recorded this session (used for export)
    this.maxSessionPoints = 20000;
    this.dominantCounts = {};     // session-wide counts for "peak state"
    this.chartInstance = null;
  }

  addReading(emotionScores, dominantEmotion, confidence = 0) {
    const timestamp = new Date();
    const dataPoint = {
      timestamp: timestamp.toISOString(),
      timeLabel: timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      scores: { ...emotionScores },
      dominant: dominantEmotion,
      confidence,
      positivity: this.calculatePositivityScore(emotionScores)
    };

    this.history.push(dataPoint);
    if (this.history.length > this.maxDataPoints) {
      this.history.shift();
    }

    this.sessionLog.push(dataPoint);
    if (this.sessionLog.length > this.maxSessionPoints) {
      this.sessionLog.shift();
    }

    this.dominantCounts[dominantEmotion] = (this.dominantCounts[dominantEmotion] || 0) + 1;
    return dataPoint;
  }

  calculatePositivityScore(scores) {
    if (!scores) return 50;
    const happy = scores.happy || 0;
    const neutral = scores.neutral || 0;
    const surprised = scores.surprised || 0;
    const sad = scores.sad || 0;
    const angry = scores.angry || 0;
    const fearful = scores.fearful || 0;
    const disgusted = scores.disgusted || 0;

    // Weighted positivity index: 0 = strongly negative, 50 = balanced, 100 = fully positive.
    const weightedSum = (happy * 1.0) + (surprised * 0.75) + (neutral * 0.5)
                      - (sad * 0.5) - (angry * 0.8) - (fearful * 0.7) - (disgusted * 0.7);

    return Math.max(0, Math.min(100, Math.round(((weightedSum + 1) / 2) * 100)));
  }

  /** Stability of positivity over the recent window, or null until there is enough data. */
  getEmotionalStability() {
    if (this.history.length < 5) return null;
    const positivities = this.history.map((h) => h.positivity);
    const mean = positivities.reduce((a, b) => a + b, 0) / positivities.length;
    const variance = positivities.reduce((a, b) => a + (b - mean) ** 2, 0) / positivities.length;
    const stdDev = Math.sqrt(variance);
    return Math.max(0, Math.min(100, Math.round(100 - stdDev * 1.5)));
  }

  /** Most frequent dominant emotion this session, or null when nothing has been recorded. */
  getPeakEmotion() {
    const total = this.sessionLog.length;
    if (total === 0) return null;

    let peak = null;
    let maxCount = 0;
    for (const [emo, count] of Object.entries(this.dominantCounts)) {
      if (count > maxCount) { maxCount = count; peak = emo; }
    }
    if (!peak) return null;

    const counted = Object.values(this.dominantCounts).reduce((a, b) => a + b, 0);
    return {
      emotion: peak.charAt(0).toUpperCase() + peak.slice(1),
      share: maxCount / counted,
      confidence: `${Math.round((maxCount / counted) * 100)}% of session`
    };
  }

  exportAsJSON() {
    return JSON.stringify({
      appName: 'EmotiSync',
      exportedAt: new Date().toISOString(),
      summary: {
        totalReadings: this.sessionLog.length,
        stabilityScore: this.getEmotionalStability(),
        peakState: this.getPeakEmotion()
      },
      history: this.sessionLog
    }, null, 2);
  }

  exportAsCSV() {
    const rows = this.sessionLog.map((h) => [
      h.timestamp,
      h.timeLabel,
      h.dominant,
      h.positivity,
      (h.scores.happy || 0).toFixed(3),
      (h.scores.neutral || 0).toFixed(3),
      (h.scores.surprised || 0).toFixed(3),
      (h.scores.sad || 0).toFixed(3),
      (h.scores.angry || 0).toFixed(3),
      (h.scores.fearful || 0).toFixed(3),
      (h.scores.disgusted || 0).toFixed(3)
    ]);
    return [CSV_HEADERS.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  clearHistory() {
    this.history = [];
    this.sessionLog = [];
    this.dominantCounts = {};
  }
}

export const analyticsEngine = new AnalyticsEngine();
