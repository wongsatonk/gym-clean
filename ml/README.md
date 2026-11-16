# Gym Clean food classifier (M7b)

Trains the small Thai food image classifier that the app runs on the phone with MediaPipe Image
Classifier. The output is one `.tflite` file (with label metadata) that you import in the app:
**Settings → Food photos → Import model**.

- **Labels** are the keys of `src/food-vision/classMap.json`, the single source of truth shared
  with the app. Each label maps to one or more `thai:*` dishes. Dataset classes reach a label
  through its `datasets` lists; your photos reach it through the dish id in `labels.csv`.
- **Nothing private is committed.** `ml/data/` (datasets, your photos), `ml/runs/`, `ml/models/`
  and every `*.tflite` are gitignored, and `ml/.gitignore` covers the venv.
- **Licences** (see `ml/DATASETS.md`, verdict B): THFOOD-50/100 are non-commercial
  research/education only. You may train a model for your own private use. Don't publish the
  images or the model. That's why the app has no bundled model and you import your own.

## Tooling choice (checked 2026-11-16)

- **Not MediaPipe Model Maker.** Its last release is `mediapipe-model-maker` 0.2.1.4 (April 2024).
  It pins `tensorflow<2.16` and needs `tensorflow-addons` (end of life). There are no current
  Apple Silicon / Python 3.12 wheels for that stack.
- **Chosen instead:**
  - TensorFlow 2.21 runs the backbone and the TFLite converter.
  - The **metadata writer** (`mediapipe.tasks.python.metadata.metadata_writers.image_classifier`)
    adds the labels and input normalization that MediaPipe needs. It ships in `mediapipe` 1.2.3.
  - MediaPipe Python's `ImageClassifier` loads the file as a check. It's the same task as the app.
- **One workaround.** The mediapipe 1.2.x wheel lacks a small compiled helper that the metadata
  writer imports for one value (the minimum metadata parser version).
  `gymfood/export.py::_metadata_shim` supplies `"1.0.0"`. Every field we write needs only that
  version. We also skip the writer's JSON-rendering step (it loads MediaPipe's native library,
  which on Linux needs `libEGL.so.1` / `libGLESv2.so.2`), so writing metadata is pure Python.
- **Export check.** The model is written first (with a `.json` report), then checked: on
  `export.verify_images` images it must give the trained head's top-1 at least
  `export.min_top1_agreement` (0.98) of the time — in MediaPipe Python, or, where MediaPipe's
  native library can't load, in the TFLite interpreter (with a warning). A failed check exits 1
  and says why; the file and the trained head are kept.
- **Preprocessing contract.** Training resizes each photo to 224×224 (stretched, Pillow
  antialiased bilinear). MediaPipe's own resize of a big photo is not antialiased and changed the
  top-1 answer on 5.5% of THFOOD-50 check photos (and more on big phone photos) (`mediapipe_full_size_top1_agreement` in the
  `.json`). So the app resizes the photo to 224×224 itself (canvas, smoothing "high") before
  `classify()`, and the export check feeds MediaPipe exactly that.
- **Model.** EfficientNet-Lite0 feature vector (Apache 2.0, 224 px, 4.7M params) is the same
  default backbone Model Maker uses. It stays **frozen**: each image is embedded once (cached),
  and a softmax head is trained on the embeddings with numpy. That makes CPU training practical.
  The export is float16, about 7 MB, well under the 25 MB limit. On the 30-class Mac run it gave
  the trained head's top-1 on 200/200 check photos (as did float32, 13.6 MB). If a future run
  fails the check because of float16, set `export.quantization: none`.
- **Measured on an M4 Pro (CPU):**
  - backbone about 2 ms/image, plus JPEG decoding;
  - THFOOD-50's ~7k mapped images with 1 augmented copy: a few minutes to embed;
  - the head: seconds;
  - the 2-class smoke run: 13 s end to end.
  - The download is the slow part: 3.1 GB.

## Mac (Apple Silicon): the full run, with your own photos

From the repo root:

```sh
cd ml
/opt/homebrew/bin/python3.12 -m venv .venv          # Python 3.12 (brew install python@3.12)
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest                          # fast tests (about 1 s)

# 1. Backbone (Apache 2.0)
.venv/bin/python scripts/download.py efficientnet_lite0

# 2. THFOOD-50: read the terms first: https://github.com/chakkritte/THFOOD-50
#    "non-commercial research/educational use"; the images belong to third parties.
#    Only if you accept them, for your own private use:
.venv/bin/python scripts/download.py thfood50 --accept-licence thfood50
#    (optional) THFOOD-100: download its zip yourself from https://github.com/NawanolT/THFOOD-100,
#    then add its class names to classMap.json `datasets.thfood100` (ask core-engineer / main):
.venv/bin/python scripts/download.py thfood100 --accept-licence thfood100 --from-file ~/Downloads/THFOOD-100.zip

# 3. Your photos: in the app, turn on Settings → Food photos → "Save photos to improve
#    recognition", log meals for a while, then Export photos (.zip). Put the zip(s) in:
mkdir -p data/personal_zips && cp ~/Downloads/gym-clean-food-photos-*.zip data/personal_zips/

# 4. Prepare, train, evaluate, export
.venv/bin/python scripts/prepare.py
.venv/bin/python scripts/train.py --run-id mac-1
.venv/bin/python scripts/evaluate.py --run-id mac-1     # -> runs/mac-1/report.md
.venv/bin/python scripts/export.py --run-id mac-1       # -> models/food-classifier.tflite
```

