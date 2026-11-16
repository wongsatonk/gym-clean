"""Export: frozen backbone + trained head -> one .tflite with MediaPipe image-classifier metadata
(labels = our classMap labels, input normalization), then a load check in MediaPipe Python.

Tooling (checked 2026-11-16): MediaPipe Model Maker's last release is 0.2.1.4 (Apr 2024); it pins
tensorflow<2.16 and needs tensorflow-addons (end of life), which have no current Apple Silicon /
Python 3.12 wheels. So we use TensorFlow's TFLite converter plus the metadata writer that ships
in the `mediapipe` package. mediapipe 1.2.x moved to C bindings and its wheel lacks the small
`_pywrap_metadata_version` module the writer imports for one call (the minimum metadata parser
version); `_metadata_shim()` provides it with "1.0.0", the version every field we write needs."""
from __future__ import annotations

import sys
import types

import numpy as np

from .config import Config

MIN_PARSER_VERSION = "1.0.0"


def _metadata_shim() -> None:
    name = "mediapipe.tasks.cc.metadata.python._pywrap_metadata_version"
    try:
        __import__(name)
        return
    except ImportError:
        pass
    mod = types.ModuleType(name)
    mod.GetMinimumMetadataParserVersion = lambda _buf: MIN_PARSER_VERSION  # type: ignore[attr-defined]
    parent = None
    for part in ("mediapipe.tasks.cc", "mediapipe.tasks.cc.metadata", "mediapipe.tasks.cc.metadata.python"):
        if part not in sys.modules:
            sys.modules[part] = types.ModuleType(part)
        if parent is not None:
            setattr(sys.modules[parent], part.rsplit(".", 1)[1], sys.modules[part])
        parent = part
    sys.modules[name] = mod
    sys.modules["mediapipe.tasks.cc.metadata.python"]._pywrap_metadata_version = mod  # type: ignore[attr-defined]


def build_tflite(cfg: Config, W: np.ndarray, b: np.ndarray, *, representative: np.ndarray | None = None) -> bytes:
    """One graph: image [1,224,224,3] float (already normalized) -> softmax probabilities."""
    import tensorflow as tf

    from .backbone import load_backbone

    model, sig = load_backbone(cfg)
    size = cfg.backbone.image_size
    holder = tf.Module()
    holder.backbone = model
    holder.W = tf.Variable(W.astype(np.float32), trainable=False)
    holder.b = tf.Variable(b.astype(np.float32), trainable=False)

    @tf.function(input_signature=[tf.TensorSpec([1, size, size, 3], tf.float32, name="image")])
    def serve(x):
        e = sig(images=x)["default"]
        return {"probabilities": tf.nn.softmax(tf.matmul(e, holder.W) + holder.b)}

    conv = tf.lite.TFLiteConverter.from_concrete_functions([serve.get_concrete_function()], holder)
    q = cfg.export.quantization
    if q == "float16":
        conv.optimizations = [tf.lite.Optimize.DEFAULT]
        conv.target_spec.supported_types = [tf.float16]
    elif q == "int8":
        if representative is None or not len(representative):
            raise ValueError("int8 export needs representative images")
        mean, std = cfg.backbone.norm_mean[0], cfg.backbone.norm_std[0]

        def rep():
            for img in representative[:200]:
                yield [((img.astype(np.float32) - mean) / std)[None]]

        conv.optimizations = [tf.lite.Optimize.DEFAULT]
        conv.representative_dataset = rep
    return conv.convert()


def add_metadata(tflite: bytes, labels: list[str], cfg: Config) -> bytes:
    _metadata_shim()
    from mediapipe.tasks.python.metadata.metadata_writers import image_classifier, metadata_writer

    writer = image_classifier.MetadataWriter.create(
        bytearray(tflite),
        list(cfg.backbone.norm_mean),
        list(cfg.backbone.norm_std),
        metadata_writer.Labels().add(list(labels)),
    )
    out, _json = writer.populate()
    return bytes(out)


def mediapipe_classify(model: bytes, images: list[np.ndarray], max_results: int = -1):
    """Runs MediaPipe Python's ImageClassifier (the same task as the app, CPU) on RGB uint8 images.
    Returns (labels in the model, per image [(label, score)], ms per image)."""
    import time

    import mediapipe as mp
    from mediapipe.tasks.python import vision
    from mediapipe.tasks.python.core.base_options import BaseOptions

    opts = vision.ImageClassifierOptions(base_options=BaseOptions(model_asset_buffer=model),
                                         max_results=max_results)
    results, t = [], 0.0
    with vision.ImageClassifier.create_from_options(opts) as clf:
        for img in images:
            t0 = time.perf_counter()
            r = clf.classify(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(img)))
            t += time.perf_counter() - t0
            results.append([(c.category_name, float(c.score)) for c in r.classifications[0].categories])
    labels = sorted({name for res in results for name, _ in res})
    return labels, results, (1000 * t / max(1, len(images)))
