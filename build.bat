@echo off
rem Builds dist\SubnetEditor.exe - a standalone editor, Python is not needed to run it.
rem Requires: pip install -r requirements.txt pyinstaller
cd /d "%~dp0"
python -m PyInstaller --noconfirm --clean --onefile --windowed --name SubnetEditor --icon assets\icon.ico ^
  --add-data "ui;ui" ^
  --hidden-import matplotlib.backends.backend_pdf --hidden-import matplotlib.backends.backend_svg ^
  --exclude-module tkinter --exclude-module PyQt5 --exclude-module PyQt6 --exclude-module PySide2 --exclude-module PySide6 ^
  --exclude-module IPython --exclude-module pandas --exclude-module scipy ^
  editor.py
if errorlevel 1 exit /b 1
rem Explorer caches exe icons by path - refresh it so a rebuilt exe shows its current icon
ie4uinit.exe -show >nul 2>&1
echo.
echo Done: dist\SubnetEditor.exe
