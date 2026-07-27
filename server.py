import json
import os
import sys
import tempfile
import threading
from flask import Flask, request, jsonify, send_from_directory
from PIL import Image, ExifTags

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tagger import WD14Tagger

app = Flask(__name__)
# When bundled with PyInstaller, data files live under sys._MEIPASS
_BASE = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
STATIC_DIR = os.path.join(_BASE, 'dist')
DEFAULT_MODEL = 'SmilingWolf/wd-eva02-large-tagger-v3'
_taggers = {}  # Cache taggers by model name
_tagger_lock = threading.Lock()
_model_state = {"status": "idle", "model": None}  # idle | downloading | ready | error

# Set by windows/main.py for the packaged standalone build only — a bare `python
# server.py` dev run (even on Windows) and Docker both leave this unset, so they
# keep the transformers/bitsandbytes path unchanged.
CAPTION_BACKEND = os.environ.get('IMAGEDNA_CAPTION_BACKEND', 'transformers')

_captioner = None
_captioner_lock = threading.Lock()
_caption_state = {"status": "idle", "model": None, "error": None, "stage": None}
_caption_capability = None  # cached: hardware never changes at runtime


def _kobold_progress(stage, detail):
    _caption_state["stage"] = stage
    if detail:
        _caption_state["model"] = detail


def get_tagger(model_name=None):
    global _taggers
    if model_name is None:
        model_name = DEFAULT_MODEL
    with _tagger_lock:
        if model_name not in _taggers:
            _model_state["status"] = "downloading"
            _model_state["model"] = model_name
            print(f"Loading model: {model_name}")
            try:
                _taggers[model_name] = WD14Tagger(model_name)
            except Exception:
                _model_state["status"] = "error"
                raise
            _model_state["status"] = "ready"
        return _taggers[model_name]


def get_captioner(quantization=None, model_id=None):
    global _captioner
    with _captioner_lock:
        if CAPTION_BACKEND == 'kobold':
            from joycaptioner_kobold import DEFAULT_MODEL_ID, DEFAULT_QUANT
            model_id = model_id or DEFAULT_MODEL_ID
            quantization = quantization or DEFAULT_QUANT
            if (_captioner is not None and getattr(_captioner, 'model_id', None) == model_id
                    and _captioner.quantization == quantization):
                return _captioner
        else:
            quantization = quantization or '4bit'
            if _captioner is not None and _captioner.quantization == quantization:
                return _captioner

        _caption_state["status"] = "downloading"
        _caption_state["error"] = None
        _caption_state["stage"] = None
        _caption_state["model"] = model_id if CAPTION_BACKEND == 'kobold' else "fancyfeast/llama-joycaption-beta-one-hf-llava"

        try:
            if CAPTION_BACKEND == 'kobold':
                from joycaptioner_kobold import JoyCaptionerKobold
            else:
                from joycaptioner import JoyCaptioner
        except ImportError:
            _caption_state["status"] = "error"
            _caption_state["error"] = "missing_dependencies"
            raise

        if _captioner is not None:
            # Switching model/quantization: release the old backend's resources
            # (GPU memory, or the KoboldCpp subprocess) before starting the
            # replacement so the two are never resident at once.
            try:
                _captioner.unload()
            except Exception:
                pass
            _captioner = None
        try:
            if CAPTION_BACKEND == 'kobold':
                _captioner = JoyCaptionerKobold(model_id=model_id, quantization=quantization, on_progress=_kobold_progress)
            else:
                _captioner = JoyCaptioner(quantization=quantization)
        except Exception as e:
            _caption_state["status"] = "error"
            _caption_state["error"] = str(e)
            raise
        _caption_state["status"] = "ready"
        _caption_state["stage"] = None
        return _captioner


def _try_get_captioner(quantization, model_id):
    try:
        get_captioner(quantization, model_id)
    except Exception:
        pass  # errors are already surfaced via _caption_state for /api/caption-status to report


