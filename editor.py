"""Subnet Editor - visual editor for subnet maps.

The interface is an HTML/JS app (ui/) shown in a native window by pywebview.
Python does what the browser can't: file dialogs, reading/writing data files
and rendering the print version with visualizer.draw_map (PNG/PDF/SVG).

    python editor.py [data.py]                       - open the editor
    python editor.py data.py --export map.pdf [--bw] - export without a window
    python editor.py --dev                           - serve the UI for a browser (development)
"""
import argparse
import base64
import io
import json
import os
import subprocess
import sys
import threading

import model
import palette

APP_NAME = 'Subnet Editor'
A4 = (11.69, 8.27)
SETTINGS_PATH = os.path.join(os.environ.get('APPDATA', os.path.expanduser('~')), 'SubnetEditor', 'settings.json')
DATA_TYPES = ('Дані карти (*.py;*.json)', 'Усі файли (*.*)')
EXPORT_TYPES = {'png': 'PNG (*.png)', 'pdf': 'PDF — векторний, для друку (*.pdf)', 'svg': 'SVG (*.svg)'}
RECENT_LIMIT = 8


def resource_path(*parts):
    base = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, *parts)


# ------------------------------------------------------------------ rendering

_viz = None
_viz_lock = threading.Lock()
_render_lock = threading.Lock()


def viz():
    # matplotlib takes about a second to import, so it is loaded lazily
    # (and preloaded in the background once the window has loaded)
    global _viz
    with _viz_lock:
        if _viz is None:
            import matplotlib
            matplotlib.use('Agg')
            matplotlib.rcParams['pdf.fonttype'] = 42  # real fonts: PDF text stays selectable
            import visualizer
            _viz = visualizer
    return _viz


def build_figure(doc, style, dpi=100):
    from matplotlib.backends.backend_agg import FigureCanvasAgg
    from matplotlib.figure import Figure
    import ipaddress

    v = viz()
    net = ipaddress.ip_network(doc['main_subnet'].strip(), strict=False)
    fig = Figure(figsize=A4, dpi=dpi)
    FigureCanvasAgg(fig)
    subnets, summaries = v.prepare_subnets(net, doc['subnet_groups'], [])
    v.draw_map(fig, net, subnets, summaries, title=doc['map_title'] or None, style=style)
    return fig


def export_figure(doc, path, style):
    with _render_lock:
        build_figure(doc, style).savefig(path, dpi=300)


# ------------------------------------------------------------------ settings

