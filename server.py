import os
import sys
import tempfile
from flask import Flask, request, jsonify

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tagger import WD14Tagger

app = Flask(__name__)
_tagger = None


def get_tagger():
    global _tagger
    if _tagger is None:
        _tagger = WD14Tagger()
    return _tagger


@app.route('/api/tag', methods=['POST'])
def tag_image():
    if 'image' not in request.files:
        return jsonify({"error": "No image provided"}), 400

    file = request.files['image']
    suffix = os.path.splitext(file.filename)[1] or '.png'
    fd, tmp_path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)

    try:
        file.stream.seek(0)
        file.save(tmp_path)
        # threshold=0 returns all tags; the frontend filters live via its threshold slider
        results = get_tagger().tag_image(tmp_path, threshold=0)
        return jsonify(results)
    finally:
        os.unlink(tmp_path)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