def get_caption_capability():
    # Cheap hardware/dependency check for the Step 2 speed indicator — never
    # touches JoyCaption's model weights, so it's safe to call on every page
    # load without triggering a download or holding _captioner_lock.
    global _caption_capability
    if _caption_capability is not None:
        return _caption_capability
    if CAPTION_BACKEND == 'kobold':
        try:
            from joycaptioner_kobold import detect_capability
            _caption_capability = detect_capability()
        except ImportError:
            _caption_capability = {"backend": "kobold", "available": False, "cuda": False, "gpu_vendor": "none"}
        return _caption_capability
    try:
        import torch
    except ImportError:
        _caption_capability = {"backend": "transformers", "available": False, "cuda": False, "gpu_vendor": "none"}
        return _caption_capability
    cuda = torch.cuda.is_available()
    _caption_capability = {"backend": "transformers", "available": True, "cuda": cuda, "gpu_vendor": "nvidia" if cuda else "none"}
    return _caption_capability


@app.route('/api/caption-capability', methods=['GET'])
def caption_capability():
    return jsonify(get_caption_capability())


@app.route('/api/tag', methods=['POST'])
def tag_image():
    if 'image' not in request.files:
        return jsonify({"error": "No image provided"}), 400

    file = request.files['image']
    model_name = request.form.get('model', DEFAULT_MODEL)

    suffix = os.path.splitext(file.filename)[1] or '.png'
    fd, tmp_path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)

    try:
        file.stream.seek(0)
        file.save(tmp_path)
        # threshold=0 returns all tags; the frontend filters live via its threshold slider
        results = get_tagger(model_name).tag_image(tmp_path, threshold=0)
        return jsonify(results)
    finally:
        os.unlink(tmp_path)


@app.route('/api/caption', methods=['POST'])
def caption_image():
    if 'image' not in request.files:
        return jsonify({"error": "No image provided"}), 400

    file = request.files['image']
    mode = request.form.get('mode', 'descriptive')
    tone = request.form.get('tone', 'casual')
    quantization = request.form.get('quantization') or None
    caption_model = request.form.get('caption_model') or None  # kobold backend only

    extra_options_raw = request.form.get('extra_options')
    try:
        extra_options = json.loads(extra_options_raw) if extra_options_raw else []
    except (json.JSONDecodeError, TypeError):
        return jsonify({"error": "invalid_extra_options"}), 400

    known_tags_raw = request.form.get('known_tags')
    known_tags = [t.strip() for t in known_tags_raw.split(',') if t.strip()] if known_tags_raw else None

    suffix = os.path.splitext(file.filename)[1] or '.png'
    fd, tmp_path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)

    try:
        file.stream.seek(0)
        file.save(tmp_path)
        try:
            captioner = get_captioner(quantization, caption_model)
        except ImportError:
            return jsonify({
                "error": "missing_dependencies",
                "message": "pip install -r requirements-joycaption.txt (requires an NVIDIA GPU)",
            }), 503
        caption, prompt_used = captioner.caption_image(
            tmp_path, mode=mode, tone=tone, extra_options=extra_options, known_tags=known_tags,
        )
        return jsonify({"caption": caption, "prompt_used": prompt_used})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        os.unlink(tmp_path)


@app.route('/api/caption-status', methods=['GET'])
def caption_status():
    return jsonify(_caption_state)


@app.route('/api/caption-enable', methods=['POST'])
def caption_enable():
    # Kicks off the (potentially multi-GB, kobold-backend) download/load in the
    # background as soon as the user opts in, rather than waiting for their first
    # Compose click, and returns immediately — progress is surfaced via the
    # existing /api/caption-status poll.
    payload = request.get_json(silent=True) or {}
    quantization = payload.get('quantization') or None
    caption_model = payload.get('caption_model') or None
    threading.Thread(target=_try_get_captioner, args=(quantization, caption_model), daemon=True).start()
    return jsonify({"status": "started"})


def _serialize_exif_value(value):
    if hasattr(value, 'numerator') and hasattr(value, 'denominator'):
        if value.denominator == 0:
            return 0
        if value.denominator == 1:
            return int(value.numerator)
        return f"{value.numerator}/{value.denominator}"
    if isinstance(value, bytes):
        return value.decode('utf-8', errors='replace').strip('\x00')
    if isinstance(value, tuple):
        return [_serialize_exif_value(v) for v in value]
    if isinstance(value, (int, float, str)):
        return value
    return str(value)


