# ImageDNA

A web application for extracting image tags and generating prompts using WD14 tagger models. Upload an image and get a list of tags that can be used as prompts for image generation models.

## What the Tool Does

ImageDNA uses the [WD14 tagger model](https://huggingface.co/SmilingWolf/wd-eva02-large-tagger-v3) to analyze images and extract tags. The tool:

- **Extracts tags from images** - Analyzes uploaded images using a pre-trained ONNX model to identify tags
- **Generates copy-ready prompts** - Outputs tags as a comma-separated prompt string ready for use with image generation
- **Provides filtering controls** - Adjust confidence threshold, exclude specific tags, and customize output formatting
- **Offers convenience options** - Toggle masterpiece quality tags, switch between underscores and spaces, and consolidate similar tags

The frontend is built with React and the backend uses Flask with ONNX Runtime for model inference. The WD14 model is automatically downloaded from Hugging Face on first run.

## Random Prompt Generator

Click the **dice icon** in the top-left header to switch to the Random Prompt Generator. This tool builds structured prompts from the selected model's tag vocabulary.

- **General Tags** - Toggle on/off and set how many random general tags to include (1-50). The generator ensures representation from key tag groups (subject count, hair, clothing, background, etc.) before filling the rest randomly.
- **Character Tags** - Toggle to include a random character tag. When enabled, a **Subject Type** selector appears to pick the correct subject tag (`1girl`, `1boy`, `1other`, or `None`) to avoid mismatches.
- **Consolidate Breasts** - Lock a specific breast size instead of letting the generator pick randomly. Choose from flat chest through gigantic breasts.
- **Exclude Tags** - Comma-separated list of terms to filter out. Exclusions apply live to the current prompt after each term is committed with a comma.
- **Structured Ordering** - Generated prompts follow conventional AI art prompt order: subject count, solo, nudity, character name, breast size, hair, clothing, background, then everything else.
- **Live Controls** - Changing the subject type, breast size, or exclude tags instantly updates the current prompt without needing to re-roll.

Click the **Generate Prompt** button to create a prompt, then use **Copy Tags** to copy it to clipboard. Click **Re-roll** to generate a new random prompt.

## Settings

Click the **gear icon** in the top-right corner of the application to open the Settings menu. The following options are available:

- **Model Selection** - Choose which tagger model to use for analysis:
  - *EVA02 Large v3* (default) - Best accuracy
  - *MOAT v2* - Good balance of speed and accuracy
  - *SwinV2 v3* - Fast and efficient

  Changing the model while an image is loaded will automatically re-run the tagging with the new model.

- **DeviantArt Mode** - When enabled, formats tags specifically for DeviantArt submissions:
  - Converts tags to lowercase
  - Removes spaces and replaces hyphens with underscores
  - Provides a separate "Copy DA Tags" button

- **DA Tag Limit** (visible when DeviantArt Mode is enabled) - A slider to set the maximum number of tags to copy (5-30). DeviantArt has a limit of 30 tags per submission.

## How to run locally (Standalone)
You can use the pre-build docker image hosted on [Docker Hub](https://hub.docker.com/r/nuclear314/image-dna) if you want to just run the application and don't require the development files

**Prerequisites:** Docker

```bash
docker run -d -p 5000:5000 nuclear314/image-dna:latest
```

## How to run locally (Development)

**Prerequisites:** Node.js 24+ and Python 3.12+

1. Install frontend dependencies:
   ```bash
   npm install
   ```

2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Build the frontend:
   ```bash
   npm run build
   ```

4. Start the server:
   ```bash
   python server.py
   ```

5. Open http://localhost:5000 in your browser

For development with hot reload, run the Vite dev server (`npm run dev`) and the Flask server separately, then access the Vite dev server URL.

## How to build the docker image

The Dockerfile uses a multi-stage build to create a production-ready image:

1. Build the image:
   ```bash
   docker build -t imagedna .
   ```

2. Run the container:
   ```bash
   docker run -p 5000:5000 imagedna
   ```

3. Open http://localhost:5000 in your browser

The container exposes port 5000 and will download the WD14 model from Hugging Face on first startup.
