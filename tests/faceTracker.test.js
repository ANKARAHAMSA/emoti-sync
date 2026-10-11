import { describe, it, expect } from 'vitest';
import { FaceTracker, boxIou, dominantOf, EMOTIONS } from '../src/js/faceTracker.js';

const scores = (over = {}) => ({ happy: 0, neutral: 0, surprised: 0, sad: 0, angry: 0, fearful: 0, disgusted: 0, ...over });
const det = (x, over = {}, w = 100, h = 100) => ({ box: { x, y: 0, width: w, height: h }, scores: scores(over), score: 0.9 });

describe('boxIou', () => {
  it('is 1 for identical boxes, 0 for disjoint boxes', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    expect(boxIou(a, a)).toBe(1);
    expect(boxIou(a, { x: 50, y: 50, width: 10, height: 10 })).toBe(0);
  });

  it('computes partial overlap', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 5, y: 0, width: 10, height: 10 };
    expect(boxIou(a, b)).toBeCloseTo(50 / 150, 5);
  });
});

describe('dominantOf', () => {
  it('picks the highest score and defaults to neutral for empty input', () => {
    expect(dominantOf(scores({ sad: 0.6, happy: 0.3 }))).toBe('sad');
    expect(dominantOf({})).toBe('neutral');
  });
});

describe('FaceTracker', () => {
  it('smooths with weight (1 - smoothing) on the new frame', () => {
    const t = new FaceTracker({ smoothing: 0.5 });
    t.update([det(0, { neutral: 1 })]);
    const [face] = t.update([det(0, { happy: 1 })]);
    expect(face.scores.happy).toBeCloseTo(0.5, 5);
    expect(face.scores.neutral).toBeCloseTo(0.5, 5);
  });

  it('with no smoothing, follows the newest frame exactly', () => {
    const t = new FaceTracker({ smoothing: 0 });
    t.update([det(0, { neutral: 1 })]);
    const [face] = t.update([det(0, { happy: 1 })]);
    expect(face.scores.happy).toBe(1);
    expect(face.dominant).toBe('happy');
  });

  it('keeps each person\'s smoothing when the detector returns faces in a different order', () => {
    const t = new FaceTracker({ smoothing: 0.5 });
    // person A (left, happy) and person B (right, sad)
    t.update([det(0, { happy: 1 }), det(300, { sad: 1 })]);
    // next frame the detector lists them in the opposite order
    const faces = t.update([det(300, { sad: 1 }), det(0, { happy: 1 })]);
    const left = faces.find((f) => f.box.x < 100);
    const right = faces.find((f) => f.box.x > 200);
    expect(left.dominant).toBe('happy');
    expect(right.dominant).toBe('sad');
    expect(left.scores.sad).toBeCloseTo(0, 5);   // no bleed from the other person
    expect(right.scores.happy).toBeCloseTo(0, 5);
  });

  it('assigns stable ids per person and reuses a freed slot', () => {
    const t = new FaceTracker({ smoothing: 0, maxMissed: 0 });
    let faces = t.update([det(0), det(300)]);
    expect(faces.map((f) => f.id)).toEqual([1, 2]);
    faces = t.update([det(300)]);          // person 1 leaves (expires immediately)
    expect(faces.map((f) => f.id)).toEqual([2]);
    faces = t.update([det(300), det(600)]); // someone new arrives and takes the free slot
    expect(faces.map((f) => f.id).sort()).toEqual([1, 2]);
  });

  it('keeps a track alive across a brief dropout', () => {
    const t = new FaceTracker({ smoothing: 0.5, maxMissed: 3 });
    t.update([det(0, { happy: 1 })]);
    t.update([]);
    t.update([]);
    const [face] = t.update([det(0, { happy: 1 })]);
    expect(face.id).toBe(1);
    expect(face.scores.happy).toBeGreaterThan(0.9);
  });

  it('drops a track after maxMissed frames', () => {
    const t = new FaceTracker({ smoothing: 0.5, maxMissed: 2 });
    t.update([det(0, { happy: 1 })]);
    t.update([]); t.update([]); t.update([]);
    expect(t.tracks.length).toBe(0);
  });

  it('reports the emotion confidence (smoothed top score), not the detection score', () => {
    const t = new FaceTracker({ smoothing: 0 });
    const [face] = t.update([{ ...det(0, { sad: 0.4, neutral: 0.35 }), score: 0.99 }]);
    expect(face.emotionConfidence).toBeCloseTo(0.4, 5);
    expect(face.detectionScore).toBe(0.99);
  });

  it('covers all 7 emotions', () => {
    expect(EMOTIONS).toHaveLength(7);
  });
});
