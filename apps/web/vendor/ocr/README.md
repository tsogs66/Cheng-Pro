# Offline text reader (used by Capture from photo)

Bundled so cards can be read on the device with no internet. Nothing here is loaded until someone presses Capture from photo.

- `tesseract.min.js`, `worker.min.js` — tesseract.js 7.0.0 (Apache-2.0)
- `tesseract-core-lstm.wasm.js`, `tesseract-core-simd-lstm.wasm.js`, `tesseract-core-relaxedsimd-lstm.wasm.js` — tesseract.js-core 7.0.0 (Apache-2.0)
- `lang/eng.traineddata.gz` — Tesseract "best" English model, 8-bit (Apache-2.0), from @tesseract.js-data/eng 1.0.0

## Handwritten digits

`digit-net.js` holds the weights of a small network (two convolution layers) that reads hand-written numbers; the code that
cuts a field into characters and runs it is `js/digit-reader.js`. It was trained here, offline, from the MNIST digit set with
shifted, slanted, thick and thin copies, then fine-tuned on digits from the ship's own cards. Tesseract (above) still reads
the month name of a written date.
