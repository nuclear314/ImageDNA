# Local Testing Checklist — After a New Build

Run through this after building the app (Docker image, `npm run build` + dev-server, or the Windows
standalone `.exe`) and before considering the build good. Section 1 applies to every build. Sections
2-4 are build-specific. Section 5 is new/high-risk territory from the JoyCaption-on-Windows
(KoboldCpp/GGUF) change and should get extra attention until its open items are resolved — see
`WINDOWS_JOYCAPTION_GGUF.md` and the CLAUDE.md "Model loading" section for context.

## 0. Automated checks (run first, catches regressions cheaply)

- [ ] `npm run test` — Vitest suite passes
- [ ] `npx tsc --noEmit` — no type errors
- [ ] `python -c "import ast; [ast.parse(open(f, encoding='utf-8').read()) for f in ['server.py','tagger.py','joycaptioner.py','joycaptioner_kobold.py']]"` — all backend files parse
- [ ] `npm run build` completes without errors/warnings you don't recognize

## 1. Core feature regression (every build)

Do these once per build target (Docker, dev-server, Windows exe) — a change to shared code (Flask
routes, `tagFiltering.ts`, etc.) can regress any of them regardless of which build you're testing.

**Tagger**
- [ ] Upload a JPEG and a PNG — tags appear with confidence scores
- [ ] Adjust the confidence threshold slider — tag list grows/shrinks live
- [ ] Add an excluded tag — it disappears from results
- [ ] Toggle underscores, masterpiece tags, breast consolidation, DA mode — output updates correctly
- [ ] Switch tagger model (EVA02 / MOAT / SwinV2) mid-session — re-tags with the new model, `/api/status` reflects a cold download on first use of each model

**Bulk Tagger**
- [ ] Drop 3-5 images — they process sequentially, one at a time
- [ ] Per-image results respect the same threshold/exclude/masterpiece settings as the single Tagger
- [ ] "Download All (.zip)" produces a zip with each image + matching `.txt` caption

**Prompt Generator**
- [ ] Generate a prompt — tags are grouped sensibly (subject/body/hair/clothing/background/misc)
- [ ] Regenerate a few times — output varies
- [ ] Switch tagger model — vocabulary reloads for the new model

**EXIF Extractor**
- [ ] Upload a PNG with Stable Diffusion metadata — positive/negative prompt and settings parse correctly
- [ ] Upload a plain JPEG with camera EXIF (or one with none) — camera/exposure/GPS fields render or gracefully show "no data", no crash

**Settings**
- [ ] "Reset all settings to defaults" clears every `imagedna:`-prefixed `localStorage` key and reloads cleanly

## 2. Docker — CPU-only default image

```bash
docker build -t imagedna .
docker run -p 5000:5000 imagedna
```

- [ ] Container starts; `/api/status` reaches `"ready"` without errors in `docker logs`
- [ ] Section 1's core regression checklist passes against `http://localhost:5000`
- [ ] Step 2 (Natural Language Captioning) toggle in Settings: enabling it and clicking Compose shows the "missing dependencies" message (expected — this image has no `torch`/`transformers`), rest of the app unaffected

## 3. Docker — with JoyCaption (`WITH_JOYCAPTION=true`)

Requires an NVIDIA GPU + NVIDIA Container Toolkit on the host.

```bash
docker build --build-arg WITH_JOYCAPTION=true -t imagedna-joycaption .
docker run --gpus all -p 5000:5000 imagedna-joycaption
```

- [ ] Section 1's core regression checklist passes
- [ ] Header caption-speed badge shows "Fast Caption" (confirms `torch.cuda.is_available()` is `True` inside the container)
- [ ] Enable Step 2, compose a caption at each quantization (4-bit, 8-bit, bf16) — caption text is coherent for all three
- [ ] Switch quantization mid-session — old model unloads (watch `nvidia-smi` VRAM drop) before the new one loads, no crash
- [ ] Toggle "Use extracted tags as ground truth" on/off — caption content visibly reflects Step 1's tags when on

## 4. Windows standalone build (`windows/build.bat` → `release\ImageDNA\ImageDNA.exe`)

```
cd windows
build.bat
```

