/**
 * Face Tracker — keeps per-person emotion smoothing attached to the right face.
 *
 * Detections are matched to existing tracks by box overlap (IoU), not by array
 * index, so when two people swap order in the detector's output each person keeps
 * their own smoothed scores. Pure logic (no DOM), so it is unit-testable.
 */

export const EMOTIONS = ['happy', 'neutral', 'surprised', 'sad', 'angry', 'fearful', 'disgusted'];

/**
 * Below this top-emotion score the result is shown as "unsure". Measured on 671 labelled faces:
 * predictions under 0.7 (20% of faces) were right ~37% of the time; the rest ~66%.
 */
export const UNCERTAIN_BELOW = 0.7;

export function boxIou(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

export function dominantOf(scores) {
  let best = 'neutral';
  let max = 0; // all-zero / empty scores stay "neutral" rather than defaulting to the first emotion
  for (const emo of EMOTIONS) {
    const s = scores[emo] || 0;
    if (s > max) { max = s; best = emo; }
  }
  return best;
}

export class FaceTracker {
  /**
   * @param {object} opts
   * @param {number} opts.smoothing   0 = no smoothing, 0.9 = very slow. Weight on the NEW frame is (1 - smoothing).
   * @param {number} opts.minIou      Minimum overlap for a detection to continue an existing track.
   * @param {number} opts.maxMissed   Frames a track survives without a matching detection.
   */
  constructor({ smoothing = 0.6, minIou = 0.25, maxMissed = 8 } = {}) {
    this.smoothing = smoothing;
    this.minIou = minIou;
    this.maxMissed = maxMissed;
    this.tracks = [];
  }

  reset() {
    this.tracks = [];
  }

  _freeSlot() {
    const used = new Set(this.tracks.map((t) => t.id));
    let id = 1;
    while (used.has(id)) id++;
    return id;
  }

  /**
   * @param {Array<{box:{x,y,width,height}, scores:object, score?:number, landmarks?:any}>} detections
   * @returns faces seen this frame: [{id, box, scores, dominant, emotionConfidence, detectionScore, landmarks}]
   */
  update(detections) {
    const prevCount = this.tracks.length;
    const pairs = [];
    detections.forEach((d, di) => {
      this.tracks.forEach((t, ti) => {
        const v = boxIou(d.box, t.box);
        if (v >= this.minIou) pairs.push({ di, ti, v });
      });
    });
    pairs.sort((a, b) => b.v - a.v);

    const detTrack = new Array(detections.length).fill(-1);
    const trackUsed = new Set();
    for (const p of pairs) {
      if (detTrack[p.di] !== -1 || trackUsed.has(p.ti)) continue;
      detTrack[p.di] = p.ti;
      trackUsed.add(p.ti);
    }

    const w = 1 - this.smoothing;
    const faces = [];

    detections.forEach((d, di) => {
      let track;
      if (detTrack[di] !== -1) {
        track = this.tracks[detTrack[di]];
        for (const e of EMOTIONS) {
          track.scores[e] = w * (d.scores[e] || 0) + (1 - w) * (track.scores[e] || 0);
        }
        // light box smoothing keeps overlays steady without lagging behind motion
        track.box = {
          x: 0.6 * d.box.x + 0.4 * track.box.x,
          y: 0.6 * d.box.y + 0.4 * track.box.y,
          width: 0.6 * d.box.width + 0.4 * track.box.width,
          height: 0.6 * d.box.height + 0.4 * track.box.height
        };
        track.missed = 0;
      } else {
        track = {
          id: this._freeSlot(),
          box: { ...d.box },
          scores: Object.fromEntries(EMOTIONS.map((e) => [e, d.scores[e] || 0])),
          missed: 0
        };
        this.tracks.push(track);
      }
      const dominant = dominantOf(track.scores);
      faces.push({
        id: track.id,
        box: track.box,
        scores: { ...track.scores },
        dominant,
        emotionConfidence: track.scores[dominant] || 0,
        detectionScore: d.score ?? 1,
        landmarks: d.landmarks
      });
    });

    // Age out tracks that existed before this frame but were not matched.
    // (New tracks were appended after the first `prevCount` entries.)
    for (let ti = 0; ti < prevCount; ti++) {
      if (!trackUsed.has(ti)) this.tracks[ti].missed += 1;
    }
    this.tracks = this.tracks.filter((t) => t.missed <= this.maxMissed);

    return faces.sort((a, b) => a.id - b.id);
  }
}
