"""Diagnostic entry point — swap into imagedna.spec to diagnose issues."""

import os
import sys
import ctypes
import ctypes.wintypes

meipass = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
print(f"Python: {sys.version}")
print(f"Bundle root (_MEIPASS): {meipass}")
print(f"sys.path: {sys.path}")
print()

# --- 1. Show files in key directories ---
for label, directory in [
    ('bundle root', meipass),
    ('onnxruntime/capi', os.path.join(meipass, 'onnxruntime', 'capi')),
]:
    if os.path.isdir(directory):
        files = sorted(os.listdir(directory))
        print(f"=== {label} ({len(files)} files) ===")
        for f in files:
            print(f"  {f}")
    else:
        print(f"=== {label}: DIRECTORY MISSING ===")
    print()

# --- 2. Direct Windows LoadLibrary test (bypasses PyInstaller ctypes hook) ---
print("=== Direct Windows LoadLibrary test ===")
kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
kernel32.LoadLibraryW.restype = ctypes.wintypes.HMODULE
kernel32.LoadLibraryW.argtypes = [ctypes.wintypes.LPCWSTR]
kernel32.FreeLibrary.argtypes = [ctypes.wintypes.HMODULE]

test_dlls = [
    os.path.join(meipass, 'onnxruntime', 'capi', 'onnxruntime_providers_shared.dll'),
    os.path.join(meipass, 'onnxruntime', 'capi', 'onnxruntime.dll'),
]
for dll_path in test_dlls:
    if not os.path.exists(dll_path):
        print(f"  SKIP (file missing): {dll_path}")
        continue
    handle = kernel32.LoadLibraryW(dll_path)
    if handle:
        print(f"  OK: {os.path.basename(dll_path)}")
        kernel32.FreeLibrary(handle)
    else:
        err = ctypes.get_last_error()
        print(f"  FAIL: {os.path.basename(dll_path)}")
        print(f"        Windows error {err}: {ctypes.FormatError(err)}")
print()

# --- 3. Direct Python import test ---
print("=== Python import test ===")
try:
    import onnxruntime as ort
    print(f"  SUCCESS: onnxruntime {ort.__version__} imported OK")
except Exception as e:
    print(f"  FAIL: {type(e).__name__}: {e}")
print()

print("=== Done — press Enter to exit ===")
input()
