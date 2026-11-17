# Offline text reader (used by Capture from photo)

Bundled so cards can be read on the device with no internet. Nothing here is loaded until someone presses Capture from photo.

- `tesseract.min.js`, `worker.min.js` — tesseract.js 7.0.0 (Apache-2.0)
- `tesseract-core-lstm.wasm.js`, `tesseract-core-simd-lstm.wasm.js`, `tesseract-core-relaxedsimd-lstm.wasm.js` — tesseract.js-core 7.0.0 (Apache-2.0)
- `lang/eng.traineddata.gz` — Tesseract "best" English model, 8-bit (Apache-2.0), from @tesseract.js-data/eng 1.0.0
