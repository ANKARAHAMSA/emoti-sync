/**
 * Compare AffectNet-trained ONNX emotion models (HSEmotion) with face-api on IDENTICAL faces.
 * Detection uses the app's detector; each detected face is cropped and fed to every ONNX model,
 * and all raw scores are saved so ensembles / calibration can be tried offline (see compare.py).
 *
 *   node experiments/compare_models.cjs data 100000 results2_pad.json     (PAD=0.4 for the padded run)
 *   env: MODELS=comma list of .onnx basenames, EXPANDS=crop expansions, ONNX_DIR=folder with the .onnx files
 */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const wasm = require('@tensorflow/tfjs-backend-wasm');
const faceapi = require('@vladmandic/face-api/dist/face-api.node-wasm.js');
const ort = require('onnxruntime-web');

const DATA = process.argv[2];
const LIMIT = process.argv[3] ? parseInt(process.argv[3]) : Infinity;
const OUT = process.argv[4] || 'results2.json';
const PAD = parseFloat(process.env.PAD || '0');
const EXPANDS = (process.env.EXPANDS || '0,0.2').split(',').map(Number);
const MODELS = (process.env.MODELS || 'enet_b0_8_best_vgaf,enet_b0_8_best_afew,enet_b2_8').split(',');
const ROOT = path.resolve(__dirname, '..');
const MODEL_DIR = path.resolve(ROOT, '..', 'public', 'models');
const ONNX_DIR = process.env.ONNX_DIR ? path.resolve(process.env.ONNX_DIR) : path.resolve(__dirname, 'models');
// HSEmotion 8-class order
const HS = ['angry','contempt','disgusted','fearful','happy','neutral','sad','surprised'];
const EMO = ['happy','neutral','surprised','sad','angry','fearful','disgusted'];
const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];

function softmax(a) { const m = Math.max(...a); const e = a.map(x => Math.exp(x - m)); const s = e.reduce((p, c) => p + c, 0); return e.map(x => x / s); }

(async () => {
  wasm.setWasmPaths(path.resolve(ROOT, 'node_modules/@tensorflow/tfjs-backend-wasm/dist') + '/');
  await faceapi.tf.setBackend('wasm'); await faceapi.tf.ready();
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromDisk(MODEL_DIR),
    faceapi.nets.faceLandmark68Net.loadFromDisk(MODEL_DIR),
    faceapi.nets.faceExpressionNet.loadFromDisk(MODEL_DIR),
  ]);
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = path.resolve(ROOT, 'node_modules/onnxruntime-web/dist') + '/';
  const sessions = {};
  for (const m of MODELS) {
    sessions[m] = await ort.InferenceSession.create(fs.readFileSync(path.join(ONNX_DIR, m + '.onnx')), { executionProviders: ['wasm'] });
    console.log(m, 'inputs', sessions[m].inputNames, 'outputs', sessions[m].outputNames);
  }
  const sizeOf = m => (m.includes('b2') ? 260 : 224);

  const rows = fs.readFileSync(path.join(DATA, 'sample.csv'), 'utf8').trim().split('\n').slice(1).map(l => l.split(','));
  const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.35 });
  const results = [];
  let i = 0;
  for (const [file, label] of rows) {
    if (i++ >= LIMIT) break;
    try {
      let img = sharp(path.join(DATA, 'img', file)).removeAlpha();
      if (PAD > 0) {
        const m = await sharp(path.join(DATA, 'img', file)).metadata();
        const px = Math.round(m.width * PAD), py = Math.round(m.height * PAD);
        img = img.extend({ top: py, bottom: py, left: px, right: px, background: { r: 128, g: 128, b: 128 } });
      }
      const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
      const t = faceapi.tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3], 'int32');
      const dets = await faceapi.detectAllFaces(t, opts).withFaceLandmarks().withFaceExpressions();
      t.dispose();
      if (!dets.length) { results.push({ file, label, detected: false }); continue; }
      const best = dets.reduce((a, b) => (a.detection.score >= b.detection.score ? a : b));
      const fa = Object.fromEntries(EMO.map(e => [e, best.expressions[e] || 0]));
      const box = best.detection.box;
      const rec = { file, label, detected: true, det: best.detection.score, box: [box.x, box.y, box.width, box.height], fa, hs: {} };
      for (const m of MODELS) {
        for (const ex of EXPANDS) {
          const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
          const side = Math.max(box.width, box.height) * (1 + ex);
          let x0 = Math.round(cx - side / 2), y0 = Math.round(cy - side / 2), s = Math.round(side);
          // clamp by shrinking into image (keep square)
          x0 = Math.max(0, x0); y0 = Math.max(0, y0);
          let w = Math.min(s, info.width - x0), h = Math.min(s, info.height - y0);
          if (w < 8 || h < 8) { continue; }
          const sz = sizeOf(m);
          const buf = await sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } })
            .extract({ left: x0, top: y0, width: w, height: h }).resize(sz, sz, { fit: 'fill', kernel: 'cubic' }).raw().toBuffer();
          const f = new Float32Array(3 * sz * sz);
          for (let p = 0; p < sz * sz; p++) for (let c = 0; c < 3; c++) f[c * sz * sz + p] = (buf[p * 3 + c] / 255 - MEAN[c]) / STD[c];
          const out = await sessions[m].run({ [sessions[m].inputNames[0]]: new ort.Tensor('float32', f, [1, 3, sz, sz]) });
          const logits = Array.from(out[sessions[m].outputNames[0]].data);
          const p8 = softmax(logits);
          const p7raw = HS.map((e, k) => [e, logits[k]]).filter(([e]) => e !== 'contempt');
          const p7 = softmax(p7raw.map(([, v]) => v));
          rec.hs[`${m}@${ex}`] = { p8: Object.fromEntries(HS.map((e, k) => [e, p8[k]])), p7: Object.fromEntries(p7raw.map(([e], k) => [e, p7[k]])) };
        }
      }
      results.push(rec);
    } catch (e) { results.push({ file, label, detected: false, error: String(e).slice(0, 200) }); }
    if (i % 50 === 0) console.log('progress', i, '/', Math.min(rows.length, LIMIT));
  }
  fs.writeFileSync(OUT, JSON.stringify(results));
  console.log('done', results.length, 'errors:', results.filter(r => r.error).length);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