@app.route('/api/exif', methods=['POST'])
def extract_exif():
    if 'image' not in request.files:
        return jsonify({"error": "No image provided"}), 400

    file = request.files['image']
    suffix = os.path.splitext(file.filename)[1] or '.jpg'
    fd, tmp_path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)

    try:
        file.stream.seek(0)
        file.save(tmp_path)

        with Image.open(tmp_path) as img:
            width, height = img.size

            # PNG text chunks (Stable Diffusion, ComfyUI, etc. store metadata here)
            text_meta = {}
            for key, value in img.info.items():
                if isinstance(value, str):
                    text_meta[key] = value

            # Traditional EXIF (JPEG / TIFF)
            exif_data = img.getexif()
            raw = {}
            gps = {}

            if exif_data:
                for tag_id, value in exif_data.items():
                    tag_name = ExifTags.TAGS.get(tag_id, str(tag_id))
                    raw[tag_name] = _serialize_exif_value(value)

                exif_ifd = exif_data.get_ifd(0x8769)
                for tag_id, value in exif_ifd.items():
                    tag_name = ExifTags.TAGS.get(tag_id, str(tag_id))
                    raw[tag_name] = _serialize_exif_value(value)

                gps_ifd = exif_data.get_ifd(0x8825)
                for tag_id, value in gps_ifd.items():
                    tag_name = ExifTags.GPSTAGS.get(tag_id, str(tag_id))
                    gps[tag_name] = _serialize_exif_value(value)

            if not raw and not text_meta:
                return jsonify({"exif": None, "dimensions": {"width": width, "height": height}})

            camera_fields = ['Make', 'Model', 'LensModel', 'LensMake']
            exposure_fields = ['ExposureTime', 'FNumber', 'ISOSpeedRatings', 'ExposureProgram',
                               'MeteringMode', 'Flash', 'FocalLength', 'ExposureBiasValue',
                               'WhiteBalance', 'ExposureMode']
            image_fields = ['ColorSpace', 'Orientation', 'XResolution', 'YResolution']
            datetime_fields = ['DateTimeOriginal', 'DateTime', 'DateTimeDigitized']

            # Pull the generation parameters field (Stable Diffusion / ComfyUI / etc.)
            parameters = text_meta.pop('parameters', None) or text_meta.pop('prompt', None)

            return jsonify({
                "exif": {
                    "parameters": parameters,
                    "text_meta": text_meta if text_meta else None,
                    "camera": {k: raw[k] for k in camera_fields if k in raw},
                    "exposure": {k: raw[k] for k in exposure_fields if k in raw},
                    "image": {k: raw[k] for k in image_fields if k in raw},
                    "datetime": {k: raw[k] for k in datetime_fields if k in raw},
                    "gps": gps if gps else None,
                    "raw": raw,
                    "dimensions": {"width": width, "height": height},
                }
            })
    finally:
        os.unlink(tmp_path)


@app.route('/api/tags', methods=['GET'])
def get_tags():
    model_name = request.args.get('model', DEFAULT_MODEL)
    tagger = get_tagger(model_name)
    result = {'general': [], 'character': []}
    for tag in tagger.tags:
        cat = int(tag['category'])
        name = tag['name']
        if cat == 4:
            result['character'].append(name)
        elif cat != 9:
            result['general'].append(name)
    return jsonify(result)


@app.route('/api/status', methods=['GET'])
def status():
    return jsonify(_model_state)


@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    if path and os.path.exists(os.path.join(STATIC_DIR, path)):
        return send_from_directory(STATIC_DIR, path)
    return send_from_directory(STATIC_DIR, 'index.html')


if __name__ == '__main__':
    from waitress import serve
    # Start loading the default model in the background immediately, rather than
    # waiting for the first /api/tag or /api/tags request to trigger it. This lets
    # /api/status (a pure read, never itself a trigger) reflect real load progress
    # from the moment the process starts, which the Windows launcher polls before
    # opening its window, and it means Docker readiness reflects real usability sooner.
    threading.Thread(target=get_tagger, daemon=True).start()
    serve(app, host='0.0.0.0', port=5000, threads=8)
