# PyInstaller spec for the ImageDNA launcher.
# The launcher only needs webview + stdlib — onnxruntime runs in a separate
# embedded Python process (release/ImageDNA/server/) and is never imported here.

import os
import glob
import sys
from PyInstaller.utils.hooks import collect_all

root           = os.path.abspath('..')
base_python_dir = sys.base_prefix

# Python runtime DLLs from the base install (not the venv Scripts/ dir)
_runtime_dlls = []
ver = f'{sys.version_info.major}{sys.version_info.minor}'
for pattern in [f'python{ver}.dll', f'python{sys.version_info.major}.dll', 'vcruntime*.dll']:
    for dll in glob.glob(os.path.join(base_python_dir, pattern)):
        _runtime_dlls.append((dll, '.'))

print(f'[spec] base_python_dir : {base_python_dir}')
print(f'[spec] runtime DLLs    : {[os.path.basename(d[0]) for d in _runtime_dlls]}')

# Only collect webview — no onnxruntime, flask, or tagger here
_datas, _binaries, _hiddenimports = [], [], []
for pkg in ('webview',):
    d, b, h = collect_all(pkg)
    _datas    += d
    _binaries += b
    _hiddenimports += h

a = Analysis(
    [os.path.join(root, 'windows', 'main.py')],
    pathex=[root],
    binaries=_runtime_dlls + _binaries,
    datas=_datas,
    hiddenimports=_hiddenimports + [
        'webview.platforms.winforms',
        'webview.platforms.edgechromium',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='ImageDNA',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='ImageDNA',
)
