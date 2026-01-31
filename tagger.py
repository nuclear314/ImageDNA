import sys
import json
from pathlib import Path
from huggingface_hub import hf_hub_download
import onnxruntime as ort
import numpy as np
from PIL import Image

class WD14Tagger:
    def __init__(self, model_name="SmilingWolf/wd-eva02-large-tagger-v3"):
        """Initialize the WD14 tagger with specified model"""
        self.model_name = model_name
        self.model = None
        self.tags = None
        self.load_model()
    
    def load_model(self):
        """Download and load the ONNX model and tags"""
        # Download model files from Hugging Face
        model_path = hf_hub_download(
            self.model_name,
            "model.onnx"
        )
        tags_path = hf_hub_download(
            self.model_name,
            "selected_tags.csv"
        )
        
        # Load ONNX model
        self.model = ort.InferenceSession(model_path)
        
        # Load tags
        import csv
        with open(tags_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            self.tags = [row for row in reader]
    
    def preprocess_image(self, image_path):
        """Preprocess image for the model"""
        # Handle transparency by compositing on white background
        img = Image.open(image_path).convert("RGBA")
        canvas = Image.new("RGBA", img.size, (255, 255, 255))
        canvas.alpha_composite(img)
        img = canvas.convert("RGB")

        # Pad to square preserving aspect ratio, then resize
        width, height = img.size
        max_dim = max(width, height)
        padded = Image.new('RGB', (max_dim, max_dim), (255, 255, 255))
        padded.paste(img, ((max_dim - width) // 2, (max_dim - height) // 2))
        img = padded.resize((448, 448), Image.Resampling.BICUBIC)

        # Convert to numpy array (float32, range 0-255 — no /255 or mean/std)
        img_array = np.array(img, dtype=np.float32)

        # Convert RGB to BGR (model expects BGR channel order)
        img_array = img_array[:, :, ::-1].copy()

        # Add batch dimension (model expects NHWC: [batch, height, width, channels])
        img_array = np.expand_dims(img_array, axis=0)

        return img_array
    
    def tag_image(self, image_path, threshold=0.35):
        """Tag an image and return results above threshold"""
        # Preprocess image
        img_array = self.preprocess_image(image_path)
        
        # Run inference
        input_name = self.model.get_inputs()[0].name
        output_name = self.model.get_outputs()[0].name
        probs = self.model.run([output_name], {input_name: img_array})[0][0]

        # Get tags above threshold
        results = {
            'general_tags': {},
            'character_tags': {},
        }

        for i, tag_data in enumerate(self.tags):
            prob = float(probs[i])
            if prob >= threshold:
                tag_name = tag_data['name']
                category = int(tag_data['category'])

                # 4=character, 9=rating (skipped); everything else → general
                if category == 4:
                    results['character_tags'][tag_name] = prob
                elif category != 9:
                    results['general_tags'][tag_name] = prob
        
        # Sort by confidence
        for key in results:
            results[key] = dict(sorted(
                results[key].items(),
                key=lambda x: x[1],
                reverse=True
            ))
        
        return results

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No image path provided"}))
        sys.exit(1)
    
    image_path = sys.argv[1]
    threshold = float(sys.argv[2]) if len(sys.argv) > 2 else 0.35
    
    try:
        tagger = WD14Tagger()
        results = tagger.tag_image(image_path, threshold)
        print(json.dumps(results, indent=2))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()