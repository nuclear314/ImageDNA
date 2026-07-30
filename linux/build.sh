#!/usr/bin/env bash
# ImageDNA Linux standalone build.
# Mirrors windows/build.bat's 4-step pipeline (frontend -> launcher ->
# embedded runtime -> package), swapping PyInstaller's Windows-only pieces
# for their Linux equivalents:
#   - embedded runtime: python-build-standalone instead of python.org's
#     embeddable zip (python.org publishes no Linux equivalent — see
#     LINUX_STANDALONE_BUILD.md)
#   - packaging: an AppImage instead of a plain exe, since there's no
#     single-file "just run it" convention on Linux the way a .exe is on
#     Windows.
#
# Usage: linux/build.sh                - full clean build
#        linux/build.sh --skip-server  - launcher-only rebuild, reuses the
#                                        existing embedded server runtime
#                                        (fast iteration on linux/main.py /
#                                        imagedna.spec). Does NOT pick up
#                                        requirements.txt changes — run a
#                                        full build after touching it.
set -euo pipefail

echo "=== ImageDNA Linux Build ==="

SKIP_SERVER=0
if [[ "${1:-}" == "--skip-server" ]]; then
  SKIP_SERVER=1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
RELEASE_DIR="$REPO_ROOT/release"
SERVER_DIR="$RELEASE_DIR/ImageDNA/server"
SERVER_BACKUP="$SCRIPT_DIR/_server_backup"
CACHE_DIR="$SCRIPT_DIR/cache"

# -----------------------------------------------------------------------
# Step 1 - Build React frontend
# -----------------------------------------------------------------------
cd "$REPO_ROOT"
echo "[1/4] Building React frontend..."
npm run build

# -----------------------------------------------------------------------
# Step 2 - Build the PyInstaller launcher (pywebview GTK window, no
# onnxruntime bundled)
# -----------------------------------------------------------------------
cd "$SCRIPT_DIR"
echo
echo "[2/4] Building launcher..."

if [[ -f "$REPO_ROOT/.venv/bin/activate" ]]; then
  echo "    Activating .venv..."
  # shellcheck disable=SC1091
  source "$REPO_ROOT/.venv/bin/activate"
fi

pip install -r requirements-linux.txt --quiet

# PyInstaller's --noconfirm wipes the whole release/ImageDNA/ folder before
# rebuilding (even with --skip-server), so move the existing server/ runtime
# aside first and restore it afterward instead of losing it. Same rationale
# as windows/build.bat.
if [[ "$SKIP_SERVER" == "1" && -d "$SERVER_DIR" ]]; then
  echo "    Preserving existing server runtime..."
  rm -rf "$SERVER_BACKUP"
  mv "$SERVER_DIR" "$SERVER_BACKUP"
fi

python -m PyInstaller imagedna.spec --distpath "$RELEASE_DIR" --workpath build --noconfirm

if [[ -d "$SERVER_BACKUP" ]]; then
  mv "$SERVER_BACKUP" "$SERVER_DIR"
fi

# -----------------------------------------------------------------------
# Step 3 - Set up embedded Python server runtime
#   Downloads a python-build-standalone release once (cached in
#   linux/cache/) and installs all app packages into it.
#   NOTE: must run AFTER PyInstaller so --noconfirm does not wipe server/
# -----------------------------------------------------------------------
echo
DO_SKIP_SERVER=0
if [[ "$SKIP_SERVER" == "1" && -d "$SERVER_DIR" ]]; then
  DO_SKIP_SERVER=1
fi

if [[ "$DO_SKIP_SERVER" == "1" ]]; then
  echo "[3/4] Skipping embedded Python server runtime setup (--skip-server)"
