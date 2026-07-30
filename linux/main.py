import os
import sys
import subprocess
import time
import json
import logging
import urllib.request

# Persistent profile for localStorage / settings. XDG_DATA_HOME falls back to
# ~/.local/share per the XDG Base Directory spec, mirroring windows/main.py's
# %APPDATA%\ImageDNA.
xdg_data_home = os.environ.get('XDG_DATA_HOME') or os.path.join(os.path.expanduser('~'), '.local', 'share')
user_data = os.path.join(xdg_data_home, 'ImageDNA')
os.makedirs(user_data, exist_ok=True)
log_path = os.path.join(user_data, 'server.log')
launcher_log_path = os.path.join(user_data, 'launcher.log')

# Captures pywebview's own internal logger (it logs, but doesn't re-raise,
# the real exception behind each backend it tries) so failures are
# diagnosable from launcher.log instead of a silent crash. Mirrors
# windows/main.py's rationale for the same logging.basicConfig call.
logging.basicConfig(filename=launcher_log_path, filemode='w', level=logging.DEBUG)

import webview


def _fatal(title, message):
    """Best-effort fatal-error surface. Linux has no ctypes.windll.user32
    MessageBoxW equivalent, so this always logs first (which never fails),
    then tries a GTK dialog (GTK is guaranteed importable here since it's
    the chosen pywebview backend), falling back to notify-send if that
    raises. Mirrors the "best-effort, never itself fatal" style already
    used by _assign_job_object in joycaptioner_kobold.py.
    """
    logging.error('%s: %s', title, message)
    print(f'{title}: {message}', file=sys.stderr)
    try:
        import gi
        gi.require_version('Gtk', '3.0')
        from gi.repository import Gtk
        dialog = Gtk.MessageDialog(
            transient_for=None, flags=0, message_type=Gtk.MessageType.ERROR,
            buttons=Gtk.ButtonsType.OK, text=title)
        dialog.format_secondary_text(message)
        dialog.run()
        dialog.destroy()
    except Exception:
        try:
            subprocess.run(['notify-send', title, message], timeout=5)
        except Exception:
            pass


# Locate the embedded server directory alongside this executable
base = os.path.dirname(sys.executable) if hasattr(sys, '_MEIPASS') else os.path.join(os.path.dirname(__file__), '..')
server_dir = os.path.join(base, 'server')
# python-build-standalone's install_only archives use a conventional Unix
# bin/lib/share layout (unlike the Windows embeddable zip's flat python.exe),
# so the interpreter lives at server/bin/python3 rather than server/python.exe.
python_exe = os.path.join(server_dir, 'bin', 'python3')
server_py = os.path.join(server_dir, 'server.py')

if not os.path.exists(python_exe):
    _fatal(
        'ImageDNA — startup error',
        f'Could not find embedded Python runtime.\n\nExpected:\n{python_exe}\n\n'
        f'Make sure the full release/ImageDNA/ folder is present, not just the executable.')
    sys.exit(1)

# Keep downloaded models under the same app-data folder, so uninstalling/
# cleaning the app is a single folder delete.
env = os.environ.copy()
env['HF_HOME'] = os.path.join(user_data, 'models')
# Only the packaged standalone build sets this — a bare `python server.py` dev run
# (even on Linux) and Docker both leave it unset and keep the transformers/
# bitsandbytes captioner path. See joycaptioner_kobold.py for the KoboldCpp backend.
env['IMAGEDNA_CAPTION_BACKEND'] = 'kobold'
env['IMAGEDNA_KOBOLD_HOME'] = os.path.join(user_data, 'kobold')

# Start Flask in the embedded Python; capture output to log file
log_file = open(log_path, 'w')
proc = subprocess.Popen(
    [python_exe, server_py],
    cwd=server_dir,
    env=env,
    stdout=log_file,
    stderr=log_file,
)

# Poll /api/status until the tagger model is actually loaded, not just until
# the Flask process is up. server.py starts loading the default model in a
# background thread as soon as it boots; /api/status is a pure, non-blocking
# read of that progress, and on first run the load also covers downloading the
# model from Hugging Face — so this budget is minutes, not seconds.
server_ready = False
server_error = False
for _ in range(600):
    if proc.poll() is not None:
        break  # server crashed
    try:
        with urllib.request.urlopen('http://127.0.0.1:5000/api/status', timeout=2) as resp:
            state = json.loads(resp.read())
        if state.get('status') == 'ready':
            server_ready = True
            break
        if state.get('status') == 'error':
            server_error = True
            break
    except Exception:
        pass
    time.sleep(1)

if not server_ready:
    log_file.flush()
    detail = 'The tagger model failed to load.' if server_error else 'The ImageDNA server failed to start.'
    _fatal('ImageDNA — startup error', f'{detail}\n\nCheck the log for details:\n{log_path}')
    proc.terminate()
    sys.exit(1)

try:
    # Off by default in pywebview — kept for parity with windows/main.py, whose
    # rationale (WebView2 silently cancels downloads) is WebView2-specific and
    # not confirmed to apply to WebKitGTK's own download handling. Harmless if
    # a no-op here; verify the Bulk Tagger's "Download All (.zip)" button
    # manually before relying on this.
    webview.settings['ALLOW_DOWNLOADS'] = True
    window = webview.create_window(
        'ImageDNA', 'http://127.0.0.1:5000',
        width=1280, height=900, min_size=(900, 650))
    # gui='gtk' pinned explicitly rather than relying on pywebview's own
    # backend auto-detection, so a dev machine that also happens to have
    # PyQt5 installed can't silently flip the packaged app onto the
    # untested Qt backend.
    # pywebview defaults to private_mode=True (cookies/localStorage discarded on
    # close) unless told otherwise here at start(), not create_window() — passing
    # user_data alone (for HF_HOME/kobold above) never touched this, so Settings/
    # excluded-tags/etc previously reset every launch despite living in
    # localStorage. storage_path pins WebKitGTK's profile under the same
    # XDG data folder so it survives close/reopen the same way HF_HOME does.
    webview.start(gui='gtk', private_mode=False, storage_path=os.path.join(user_data, 'webview'))
    # webview.start() blocks until the window is closed
except Exception as exc:
    logging.exception('Failed to open the app window')
    _fatal('ImageDNA — startup error', f'Failed to open the app window:\n{exc}\n\nCheck the log for details:\n{launcher_log_path}')

proc.terminate()
proc.wait()
