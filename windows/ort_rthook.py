import os
import sys

# onnxruntime is included as raw data to preserve the capi/.pyd + capi/*.dll
# side-by-side relationship. We still need to register the capi directory so
# that Windows finds onnxruntime.dll and provider DLLs when the .pyd loads.
if hasattr(sys, '_MEIPASS'):
    _dirs = []
    for _sub in ('', 'onnxruntime', 'onnxruntime/capi'):
        _d = os.path.join(sys._MEIPASS, _sub)
        if os.path.isdir(_d):
            _dirs.append(_d)

    for _d in _dirs:
        os.add_dll_directory(_d)

    os.environ['PATH'] = os.pathsep.join(_dirs) + os.pathsep + os.environ.get('PATH', '')
