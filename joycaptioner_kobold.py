"""
Windows/Linux Step 2 backend: runs a local KoboldCpp subprocess pointed at a GGUF
vision-caption model + its mmproj (multimodal projector) file, and talks to it over
its OpenAI-compatible /v1/chat/completions HTTP endpoint, instead of loading
transformers/bitsandbytes in-process (see joycaptioner.py, used by Docker/dev).

Only active when IMAGEDNA_CAPTION_BACKEND=kobold (set by windows/main.py and
linux/main.py for their respective packaged standalone builds) — see server.py's
CAPTION_BACKEND dispatch.

The KoboldCpp release and both catalog models' GGUF/mmproj repos and filenames
are pinned (see KOBOLDCPP_VERSION and KOBOLD_CAPTION_MODELS below). The HTTP
integration itself (KoboldCpp's readiness endpoint and chat-completions request/
response shape — see _wait_ready and caption_image) is confirmed working against
a live Windows/GPU instance (produces real NLP captions end-to-end). What's
*not* yet verified on Linux specifically is the OS-specific plumbing added by
this port: GPU vendor detection (detect_capability), the koboldcpp-linux-x64-nocuda
binary actually downloading/starting/becoming ready, and the PR_SET_PDEATHSIG
process-lifecycle replacement for Windows' Job Object (see _preexec_pdeathsig) —
see WINDOWS_JOYCAPTION_GGUF.md and the implementation plan's "Open items
requiring hands-on verification" section.
"""
import base64
import ctypes
import json
import os
import platform
import signal
import subprocess
import time
import urllib.error
import urllib.request

from joycaptioner import build_prompt  # pure string logic, safe to reuse without pulling in torch/transformers

KOBOLD_PORT = 5001

# Pinned KoboldCpp release, mirroring how windows/build.bat pins PYVER.
# The nocuda build (Vulkan/CLBlast only, no bundled CUDA) matches this module's
# always-`--usevulkan` launch flags below and is ~5x smaller than koboldcpp.exe,
# which bundles CUDA this code never asks for via --usecublas. Same version tag
# publishes both the Windows and Linux assets, so one pin covers both platforms.
KOBOLDCPP_VERSION = "1.117.1"
KOBOLDCPP_EXE_URL_WINDOWS = f"https://github.com/LostRuins/koboldcpp/releases/download/v{KOBOLDCPP_VERSION}/koboldcpp-nocuda.exe"
# VERIFY at implementation time — asset naming has shifted across KoboldCpp
# releases historically; confirmed present for this exact pinned version as of
# this port, but re-check before bumping KOBOLDCPP_VERSION.
KOBOLDCPP_EXE_URL_LINUX = f"https://github.com/LostRuins/koboldcpp/releases/download/v{KOBOLDCPP_VERSION}/koboldcpp-linux-x64-nocuda"

