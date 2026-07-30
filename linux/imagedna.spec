# PyInstaller spec for the ImageDNA Linux launcher.
# The launcher starts the embedded Python server and opens it in a native
# pywebview window (GTK/WebKit2GTK backend, see linux/main.py's
# webview.start(gui='gtk')). No onnxruntime bundled in the launcher itself —
# that lives in the embedded Python server runtime (see linux/build.sh step 3),
# mirroring windows/imagedna.spec's split.

import os

root = os.path.abspath('..')

a = Analysis(
    [os.path.join(root, 'linux', 'main.py')],
    pathex=[root],
    binaries=[],
    datas=[],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

# PyInstaller's built-in hooks for gi.repository.Gtk/Gdk/GLib/GObject/Gio/
# Pango/cairo auto-bundle the *build machine's own* .so/.typelib files
# whenever gi.repository.Gtk is imported (which pywebview's GTK backend does
# unconditionally) — but there is no equivalent hook for WebKit2/Soup, and
# pyinstaller-hooks-contrib's webview hook is a no-op on Linux. Left
# unfiltered, this bundles a frozen GTK3 that then talks to a separately-
# versioned host WebKit2GTK (which links its own GTK3) — a real ABI-mismatch
# risk, and the likely mechanism behind LINUX_STANDALONE_BUILD.md's warning
# that "AppImage bundling of GTK/WebKit-based apps [is] trickier."
#
# Mitigation: treat GTK3/GLib/WebKit2GTK/Soup entirely as a system
# prerequisite (never bundled), stripping PyInstaller's auto-added GTK
# binaries/datas back out below. gi.repository.* submodules resolve at
# *runtime* via a sys.meta_path importer that reads .typelib files off the
# system's own GI search path, not through PyInstaller's frozen import
# machinery — so this filtering is safe as long as the target system has
# GTK3 + WebKit2GTK installed (documented as a Linux prerequisite in README).
#
# VERIFY this substring list against the real a.binaries/a.datas entries
# PyInstaller produces on the actual build machine before relying on it —
# SONAMEs vary by distro/version. Uncomment the print() below to inspect.
# print('[spec] binaries:', [b[0] for b in a.binaries])
_EXCLUDE_SO_SUBSTRINGS = (
    'libgtk-3', 'libgdk-3', 'libwebkit2gtk', 'libjavascriptcoregtk',
    'libsoup', 'libglib-2.0', 'libgobject-2.0', 'libgio-2.0',
)
a.binaries = [b for b in a.binaries if not any(s in b[0] for s in _EXCLUDE_SO_SUBSTRINGS)]
a.datas = [d for d in a.datas if 'gi_typelibs' not in d[0]]

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
