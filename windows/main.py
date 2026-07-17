import os
import sys
import subprocess
import time
import json
import logging
import urllib.request
import ctypes

# Persistent profile for localStorage / settings
user_data = os.path.join(os.environ.get('APPDATA', os.path.expanduser('~')), 'ImageDNA')
os.makedirs(user_data, exist_ok=True)
log_path = os.path.join(user_data, 'server.log')
launcher_log_path = os.path.join(user_data, 'launcher.log')

# Captures pywebview's own internal logger (it logs, but doesn't re-raise,
# the real exception behind each backend it tries) so failures are
# diagnosable from launcher.log instead of a generic error dialog. pywebview's
# Windows backend (winforms.py) needs the classic .NET Framework specifically
# — it references assemblies (e.g. Microsoft.Win32.SystemEvents, bundled into
# System.Windows.Forms.dll under netfx) that don't resolve the same way under
# CoreCLR/.NET Desktop Runtime, so don't try to force pythonnet onto coreclr.
logging.basicConfig(filename=launcher_log_path, filemode='w', level=logging.DEBUG)

import webview

# Locate the embedded server directory alongside this executable
base = os.path.dirname(sys.executable) if hasattr(sys, '_MEIPASS') else os.path.join(os.path.dirname(__file__), '..')
server_dir = os.path.join(base, 'server')
python_exe = os.path.join(server_dir, 'python.exe')
server_py  = os.path.join(server_dir, 'server.py')

if not os.path.exists(python_exe):
    ctypes.windll.user32.MessageBoxW(
        0,
        f'Could not find embedded Python runtime.\n\nExpected:\n{python_exe}\n\n'
        f'Make sure the full release\\ImageDNA\\ folder is present, not just the .exe.',
        'ImageDNA — startup error', 0x10)
    sys.exit(1)

# Keep downloaded models under the same app-data folder, so uninstalling/
# cleaning the app is a single folder delete.
env = os.environ.copy()
env['HF_HOME'] = os.path.join(user_data, 'models')

# Start Flask in the embedded Python; capture output to log file
log_file = open(log_path, 'w')
proc = subprocess.Popen(
    [python_exe, server_py],
    cwd=server_dir,
    env=env,
    creationflags=subprocess.CREATE_NO_WINDOW,
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
    ctypes.windll.user32.MessageBoxW(
        0,
        f'{detail}\n\nCheck the log for details:\n{log_path}',
        'ImageDNA — startup error', 0x10)
    proc.terminate()
    sys.exit(1)

try:
    window = webview.create_window(
        'ImageDNA', 'http://127.0.0.1:5000',
        width=1280, height=900, min_size=(900, 650))
    webview.start()
    # webview.start() blocks until the window is closed
except Exception as exc:
    logging.exception('Failed to open the app window')
    ctypes.windll.user32.MessageBoxW(
        0,
        f'Failed to open the app window:\n{exc}\n\nCheck the log for details:\n{launcher_log_path}',
        'ImageDNA — startup error', 0x10)

proc.terminate()
proc.wait()
