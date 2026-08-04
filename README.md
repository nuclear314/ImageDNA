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

### Step 2 on the Windows standalone build

The Windows standalone build uses a different Step 2 backend than Docker/dev: instead of loading
`torch`/`transformers`/`bitsandbytes` in-process (which would balloon the release folder by several GB
for every user and has no AMD path), it downloads and runs [KoboldCpp](https://github.com/LostRuins/koboldcpp)
— a small, self-contained inference server — as a background process, pointed at a GGUF conversion of
the selected caption model plus its vision projector (`mmproj`) file.

- **Opt-in, on demand:** nothing is downloaded until you turn on Natural Language Captioning in
  Settings. `koboldcpp.exe` plus the GGUF/mmproj files (several GB) download once and are cached under
  `%APPDATA%\ImageDNA\kobold` and `%APPDATA%\ImageDNA\models`.
- **GPU required:** Step 2 needs an NVIDIA or AMD GPU (AMD via KoboldCpp's Vulkan backend) — there is no
  CPU fallback. If no compatible GPU is detected, the toggle is disabled with an explanation.
- **Caption model:** choose between JoyCaption Beta One (general-purpose, default) and NSFWVision v5
  (NSFW-oriented) in Settings.
- **Quantization:** GGUF quant levels — Q4_K_M (fastest, ~5-6GB VRAM, recommended), Q5_K_M (~6-7GB VRAM),
  or Q6_K (~8-9GB VRAM, best quality) — distinct from Docker/dev's bitsandbytes 4-bit/8-bit/bf16 options.
- **Attribution:** KoboldCpp's own code is licensed AGPL v3.0 (the underlying llama.cpp is MIT). ImageDNA
  downloads and runs KoboldCpp's official, unmodified binary as a separate subprocess — it is not linked
  against or vendored in this repository.

### Step 2 on the Flatpak build

The Flatpak build uses the same KoboldCpp-based backend as the Windows standalone build (see above) — no
`torch`/`transformers`/`bitsandbytes` in-process, same rationale (small install size, AMD support via
Vulkan).

- **Opt-in, on demand:** nothing is downloaded until you turn on Natural Language Captioning in Settings.
  `koboldcpp` plus the GGUF/mmproj files (several GB) download once and are cached under
  `~/.var/app/io.github.nuclear314.ImageDNA/data/ImageDNA/kobold` and the equivalent `.../models` path —
  Flatpak auto-redirects `XDG_DATA_HOME` into the sandboxed data dir, so the app needs no Flatpak-specific
  code to land in the right place.
- **GPU required:** same as Windows — an NVIDIA or AMD GPU (AMD via KoboldCpp's Vulkan backend), no CPU
  fallback. GPU vendor detection shells out to `lspci` (falling back to reading PCI vendor IDs from
  `/sys/class/drm/` if `lspci` itself isn't present); GPU access itself is granted to the sandbox via the
  manifest's `--device=dri` permission.
- **Caption model / quantization:** same catalog and GGUF quant levels as Windows (JoyCaption Beta One /
  NSFWVision v5; Q4_K_M / Q5_K_M / Q6_K or Q8_0 depending on model).
- **Attribution:** same as Windows — KoboldCpp's own code is AGPL v3.0 (llama.cpp is MIT); ImageDNA runs
  its official, unmodified Linux binary as a separate subprocess.

### Using a remote KoboldCpp instance

Both the Windows and Flatpak standalone builds also support pointing Step 2 at a KoboldCpp instance running
somewhere else — a beefier machine on your LAN, or any hardware this app's own GPU detection doesn't
recognize — instead of downloading and running one locally.

- In Settings → Natural Language Captioning → Connection, choose **Remote server** and enter that
  instance's base URL (e.g. `http://192.168.1.50:5001`), plus an API key if it's running with KoboldCpp's
  `--password` option.
- ImageDNA does not download, launch, or manage that instance — you're responsible for keeping it running
  with a vision-capable model and its `mmproj` file already loaded.
- The caption model and quantization dropdowns are hidden in this mode, since they're determined by
  whatever the remote server already has loaded, not by ImageDNA.
- If no compatible local GPU is detected, this mode is selected automatically (the local option is disabled
  in that case, since there's no CPU fallback).

**Recommended settings on the remote KoboldCpp server itself** — this is the machine you start
`koboldcpp`/`koboldcpp.exe` on, separate from whatever machine is running ImageDNA:

```bash
koboldcpp --model llama-joycaption-beta-one-hf-llava-q4_k_m.gguf \
          --mmproj llama-joycaption-beta-one-llava-mmproj-model-f16.gguf \
          --usecublas \
          --host 0.0.0.0 --port 5001 \
          --contextsize 8192 \
          --password <a-long-random-token>
```

- **A vision-capable GGUF + its matching `mmproj` file** — either of the models in ImageDNA's own catalog
  (`JoyCaption Beta One` or `NSFWVision v5`, see `KOBOLD_CAPTION_MODELS` in `joycaptioner_kobold.py`) work
  well, but any llava-style GGUF KoboldCpp can load with a vision projector is compatible — ImageDNA just
  calls its generic OpenAI-compatible `/v1/chat/completions` endpoint with an image, it doesn't require
  one of the catalog models specifically.
- **`--usecublas` on NVIDIA** (fastest) or **`--usevulkan`** for broader compatibility (AMD, or NVIDIA
  without a CUDA-enabled KoboldCpp build) — matches what ImageDNA's own local mode uses.
- **`--host 0.0.0.0`** (not the default `127.0.0.1`) so the port is actually reachable from other machines
  on the network — ImageDNA's local mode binds `127.0.0.1` deliberately since it only ever talks to itself,
  but a remote server needs to accept connections from elsewhere.
- **`--contextsize 8192`** or higher — the default (2048) can be tight once an image's vision tokens plus a
  detailed prompt and known-tags list are all in context; bump it further if you routinely use "Advanced
  details" with many extra options and a large known-tags list.
- **`--password <token>`** — KoboldCpp has no authentication by default. If this instance is reachable
  beyond a trusted LAN (or even on a shared LAN), set a password and enter the same value as the API key
  in ImageDNA's Settings; otherwise anyone who can reach the port can use your GPU and see your images.
- There's no TLS here — traffic (including the base64-encoded image) is sent in plaintext. Keep this on a
  trusted network or tunnel it (e.g. a VPN or SSH tunnel) rather than exposing it directly on the open
  internet.

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

## How to run locally (Linux)

A packaged Flatpak build runs standalone — no Python, Node, or Docker needed, and no GTK/WebKit2GTK
version-matching to worry about (see [How to build the Flatpak](#how-to-build-the-flatpak) for why). Grab
the `.flatpak` bundle from CI or a release if one's been published.

**Prerequisites:**
- `flatpak` itself — most distros ship it, or see [flatpak.org/setup](https://flatpak.org/setup/)
- The Flathub remote, so the `org.gnome.Platform//50` runtime the app depends on can be fetched
  automatically when you install the bundle:
  ```bash
  flatpak remote-add --if-not-exists --user flathub https://flathub.org/repo/flathub.flatpakrepo
  ```

```bash
flatpak install --user ImageDNA.flatpak
flatpak run io.github.nuclear314.ImageDNA
```

First run requires internet access to download the tagger model from Hugging Face into
`~/.var/app/io.github.nuclear314.ImageDNA/data/ImageDNA/models` (Flatpak's sandboxed, per-app redirect of
`~/.local/share`); it's cached there afterward, so subsequent launches work offline.

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

**Lighter alternative — remote KoboldCpp:** you can also get Step 2 in the stock CPU-only image (no
`WITH_JOYCAPTION` build, no `torch`, no `--gpus all`) by setting `IMAGEDNA_CAPTION_BACKEND=kobold` and
pointing Settings → Natural Language Captioning → Connection at a KoboldCpp instance running elsewhere —
see "Using a remote KoboldCpp instance" above. The stock image has no bundled GPU passthrough for the
*local* KoboldCpp option, so remote is the realistic choice here:

```bash
docker run -p 5000:5000 -e IMAGEDNA_CAPTION_BACKEND=kobold imagedna
```

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

## How to build the Flatpak

`flatpak/` contains a Flatpak manifest that packages the same `pywebview`-based launcher as the Windows
standalone build, but runs it against the `org.gnome.Platform`/`org.gnome.Sdk` runtime's own matched,
tested GTK3/WebKit2GTK/girepository set instead of freezing them at build time — see
`flatpak/io.github.nuclear314.ImageDNA.yml`'s header comment for why this replaced an earlier
PyInstaller+AppImage approach (that approach's compiled PyGObject extension only worked correctly on
end-user systems with a close-enough gobject-introspection version to the build machine's).

**Prerequisites:**
- Linux
- Python 3.12+ and Node.js 24+ (to build the frontend and generate the pip lockfile)
- `flatpak` and `flatpak-builder`:
  ```bash
  # Debian/Ubuntu
  sudo apt-get install flatpak flatpak-builder
  # Arch/Artix
  sudo pacman -S flatpak flatpak-builder
  ```
- The GNOME Platform and SDK runtimes:
  ```bash
  flatpak remote-add --if-not-exists --user flathub https://flathub.org/repo/flathub.flatpakrepo
  flatpak install --user flathub org.gnome.Platform//50 org.gnome.Sdk//50
  ```
  If `50` isn't the current branch, run `flatpak remote-ls flathub | grep org.gnome.Platform` and use
  whatever version actually exists, updating `runtime-version` in
  `flatpak/io.github.nuclear314.ImageDNA.yml` to match.

```bash
npm install && npm run build
flatpak/generate-pip-modules.sh
flatpak-builder --user --repo=repo --force-clean build-dir flatpak/io.github.nuclear314.ImageDNA.yml
flatpak build-bundle repo ImageDNA.flatpak io.github.nuclear314.ImageDNA master
```

`generate-pip-modules.sh` fetches `flatpak-pip-generator` and resolves `flatpak/requirements-flatpak.txt`
into `flatpak/python3-requirements.json` — flatpak-builder's sandboxed build step has no network access,
so every pip dependency (including exact wheel URLs and hashes) has to be resolved ahead of time. It needs
`pip install requirements-parser packaging` first if it errors on missing Python packages.

Install and run the result directly:

```bash
flatpak install --user ImageDNA.flatpak
flatpak run io.github.nuclear314.ImageDNA
```

First run requires internet access to download the tagger model from Hugging Face into
`~/.var/app/io.github.nuclear314.ImageDNA/data/ImageDNA/models`; it's cached there afterward, so
subsequent launches work offline. See [How to run locally (Linux)](#how-to-run-locally-linux) for the
runtime prerequisites end users need.
