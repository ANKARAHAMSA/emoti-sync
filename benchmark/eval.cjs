/**
 * Runs EmotiSync's real pipeline (same detector settings and the same bundled weights as the app)
 * on a labelled image set and writes per-image predictions.
 *
 *   node eval.cjs <dataDir> [limit] [outFile]
 *   PAD=0.4 node eval.cjs data 100000 results_pad.json   # add a gray border so tight crops fit the detector
 */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const wasm = require('@tensorflow/tfjs-backend-wasm');
const faceapi = require('@vladmandic/face-api/dist/face-api.node-wasm.js');

const DATA = process.argv[2] || 'data';
const LIMIT = process.argv[3] ? parseInt(process.argv[3], 10) : Infinity;
const OUT = process.argv[4] || 'results.json';
const PAD = parseFloat(process.env.PAD || '0');
const MODEL_DIR = path.resolve(__dirname, '..', 'public', 'models'); // the weights the app actually ships
const EMO = ['happy', 'neutral', 'surprised', 'sad', 'angry', 'fearful', 'disgusted'];

(async () => {
  wasm.setWasmPaths(path.resolve(__dirname, 'node_modules/@tensorflow/tfjs-backend-wasm/dist') + '/');
  await faceapi.tf.setBackend('wasm');
  await faceapi.tf.ready();
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromDisk(MODEL_DIR),
    faceapi.nets.faceLandmark68Net.loadFromDisk(MODEL_DIR),
    faceapi.nets.faceExpressionNet.loadFromDisk(MODEL_DIR)
  ]);

  const rows = fs.readFileSync(path.join(DATA, 'sample.csv'), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
  const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.35 });
  const results = [];
  let i = 0;
  for (const [file, label] of rows) {
    if (i++ >= LIMIT) break;
    try {
      const src = path.join(DATA, 'img', file);
      let img = sharp(src).removeAlpha();
      if (PAD > 0) {
        const m = await sharp(src).metadata();
        const px = Math.round(m.width * PAD);
        const py = Math.round(m.height * PAD);
        img = img.extend({ top: py, bottom: py, left: px, right: px, background: { r: 128, g: 128, b: 128 } });
      }
      const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
      const t = faceapi.tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3], 'int32');
      const dets = await faceapi.detectAllFaces(t, opts).withFaceLandmarks().withFaceExpressions();
      t.dispose();
      if (!dets.length) { results.push({ file, label, detected: false }); continue; }
      const best = dets.reduce((a, b) => (a.detection.score >= b.detection.score ? a : b));
      const scores = Object.fromEntries(EMO.map((e) => [e, best.expressions[e] || 0]));
      const pred = EMO.reduce((a, b) => (scores[a] >= scores[b] ? a : b));
      results.push({ file, label, detected: true, pred, scores, nfaces: dets.length, det: best.detection.score });
    } catch (e) {
      results.push({ file, label, detected: false, error: String(e).slice(0, 160) });
    }
    if (i % 100 === 0) console.log('progress', i, '/', Math.min(rows.length, LIMIT));
  }
  fs.writeFileSync(OUT, JSON.stringify(results));
  console.log('done', results.length, 'errors:', results.filter((r) => r.error).length);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
