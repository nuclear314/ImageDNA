# ImageDNA — Project Context for AI Assistants

## What This Project Is

ImageDNA is a full-stack web application for extracting semantic tags from images using the WD14 ONNX tagger model, and generating structured prompts from that model's tag vocabulary. It is designed for AI art workflows — users upload images to get tagging prompts, or generate new prompts from the model's known tag set.

## Tech Stack

**Frontend:** React 19 + TypeScript, Vite 6, Tailwind CSS (`@tailwindcss/vite`, built not CDN), Lucide-react icons
**Backend:** Python 3.12+, Flask + waitress, ONNX Runtime, Hugging Face Hub, Pillow, NumPy
**Dev/Prod:** Docker (multi-stage), Vite dev proxy routes `/api` → Flask on port 5000. The Dockerfile takes a
`WITH_JOYCAPTION` build arg (`false` by default) — off, it's the CPU-only image with no torch/transformers/
bitsandbytes; `--build-arg WITH_JOYCAPTION=true` installs those from PyTorch's CUDA (`cu126`) wheel index
instead of plain PyPI (which resolves to a CPU-only wheel), for use with `docker run --gpus all`. Separate
`windows/` and `linux/` standalone builds (PyInstaller + embedded Python + pywebview) also exist — see
README's "How to build the Windows standalone app" / "How to build the Linux standalone app" sections.
`windows/main.py` and `linux/main.py` both set `IMAGEDNA_CAPTION_BACKEND=kobold` (see Model Loading below)
before spawning `server.py`, so Step 2 uses the KoboldCpp/GGUF backend on either standalone build instead
of transformers/bitsandbytes. The Linux launcher uses `pywebview`'s GTK/WebKit2GTK backend (pinned
explicitly via `webview.start(gui='gtk')`) and packages as a single `.AppImage`, since Linux has no
WebView2-equivalent preinstalled runtime and no single "just run it" file convention the way a `.exe` is on
Windows; GTK3/WebKit2GTK are treated as a system prerequisite rather than bundled (see `linux/imagedna.spec`).
The Linux CI build (`.github/workflows/build.yml`'s `linux-build` job) pins an explicit Ubuntu version
(currently `24.04`) rather than floating, trading off two opposing constraints: an older base widens the
built AppImage's glibc-compatibility floor, but current PyGObject (`>=3.51.0`) only builds against the
newer `girepository-2.0`, which isn't packaged on Ubuntu 22.04 and older — so the pin is the oldest Ubuntu
version new enough to provide it, not the oldest one glibc alone would allow. Separately, `linux/build.sh`
source-patches the installed PyGObject's `gi/overrides/GLib.py` right after `pip install` (unconditionally,
every build) to work around an unresolved upstream bug (confirmed still present in PyGObject 3.57.0,
https://gitlab.gnome.org/GNOME/pygobject/-/work_items/757): on end-user systems where GLib has fully
removed the legacy `unix_signal_add` symbol in favor of a platform-specific replacement (GLib `>=2.88`,
e.g. current Arch/Artix/Fedora Rawhide), PyGObject's own override-loading crashes at
`gi.repository.Gtk` import time with `AssertionError: unix_signal_add_full was set deprecated but wasn't
added to __all__` — no PyPI version of PyGObject fixes this, only the source patch does.

## Architecture

The app has four main views toggled from the header:

1. **Tagger** — Upload an image → run ONNX inference → display tags with confidence scores
2. **Bulk Tagger** — Drop many images → tag them sequentially against `/api/tag`, reusing the same
   settings (threshold, exclude list, model, masterpiece/underscore/breast/DA toggles) as the single
   Tagger → per-image results in-page, with an optional zip export (image + matching `.txt` caption)
3. **Prompt Generator** — Fetch model vocabulary → generate structured prompts from tag groups
4. **EXIF Extractor** — Upload an image → extract EXIF metadata and AI generation parameters (positive/negative prompt, settings)

**API Endpoints (Flask):**
- `POST /api/tag` — accepts image file, returns `general_tags` and `character_tags` with scores
- `GET /api/tags` — returns full tag vocabulary for the active model
- `POST /api/exif` — accepts image file, returns structured EXIF metadata and PNG text chunks (including Stable Diffusion `parameters`)
- `GET /api/status` — returns `{status, model}` reflecting tagger load state (`idle`/`downloading`/`ready`/`error`); polled by the Windows/Linux launchers and the frontend's processing view, never triggers loading itself
- `POST /api/caption` — Step 2 natural-language captioning. Accepts image file + mode/tone/quantization/extra_options/known_tags, and (Windows/kobold backend only) `caption_model`; returns `{caption, prompt_used}`; 503s with `{"error": "missing_dependencies"}` if `requirements-joycaption.txt` isn't installed (transformers backend) or `joycaptioner_kobold.py` isn't present (kobold backend)
- `GET /api/caption-status` — returns `_caption_state` (`{status, model, error, stage}`); `stage` (`koboldcpp`/`gguf`/`mmproj`/`starting`/`None`) is only populated by the kobold backend's artifact-download progress. Polled by the frontend while a caption is composing
- `POST /api/caption-enable` — kobold backend only; accepts JSON `{quantization, caption_model}`, kicks off the (potentially multi-GB) KoboldCpp+GGUF+mmproj download/load in a background thread and returns immediately, so opting in from Settings doesn't wait for the first Compose click. No-op on the transformers backend (still safe to call — reuses `get_captioner()`)
- `GET /api/caption-capability` — returns `{backend, available, cuda, gpu_vendor}` (`backend` is `"transformers"` or `"kobold"`; dependencies installed / GPU detected), a cheap cached check; backs the header's fast/slow caption speed badge, fetched once on app load

**Model loading:** the default tagger model starts loading in a background thread as soon as `server.py`
boots, rather than lazily on first `/api/tag`/`/api/tags` request — this pre-warms the Windows/Linux
launchers' startup wait and makes Docker readiness reflect real usability sooner. The JoyCaption captioner is the
opposite: it's heavy/optional and is **never** eager-loaded — `get_captioner()` in `server.py` lazily
imports the active backend's module only on first use, so a CPU-only / lightweight deployment never
pulls those dependencies in. Switching quantization (or, on the kobold backend, the caption model) mid-
session calls `.unload()` on the previously cached instance before loading the replacement — only one
captioner instance is ever resident at a time.

**Two caption backends, dispatched by `server.py`'s `CAPTION_BACKEND` env var**
(`IMAGEDNA_CAPTION_BACKEND`, default `"transformers"`):
- **`transformers` (Docker/dev-server, including a bare `python server.py` run on Windows or Linux):**
  in-process `torch`/`transformers`/`bitsandbytes` via `joycaptioner.py`'s `JoyCaptioner`, keyed by
  quantization (`4bit`/`8bit`/`bf16`) alone — unchanged from before the Windows/Linux ports.
- **`kobold` (Windows and Linux standalone builds only, set by `windows/main.py`/`linux/main.py`):**
  `joycaptioner_kobold.py`'s `JoyCaptionerKobold` spawns a local `koboldcpp`/`koboldcpp.exe` subprocess
  pointed at a downloaded GGUF model + mmproj file, and talks to it over its OpenAI-compatible
  `/v1/chat/completions` HTTP endpoint — no torch/transformers/bitsandbytes involved. This HTTP
  integration is confirmed working end-to-end on Windows (produces real NLP captions); the Linux port
  reuses it unchanged and only adds OS-specific plumbing around it. The captioner cache key is
  **(model_id, quantization)** here, since users can pick between GGUF models (`KOBOLD_CAPTION_MODELS`
  catalog: `joycaption-beta-one` default, `nsfwvision-v5`), not just quantization. GPU is required
  (NVIDIA or AMD via `--usevulkan`) — no CPU fallback; `detect_capability()` branches on
  `platform.system()`: PowerShell's `Get-CimInstance Win32_VideoController` on Windows, `lspci` (falling
  back to sysfs PCI vendor IDs) on Linux — neither imports torch. The koboldcpp binary + GGUF/mmproj
  download opt-in on first enabling Step 2 (`POST /api/caption-enable`), cached under
  `%APPDATA%\ImageDNA\kobold` (Windows) / `~/.local/share/ImageDNA/kobold` (Linux) and the same `HF_HOME`
  the WD14 tagger uses. The Linux port replaces Windows' `ctypes.windll` Job Object cascading-kill with
  `prctl(PR_SET_PDEATHSIG)` via `preexec_fn` — flagged as needing verification under real concurrent load
  given `server.py`'s multi-threaded waitress server (`preexec_fn` + fork carries a documented deadlock
  risk if the child-side code isn't minimal). Several constants in `joycaptioner_kobold.py` (exact
  KoboldCpp release/URL per platform, exact GGUF/mmproj filenames per model) should be re-verified
  against live releases whenever `KOBOLDCPP_VERSION` is bumped — see `WINDOWS_JOYCAPTION_GGUF.md` for the
  full rationale.

