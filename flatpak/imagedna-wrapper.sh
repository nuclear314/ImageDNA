#!/bin/sh
# Thin exec wrapper so the manifest's top-level `command:` can point at a
# plain PATH entry — /app/bin/imagedna — the way Flatpak expects, rather
# than requiring `flatpak run` callers to know main.py's install path.
exec python3 /app/lib/imagedna/main.py "$@"
