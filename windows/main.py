import os
import sys
import subprocess
import time
import urllib.request
import webview

# Locate the embedded server directory alongside this executable
base = os.path.dirname(sys.executable) if hasattr(sys, '_MEIPASS') else os.path.join(os.path.dirname(__file__), '..')
server_dir = os.path.join(base, 'server')
python_exe = os.path.join(server_dir, 'python.exe')
server_py  = os.path.join(server_dir, 'server.py')

if not os.path.exists(python_exe):
    import ctypes
    ctypes.windll.user32.MessageBoxW(
        0,
        f'Could not find embedded Python runtime.\n\nExpected:\n{python_exe}\n\n'
        f'Make sure the full release\\ImageDNA\\ folder is present, not just the .exe.',
        'ImageDNA — startup error', 0x10)
    sys.exit(1)

# Start Flask in the embedded Python (no console window)
proc = subprocess.Popen(
    [python_exe, server_py],
    cwd=server_dir,
    creationflags=subprocess.CREATE_NO_WINDOW,
)

# Poll until the server responds (up to 30 s)
for _ in range(60):
    try:
        urllib.request.urlopen('http://127.0.0.1:5000', timeout=1)
        break
    except Exception:
        time.sleep(0.5)

# Open the app window
storage = os.path.join(os.environ.get('APPDATA', os.path.expanduser('~')), 'ImageDNA')
webview.create_window('ImageDNA', 'http://127.0.0.1:5000', width=1280, height=900)
webview.start(storage_path=storage, private_mode=False)

# Window closed — shut down the server
proc.terminate()
proc.wait()