Then AirDrop `models/food-classifier.tflite` to the iPhone (Save to Files) and import it in the
app (Settings → Food photos → Import model).

**Your held-out photos.**
- `prepare.py` holds out at least **100** of your photos, or 30% of them if that's more.
- They're picked by file hash and go to `personal_test`. They are **never** used for training or
  validation, and an identical file is removed from every other split.
- With fewer than 100 photos, all of them are held out, and the model trains on public data only.
- The report gives separate numbers for `test` (public) and `personal_test` (your photos).
- The targets are top-3 ≥ 90% on `personal_test`, with the model ≤ 25 MB.

**What prepare drops (and reports):**
- dataset classes with no dish in the class map (27 of THFOOD-50's 50);
- photos of dishes the camera doesn't know yet;
- exact duplicate files.

To teach the camera a new dish:
1. core-engineer adds the dish to the Thai dish table.
2. Add a class to `classMap.json` (`dishes` + `datasets`).
3. Collect about 50+ photos of it.
4. Run prepare → train → export again.

**Re-runs.** Embeddings are cached in `data/cache/emb`, keyed by the image list, so later runs
only embed new images. Re-running `train.py` with the same `--run-id` resumes from the head
checkpoint. After `prepare.py` changes the data, use a new run id.

## Google Colab: public data only

`train_colab.ipynb` trains on THFOOD-50 with a free Colab GPU. **Your photos never go to Colab.**
They train on the Mac only (above).

1. Open the notebook in Colab: *File → Open notebook → GitHub*, repo `wongsatonk/gym-clean`,
   branch `m7b-food-vision`, `ml/train_colab.ipynb`. Pick *Runtime → Change runtime type → T4 GPU*.
2. Read the THFOOD-50 terms. Set `ACCEPT_THFOOD50_LICENCE = True` in the first cell.
3. *Runtime → Run all*. The steps:
   - mount Google Drive (about 3–4 GB of extracted images go in `MyDrive/gym-clean-ml`);
   - clone the branch and install `requirements-colab.txt` (Colab keeps its own GPU TensorFlow);
   - download, prepare `--no-personal`, train, evaluate (prints top-1 / top-3 / per class), export.
   - The last cell downloads the `.tflite`.
4. After a disconnect, *Run all* again. Downloads, embedding chunks and the head checkpoint in
   Drive are reused.

## Smoke run and tests

```sh
.venv/bin/python -m pytest              # fast unit tests (prepare, split, holdout, zip, download, metrics, head)
.venv/bin/python -m pytest --runslow    # + the export smoke test (needs the backbone)
.venv/bin/python scripts/smoke.py       # 2 made-up classes, 1 epoch -> models/smoke.tflite
```

The smoke run uses generated images named with two real labels (`pad_thai`, `tom_yum_goong`).
No dataset is downloaded. The app's opt-in e2e (`FOOD_MODEL_SMOKE=ml/models/smoke.tflite`) can
import `models/smoke.tflite`.

## Layout

```
ml/
  config.yaml            paths, backbone, split, head and export settings
  requirements.txt       pinned (Mac / Linux); requirements-colab.txt for Colab
  gymfood/               the pipeline (classmap, prepare, split, personal zip, download,
                         backbone, head, metrics, export, pipeline, smoke)
  scripts/               download / prepare / train / evaluate / export / smoke CLIs
  tests/                 pytest; fixtures/ has a tiny photo-export zip of made-up images,
                         written by the app's own exporter (gen-photo-zip.ts)
  train_colab.ipynb      Colab notebook (public data only)
  data/ runs/ models/    gitignored
```

The data folders:
- `data/raw/<dataset>/<SourceClass>/…` holds the images;
- `data/personal/<sha256>.jpg` holds your photos, copied out of the zips;
- `data/prepared/manifest.csv` has the columns `path,label,split,source,sha256`.

**Download safety:**
- every fixed download is checked against a pinned sha256;
- archives are unpacked only after a path check;
- Commons files are checked against the sha1 Commons gives, and only CC0 / PD / CC BY files are
  kept, with author and licence in `ATTRIBUTION.csv`.
