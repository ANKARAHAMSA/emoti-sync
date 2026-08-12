/**
 * Analytics Engine — Calculates emotional metrics, stability indices, positivity scores,
 * and maintains history for telemetry rendering and CSV/JSON log exports.
 */

export class AnalyticsEngine {
  constructor() {
    this.history = [];
    this.maxDataPoints = 60; // Keep last 60 readings
    this.chartInstance = null;
  }

  addReading(emotionScores, dominantEmotion, confidence = 0.95) {
    const timestamp = new Date();
    const positivity = this.calculatePositivityScore(emotionScores);
    
    const dataPoint = {
      timestamp: timestamp.toISOString(),
      timeLabel: timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      scores: { ...emotionScores },
      dominant: dominantEmotion,
      confidence,
      positivity
    };

    this.history.push(dataPoint);
    if (this.history.length > this.maxDataPoints) {
      this.history.shift();
    }

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

    // Weighted positivity index formula
    const weightedSum = (happy * 1.0) + (surprised * 0.75) + (neutral * 0.5) 
                      - (sad * 0.5) - (angry * 0.8) - (fearful * 0.7) - (disgusted * 0.7);
    
    const normalized = Math.max(0, Math.min(100, Math.round(((weightedSum + 1) / 2) * 100)));
    return normalized;
  }

  getEmotionalStability() {
    if (this.history.length < 5) return 92;
    // Calculate variance in positivity over recent history
    const positivities = this.history.map(h => h.positivity);
    const mean = positivities.reduce((a, b) => a + b, 0) / positivities.length;
    const variance = positivities.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / positivities.length;
    const stdDev = Math.sqrt(variance);
    
    const stability = Math.max(40, Math.min(100, Math.round(100 - (stdDev * 1.5))));
    return stability;
  }

  getPeakEmotion() {
    if (this.history.length === 0) return { emotion: 'Neutral', confidence: '90%' };
    
    const counts = {};
    this.history.forEach(h => {
      counts[h.dominant] = (counts[h.dominant] || 0) + 1;
    });

    let peak = 'neutral';
    let maxCount = 0;
    for (const [emo, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        peak = emo;
      }
    }

    const pct = Math.round((maxCount / this.history.length) * 100);
    return {
      emotion: peak.charAt(0).toUpperCase() + peak.slice(1),
      confidence: `${pct}% Dominance`
    };
  }

  exportAsJSON() {
    return JSON.stringify({
      appName: 'EmotiSync',
      exportedAt: new Date().toISOString(),
      summary: {
        totalReadings: this.history.length,
        stabilityScore: this.getEmotionalStability(),
        peakState: this.getPeakEmotion()
      },
      history: this.history
    }, null, 2);
  }

  exportAsCSV() {
    if (this.history.length === 0) return 'Timestamp,Dominant,Positivity,Happy,Neutral,Surprised,Sad,Angry,Fearful,Disgusted\n';

    const headers = ['Timestamp', 'Time', 'Dominant', 'PositivityIndex', 'Happy', 'Neutral', 'Surprised', 'Sad', 'Angry', 'Fearful', 'Disgusted'];
    const rows = this.history.map(h => [
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

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  clearHistory() {
    this.history = [];
  }
}

export const analyticsEngine = new AnalyticsEngine();