**State persistence:** React `useState` + `localStorage` (hook lives in `lib/useLocalStorage.ts`), all keys prefixed `imagedna:`

## Key Files

| File | Role |
|---|---|
| `App.tsx` | Root component — global state, image upload, tag filtering logic |
| `server.py` | Flask server and API endpoint handlers |
| `tagger.py` | `WD14Tagger` class — HF model download, image preprocessing, ONNX inference |
| `joycaptioner.py` | `JoyCaptioner` class — Step 2 natural-language captioning via JoyCaption Beta One using in-process transformers/bitsandbytes (Docker/dev-server backend; lazy-imported, optional GPU dependency). `build_prompt()` is shared with the kobold backend |
| `joycaptioner_kobold.py` | `JoyCaptionerKobold` class — Windows/Linux Step 2 backend: spawns/manages a local KoboldCpp subprocess against a selectable GGUF model + mmproj, talks to it over its OpenAI-compatible HTTP API. Branches on `platform.system()` for GPU detection, binary download, and process-lifecycle cleanup. Also home to `KOBOLD_CAPTION_MODELS`, `detect_capability()`, and artifact download/caching |
| `components/BulkTagger.tsx` | Bulk view — multi-file queue, sequential `/api/tag` processing, zip export |
| `components/PromptGenerator.tsx` | Tag vocabulary loading, priority-group prompt generation |
| `components/ExifExtractor.tsx` | EXIF/PNG metadata extraction view — parses and splits SD generation parameters |
| `components/CaptionPanel.tsx` | Step 2 card — mode/tone selection, extra-detail toggles, calls `/api/caption`, displays the composed caption |
| `lib/tagFiltering.ts` | Pure tag filter/format pipeline (threshold, exclude, masterpiece, breast consolidation), shared by the single-image and bulk flows |
| `lib/exportZip.ts` | Builds a downloadable zip of image + matching `.txt` caption pairs (JSZip) |
| `lib/useLocalStorage.ts` | Shared `useLocalStorage` hook (extracted from `App.tsx`) used by `App.tsx` and `CaptionPanel.tsx` |
| `lib/captionOptions.ts` | Frontend catalog of JoyCaption modes and curated "extra option" toggles |
| `components/SettingsModal.tsx` | Model selection, feature toggles (masterpiece, underscores, breast consolidation, DA mode), JoyCaption quantization (backend-conditional: bitsandbytes vs. GGUF option lists) and, on the kobold backend, caption model selection |
| `components/SettingsPanel.tsx` | Confidence threshold slider and exclude tags textarea |
| `components/InfoBauble.tsx` | Reusable hoverable tooltip `(i)` component |
| `components/TagGrid.tsx` | Renders tags as color-coded chips with confidence % |
| `components/Dropzone.tsx` | Drag-and-drop / click image upload zone |
| `types.ts` | Shared TypeScript type definitions |