def load_settings():
    try:
        with open(SETTINGS_PATH, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_settings(settings):
    try:
        os.makedirs(os.path.dirname(SETTINGS_PATH), exist_ok=True)
        with open(SETTINGS_PATH, 'w', encoding='utf-8') as f:
            json.dump(settings, f, ensure_ascii=False, indent=2)
    except OSError:
        pass


# ------------------------------------------------------------------ JS API

class Api:
    # Every public method is callable from JS as window.pywebview.api.<name>().
    # Results are plain dicts; errors are returned as {'error': text}.

    def __init__(self, initial_path=None):
        self._window = None
        self._initial_path = initial_path
        self._settings = load_settings()
        self._dirty = False
        self._closing_confirmed = False

    # --- startup

    def init(self):
        result = {
            'colors': palette.COLORS,
            'defaultColors': palette.DEFAULT_COLORS,
            'settings': {k: self._settings.get(k) for k in ('theme', 'printStyle', 'snap', 'miniPreview')},
            'recent': self._recent(),
            'doc': model.new_document(),
            'path': None,
        }
        path = self._initial_path or self._settings.get('last_file')
        if path and os.path.exists(path):
            loaded = self.open_path(path)
            if 'error' in loaded and self._initial_path:
                result['error'] = loaded['error']
            elif 'doc' in loaded:
                result.update(loaded)
        return result

    # --- files

    def open_dialog(self):
        paths = self._dialog('open', file_types=DATA_TYPES)
        if not paths:
            return {'cancelled': True}
        return self.open_path(paths[0])

    def open_path(self, path):
        try:
            doc = model.load_data(path)
        except Exception as e:
            return {'error': f'Не вдалося відкрити {os.path.basename(path)}: {e}'}
        self._remember(path)
        return {'doc': doc, 'path': os.path.abspath(path), 'recent': self._recent()}

    def save(self, doc, path=None):
        if not path:
            paths = self._dialog('save', save_filename='data.py', file_types=('Python (*.py)', 'JSON (*.json)'))
            if not paths:
                return {'cancelled': True}
            path = paths[0]
            if not os.path.splitext(path)[1]:
                path += '.py'
        try:
            model.save_data(path, model.normalize_document(doc))
        except Exception as e:
            return {'error': f'Не вдалося зберегти: {e}'}
        self._remember(path)
        return {'path': os.path.abspath(path), 'recent': self._recent()}

    def export(self, doc, fmt, style, base_name='subnet_map'):
        fmt = fmt if fmt in EXPORT_TYPES else 'png'
        suffix = '_bw' if style == 'bw' else ''
        paths = self._dialog('save', save_filename=f'{base_name}{suffix}.{fmt}', file_types=(EXPORT_TYPES[fmt],))
        if not paths:
            return {'cancelled': True}
        root, ext = os.path.splitext(paths[0])
        ext = ext or f'.{fmt}'
        jobs = [(root + ext, style)]
        if style == 'both':
            jobs = [(root + ext, 'colored'), (root + '_bw' + ext, 'bw')]
        try:
            doc = model.normalize_document(doc)
            for path, job_style in jobs:
                export_figure(doc, path, job_style)
        except Exception as e:
            return {'error': f'Не вдалося експортувати: {e}'}
        return {'paths': [p for p, _ in jobs]}

    def preview(self, doc, style, width):
        # The real print render as a PNG data URL, sized for the preview pane
        try:
            doc = model.normalize_document(doc)
            dpi = max(40, min(220, width / A4[0]))
            with _render_lock:
                fig = build_figure(doc, style, dpi)
                buffer = io.BytesIO()
                fig.savefig(buffer, format='png', dpi=dpi)
        except Exception as e:
            return {'error': str(e)}
        return {'image': 'data:image/png;base64,' + base64.b64encode(buffer.getvalue()).decode('ascii')}

    def reveal(self, path):
        if os.path.exists(path):
            subprocess.Popen(['explorer', '/select,', os.path.normpath(path)])

    # --- state

    def set_dirty(self, dirty):
        self._dirty = bool(dirty)

    def set_title(self, title):
        if self._window:
            self._window.set_title(title)

    def set_settings(self, values):
        self._settings.update(values or {})
        save_settings(self._settings)

    def close(self):
        # Called by the UI after the user confirmed closing with unsaved changes
        self._closing_confirmed = True
        if self._window:
            threading.Thread(target=self._window.destroy, daemon=True).start()

    # --- internals

    def _dialog(self, kind, **kwargs):
        import webview
        if not self._window:
            return None
        directory = os.path.dirname(self._settings.get('last_file') or '') or os.path.expanduser('~')
        dialog_type = webview.FileDialog.OPEN if kind == 'open' else webview.FileDialog.SAVE
        result = self._window.create_file_dialog(dialog_type, directory=directory, **kwargs)
        if not result:
            return None
        return [result] if isinstance(result, str) else list(result)

    def _remember(self, path):
        path = os.path.abspath(path)
        recent = [p for p in self._settings.get('recent', []) if os.path.normcase(p) != os.path.normcase(path)]
        self._settings['recent'] = [path] + recent[:RECENT_LIMIT - 1]
        self._settings['last_file'] = path
        save_settings(self._settings)

    def _recent(self):
        return [p for p in self._settings.get('recent', []) if os.path.exists(p)]

    def _on_closing(self):
        # Unsaved changes: cancel the close and let the UI ask (it calls close())
        if self._dirty and not self._closing_confirmed:
            threading.Thread(target=lambda: self._window.evaluate_js('window.app && app.requestClose()'),
                             daemon=True).start()
            return False
        return True


# ------------------------------------------------------------------ entry points

def run_window(path):
    import webview
    api = Api(path)
    window = webview.create_window(
        APP_NAME, url=resource_path('ui', 'index.html'), js_api=api,
        width=1440, height=900, min_size=(1100, 680), background_color='#f4f5f7', text_select=True,
    )
    api._window = window
    window.events.closing += api._on_closing
    # Preload matplotlib only after the window is up: importing its native
    # modules while pythonnet starts the .NET runtime can deadlock the Windows loader.
    window.events.loaded += lambda: threading.Thread(target=viz, daemon=True).start()
    # private_mode: a fresh WebView2 profile per run. A shared profile folder hangs a new
    # instance while a crashed/killed one still holds it (settings are kept by Python anyway).
    webview.start(private_mode=True)


def run_dev_server(port):
    # Serves ui/ over http with the API as POST /api/<method>; dialogs are
    # unavailable here. Used to develop and test the UI in a normal browser.
    from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
    api = Api()

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=resource_path('ui'), **kwargs)

        def do_POST(self):
            name = self.path.rsplit('/', 1)[-1]
            args = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))) or b'[]')
            method = getattr(api, name, None) if not name.startswith('_') else None
            result = method(*args) if method else {'error': f'unknown method {name}'}
            body = json.dumps(result, ensure_ascii=False).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    print(f'http://127.0.0.1:{port}/index.html?dev=1', flush=True)
    ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()


def fix_windowed_streams():
    # A --windowed exe has no stdout/stderr (they are None) and pywebview's
    # built-in http server crashes when it writes its log. Errors go to a file.
    if sys.stdout is None:
        sys.stdout = open(os.devnull, 'w')
    if sys.stderr is None:
        try:
            os.makedirs(os.path.dirname(SETTINGS_PATH), exist_ok=True)
            sys.stderr = open(os.path.join(os.path.dirname(SETTINGS_PATH), 'editor.log'), 'a', encoding='utf-8')
        except OSError:
            sys.stderr = open(os.devnull, 'w')


def main():
    fix_windowed_streams()
    parser = argparse.ArgumentParser(prog='SubnetEditor', description='Візуальний редактор карти підмереж')
    parser.add_argument('data', nargs='?', help='файл даних (.py або .json)')
    parser.add_argument('--export', metavar='FILE', help='без вікна: зберегти карту у FILE (.png/.pdf/.svg) і вийти')
    parser.add_argument('--bw', action='store_true', help='чорно-білий варіант для --export')
    parser.add_argument('--dev', action='store_true', help=argparse.SUPPRESS)
    parser.add_argument('--port', type=int, default=8777, help=argparse.SUPPRESS)
    args = parser.parse_args()

    if args.export:
        if not args.data:
            parser.error('для --export потрібен файл даних')
        export_figure(model.load_data(args.data), args.export, 'bw' if args.bw else 'colored')
    elif args.dev:
        run_dev_server(args.port)
    else:
        run_window(args.data)


if __name__ == '__main__':
    main()
