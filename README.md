<div align="center">

# 🔮 EmotiSync

### *Real-time facial emotion telemetry & mood analytics — running entirely in your browser*

![Privacy First](https://img.shields.io/badge/Privacy-100%25%20Local-06b6d4?style=for-the-badge)
![Deployment](https://img.shields.io/badge/Vercel-Live-10b981?style=for-the-badge&logo=vercel)
![License](https://img.shields.io/badge/License-MIT-f59e0b?style=for-the-badge)

**[🌐 Experience Live Demo](https://emoti-sync.vercel.app)**

---

</div>

## ✨ Overview

**EmotiSync** is a privacy-first computer-vision web app. It detects faces from your webcam, scores seven emotions per face in real time, tracks mood over a session, and tints the UI to match the primary emotion.

Everything runs on-device with [face-api.js](https://github.com/vladmandic/face-api). The neural-network weights, fonts and icons are **bundled with the app** and served from its own origin, so nothing is fetched from third-party CDNs and camera frames are never uploaded. An automated test (`tests/privacy.test.js`) guards this.

---

## 🚀 Features

- 🎥 **Live multi-face analysis** — detects and tracks several faces at once, each with its own ID, 68-point landmark mesh, bounding box and emotion badge. Per-person smoothing follows each face (matched by box overlap, not by detector order).
- 🎯 **Honest confidence** — the badge shows the emotion's own confidence, and results below 70% are marked **"unsure"** (see [Accuracy](#-accuracy--what-to-expect)).
- 🌈 **Ambient aura** — the backdrop and glass tint follow the primary (largest) face's emotion: Happy ☀️ gold · Neutral 🌊 cyan · Surprised ⚡ purple · Sad 🌧️ blue · Angry 🔥 crimson · Fearful 🛡️ orange · Disgusted 🌿 green.
- 📊 **Session analytics** — mood timeline across all 7 emotions, **Positivity Index**, **Emotional Stability** and **Peak Dominant State**. Metrics show "—" until there is real data; frames with no face are never recorded.
- 🖼️ **Media scanner** — drop a photo or video and scan every face in it (video re-scans on pause/seek).
- 📸 **Snapshot & export** — annotated snapshots (camera frame + overlays, with copyable JSON telemetry) and the full session log as CSV.
- 🛠️ **Live diagnostics** — measured FPS and per-frame latency, and a status badge that shows whether the models are loading, ready, or failed (with retry).

---

## 🔬 How it works

For each video frame, in the browser:

1. **TinyFaceDetector** finds faces.
2. **FaceLandmark68Net** returns 68 landmarks (used for the mesh and to align the face crop).
3. **FaceExpressionNet** scores 7 emotions per face.
4. **FaceTracker** matches faces across frames and applies exponential smoothing per person.

If the models cannot be loaded, the app says so and shows no analysis. It deliberately has **no heuristic fallback**: guessing emotion from image brightness would present made-up results as real ones.

---

## 🎯 Accuracy — what to expect

Measured by running the app's exact pipeline (same detector settings and weights) on a class-balanced **921-image sample** of the public [`muxspace/facial_expressions`](https://github.com/muxspace/facial_expressions) dataset. Reproduce it with [`benchmark/`](benchmark/README.md).

| Faces given a full-frame margin (padded run) | |
|---|---|
| Faces detected | 72.9% |
| Emotion accuracy on detected faces | **60.5%** (95% CI 56.8–64.1) · chance ≈ 14% |
| Positive / neutral / negative accuracy | ~72% |

| Emotion | F1 | Notes |
|---|---|---|
| Happy | 88% | reliable |
| Angry | 70% | decent |
| Surprised | 63% | often read as neutral |
| Sad | 57% | often read as neutral |
| Neutral | 53% | the model's default when unsure |
| Fearful | 13% | **not reliable** (small sample) |
| Disgusted | 11% | **not reliable** |

**Confidence matters.** Predictions scoring under 70% (20% of faces) were right only ~37% of the time; the rest ~66%. That is why low-confidence results are flagged "unsure".

**What this means:** EmotiSync is a good *happy / not-happy and rough mood* indicator, and a solid demo of a real-time in-browser vision pipeline. It is **not** a dependable 7-way emotion classifier — especially for fear and disgust — and should not be used for decisions about people.

<details>
<summary>Caveats and alternatives evaluated</summary>

- The sample is a community dataset (mostly grayscale, tight crops of public figures), not a standard benchmark such as FER2013, RAF-DB or AffectNet; its labels may be noisy. Treat the numbers as indicative.
- Tight close-ups where the face overflows the frame are often missed by the detector (35% detected as-is). The padded run adds a neutral border so faces are a normal size, closer to a webcam.
- **Alternative tested:** AffectNet-trained ONNX models (HSEmotion `enet_b0_8_best_vgaf`, `enet_b0_8_best_afew`, `enet_b2_8`) on the same faces. Alone they were *worse* (45–50% accuracy) mainly because they under-detect neutral (~20% recall). They are far better on fear (~80% recall). Averaging one with face-api gave 63.0% vs 60.5% (+2.5 points, exact McNemar p = 0.016) and ~76% polarity accuracy, but adds ~30 MB of model/runtime files and a heavier runtime, so it was not adopted. If you need better accuracy, benchmark candidate models on **your own** data with the harness in `benchmark/`.
- Live-webcam conditions (lighting, angle, glasses) are not covered by this benchmark.

</details>

---

## 🛠️ Tech stack

- **App:** HTML5, ES modules, Canvas 2D, vanilla CSS (glassmorphism)
- **Vision:** `@vladmandic/face-api` (TinyFaceDetector, FaceLandmark68Net, FaceExpressionNet)
- **UI libs:** Chart.js 4, Lucide icons, `@fontsource` fonts — all bundled, no CDNs
- **Tooling:** Vite 6, Vitest
- **Deployment:** Vercel

---

## ⚡ Quick start

```bash
git clone https://github.com/ANKARAHAMSA/emoti-sync.git
cd emoti-sync
npm install
npm run dev      # http://localhost:3000  (camera needs localhost or HTTPS)
npm test         # unit tests
npm run build    # production build in dist/
```

### Accuracy benchmark

```bash
cd benchmark
npm install
npm run fetch     # downloads the labelled sample (~15 MB)
npm run eval      # runs the app's pipeline on it
npm run metrics   # accuracy, per-class precision/recall/F1, confusion matrix
```

---

## 📁 Project structure

```
src/js/emotionEngine.js   webcam loop, detection, overlay drawing (video→canvas mapping)
src/js/faceTracker.js     per-face tracking + smoothing (pure logic, unit-tested)
src/js/modelLoader.js     loads models from /models, reports real status
src/js/analyticsEngine.js positivity, stability, peak state, CSV/JSON export
src/js/mediaScanner.js    photo / video scanner
public/models/            face-api weights served from the app's own origin
benchmark/                reproducible accuracy test
tests/                    unit tests, incl. privacy/offline guarantees
```

---

## ⚠️ Limitations

- Emotion recognition from facial expressions is imperfect and culturally variable; the output is a statistical guess about expression, not about a person's inner state.
- Accuracy drops with poor lighting, extreme angles, occlusion (masks, hands) and low resolution.
- The face-detection step can miss faces that are very large in frame or very small/far away.

---

## 📄 License

MIT — see [LICENSE](LICENSE). Model weights come from the [face-api.js](https://github.com/justadudewhohacks/face-api.js) project (MIT); fonts are SIL OFL via [Fontsource](https://fontsource.org). The benchmark dataset is a third-party public dataset and is **not** redistributed here.

<div align="center">
  <sub>Crafted by Shahin Hamza</sub>
</div>