## Data Flows

**Tagging:**
Image upload → `POST /api/tag` → ONNX inference (448×448 BGR) → confidence scores
→ frontend filters: threshold slider, exclude list, breast consolidation → `TagGrid`

**Bulk tagging:**
Multiple images dropped at once → queued client-side → one `POST /api/tag` in flight at a time
(sequential, not parallel — no batched backend endpoint) → each result run through the same
`lib/tagFiltering.ts` pipeline as the single-image flow → per-image `TagGrid` + optional
`lib/exportZip.ts` zip download (image + matching `.txt` caption per file)

**EXIF extraction:**
Image upload → `POST /api/exif` → Pillow reads `img.getexif()` (JPEG EXIF) + `img.info` (PNG text chunks)
→ frontend parses `parameters` string into positive prompt / negative prompt / settings → `ExifExtractor`

**Prompt generation:**
`GET /api/tags` vocabulary → priority grouping (subject → body → hair → clothing → background → misc)
→ random pick per group → exclude filter → chip display + copyable text

**Image preprocessing (tagger.py):**
RGBA → RGB (white background) → pad to square → resize 448×448 → BGR float32 array

**Natural-language captioning (Step 2):**
Extracted tags (Step 1) → `POST /api/caption` → grounded caption via whichever backend `CAPTION_BACKEND`
selects → textarea + copy button in `CaptionPanel`. Optional and additive.
- **Docker/dev-server (transformers backend):** requires `pip install -r requirements-joycaption.txt`
  and an NVIDIA GPU. Installing plain `torch` from PyPI resolves to a CPU-only wheel (PyTorch's CUDA
  builds are too large for PyPI and only live on PyTorch's own `cu126` index) — the
  `/api/caption-capability` badge reads "Slow Caption" whenever `torch.cuda.is_available()` is `False`,
  which includes this case even on a machine with a working NVIDIA GPU. In Docker this is handled by the
  `WITH_JOYCAPTION` build arg (see Tech Stack); for bare venvs, see README's "GPU build of torch" note.
- **Windows/Linux standalone builds (kobold backend):** no Python ML dependencies at all — requires an
  NVIDIA or AMD GPU (via KoboldCpp's Vulkan backend) instead, downloaded opt-in on first enabling Step 2.
  See README's "Step 2 on the Windows standalone build" / "Step 2 on the Linux standalone build" sections
  and the Model Loading section above.

## Available Models

Three WD14 ONNX models selectable in settings:
- EVA02 Large Tagger v3
- MOAT Tagger v2
- SwinV2 Tagger v3

Models are downloaded from Hugging Face Hub on first use and cached server-side by name.

## UI Conventions

- All React components live in `components/`
- Use the `InfoBauble` component for any contextual help tooltip
- Tag category accent colors: general=indigo, character=purple, rating=amber, meta=emerald
- Tailwind utility classes only — `index.css` is just the Tailwind build entry point (`@import`/`@custom-variant`), not a place for ad-hoc component CSS
- Dark mode uses the `dark:` variant with a class toggle on `<html>`
- LocalStorage keys must use the `imagedna:` prefix

## Running the Project

```bash
# Frontend dev server (with API proxy)
npm run dev

# Backend (separate terminal)
python server.py

# Docker (production, CPU-only — default)
docker build -t imagedna .
docker run -p 5000:5000 imagedna

# Docker with Step 2 (JoyCaption) enabled — requires NVIDIA GPU + NVIDIA Container Toolkit
docker build --build-arg WITH_JOYCAPTION=true -t imagedna-joycaption .
docker run --gpus all -p 5000:5000 imagedna-joycaption
```
