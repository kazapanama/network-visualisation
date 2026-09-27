@echo off
rem Builds dist\SubnetEditor.exe - a standalone editor, Python is not needed to run it.
rem Requires: pip install -r requirements.txt pyinstaller
cd /d "%~dp0"
python -m PyInstaller --noconfirm --clean --onefile --windowed --name SubnetEditor ^
  --exclude-module PyQt5 --exclude-module PyQt6 --exclude-module PySide2 --exclude-module PySide6 ^
  --exclude-module IPython --exclude-module pandas --exclude-module scipy ^
  --hidden-import matplotlib.backends.backend_pdf --hidden-import matplotlib.backends.backend_svg ^
  editor.py
if errorlevel 1 exit /b 1
echo.
echo Done: dist\SubnetEditor.exe
