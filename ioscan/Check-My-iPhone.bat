@echo off
REM Double-click this file on Windows to launch "Check My iPhone".
REM It sets up a private Python environment the first time, then opens
REM the graphical scanner. No command-line knowledge required.

cd /d "%~dp0"
echo Check My iPhone - first-time setup may take a minute...

REM Find Python.
where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo Python 3 is not installed.
  echo Install it from https://www.python.org/downloads/  ^(check "Add to PATH"^)
  echo then run this again.
  pause
  exit /b 1
)

REM Create the private environment once.
if not exist ".venv" (
  echo Creating a private Python environment...
  python -m venv .venv
)

REM Install / update ioscan into it.
call ".venv\Scripts\python.exe" -m pip install --quiet --upgrade pip >nul 2>nul
call ".venv\Scripts\pip.exe" install --quiet -e . >nul

REM Launch the graphical app.
echo Launching...
call ".venv\Scripts\ioscan-gui.exe"
