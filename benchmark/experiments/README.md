# Model comparison experiment

Compares face-api (the app's model) against AffectNet-trained HSEmotion ONNX models and simple
ensembles, on the same detected faces.

```bash
cd benchmark && npm install && npm run fetch
sh experiments/fetch_models.sh                       # ~60 MB of .onnx files into experiments/models
node experiments/compare_models.cjs data 100000 results2_asis.json
PAD=0.4 node experiments/compare_models.cjs data 100000 results2_pad.json
python3 experiments/compare.py results2_asis.json results2_pad.json
```

It takes a while (about 2 s per detected face on one CPU core). Findings are summarised in the main README.
