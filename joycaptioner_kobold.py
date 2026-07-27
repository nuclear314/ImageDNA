"""
Windows-only Step 2 backend: runs a local KoboldCpp subprocess pointed at a GGUF
vision-caption model + its mmproj (multimodal projector) file, and talks to it over
its OpenAI-compatible /v1/chat/completions HTTP endpoint, instead of loading
transformers/bitsandbytes in-process (see joycaptioner.py, used by Docker/dev).

Only active when IMAGEDNA_CAPTION_BACKEND=kobold (set by windows/main.py for the
packaged standalone build) — see server.py's CAPTION_BACKEND dispatch.

Several constants below are placeholders pending hands-on verification against a
real KoboldCpp release and the target HF repos (exact filenames, CLI flags, and
request/response shapes) — see WINDOWS_JOYCAPTION_GGUF.md and the implementation
plan's "Open items requiring hands-on verification" section.
"""
import base64
import ctypes
import json
import os
import subprocess
import time
import urllib.error
import urllib.request

from joycaptioner import build_prompt  # pure string logic, safe to reuse without pulling in torch/transformers

KOBOLD_PORT = 5001

# TODO: pin a specific KoboldCpp release, mirroring how windows/build.bat pins PYVER.
KOBOLDCPP_VERSION = "TODO"
KOBOLDCPP_EXE_URL = f"https://github.com/LostRuins/koboldcpp/releases/download/v{KOBOLDCPP_VERSION}/koboldcpp.exe"

# Selectable GGUF caption models, mirroring App.tsx's TAGGER_MODELS pattern for WD14.
# IDs are short stable slugs (not raw HF repo strings) so either side's repo pointer
# can change without touching the other; must match KOBOLD_CAPTION_MODELS in App.tsx.
KOBOLD_CAPTION_MODELS = {
    "joycaption-beta-one": {
        "name": "JoyCaption Beta One",
        "description": "General-purpose descriptive captioning (default)",
        # TODO: confirm exact repo + per-quant filenames — candidates per the
        # investigation doc: Mungert/llama-joycaption-beta-one-hf-llava-GGUF,
        # mradermacher/llama-joycaption-beta-one-hf-llava-GGUF.
        "gguf_repo": "Mungert/llama-joycaption-beta-one-hf-llava-GGUF",
        "mmproj_repo": "concedo/llama-joycaption-beta-one-hf-llava-mmproj-gguf",
        "mmproj_filename": "TODO",
        "quant_filenames": {
            "Q4_K_M": "TODO.gguf",
            "Q5_K_M": "TODO.gguf",
            "Q6_K": "TODO.gguf",
        },
    },
    "nsfwvision-v5": {
        "name": "NSFWVision v5 (Qwen3.5 9B)",
        "description": "NSFW-oriented captioning",
        # TODO: this is a Qwen3.5-9B-based vision model, a different architecture
        # from JoyCaption's SigLIP tower — needs its own feasibility pass before
        # shipping: confirm this repo actually has a GGUF + matching mmproj, under
        # what filenames/quant naming (may not follow Q4_K_M/Q5_K_M/Q6_K at all),
        # and that KoboldCpp's mtmd support covers this vision tower. See
        # WINDOWS_JOYCAPTION_GGUF.md's follow-up plan, open item 9.
        "gguf_repo": "GitMylo/nsfwvision-v5_qwen3.5-9b-gguf",
        "mmproj_repo": "TODO",
        "mmproj_filename": "TODO",
        "quant_filenames": {
            "TODO": "TODO.gguf",
        },
    },
}
DEFAULT_MODEL_ID = "joycaption-beta-one"
DEFAULT_QUANT = "Q4_K_M"


def _kobold_home():
    return os.environ.get("IMAGEDNA_KOBOLD_HOME") or os.path.join(os.getcwd(), "_kobold_cache")