# Selectable GGUF caption models, mirroring App.tsx's TAGGER_MODELS pattern for WD14.
# IDs are short stable slugs (not raw HF repo strings) so either side's repo pointer
# can change without touching the other; must match KOBOLD_CAPTION_MODELS in App.tsx.
KOBOLD_CAPTION_MODELS = {
    "joycaption-beta-one": {
        "name": "JoyCaption Beta One",
        "description": "General-purpose descriptive captioning (default)",
        # mmproj_repo is published by concedo (KoboldCpp's own author); its other
        # three files are full-model GGUFs, not mmproj — the mmproj file is the
        # only one under this exact name. Verified against the live HF repo listings.
        "gguf_repo": "Mungert/llama-joycaption-beta-one-hf-llava-GGUF",
        "mmproj_repo": "concedo/llama-joycaption-beta-one-hf-llava-mmproj-gguf",
        "mmproj_filename": "llama-joycaption-beta-one-llava-mmproj-model-f16.gguf",
        "quant_filenames": {
            "Q4_K_M": "llama-joycaption-beta-one-hf-llava-q4_k_m.gguf",
            "Q5_K_M": "llama-joycaption-beta-one-hf-llava-q5_k_m.gguf",
            "Q6_K": "llama-joycaption-beta-one-hf-llava-q6_k_m.gguf",
        },
    },
    "nsfwvision-v5": {
        "name": "NSFWVision v5 (Qwen3.5 9B)",
        "description": "NSFW-oriented captioning",
        # Single repo hosts both the GGUFs and the mmproj (the "mmproj-" filename
        # prefix is llama.cpp's own naming convention for a multimodal projector,
        # good evidence KoboldCpp's mtmd path supports this vision tower). Verified
        # against the live HF repo listing. This repo's own top quant is Q8_0 (no
        # Q6_K) — the frontend shows each model's real quant set rather than a
        # shared list, so this key is genuinely Q8_0, not a stand-in for Q6_K.
        "gguf_repo": "GitMylo/nsfwvision-v5_qwen3.5-9b-gguf",
        "mmproj_repo": "GitMylo/nsfwvision-v5_qwen3.5-9b-gguf",
        "mmproj_filename": "mmproj-nsfwvision_v5.gguf",
        "quant_filenames": {
            "Q4_K_M": "nsfwvision_v5-Q4_K_M.gguf",
            "Q5_K_M": "nsfwvision_v5-Q5_K_M.gguf",
            "Q8_0": "nsfwvision_v5-Q8_0.gguf",
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
    choosing KoboldCpp). On Windows, shells out to PowerShell's CIM cmdlet
    (same tool windows/build.bat already relies on for its own downloads). On
    Linux, shells out to `lspci` — the closest semantic match (enumerates
    attached display hardware independent of driver state, available
    out-of-the-box via pciutils on virtually every mainstream distro, needs no
    elevated privileges), falling back to reading PCI vendor IDs directly from
    sysfs if `lspci` itself is missing (rare, e.g. some minimal containers).
    Not independently verified on live Linux/GPU hardware — same category of
    gap as this function's own Windows path had before hands-on testing.
    """
    vendor = "none"
    try:
        if platform.system() == "Windows":
            out = subprocess.run(
                ["powershell", "-NoProfile", "-Command", "(Get-CimInstance Win32_VideoController).Name"],
                capture_output=True, text=True, timeout=10,
            ).stdout.lower()
        else:
            out = subprocess.run(
                ["lspci", "-nn"], capture_output=True, text=True, timeout=10,
            ).stdout.lower()
        if "nvidia" in out:
            vendor = "nvidia"
        elif "amd" in out or "radeon" in out or "advanced micro devices" in out:
            vendor = "amd"
    except Exception:
        if platform.system() != "Windows":
            # lspci missing - fall back to PCI vendor IDs from sysfs directly,
            # no external binary required. 0x10de=NVIDIA, 0x1002=AMD.
            try:
                import glob
                for vendor_file in glob.glob("/sys/class/drm/*/device/vendor"):
                    with open(vendor_file) as f:
                        vid = f.read().strip().lower()
                    if vid == "0x10de":
                        vendor = "nvidia"
                        break
                    elif vid == "0x1002":
                        vendor = "amd"
                        break
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
    is_windows = platform.system() == "Windows"
    exe_name = "koboldcpp.exe" if is_windows else "koboldcpp"
    exe_url = KOBOLDCPP_EXE_URL_WINDOWS if is_windows else KOBOLDCPP_EXE_URL_LINUX
    exe_path = os.path.join(home, exe_name)

    if on_progress:
        on_progress("koboldcpp", exe_name)
    if not os.path.exists(exe_path):
        _download_with_progress(exe_url, exe_path)
        if not is_windows:
            # A plain HTTP download never carries the executable bit over
            # regardless of what the origin GitHub release asset had.
            os.chmod(exe_path, 0o755)

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


# --- Linux process-lifecycle equivalent ------------------------------------------
# Linux has no Job Object API. PR_SET_PDEATHSIG asks the kernel to deliver a
# signal to *this* (child) process automatically if its direct parent (the
# server.py process that Popen'd it) dies for any reason, including an abrupt
# SIGKILL — the closest analog to the Windows Job Object's
# JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE cascading-kill behavior, tied to the same
# parent/child relationship (server.py -> koboldcpp), not to linux/main.py's.
#
# subprocess.Popen(preexec_fn=...) in a *multi-threaded* parent carries a
# documented fork-deadlock risk in Python's own docs (fork() only duplicates
# the calling thread; a lock held by another thread at fork-time stays locked
# forever in the child) — and server.py is multi-threaded (waitress runs with
# multiple threads, plus the tagger/captioner background-loading threads).
# This function is deliberately minimal (a single ctypes call, no allocation
# or locking) to follow the standard safe pattern, but has not been verified
# under real concurrent load (e.g. a caption request racing a bulk-tag
# request) — needs hands-on verification, same category of gap as this file's
# other Linux-specific additions.
def _preexec_pdeathsig():
    try:
        PR_SET_PDEATHSIG = 1
        ctypes.CDLL("libc.so.6", use_errno=True).prctl(PR_SET_PDEATHSIG, signal.SIGTERM, 0, 0, 0)
    except Exception:
        pass


def _kill_stale_process_on_port(port):
    """Best-effort: if a previous koboldcpp instance is still bound to our port —
    orphaned by a crash, a force-quit, or the Job Object/PR_SET_PDEATHSIG cleanup
    above not firing (both are explicitly flagged elsewhere in this file as
    unverified under real-world conditions) — kill it before starting a fresh
    one. Without this, _wait_ready()'s HTTP probe would happily report "ready"
    by talking to the STALE process instead of the one we just spawned, so the
    new subprocess.Popen() either fails to bind the port and dies unnoticed, or
    (worse) both end up alive: two koboldcpp processes, with our self.proc
    handle pointing at the wrong one and no way to ever kill the real one
    later. This closes that gap by clearing the port ourselves first.
    """
    try:
        if platform.system() == "Windows":
            out = subprocess.run(
                ["netstat", "-ano", "-p", "tcp"], capture_output=True, text=True, timeout=10,
            ).stdout
            pids = set()
            for line in out.splitlines():
                parts = line.split()
                if len(parts) >= 5 and parts[0].upper() == "TCP" and parts[3].upper() == "LISTENING" \
                        and parts[1].endswith(f":{port}"):
                    pids.add(parts[4])
            for pid in pids:
                subprocess.run(["taskkill", "/F", "/PID", pid], capture_output=True, timeout=10)
        else:
            # Parsed directly from /proc rather than shelling out to lsof/fuser,
            # which aren't guaranteed installed — same rationale as
            # detect_capability()'s sysfs fallback below it.
            port_hex = f"{port:04X}"
            inodes = set()
            with open("/proc/net/tcp") as f:
                next(f)
                for line in f:
                    fields = line.split()
                    if fields[1].split(":")[1] == port_hex and fields[3] == "0A":  # 0A = LISTEN
                        inodes.add(fields[9])
            if inodes:
                import glob
                for fd_link in glob.glob("/proc/*/fd/*"):
                    try:
                        target = os.readlink(fd_link)
                    except OSError:
                        continue
                    if target.startswith("socket:[") and target[8:-1] in inodes:
                        try:
                            os.kill(int(fd_link.split("/")[2]), signal.SIGKILL)
                        except (OSError, ValueError):
                            pass
        time.sleep(1)  # give the OS a moment to actually release the port
    except Exception:
        pass


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
        is_windows = platform.system() == "Windows"
        _kill_stale_process_on_port(self.port)
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
            creationflags=subprocess.CREATE_NO_WINDOW if is_windows else 0,
            preexec_fn=None if is_windows else _preexec_pdeathsig,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        if is_windows:
            self._job = _assign_job_object(self.proc.pid)
        try:
            self._wait_ready()
        except Exception:
            # _wait_ready raising (timeout or crash-detection) leaves self.proc
            # still running (the timeout case) or already dead (the crash case).
            # Either way, __init__ is about to raise past this point without ever
            # handing the caller an instance to call .unload() on later, so the
            # subprocess would otherwise be orphaned — still holding VRAM — while
            # server.py's get_captioner() sees _captioner as None and spawns a
            # fresh one on the next request/retry. Clean up before re-raising so a
            # slow-loading (e.g. larger) model can't leave two koboldcpp processes
            # running at once.
            self.unload()
            raise

    def _wait_ready(self, timeout_s=180):
        # Mirrors windows/main.py's Popen+poll idiom for server.py itself.
        # KoboldCpp's readiness endpoint (/v1/models) and request/response
        # shape are confirmed working against a live Windows/GPU instance
        # (produces real NLP captions end-to-end) — this doesn't differ by
        # OS, so the Linux port inherits that as proven rather than
        # speculative.
        for _ in range(timeout_s):
            if self.proc.poll() is not None:
                raise RuntimeError("koboldcpp exited before becoming ready")
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{self.port}/v1/models", timeout=2)
                return
            except Exception:
                time.sleep(1)
        raise RuntimeError("koboldcpp did not become ready in time")

    def caption_image(self, image_path, mode="descriptive", tone="casual", extra_options=None,
                       known_tags=None, max_new_tokens=512):
        prompt = build_prompt(mode=mode, tone=tone, extra_options=extra_options, known_tags=known_tags)

        with open(image_path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode()

        # This request shape (OpenAI/GPT-4V-style messages[].content[].image_url.url)
        # is confirmed working against a live KoboldCpp instance on Windows — carries
        # over unchanged for Linux since KoboldCpp's HTTP API doesn't differ by OS.
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
