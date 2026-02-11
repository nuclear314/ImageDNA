import os
import sys
import tempfile
from flask import Flask, request, jsonify, send_from_directory

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tagger import WD14Tagger

app = Flask(__name__)
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dist')
DEFAULT_MODEL = 'SmilingWolf/wd-eva02-large-tagger-v3'
_taggers = {}  # Cache taggers by model name


def get_tagger(model_name=None):
    global _taggers
    if model_name is None:
        model_name = DEFAULT_MODEL
    if model_name not in _taggers:
        print(f"Loading model: {model_name}")
        _taggers[model_name] = WD14Tagger(model_name)
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


@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    if path and os.path.exists(os.path.join(STATIC_DIR, path)):
        return send_from_directory(STATIC_DIR, path)
    return send_from_directory(STATIC_DIR, 'index.html')


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
