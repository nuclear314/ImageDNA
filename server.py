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
    try:
        get_tagger()
    except Exception:
        pass  # _model_state already reflects "error"; report it rather than 500
    return jsonify(_model_state)


@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    if path and os.path.exists(os.path.join(STATIC_DIR, path)):
        return send_from_directory(STATIC_DIR, path)
    return send_from_directory(STATIC_DIR, 'index.html')


if __name__ == '__main__':
    from waitress import serve
    serve(app, host='0.0.0.0', port=5000)
