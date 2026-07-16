# ImageDNA — Project Context for AI Assistants

## What This Project Is

ImageDNA is a full-stack web application for extracting semantic tags from images using the WD14 ONNX tagger model, and generating structured prompts from that model's tag vocabulary. It is designed for AI art workflows — users upload images to get tagging prompts, or generate new prompts from the model's known tag set.

## Tech Stack

**Frontend:** React 19 + TypeScript, Vite 6, Tailwind CSS (`@tailwindcss/vite`, built not CDN), Lucide-react icons
**Backend:** Python 3.12+, Flask + waitress, ONNX Runtime, Hugging Face Hub, Pillow, NumPy
**Dev/Prod:** Docker (multi-stage), Vite dev proxy routes `/api` → Flask on port 5000. A separate `windows/`
standalone build (PyInstaller + embedded Python + pywebview) also exists — see README's "How to build the
Windows standalone app" section.

## Architecture

The app has three main views toggled from the header:

1. **Tagger** — Upload an image → run ONNX inference → display tags with confidence scores
2. **Prompt Generator** — Fetch model vocabulary → generate structured prompts from tag groups
3. **EXIF Extractor** — Upload an image → extract EXIF metadata and AI generation parameters (positive/negative prompt, settings)

**API Endpoints (Flask):**
- `POST /api/tag` — accepts image file, returns `general_tags` and `character_tags` with scores
- `GET /api/tags` — returns full tag vocabulary for the active model
- `POST /api/exif` — accepts image file, returns structured EXIF metadata and PNG text chunks (including Stable Diffusion `parameters`)

**State persistence:** React `useState` + `localStorage`, all keys prefixed `imagedna:`

## Key Files

| File | Role |
|---|---|
| `App.tsx` | Root component — global state, image upload, tag filtering logic |
| `server.py` | Flask server and API endpoint handlers |
| `tagger.py` | `WD14Tagger` class — HF model download, image preprocessing, ONNX inference |
| `components/PromptGenerator.tsx` | Tag vocabulary loading, priority-group prompt generation |
| `components/ExifExtractor.tsx` | EXIF/PNG metadata extraction view — parses and splits SD generation parameters |
| `components/SettingsModal.tsx` | Model selection, feature toggles (masterpiece, underscores, breast consolidation, DA mode) |
| `components/SettingsPanel.tsx` | Confidence threshold slider and exclude tags textarea |
| `components/InfoBauble.tsx` | Reusable hoverable tooltip `(i)` component |
| `components/TagGrid.tsx` | Renders tags as color-coded chips with confidence % |
| `components/Dropzone.tsx` | Drag-and-drop / click image upload zone |
| `types.ts` | Shared TypeScript type definitions |

## Data Flows

**Tagging:**
Image upload → `POST /api/tag` → ONNX inference (448×448 BGR) → confidence scores
→ frontend filters: threshold slider, exclude list, breast consolidation → `TagGrid`

**EXIF extraction:**
Image upload → `POST /api/exif` → Pillow reads `img.getexif()` (JPEG EXIF) + `img.info` (PNG text chunks)
→ frontend parses `parameters` string into positive prompt / negative prompt / settings → `ExifExtractor`

**Prompt generation:**
`GET /api/tags` vocabulary → priority grouping (subject → body → hair → clothing → background → misc)
→ random pick per group → exclude filter → chip display + copyable text

**Image preprocessing (tagger.py):**
RGBA → RGB (white background) → pad to square → resize 448×448 → BGR float32 array

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

# Docker (production)
docker build -t imagedna .
docker run -p 5000:5000 imagedna
```
