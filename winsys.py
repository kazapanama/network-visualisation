"""Windows helpers for the editor: choosing how to show the UI and native
file dialogs that work without pywebview (for the browser fallback).

The UI needs a Chromium engine. pywebview uses Microsoft Edge WebView2 when
it is installed; without it pywebview silently falls back to Internet
Explorer (MSHTML), which cannot run the UI. Windows 11 ships WebView2, many
Windows 10 machines (especially offline ones) do not - there the editor opens
in Chrome / Edge in app mode instead.
"""
import ctypes
import os
import re
import winreg
from ctypes import wintypes

WEBVIEW2_DOWNLOAD = 'https://developer.microsoft.com/microsoft-edge/webview2/'


# ------------------------------------------------------------------ WebView2

def _registry_value(root, path, name):
    try:
        with winreg.OpenKey(root, path) as key:
            return winreg.QueryValueEx(key, name)[0]
    except OSError:
        return None


def webview2_version():
    # Same check as pywebview: .NET >= 4.6.2 and a WebView2 runtime >= 86
    release = _registry_value(winreg.HKEY_LOCAL_MACHINE, r'SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full', 'Release')
    if not release or release < 394802:
        return None
    runtime = r'Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
    for root, path in ((winreg.HKEY_LOCAL_MACHINE, rf'SOFTWARE\WOW6432Node\{runtime}'),
                       (winreg.HKEY_LOCAL_MACHINE, rf'SOFTWARE\{runtime}'),
                       (winreg.HKEY_CURRENT_USER, rf'SOFTWARE\{runtime}')):
        version = _registry_value(root, path, 'pv')
        if version and version != '0.0.0.0' and int(version.split('.')[0]) >= 86:
            return version
    return None


# ------------------------------------------------------------------ browsers

def find_chromium():
    # Chrome or Chromium-based Edge; old (legacy) Edge cannot open app windows
    candidates = []
    for exe in ('chrome.exe', 'msedge.exe'):
        for root in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
            path = _registry_value(root, rf'SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\{exe}', '')
            if path:
                candidates.append(path)
    for base in (os.environ.get('ProgramFiles'), os.environ.get('ProgramFiles(x86)'), os.environ.get('LOCALAPPDATA')):
        if base:
            candidates.append(os.path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'))
            candidates.append(os.path.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'))
    for path in candidates:
        path = path.strip('"')
        if os.path.isfile(path):
            return path
    return None


# ------------------------------------------------------------------ dialogs

class OPENFILENAMEW(ctypes.Structure):
    _fields_ = [
        ('lStructSize', wintypes.DWORD), ('hwndOwner', wintypes.HWND), ('hInstance', wintypes.HINSTANCE),
        ('lpstrFilter', wintypes.LPCWSTR), ('lpstrCustomFilter', wintypes.LPWSTR), ('nMaxCustFilter', wintypes.DWORD),
        ('nFilterIndex', wintypes.DWORD), ('lpstrFile', wintypes.LPWSTR), ('nMaxFile', wintypes.DWORD),
        ('lpstrFileTitle', wintypes.LPWSTR), ('nMaxFileTitle', wintypes.DWORD), ('lpstrInitialDir', wintypes.LPCWSTR),
        ('lpstrTitle', wintypes.LPCWSTR), ('Flags', wintypes.DWORD), ('nFileOffset', wintypes.WORD),
        ('nFileExtension', wintypes.WORD), ('lpstrDefExt', wintypes.LPCWSTR), ('lCustData', wintypes.LPARAM),
        ('lpfnHook', ctypes.c_void_p), ('lpTemplateName', wintypes.LPCWSTR), ('pvReserved', ctypes.c_void_p),
        ('dwReserved', wintypes.DWORD), ('FlagsEx', wintypes.DWORD),
    ]


OFN_OVERWRITEPROMPT, OFN_NOCHANGEDIR, OFN_PATHMUSTEXIST, OFN_FILEMUSTEXIST, OFN_EXPLORER = 0x2, 0x8, 0x800, 0x1000, 0x80000


def file_dialog(kind, directory='', save_filename='', file_types=()):
    # Native open/save dialog, file_types in pywebview style: 'Description (*.py;*.json)'.
    # Returns [path] or None. Owned by the foreground window (the browser window).
    filters, default_ext = '', None
    for item in file_types or ('Усі файли (*.*)',):
        match = re.search(r'\(([^)]*)\)\s*$', item)
        pattern = match.group(1) if match else '*.*'
        filters += f'{item}\0{pattern}\0'
        if default_ext is None:
            ext = pattern.split(';')[0].lstrip('*.')
            default_ext = ext if ext and ext != '*' else ''
    filter_buf = ctypes.create_unicode_buffer(filters + '\0')
    file_buf = ctypes.create_unicode_buffer(save_filename or '', 4096)

    ofn = OPENFILENAMEW()
    ofn.lStructSize = ctypes.sizeof(OPENFILENAMEW)
    ofn.hwndOwner = ctypes.windll.user32.GetForegroundWindow()
    ofn.lpstrFilter = ctypes.cast(filter_buf, wintypes.LPCWSTR)
    ofn.nFilterIndex = 1
    ofn.lpstrFile = ctypes.cast(file_buf, wintypes.LPWSTR)
    ofn.nMaxFile = 4096
    ofn.lpstrInitialDir = directory or None  # Windows may prefer the folder it remembers for the app
    ofn.lpstrDefExt = default_ext or None
    ofn.Flags = OFN_EXPLORER | OFN_NOCHANGEDIR | OFN_PATHMUSTEXIST
    ofn.Flags |= OFN_FILEMUSTEXIST if kind == 'open' else OFN_OVERWRITEPROMPT

    ctypes.windll.ole32.CoInitializeEx(None, 2)  # apartment-threaded, required by the Explorer-style dialog
    comdlg32 = ctypes.windll.comdlg32
    ok = (comdlg32.GetOpenFileNameW if kind == 'open' else comdlg32.GetSaveFileNameW)(ctypes.byref(ofn))
    return [file_buf.value] if ok and file_buf.value else None


def message_box(title, text, error=True):
    MB_ICONERROR, MB_ICONINFORMATION, MB_SETFOREGROUND = 0x10, 0x40, 0x10000
    ctypes.windll.user32.MessageBoxW(None, text, title, (MB_ICONERROR if error else MB_ICONINFORMATION) | MB_SETFOREGROUND)
