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
# A fixed substring list of *names* (libgtk-3, libwebkit2gtk, ...) only
# catches libraries we thought to enumerate — confirmed in practice this
# isn't enough: WebKit2GTK/GLib's own transitive dependency tree drags in
# dozens of unrelated system libraries (libmount, libpcre2, libblkid,
# libselinux, ...) that PyInstaller's automatic ldd-walking bundles right
# alongside them. A bundled build-machine libmount.so.1 this way shadowed an
# end-user system's own newer libgio-2.0.so.0's runtime dependency on
# libmount, crashing with "version `MOUNT_2_40' not found" — the exact
# ABI-mismatch risk this file already exists to prevent, just one level
# removed through GLib's own dependency graph instead of GLib itself.
#
# Filtering by *source path* instead catches that whole transitive tree in
# one pass: anything PyInstaller resolved from a standard system library
# directory is, definitionally, something the target system already
# provides and should keep resolving on its own at runtime — nothing this
# launcher needs (pywebview, gi, PyInstaller's own bootstrap) should
# legitimately require bundling a system multiarch library, since
# onnxruntime/numpy/etc. live in the separately-provisioned embedded server
# runtime (see this file's top comment), not here.
#
# One deliberate exception: libgirepository-2.0 is NOT stripped even though
# it's resolved from a system lib directory like everything else here. Unlike
# GTK/GLib/WebKit2GTK (UI toolkit libraries whose ABI must match the *other*
# GTK-stack libraries already on the target system), libgirepository is
# PyGObject's own introspection/marshaling engine — the library its _gi.so
# extension is compiled and linked against, used only to read .typelib
# metadata and marshal call arguments via libffi. It has no ABI relationship
# with GTK/WebKit's own C ABI, so it should travel as a matched pair with
# _gi.so rather than resolve from the end-user's system. Suspected mechanism
# behind an observed "TypeError: Must be number, not method" crash inside
# pywebview's GTK backend (marshaling GLib.idle_add's callback argument) on
# an end-user system with a much newer gobject-introspection than the CI
# build machine's, that did not reproduce using the end-user's own system
# PyGObject — VERIFY this actually resolves it before trusting this comment.
a.binaries = [
    b for b in a.binaries
    if 'libgirepository' in b[1] or not b[1].startswith(('/usr/lib/', '/lib/'))
]
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