def detect_capability():
    """GPU vendor sniff without importing torch (torch is deliberately never
    installed on this path — that's the whole size/AMD-support rationale for
    choosing KoboldCpp). Shells out to PowerShell's CIM cmdlet, same tool
    windows/build.bat already relies on for its own downloads.
    """
    vendor = "none"
    try:
        out = subprocess.run(
            ["powershell", "-NoProfile", "-Command", "(Get-CimInstance Win32_VideoController).Name"],
            capture_output=True, text=True, timeout=10,
        ).stdout.lower()
        if "nvidia" in out:
            vendor = "nvidia"
        elif "amd" in out or "radeon" in out:
            vendor = "amd"
    except Exception:
        pass
    return {
        "backend": "kobold",
        "available": vendor != "none",  # GPU required, no CPU fallback
        "cuda": vendor == "nvidia",  # kept for the header's existing .cuda-based badge
        "gpu_vendor": vendor,
    }


def _download_with_progress(url, dest):
    tmp = dest + ".part"
    with urllib.request.urlopen(url, timeout=30) as resp, open(tmp, "wb") as f:
        while True:
            chunk = resp.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
    os.replace(tmp, dest)


def ensure_artifacts(model_id, quantization, on_progress=None):
    """Downloads/caches koboldcpp.exe (shared across all models) plus the selected
    model's GGUF + mmproj files. Returns (exe_path, gguf_path, mmproj_path).
    """
    from huggingface_hub import hf_hub_download

    catalog_entry = KOBOLD_CAPTION_MODELS[model_id]

    home = _kobold_home()
    os.makedirs(home, exist_ok=True)
    exe_path = os.path.join(home, "koboldcpp.exe")

    if on_progress:
        on_progress("koboldcpp", "koboldcpp.exe")
    if not os.path.exists(exe_path):
        _download_with_progress(KOBOLDCPP_EXE_URL, exe_path)

    quant_filename = catalog_entry["quant_filenames"][quantization]
    if on_progress:
        on_progress("gguf", quant_filename)
    gguf_path = hf_hub_download(catalog_entry["gguf_repo"], quant_filename)

    if on_progress:
        on_progress("mmproj", catalog_entry["mmproj_filename"])
    mmproj_path = hf_hub_download(catalog_entry["mmproj_repo"], catalog_entry["mmproj_filename"])

    return exe_path, gguf_path, mmproj_path


# --- Windows Job Object plumbing -------------------------------------------------
# windows/main.py shuts the app down with proc.terminate() on server.py, an abrupt
# TerminateProcess with no chance for server.py's own cleanup code to run. Without
# this, koboldcpp.exe (server.py's child) would be orphaned and keep holding
# VRAM/a port after the app window closes. Assigning it to a Job Object with
# JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE ties its lifetime to this process's handle,
# so Windows cascades the kill when server.py's process (and this job handle) goes
# away, however abruptly. Needs hands-on validation on a real Windows machine —
# see the implementation plan's open item 6.
_JobObjectExtendedLimitInformation = 9
_JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000


class _JOBOBJECT_BASIC_LIMIT_INFORMATION(ctypes.Structure):
    _fields_ = [
        ("PerProcessUserTimeLimit", ctypes.c_int64),
        ("PerJobUserTimeLimit", ctypes.c_int64),
        ("LimitFlags", ctypes.c_uint32),
        ("MinimumWorkingSetSize", ctypes.c_size_t),
        ("MaximumWorkingSetSize", ctypes.c_size_t),
        ("ActiveProcessLimit", ctypes.c_uint32),
        ("Affinity", ctypes.c_size_t),
        ("PriorityClass", ctypes.c_uint32),
        ("SchedulingClass", ctypes.c_uint32),
    ]


class _IO_COUNTERS(ctypes.Structure):
    _fields_ = [
        ("ReadOperationCount", ctypes.c_uint64),
        ("WriteOperationCount", ctypes.c_uint64),
        ("OtherOperationCount", ctypes.c_uint64),
        ("ReadTransferCount", ctypes.c_uint64),
        ("WriteTransferCount", ctypes.c_uint64),
        ("OtherTransferCount", ctypes.c_uint64),
    ]