else
  echo "[3/4] Setting up embedded Python server runtime..."

  # Pinned python-build-standalone release + CPython version, mirroring how
  # windows/build.bat pins PYVER. VERIFY both against a live release before
  # each version bump - the project has moved orgs before
  # (indygreg/python-build-standalone -> astral-sh/python-build-standalone),
  # and asset naming/internal tarball layout should be re-checked
  # (`tar tzf "$ARCHIVE" | head`, `bin/python3 -m pip --version`) whenever
  # this pin changes.
  PBS_RELEASE=20260728
  PYVER=3.12.13
  ASSET="cpython-${PYVER}+${PBS_RELEASE}-x86_64-unknown-linux-gnu-install_only.tar.gz"
  ARCHIVE="$CACHE_DIR/$ASSET"

  echo "    Using Python $PYVER (python-build-standalone $PBS_RELEASE)"

  rm -rf "$SERVER_DIR"
  mkdir -p "$SERVER_DIR"

  if [[ ! -f "$ARCHIVE" ]]; then
    echo "    Downloading Python $PYVER (python-build-standalone)..."
    mkdir -p "$CACHE_DIR"
    curl -fL -o "$ARCHIVE" \
      "https://github.com/astral-sh/python-build-standalone/releases/download/${PBS_RELEASE}/${ASSET}"
  else
    echo "    Using cached $ARCHIVE"
  fi

  # install_only archives are full self-contained interpreters (unlike the
  # Windows embeddable zip), so there's no ._pth "import site" dance needed.
  # --strip-components=1 assumes a top-level 'python/' dir in the tarball -
  # verify with `tar tzf "$ARCHIVE" | head` if this pin is ever bumped.
  echo "    Extracting..."
  tar -xzf "$ARCHIVE" -C "$SERVER_DIR" --strip-components=1

  PY_BIN="$SERVER_DIR/bin/python3"

  # install_only builds are believed to ship pip pre-bootstrapped - verify;
  # fall back to get-pip.py (mirroring windows/build.bat) if not.
  if ! "$PY_BIN" -m pip --version >/dev/null 2>&1; then
    echo "    Installing pip..."
    curl -fL -o "$SERVER_DIR/get-pip.py" https://bootstrap.pypa.io/get-pip.py
    "$PY_BIN" "$SERVER_DIR/get-pip.py" --no-warn-script-location --quiet
    rm "$SERVER_DIR/get-pip.py"
  fi

  # Install app requirements directly into the server's site-packages.
  # --target prevents pip from skipping packages already installed in the
  # developer's own Python environment ("Requirement already satisfied").
  echo "    Installing packages (this may take a few minutes)..."
  PY_MINOR="$(echo "$PYVER" | cut -d. -f1,2)"
  SITE_PACKAGES="$SERVER_DIR/lib/python${PY_MINOR}/site-packages"
  "$PY_BIN" -m pip install -r "$REPO_ROOT/requirements.txt" \
    --target="$SITE_PACKAGES" --no-warn-script-location --quiet

  # Copy app files into the server directory
  echo "    Copying app files..."
  cp "$REPO_ROOT/server.py" "$SERVER_DIR/"
  cp "$REPO_ROOT/tagger.py" "$SERVER_DIR/"
  cp "$REPO_ROOT/joycaptioner.py" "$SERVER_DIR/"
  cp "$REPO_ROOT/joycaptioner_kobold.py" "$SERVER_DIR/"
  cp -r "$REPO_ROOT/dist" "$SERVER_DIR/dist"

  echo "    Server runtime ready."
fi

# -----------------------------------------------------------------------
# Step 4 - Package as an AppImage
#   Zero precedent in this repo - Windows has no equivalent single-file
#   packaging step. The AppDir/.desktop/AppRun structure below is standard
#   AppImage convention; its interaction with a PyInstaller onedir COLLECT
#   payload (server/ sitting alongside the frozen launcher) has not been
#   verified against a live FUSE-mounted AppImage - see
#   LINUX_STANDALONE_BUILD.md / the implementation plan's Phase 0 spike.
# -----------------------------------------------------------------------
echo
echo "[4/4] Packaging AppImage..."

APPDIR="$SCRIPT_DIR/build/AppDir"
rm -rf "$APPDIR"
mkdir -p "$APPDIR"

# The whole PyInstaller COLLECT output (ImageDNA binary + its deps +
# server/ runtime) becomes the AppDir's payload, kept together so main.py's
# dirname(sys.executable)-relative server/ lookup still resolves once
# mounted read-only by the AppImage's own FUSE runtime.
cp -r "$RELEASE_DIR/ImageDNA" "$APPDIR/ImageDNA"

cat > "$APPDIR/ImageDNA.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=ImageDNA
Exec=AppRun
Icon=imagedna
Categories=Graphics;
EOF

# linux/imagedna.png is generated from assets/icon.png (the master source,
# shared with windows/icon.ico) — see assets/icon.png's provenance. Falls
# back to appimagetool's own generic default if it's ever missing, so
# packaging doesn't hard-fail on a missing icon.
if [[ -f "$SCRIPT_DIR/imagedna.png" ]]; then
  cp "$SCRIPT_DIR/imagedna.png" "$APPDIR/imagedna.png"
else
  echo "    WARNING: linux/imagedna.png not found - packaging without a custom icon."
fi

cat > "$APPDIR/AppRun" <<'EOF'
#!/usr/bin/env bash
HERE="$(dirname "$(readlink -f "${0}")")"
exec "$HERE/ImageDNA/ImageDNA" "$@"
EOF
chmod +x "$APPDIR/AppRun"

APPIMAGETOOL="$CACHE_DIR/appimagetool-x86_64.AppImage"
if [[ ! -f "$APPIMAGETOOL" ]]; then
  echo "    Downloading appimagetool..."
  mkdir -p "$CACHE_DIR"
  curl -fL -o "$APPIMAGETOOL" \
    "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage"
  chmod +x "$APPIMAGETOOL"
fi

OUTPUT="$RELEASE_DIR/ImageDNA-x86_64.AppImage"
# ARCH is required by some appimagetool builds when not run under a real
# desktop session (e.g. CI); harmless to set unconditionally.
ARCH=x86_64 "$APPIMAGETOOL" "$APPDIR" "$OUTPUT"

echo
echo "[4/4] Build complete!"
echo "Distributable: release/ImageDNA-x86_64.AppImage"
echo "Launch with:   chmod +x release/ImageDNA-x86_64.AppImage && ./release/ImageDNA-x86_64.AppImage"