- [ ] Build completes; `release\ImageDNA\` contains `ImageDNA.exe` and a `server\` folder with `server.py`, `tagger.py`, `joycaptioner.py`, `joycaptioner_kobold.py`, and `dist\`
- [ ] Launch `ImageDNA.exe` from a clean checkout (no leftover `%APPDATA%\ImageDNA`) — window opens, WD14 tagger loads (first run downloads the model; watch `%APPDATA%\ImageDNA\server.log`)
- [ ] Section 1's core regression checklist passes inside the webview window
- [ ] Close the app normally — confirm the `server.py` child process actually exits (Task Manager), not left running
- [ ] "Download All (.zip)" in Bulk Tagger actually triggers WebView2's native Save-As dialog (regression check for the `ALLOW_DOWNLOADS` setting)

## 5. Windows Step 2 — KoboldCpp/GGUF backend (new, largely unverified — test carefully)

This is the newly-added path (`joycaptioner_kobold.py`, `IMAGEDNA_CAPTION_BACKEND=kobold` set by
`windows/main.py`). Several constants in `joycaptioner_kobold.py` are still placeholder `TODO`s
(exact KoboldCpp release/URL, exact GGUF/mmproj filenames per model) — **fill those in and re-check
this section before treating Step 2 as working on Windows.** Requires an NVIDIA or AMD GPU.

**Backend dispatch sanity (do this first — easy to get backwards)**
- [ ] Running `python server.py` directly on a Windows dev machine (not the packaged exe) still uses the **transformers** backend — `/api/caption-capability` returns `"backend": "transformers"`. If it says `"kobold"`, the env-var gate is broken and Docker/dev behavior has regressed
- [ ] Only the packaged `ImageDNA.exe` launch path reports `"backend": "kobold"`

**GPU detection**
- [ ] On a machine with an NVIDIA GPU: `/api/caption-capability` reports `gpu_vendor: "nvidia"`, `available: true`
- [ ] On a machine with an AMD GPU: reports `gpu_vendor: "amd"`, `available: true`
- [ ] On a machine with no discrete GPU (or GPU-less VM): reports `gpu_vendor: "none"`, `available: false`, and the Settings toggle is disabled with the "No compatible GPU detected" message instead of silently failing later
- [ ] On a hybrid-graphics laptop (Intel iGPU + NVIDIA/AMD dGPU) — confirm `detect_capability()` still correctly finds the discrete GPU rather than misreading the iGPU

**First-run download + enable flow**
- [ ] Toggle "Natural Language Captioning" on in Settings — `POST /api/caption-enable` fires and the download starts in the background immediately (don't need to open the Step 2 card first)
- [ ] Watch `/api/caption-status` while downloading — `stage` cycles through `koboldcpp` → `gguf` → `mmproj` → `starting` → clears to `null` on `"ready"`; CaptionPanel's busy-button label updates accordingly
- [ ] Confirm `koboldcpp.exe` lands in `%APPDATA%\ImageDNA\kobold\` and the GGUF/mmproj land under the same `HF_HOME` cache the WD14 tagger uses
- [ ] Re-launch the app after first download — no re-download, `/api/caption-status` goes straight to `"ready"` quickly

**Captioning correctness**
- [ ] Compose a caption with the default model (JoyCaption Beta One) at each quant level (Q4_K_M, Q5_K_M, Q6_K) — coherent output, compare quality/speed against the transformers bf16 baseline if you have both available
- [ ] Switch caption model to NSFWVision v5 — confirm KoboldCpp actually loads it (this model's mtmd/vision-tower compatibility with KoboldCpp is unverified per the implementation plan; if it fails to load or produces garbage, that's the expected risk called out in `joycaptioner_kobold.py`'s comments, not a regression)
- [ ] Switch model or quantization mid-session — old `koboldcpp.exe` process fully exits (check Task Manager / `nvidia-smi`) before the new one starts, no two instances resident at once
- [ ] "Use extracted tags as ground truth" toggle — caption content reflects Step 1 tags when on, same as the transformers backend

**Process cleanup (orphan-process risk — see `joycaptioner_kobold.py`'s Job Object comment)**
- [ ] Close `ImageDNA.exe` normally after Step 2 has been used — confirm `koboldcpp.exe` is NOT left running in Task Manager and VRAM is freed
- [ ] Force-kill `ImageDNA.exe` via Task Manager while Step 2 is active — confirm `koboldcpp.exe` still gets cleaned up (this is the specific case the Job Object mitigation exists for)
- [ ] Kill `server.py`'s process directly (simulating a crash) while `koboldcpp.exe` is running — confirm it doesn't survive as an orphan

**Settings/state edge cases**
- [ ] A `localStorage` profile with a pre-existing `imagedna:captionQuantization` value of `4bit`/`8bit`/`bf16` (from before this change, or copied from a Docker/dev profile) — on first load of the Windows build, this should reconcile to `Q4_K_M` automatically rather than being sent to `/api/caption` as-is
- [ ] Same check in reverse: a `Q4_K_M`-style value carried into a transformers-backend session should reconcile to `4bit`