class _JOBOBJECT_EXTENDED_LIMIT_INFORMATION(ctypes.Structure):
    _fields_ = [
        ("BasicLimitInformation", _JOBOBJECT_BASIC_LIMIT_INFORMATION),
        ("IoInfo", _IO_COUNTERS),
        ("ProcessMemoryLimit", ctypes.c_size_t),
        ("JobMemoryLimit", ctypes.c_size_t),
        ("PeakProcessMemoryUsed", ctypes.c_size_t),
        ("PeakJobMemoryUsed", ctypes.c_size_t),
    ]


def _assign_job_object(pid):
    """Best-effort: failures here shouldn't block captioning, just weaken cleanup."""
    try:
        kernel32 = ctypes.windll.kernel32
        job = kernel32.CreateJobObjectW(None, None)
        if not job:
            return None
        info = _JOBOBJECT_EXTENDED_LIMIT_INFORMATION()
        info.BasicLimitInformation.LimitFlags = _JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        kernel32.SetInformationJobObject(
            job, _JobObjectExtendedLimitInformation, ctypes.byref(info), ctypes.sizeof(info)
        )
        PROCESS_ALL_ACCESS = 0x1F0FFF
        proc_handle = kernel32.OpenProcess(PROCESS_ALL_ACCESS, False, pid)
        if proc_handle:
            kernel32.AssignProcessToJobObject(job, proc_handle)
            kernel32.CloseHandle(proc_handle)
        return job
    except Exception:
        return None


class JoyCaptionerKobold:
    def __init__(self, model_id=DEFAULT_MODEL_ID, quantization=DEFAULT_QUANT, on_progress=None, port=KOBOLD_PORT):
        self.model_id = model_id
        self.quantization = quantization
        self.port = port
        self.proc = None
        self._job = None

        exe, gguf, mmproj = ensure_artifacts(model_id, quantization, on_progress)
        if on_progress:
            on_progress("starting", None)
        self._start(exe, gguf, mmproj)

    def _start(self, exe, gguf, mmproj):
        # TODO: verify exact flag names/headless behavior against `koboldcpp.exe --help`.
        self.proc = subprocess.Popen(
            [
                exe,
                "--model", gguf,
                "--mmproj", mmproj,
                "--usevulkan",
                "--host", "127.0.0.1",
                "--port", str(self.port),
                "--quiet",
            ],
            creationflags=subprocess.CREATE_NO_WINDOW,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self._job = _assign_job_object(self.proc.pid)
        self._wait_ready()

    def _wait_ready(self, timeout_s=180):
        # Mirrors windows/main.py's Popen+poll idiom for server.py itself.
        # TODO: verify KoboldCpp's actual readiness endpoint against a live instance
        # (guessed as /v1/models here).
        for _ in range(timeout_s):
            if self.proc.poll() is not None:
                raise RuntimeError("koboldcpp.exe exited before becoming ready")
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{self.port}/v1/models", timeout=2)
                return
            except Exception:
                time.sleep(1)
        raise RuntimeError("koboldcpp.exe did not become ready in time")

    def caption_image(self, image_path, mode="descriptive", tone="casual", extra_options=None,
                       known_tags=None, max_new_tokens=512):
        prompt = build_prompt(mode=mode, tone=tone, extra_options=extra_options, known_tags=known_tags)

        with open(image_path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode()

        # TODO: verify this exact request shape against a live KoboldCpp instance —
        # in particular whether the image goes in messages[].content[].image_url.url
        # (OpenAI/GPT-4V shape, assumed here) or a different top-level field.
        payload = {
            "messages": [
                {"role": "system", "content": "You are a helpful image captioner."},
                {"role": "user", "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
                ]},
            ],
            "max_tokens": max_new_tokens,
            "temperature": 0.6,
            "top_p": 0.9,
        }
        req = urllib.request.Request(
            f"http://127.0.0.1:{self.port}/v1/chat/completions",
            data=json.dumps(payload).encode(),
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read())

        caption = data["choices"][0]["message"]["content"].strip()
        return caption, prompt

    def unload(self):
        if self.proc is None:
            return
        self.proc.terminate()
        try:
            self.proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.proc.kill()
        self.proc = None
