# EmotiSync accuracy benchmark

Measures how accurate EmotiSync's emotion pipeline is on labelled face images. It runs the **same
detector settings and the same weights the app ships** (`../public/models`), headless in Node (WASM),
so the numbers describe the real model, not a re-implementation.

## Run it

```bash
npm install
npm run fetch      # builds data/sample.csv + downloads data/img (class-balanced, seed 42)
npm run eval       # as-is run and a padded run (adds a 40% gray border so close-ups fit the detector)
npm run metrics    # accuracy, per-class precision/recall/F1, confusion matrix, calibration
```

`python3 fetch_data.py 50` uses 50 images per class for a quick smoke run.

## What it reports

- **Detection rate** — share of images where a face was found.
- **Accuracy on detected faces**, and a strict number that counts missed faces as wrong.
- **Per-class precision / recall / F1** and the **confusion matrix** (rows = true, columns = predicted).
- **Calibration** — accuracy by confidence bucket (this is how the app's 0.7 "unsure" threshold was chosen).

## Use your own data

Put images in `data/img/` and a `data/sample.csv` with columns `image,label`, where `label` is one of
`happy, neutral, surprised, sad, angry, fearful, disgusted`. Frames captured from the camera and lighting
you will actually deploy with will be more informative than any public dataset.

## Comparing other models

`experiments/` contains the script used to compare AffectNet-trained ONNX models (HSEmotion) and simple
ensembles against face-api on identical faces — see `experiments/README.md`.

## Notes

- Data and results are git-ignored. The dataset is third-party and is not redistributed.
- The default sample is a community dataset, not a standard benchmark; its labels may be noisy.
