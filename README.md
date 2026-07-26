# ImageDNA

A web application for extracting image tags and generating prompts using WD14 tagger models. Upload an image and get a list of tags that can be used as prompts for image generation models.

## What the Tool Does

ImageDNA uses the [WD14 tagger model](https://huggingface.co/SmilingWolf/wd-eva02-large-tagger-v3) to analyze images and extract tags. The tool:

- **Extracts tags from images** - Analyzes uploaded images using a pre-trained ONNX model to identify tags
- **Generates copy-ready prompts** - Outputs tags as a comma-separated prompt string ready for use with image generation
- **Provides filtering controls** - Adjust confidence threshold, exclude specific tags, and customize output formatting
- **Offers convenience options** - Toggle masterpiece quality tags, switch between underscores and spaces, and consolidate similar tags
- **Reads image metadata** - Extracts EXIF data and AI generation parameters (positive prompt, negative prompt, sampler settings) from any image

The frontend is built with React and the backend uses Flask with ONNX Runtime for model inference. The WD14 model is automatically downloaded from Hugging Face on first run.

## Step 2: Natural Language Captioning

After tagging an image, an optional **Step 2** card lets you compose a natural-language caption with
[JoyCaption Beta One](https://github.com/fpgaminer/joycaption), grounded in the WD14 tags extracted in
Step 1 rather than having it guess from pixels alone — the same WD14 + JoyCaption workflow commonly used
for anime LoRA/dataset captioning. Choose a mode (Descriptive, Straightforward, SD-style Prompt,
MidJourney, Social Media), optionally toggle extra details (lighting, camera angle, rating, etc.), and
click **Compose Natural Language Prompt**.

This feature is additive and optional:

- **Install:** `pip install -r requirements-joycaption.txt` (in addition to `requirements.txt`). Requires
  an NVIDIA GPU; first use downloads the JoyCaption model (~6–17GB depending on quantization) from
  Hugging Face.
- **GPU build of torch:** `requirements-joycaption.txt` pins a bare `torch>=2.3.0` so it installs on any
  machine, but plain `pip install torch` from PyPI resolves to a **CPU-only** wheel — PyTorch's CUDA
  builds are too large for PyPI and only live on their own index. If the header's caption-speed badge
  shows "Slow Caption" despite having an NVIDIA GPU, reinstall torch from that index, e.g.:
  `pip install --index-url https://download.pytorch.org/whl/cu126 torch==<installed-version> --force-reinstall`
  (check available CUDA tags/versions with `pip index versions torch --index-url https://download.pytorch.org/whl/cu126`).
- **Quantization:** Settings → Natural Language Captioning lets you pick 4-bit (fastest, ~6GB VRAM),
  8-bit (~10GB VRAM), or full bf16 precision (~17GB VRAM, best quality).
- Without `requirements-joycaption.txt` installed, the Step 2 card shows a clear "missing dependencies"
  message and the rest of the app (WD14 tagging, EXIF extraction, prompt generation) is unaffected.
- **Not currently supported in the Windows standalone build** — `torch`/`transformers`/`bitsandbytes` are
  not bundled into the PyInstaller executable. Use the Docker or dev-server setup for Step 2.

## Random Prompt Generator

Click the **dice icon** in the top-left header to switch to the Random Prompt Generator. This tool builds structured prompts from the selected model's tag vocabulary.

- **General Tags** - Toggle on/off and set how many random general tags to include (1-50). The generator ensures representation from key tag groups (subject count, hair, clothing, background, etc.) before filling the rest randomly.
- **Character Tags** - Toggle to include a random character tag. When enabled, a **Subject Type** selector appears to pick the correct subject tag (`1girl`, `1boy`, `1other`, or `None`) to avoid mismatches.
- **Consolidate Breasts** - Lock a specific breast size instead of letting the generator pick randomly. Choose from flat chest through gigantic breasts.
- **Exclude Tags** - Comma-separated list of terms to filter out. Exclusions apply live to the current prompt after each term is committed with a comma.
- **Structured Ordering** - Generated prompts follow conventional AI art prompt order: subject count, solo, nudity, character name, breast size, hair, clothing, background, then everything else.
- **Live Controls** - Changing the subject type, breast size, or exclude tags instantly updates the current prompt without needing to re-roll.

Click the **Generate Prompt** button to create a prompt, then use **Copy Tags** to copy it to clipboard. Click **Re-roll** to generate a new random prompt.

## EXIF Extractor

Click the **EXIF** tab in the header to switch to the EXIF Extractor. Drop or click to upload any image and the tool will read its embedded metadata.

- **Generation Parameters** - For AI-generated images (Stable Diffusion, ComfyUI, etc.), the embedded parameters string is split into three sections:
  - *Positive* - The positive prompt, highlighted in green with its own copy button
  - *Negative* - The negative prompt, highlighted in red with its own copy button
  - *Settings* - Sampler, steps, CFG scale, seed, and other generation settings
  - *Full Parameters* - The raw unmodified string with a "Copy All" button
- **Image Text Data** - Other PNG text chunks are shown in a collapsible section
- **EXIF Metadata** - Camera make/model, lens, exposure settings, ISO, date/time, and GPS for photos taken on real cameras
- **Drag to replace** - With an image already loaded, drag a new image directly onto the preview to replace it instantly

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

## How to run locally (Docker)
You can use the pre-build docker image hosted on [Docker Hub](https://hub.docker.com/r/nuclear314/image-dna) if you want to just run the application and don't require the development files

**Prerequisites:** Docker

```bash
docker run -d -p 5000:5000 nuclear314/image-dna:latest
```

## How to run locally (Windows)

A packaged Windows build (`ImageDNA.exe`) runs standalone — no Python, Node, or Docker needed. Grab a
build from CI (see [How to build the Windows standalone app](#how-to-build-the-windows-standalone-app))
or a release if one's been published, then just run the exe.

**Prerequisites:**
- [Visual C++ Redistributable 2015–2022 (x64), v14.29+](https://aka.ms/vs/17/release/vc_redist.x64.exe) —
  `onnxruntime` requires the VC++ 2019 runtime or later; the linked installer always ships the latest
  compatible version. Missing it surfaces as `ImportError: DLL load failed while importing
  onnxruntime_pybind11_state` when the app starts.
- [.NET Desktop Runtime](https://dotnet.microsoft.com/download/dotnet) — required by `pywebview`'s `pythonnet` bridge on Windows. Already preinstalled
  on Windows 10/11; only relevant on older or minimal Windows installs.
- **WebView2 Runtime** — renders the app window; preinstalled on Windows 11 and auto-delivered via Windows
  Update on Windows 10. If missing, install the
  [Evergreen Bootstrapper](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).

First run requires internet access to download the tagger model from Hugging Face into
`%APPDATA%\ImageDNA\models`; it's cached there afterward, so subsequent launches work offline.

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

### Persisting the model cache

By default the container re-downloads the tagger model every time it's recreated. Point `HF_HOME` at a
named volume so the model survives across `docker run` recreations:

```bash
docker run -p 5000:5000 -e HF_HOME=/cache -v imagedna-cache:/cache imagedna
```

### Enabling Step 2 (JoyCaption) in Docker

Off by default — the image above is CPU-only and doesn't install `torch`/`transformers`/`bitsandbytes` at
all, since most users don't need the multi-GB GPU-captioning stack. To opt in, build with
`WITH_JOYCAPTION=true` and run with `--gpus all`:

```bash
docker build --build-arg WITH_JOYCAPTION=true -t imagedna-joycaption .
docker run --gpus all -p 5000:5000 imagedna-joycaption
```

**Prerequisites for the GPU build:** an NVIDIA GPU and the
[NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)
installed on the Docker host (this is what makes `--gpus all` work). No CUDA base image is needed — the
`torch` wheel installed from PyTorch's `cu126` index bundles its own CUDA runtime libraries; the container
toolkit just needs to expose the host's NVIDIA driver into the container.

Without `WITH_JOYCAPTION=true`, the Step 2 card in the running app shows its normal "missing dependencies"
message and everything else (WD14 tagging, EXIF extraction, prompt generation) works as usual.

## How to build the Windows standalone app

`windows/` contains a PyInstaller-based launcher that bundles an embedded Python server and opens the
app in a native window (via `pywebview`), so end users don't need Python, Node, or Docker installed.

**Prerequisites:**
- Windows
- Python 3.12+
- Node.js 24+
- A virtual environment at the repo root (`.venv`) with `windows/requirements-windows.txt` installed —
  `build.bat` activates it automatically if present

```bat
cd windows
build.bat
```

This runs a full build: compiles the frontend, builds the PyInstaller launcher, and sets up the embedded
Python server runtime (downloading the Python embeddable package once, cached under `windows\cache\`).

For fast iteration on just the launcher (`windows/main.py` or `imagedna.spec`), skip re-provisioning the
embedded server runtime:

```bat
build.bat --skip-server
```

This only works if a full build has already populated `release\ImageDNA\server\` — it reuses that
directory instead of rebuilding it. Note that `--skip-server` will **not** pick up changes to
`requirements.txt` (or other server-side changes), since it skips the step that reinstalls those
packages into the embedded runtime — run a full `build.bat` after touching `requirements.txt`.

The output lands in `release\ImageDNA\`. Launch the app with `release\ImageDNA\ImageDNA.exe`.

First run requires internet access to download the tagger model from Hugging Face into
`%APPDATA%\ImageDNA\models`; it's cached there afterward, so subsequent launches work offline. See
[How to run locally (Windows)](#how-to-run-locally-windows) for the runtime prerequisites end users need.
