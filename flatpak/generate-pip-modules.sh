#!/usr/bin/env bash
# Regenerates flatpak/python3-requirements.json from requirements-flatpak.txt.
#
# python3-requirements.json is checked into git rather than generated fresh
# on every CI build: flatpak-builder's sandboxed build environment has no
# network access by design (the whole point of Flatpak's reproducibility
# model), so the pip package list/URLs/hashes have to be resolved *outside*
# the sandbox, ahead of time, by a human running this script — analogous to
# a lockfile. Re-run this whenever requirements-flatpak.txt changes.
#
# Usage: flatpak/generate-pip-modules.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GENERATOR="$SCRIPT_DIR/flatpak-pip-generator"

if [[ ! -f "$GENERATOR" ]]; then
  echo "Fetching flatpak-pip-generator..."
  curl -fL -o "$GENERATOR" \
    "https://raw.githubusercontent.com/flatpak/flatpak-builder-tools/master/pip/flatpak-pip-generator.py"
  chmod +x "$GENERATOR"
fi

echo "Generating python3-requirements.json..."
# onnxruntime, hf_xet, PyYAML, MarkupSafe, numpy, and Pillow all fail to
# resolve as buildable sdists inside flatpak-pip-generator's runtime-probed
# sandbox (onnxruntime and hf_xet ship no sdist on PyPI at all — the latter's
# a Rust/maturin build; the rest hit build-isolation/toolchain gaps under the
# GNOME Sdk) — --prefer-wheels opts them into resolved wheels instead, which
# requires pinning --runtime to the SDK actually used to build this manifest
# (kept in sync with io.github.nuclear314.ImageDNA.yml's sdk/runtime-version).
python3 "$GENERATOR" \
  --requirements-file="$SCRIPT_DIR/requirements-flatpak.txt" \
  --output=python3-requirements \
  --runtime=org.gnome.Sdk//50 \
  --prefer-wheels=onnxruntime,hf_xet,pyyaml,markupsafe,numpy,pillow

# flatpak-pip-generator writes into the current directory; move the result
# next to this script regardless of where it was invoked from.
mv "python3-requirements.json" "$SCRIPT_DIR/python3-requirements.json" 2>/dev/null || true

echo "Done. Review the diff in flatpak/python3-requirements.json before committing."
