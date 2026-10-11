#!/bin/sh
# Downloads the HSEmotion ONNX models (Apache-2.0 code; trained on AffectNet — check its terms before commercial use).
set -e
mkdir -p models
B=https://raw.githubusercontent.com/av-savchenko/face-emotion-recognition/main/models/affectnet_emotions/onnx
for n in enet_b0_8_best_vgaf enet_b0_8_best_afew enet_b2_8; do
  [ -s models/$n.onnx ] || curl -L -o models/$n.onnx "$B/$n.onnx"
done
ls -la models
