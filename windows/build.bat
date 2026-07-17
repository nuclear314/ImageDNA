@echo off
setlocal EnableDelayedExpansion

echo === ImageDNA Windows Build ===
echo.
echo Usage: build.bat                - full clean build
echo        build.bat --skip-server  - launcher-only rebuild, reuses the existing
echo                                   embedded server runtime (fast iteration on
echo                                   windows\main.py / imagedna.spec)
echo.

set SKIP_SERVER=
if "%1"=="--skip-server" set SKIP_SERVER=1

set "SERVER_DIR=%~dp0..\release\ImageDNA\server"
set "SERVER_BACKUP=%~dp0_server_backup"

:: -----------------------------------------------------------------------
:: Step 1 - Build React frontend
:: -----------------------------------------------------------------------
cd /d "%~dp0.."
echo [1/4] Building React frontend...
call npm run build
if errorlevel 1 echo ERROR: npm build failed.
if errorlevel 1 goto :build_failed

:: -----------------------------------------------------------------------
:: Step 2 - Build the PyInstaller launcher (pywebview window, no onnxruntime bundled)
:: -----------------------------------------------------------------------
cd /d "%~dp0"
echo.
echo [2/4] Building launcher...

:: Activate the project venv so PyInstaller finds pywebview
if exist "..\\.venv\\Scripts\\activate.bat" (
    echo     Activating .venv...
    call "..\\.venv\\Scripts\\activate.bat"
)

pip install -r requirements-windows.txt --quiet
if errorlevel 1 echo ERROR: pip install failed.
if errorlevel 1 goto :build_failed

:: PyInstaller's --noconfirm wipes the whole release\ImageDNA\ folder before
:: rebuilding (even with --skip-server), so move the existing server\ runtime
:: aside first and restore it afterward instead of losing it.
if defined SKIP_SERVER (
    if exist "!SERVER_DIR!" (
        echo     Preserving existing server runtime...
        move "!SERVER_DIR!" "!SERVER_BACKUP!" >nul
    )
)

python -m PyInstaller imagedna.spec --distpath ..\release --workpath build --noconfirm
if errorlevel 1 echo ERROR: PyInstaller failed.
if errorlevel 1 goto :build_failed

if exist "!SERVER_BACKUP!" (
    move "!SERVER_BACKUP!" "!SERVER_DIR!" >nul
)

:: -----------------------------------------------------------------------
:: Step 3 - Set up embedded Python server runtime
::   Downloads the official Python embeddable zip once (cached in windows\cache\)
::   and installs all app packages into it.
::   NOTE: must run AFTER PyInstaller so --noconfirm does not wipe server\
:: -----------------------------------------------------------------------
echo.
set DO_SKIP_SERVER=0
if defined SKIP_SERVER if exist "!SERVER_DIR!" set DO_SKIP_SERVER=1

if "!DO_SKIP_SERVER!"=="1" (
    echo [3/4] Skipping embedded Python server runtime setup ^(--skip-server^)
) else (
    echo [3/4] Setting up embedded Python server runtime...

    :: Pinned Python version for the embedded server runtime.
    :: Change only when you want to upgrade the bundled Python.
    set PYVER=3.12.9
    echo     Using Python !PYVER!

    set CACHE_DIR=%~dp0cache
    set EMBED_ZIP=!CACHE_DIR!\python-!PYVER!-embed-amd64.zip

    :: (Re)create the server directory
    if exist "!SERVER_DIR!" rmdir /s /q "!SERVER_DIR!"
    mkdir "!SERVER_DIR!"

    :: Download the embeddable zip if not already cached
    if not exist "!EMBED_ZIP!" (
        echo     Downloading Python !PYVER! embeddable package...
        if not exist "!CACHE_DIR!" mkdir "!CACHE_DIR!"
        powershell -Command "Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/!PYVER!/python-!PYVER!-embed-amd64.zip' -OutFile '!EMBED_ZIP!'"
        if errorlevel 1 echo ERROR: Download failed.
        if errorlevel 1 goto :build_failed
    ) else (
        echo     Using cached !EMBED_ZIP!
    )

    :: Extract
    echo     Extracting...
    powershell -Command "Expand-Archive -Path '!EMBED_ZIP!' -DestinationPath '!SERVER_DIR!' -Force"
    if errorlevel 1 echo ERROR: Extraction failed.
    if errorlevel 1 goto :build_failed

    :: Enable site-packages by uncommenting 'import site' in the ._pth file
    echo     Enabling site-packages...
    for %%f in ("!SERVER_DIR!\python*._pth") do (
        powershell -Command "(Get-Content '%%f') -replace '#import site', 'import site' | Set-Content '%%f'"
    )

    :: Install pip into the embedded Python
    echo     Installing pip...
    powershell -Command "Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile '!SERVER_DIR!\get-pip.py'"
    "!SERVER_DIR!\python.exe" "!SERVER_DIR!\get-pip.py" --no-warn-script-location --quiet
    if errorlevel 1 echo ERROR: pip bootstrap failed.
    if errorlevel 1 goto :build_failed
    del "!SERVER_DIR!\get-pip.py"

    :: Install app requirements directly into the server's site-packages.
    :: --target prevents pip from skipping packages that are already installed
    :: in the developer's own Python environment ("Requirement already satisfied").
    echo     Installing packages ^(this may take a few minutes^)...
    "!SERVER_DIR!\python.exe" -m pip install -r ..\requirements.txt --target="!SERVER_DIR!\Lib\site-packages" --no-warn-script-location --quiet
    if errorlevel 1 echo ERROR: Package installation failed.
    if errorlevel 1 goto :build_failed

    :: Copy app files into the server directory
    echo     Copying app files...
    copy "..\server.py" "!SERVER_DIR!\"
    copy "..\tagger.py" "!SERVER_DIR!\"
    xcopy /s /e /q /y "..\dist" "!SERVER_DIR!\dist\"

    echo     Server runtime ready.
)

echo.
echo [4/4] Build complete!
echo Distributable: release\ImageDNA\
echo Launch with:   release\ImageDNA\ImageDNA.exe
if not defined CI pause
exit /b 0

:: Reached via "goto :build_failed" from the error checks above. Each of those
:: checks is deliberately two bare top-level "if errorlevel 1 ..." lines rather
:: than a single "if errorlevel 1 (echo ... & pause & exit /b 1)" block: cmd.exe
:: resets a nested block's "exit /b" return code to 0 as it unwinds through
:: enclosing parens, and a "goto" placed inside a parenthesized block can also
:: fail to resolve its label when that block is immediately followed by another
:: if/else construct (as several of these are, e.g. Step 3's skip/setup branch).
:: Keeping "if errorlevel 1 <cmd>" unparenthesized and jumping from there avoids
:: both pitfalls. Verified locally by driving every failure branch under a
:: simulated CI env var and confirming exit code 1 in each case.
:build_failed
if not defined CI pause
exit /b 1
