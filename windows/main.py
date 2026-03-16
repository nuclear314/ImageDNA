import os
import sys
import subprocess
import time
import urllib.request
import ctypes

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

# Persistent profile for localStorage / settings
user_data = os.path.join(os.environ.get('APPDATA', os.path.expanduser('~')), 'ImageDNA')
os.makedirs(user_data, exist_ok=True)
log_path = os.path.join(user_data, 'server.log')

# Start Flask in the embedded Python; capture output to log file
log_file = open(log_path, 'w')
proc = subprocess.Popen(
    [python_exe, server_py],
    cwd=server_dir,
    creationflags=subprocess.CREATE_NO_WINDOW,
    stdout=log_file,
    stderr=log_file,
)

# Poll until the server responds (up to 30 s)
server_ready = False
for _ in range(60):
    if proc.poll() is not None:
        break  # server crashed
    try:
        urllib.request.urlopen('http://127.0.0.1:5000', timeout=1)
        server_ready = True
        break
    except Exception:
        time.sleep(0.5)

if not server_ready:
    log_file.flush()
    ctypes.windll.user32.MessageBoxW(
        0,
        f'The ImageDNA server failed to start.\n\nCheck the log for details:\n{log_path}',
        'ImageDNA — startup error', 0x10)
    proc.terminate()
    sys.exit(1)

# Find Edge or Chrome (app mode — no address bar, looks like a native window)
browser_exe = None
for path in [
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
]:
    if os.path.exists(path):
        browser_exe = path
        break

if browser_exe:
    subprocess.Popen([
        browser_exe,
        '--app=http://127.0.0.1:5000',
        '--window-size=1280,900',
        f'--user-data-dir={user_data}',
        '--no-first-run',
        '--no-default-browser-check',
    ])
else:
    import webbrowser
    webbrowser.open('http://127.0.0.1:5000')

# Keep Flask alive until the user explicitly quits
ctypes.windll.user32.MessageBoxW(
    0,
    'ImageDNA is running.\n\nClose this dialog to stop the server.',
    'ImageDNA', 0x40)

# Browser window closed — shut down the server
proc.terminate()
proc.wait()
