"""Subnet Editor - visual editor for subnet maps.

The map is rendered by the same code as visualizer.py (draw_map), so what is
shown on screen is exactly what gets exported. Groups can be moved and
resized with the mouse; edits snap to a selectable prefix grid and the
group's subnet list is recalculated into aligned CIDRs.
"""
import argparse
import copy
import ipaddress
import json
import os
import re

import matplotlib
matplotlib.use('Agg')
matplotlib.rcParams['pdf.fonttype'] = 42  # real fonts in PDF: text stays selectable/searchable
from matplotlib.backends.backend_agg import FigureCanvasAgg
from matplotlib.colors import is_color_like, to_hex
from matplotlib.figure import Figure
from matplotlib.patches import Rectangle
from PIL import Image, ImageTk

import tkinter as tk
from tkinter import colorchooser, filedialog, messagebox, ttk

import model
import visualizer as viz

APP_NAME = 'Subnet Editor'
A4 = (11.69, 8.27)
BLOCK_Y0, BLOCK_Y1 = 0.2, 1.0  # vertical extent of blocks in map data coords (see draw_map)
EDGE_GRAB_PX = 6
AUTO_COLOR = '(авто)'
SELECT_COLOR = '#e11d48'
PAPER_BG = '#d4d8de'
DATA_FILETYPES = [('Файл даних Python', '*.py'), ('JSON', '*.json'), ('Усі файли', '*.*')]
SETTINGS_PATH = os.path.join(os.environ.get('APPDATA', os.path.expanduser('~')), 'SubnetEditor', 'settings.json')

# Windows virtual key codes, so shortcuts also work with a Cyrillic layout
KEY_N, KEY_O, KEY_S, KEY_E, KEY_Z, KEY_Y, KEY_D = 78, 79, 83, 69, 90, 89, 68

HELP_TEXT = """Миша на карті:
  • клік по блоку — вибрати групу
  • перетягнути блок — перемістити групу
  • перетягнути лівий/правий край — змінити розмір
  • клік по порожньому місцю — зняти виділення

Клавіатура (коли фокус на карті):
  ← / →              — зсунути групу на крок прив'язки
  Shift + ← / →      — посунути правий край групи
  Ctrl + ← / →       — посунути лівий край групи
  Delete             — видалити групу

Ctrl+Z / Ctrl+Y — скасувати / повторити
Ctrl+S — зберегти, Ctrl+O — відкрити, Ctrl+E — експорт зображення

Прив'язка задає крок, до якого вирівнюються межі при
перетягуванні. Після перетягування список підмереж групи
перераховується в мінімальний набір вирівняних CIDR.
Червона штриховка — адреси, зайняті кількома групами."""


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


def group_color(group, index):
    # Same color resolution as visualizer.render
    color = group.get('color')
    if color:
        return viz.COLORS.get(color, color)
    return viz.DEFAULT_COLORS[index % len(viz.DEFAULT_COLORS)]


def build_figure(doc, style, dpi=100, messages=None):
    # Renders a document with visualizer.draw_map; returns (figure, axes, blocks)
    # where blocks are (start, end, group index) of every drawn rectangle
    net = ipaddress.ip_network(doc['main_subnet'].strip(), strict=False)
    fig = Figure(figsize=A4, dpi=dpi)
    FigureCanvasAgg(fig)
    subnets, summaries = viz.prepare_subnets(net, doc['subnet_groups'], [] if messages is None else messages)
    blocks = [(s['start_int'], s['end_int'], s['group_idx']) for s in subnets]
    ax = viz.draw_map(fig, net, subnets, summaries, title=doc['map_title'] or None, style=style)
    return fig, ax, blocks


def translate_message(message):
    # visualizer.prepare_subnets reports in English (it is also a CLI tool)
    m = re.match(r'Error parsing (.*?): ', message)
    if m:
        return f'Некоректна підмережа «{m.group(1)}» — пропущена (можливо, бракує коми між рядками?)'
    m = re.match(r'Warning: (.*) extends outside main network boundaries', message)
    if m:
        return f'«{m.group(1)}» виходить за межі головної мережі'
    return message


def group_name(group, index):
    title = (group.get('title') or '').strip()
    if title:
        return title
    comment = (group.get('comment') or '').strip().split('\n')[0]
    return comment or f'Група {index + 1}'


class Editor:
    def __init__(self, root, path=None):
        self.root = root
        self.settings = load_settings()
        self.doc = model.new_document()
        self.path = None
        self.dirty = False
        self.selected = None
        self.undo_stack, self.redo_stack = [], []
        self.undo_key = None
        self.loading = False      # True while widgets are filled programmatically
        self.render_pending = False
        self.drag = None
        self.view = None          # geometry of the last render, used for hit testing
        self.photo = None

        self.style_var = tk.StringVar(value=self.settings.get('style', 'colored'))
        self.snap_var = tk.StringVar(value='/24')

        self.build_ui()
        self.bind_keys()

        start = path or self.settings.get('last_file')
        if start and os.path.exists(start):
            self.open_path(start, quiet=path is None)
        else:
            self.load_document(model.new_document(), None)

    # ================================================================ UI

    def build_ui(self):
        root = self.root
        root.title(APP_NAME)
        root.minsize(1100, 680)
        root.protocol('WM_DELETE_WINDOW', self.on_exit)

        style = ttk.Style()
        style.configure('Hint.TLabel', foreground='#6b7280')
        style.configure('Error.TLabel', foreground='#b91c1c')
        style.configure('Treeview', rowheight=24)

        self.build_menu()

        # --- document toolbar
        bar = ttk.Frame(root, padding=(8, 6))
        bar.pack(side='top', fill='x')
        ttk.Label(bar, text='Мережа:').pack(side='left')
        self.main_var = tk.StringVar()
        self.main_entry = tk.Entry(bar, textvariable=self.main_var, width=18, relief='solid', bd=1)
        self.main_entry.pack(side='left', padx=(4, 12), ipady=2)
        self.main_var.trace_add('write', lambda *a: self.on_main_changed())

        ttk.Label(bar, text='Заголовок:').pack(side='left')
        self.title_var = tk.StringVar()
        tk.Entry(bar, textvariable=self.title_var, width=46, relief='solid', bd=1).pack(side='left', padx=(4, 12), ipady=2)
        self.title_var.trace_add('write', lambda *a: self.on_map_title_changed())

        ttk.Label(bar, text="Прив'язка:").pack(side='left')
        self.snap_combo = ttk.Combobox(bar, textvariable=self.snap_var, width=5, state='readonly')
        self.snap_combo.pack(side='left', padx=(4, 12))
        self.snap_combo.bind('<<ComboboxSelected>>', lambda e: self.cv.focus_set())

        ttk.Radiobutton(bar, text='Кольорова', value='colored', variable=self.style_var,
                        command=self.on_style_changed).pack(side='left')
        ttk.Radiobutton(bar, text='Ч/Б', value='bw', variable=self.style_var,
                        command=self.on_style_changed).pack(side='left', padx=(4, 0))

        ttk.Button(bar, text='Експорт зображення…', command=self.export_image).pack(side='right')

        # --- status bar
        status = ttk.Frame(root, padding=(8, 3))
        status.pack(side='bottom', fill='x')
        self.status_var = tk.StringVar()
        ttk.Label(status, textvariable=self.status_var).pack(side='left')
        self.warn_var = tk.StringVar()
        ttk.Label(status, textvariable=self.warn_var, style='Error.TLabel').pack(side='right')

        body = ttk.Panedwindow(root, orient='horizontal')
        body.pack(fill='both', expand=True)

        # --- groups list
        left = ttk.Frame(body, padding=(8, 0, 4, 8))
        body.add(left, weight=0)
        ttk.Label(left, text='Групи', font=('Segoe UI', 10, 'bold')).pack(anchor='w', pady=(0, 4))
        self.tree = ttk.Treeview(left, columns=('range',), show='tree headings', selectmode='browse', height=20)
        self.tree.heading('#0', text='Назва')
        self.tree.heading('range', text='Діапазон')
        self.tree.column('#0', width=130, stretch=True)
        self.tree.column('range', width=190, stretch=True)
        self.tree.pack(fill='both', expand=True)
        self.tree.bind('<<TreeviewSelect>>', self.on_tree_select)

        buttons = ttk.Frame(left)
        buttons.pack(fill='x', pady=(6, 0))
        ttk.Button(buttons, text='+ Додати', command=self.add_group).pack(side='left')
        ttk.Button(buttons, text='Дублювати', command=self.duplicate_group).pack(side='left', padx=4)
        ttk.Button(buttons, text='Видалити', command=self.delete_group).pack(side='left')
        ttk.Button(buttons, text='▼', width=3, command=lambda: self.move_group_in_list(1)).pack(side='right')
        ttk.Button(buttons, text='▲', width=3, command=lambda: self.move_group_in_list(-1)).pack(side='right', padx=4)

        # --- map
        center = ttk.Frame(body)
        body.add(center, weight=1)
        self.cv = tk.Canvas(center, bg=PAPER_BG, highlightthickness=0, takefocus=1)
        self.cv.pack(fill='both', expand=True)
        self.cv.bind('<Configure>', lambda e: self.request_render())
        self.cv.bind('<ButtonPress-1>', self.on_press)
        self.cv.bind('<B1-Motion>', self.on_motion)
        self.cv.bind('<ButtonRelease-1>', self.on_release)
        self.cv.bind('<Motion>', self.on_hover)
        self.cv.bind('<Leave>', lambda e: self.status_var.set(''))
        self.cv.bind('<Left>', lambda e: self.nudge(-1))
        self.cv.bind('<Right>', lambda e: self.nudge(1))
        self.cv.bind('<Shift-Left>', lambda e: self.nudge(-1, 'right'))
        self.cv.bind('<Shift-Right>', lambda e: self.nudge(1, 'right'))
        self.cv.bind('<Control-Left>', lambda e: self.nudge(-1, 'left'))
        self.cv.bind('<Control-Right>', lambda e: self.nudge(1, 'left'))
        self.cv.bind('<Delete>', lambda e: self.delete_group())

        # --- group properties
        right = ttk.Frame(body, padding=(4, 0, 8, 8))
        body.add(right, weight=0)
        self.props = ttk.LabelFrame(right, text='Група', padding=8)
        self.props.pack(fill='x')
        p = self.props
        p.columnconfigure(1, weight=1)

        ttk.Label(p, text='Назва:').grid(row=0, column=0, sticky='w', pady=2)
        self.g_title = tk.StringVar()
        tk.Entry(p, textvariable=self.g_title, relief='solid', bd=1).grid(row=0, column=1, columnspan=2, sticky='ew', pady=2, ipady=2)
        self.g_title.trace_add('write', lambda *a: self.on_prop('title', self.g_title.get()))

        ttk.Label(p, text='Коментар:').grid(row=1, column=0, sticky='nw', pady=2)
        self.g_comment = tk.Text(p, height=3, width=28, relief='solid', bd=1, font=('Segoe UI', 9), undo=False)
        self.g_comment.grid(row=1, column=1, columnspan=2, sticky='ew', pady=2)
        self.g_comment.bind('<<Modified>>', self.on_comment_modified)

        ttk.Label(p, text='Колір:').grid(row=2, column=0, sticky='w', pady=2)
        self.g_color = tk.StringVar()
        self.color_combo = ttk.Combobox(p, textvariable=self.g_color, values=[AUTO_COLOR] + list(viz.COLORS), width=14)
        self.color_combo.grid(row=2, column=1, sticky='ew', pady=2)
        self.g_color.trace_add('write', lambda *a: self.on_color_changed())
        color_btns = ttk.Frame(p)
        color_btns.grid(row=2, column=2, sticky='e', padx=(4, 0))
        self.swatch = tk.Label(color_btns, width=3, relief='solid', bd=1)
        self.swatch.pack(side='left')
        ttk.Button(color_btns, text='…', width=3, command=self.pick_color).pack(side='left', padx=(4, 0))

        self.g_full = tk.BooleanVar()
        ttk.Checkbutton(p, text='Показувати кожну підмережу окремо', variable=self.g_full,
                        command=lambda: self.on_prop('show_full', self.g_full.get())).grid(
            row=3, column=0, columnspan=3, sticky='w', pady=(4, 2))

        ttk.Label(p, text='Підмережі (по одній у рядку):').grid(row=4, column=0, columnspan=3, sticky='w', pady=(6, 2))
        self.g_subnets = tk.Text(p, height=12, width=28, relief='solid', bd=1, font=('Consolas', 10), undo=False)
        self.g_subnets.grid(row=5, column=0, columnspan=3, sticky='ew')
        self.g_subnets.bind('<<Modified>>', self.on_subnets_modified)
        self.subnets_error = ttk.Label(p, style='Error.TLabel', wraplength=260)
        self.subnets_error.grid(row=6, column=0, columnspan=3, sticky='w')
        self.g_info = ttk.Label(p, style='Hint.TLabel', wraplength=260, justify='left')
        self.g_info.grid(row=7, column=0, columnspan=3, sticky='w', pady=(2, 0))
        ttk.Button(p, text='Нормалізувати список', command=self.normalize_group).grid(
            row=8, column=0, columnspan=3, sticky='w', pady=(6, 0))

        warn_frame = ttk.LabelFrame(right, text='Попередження', padding=6)
        warn_frame.pack(fill='both', expand=True, pady=(8, 0))
        self.warn_text = tk.Text(warn_frame, height=8, width=34, relief='flat', wrap='word',
                                 font=('Segoe UI', 9), bg=root.cget('bg'), fg='#b91c1c', state='disabled')
        self.warn_text.pack(fill='both', expand=True)

        self.props_widgets = [w for w in p.winfo_children()]

    def build_menu(self):
        menu = tk.Menu(self.root)
        file_menu = tk.Menu(menu, tearoff=False)
        file_menu.add_command(label='Новий', accelerator='Ctrl+N', command=self.new_file)
        file_menu.add_command(label='Відкрити дані…', accelerator='Ctrl+O', command=self.open_file)
        file_menu.add_command(label='Зберегти дані', accelerator='Ctrl+S', command=self.save_file)
        file_menu.add_command(label='Зберегти дані як…', accelerator='Ctrl+Shift+S', command=self.save_file_as)
        file_menu.add_separator()
        file_menu.add_command(label='Експорт зображення…', accelerator='Ctrl+E', command=self.export_image)
        file_menu.add_command(label='Експорт PNG: кольоровий + Ч/Б…', command=self.export_both)
        file_menu.add_separator()
        file_menu.add_command(label='Вихід', command=self.on_exit)
        menu.add_cascade(label='Файл', menu=file_menu)

        edit_menu = tk.Menu(menu, tearoff=False)
        edit_menu.add_command(label='Скасувати', accelerator='Ctrl+Z', command=self.undo)
        edit_menu.add_command(label='Повторити', accelerator='Ctrl+Y', command=self.redo)
        edit_menu.add_separator()
        edit_menu.add_command(label='Додати групу', command=self.add_group)
        edit_menu.add_command(label='Дублювати групу', accelerator='Ctrl+D', command=self.duplicate_group)
        edit_menu.add_command(label='Видалити групу', accelerator='Delete', command=self.delete_group)
        menu.add_cascade(label='Правка', menu=edit_menu)

        help_menu = tk.Menu(menu, tearoff=False)
        help_menu.add_command(label='Керування', command=lambda: messagebox.showinfo('Керування', HELP_TEXT))
        menu.add_cascade(label='Довідка', menu=help_menu)
        self.root.config(menu=menu)

    def bind_keys(self):
        # Match by keycode instead of keysym: with a Cyrillic layout Tk
        # reports Cyrillic keysyms and <Control-z> would never fire.
        actions = {
            KEY_N: self.new_file, KEY_O: self.open_file, KEY_E: self.export_image,
            KEY_Z: self.undo, KEY_Y: self.redo, KEY_D: self.duplicate_group,
        }

        def on_ctrl(event):
            if event.state & 0x20000:  # Alt / AltGr: typing a character, not a shortcut
                return
            if event.keycode == KEY_S:
                (self.save_file_as if event.state & 0x1 else self.save_file)()
                return 'break'
            action = actions.get(event.keycode)
            if action:
                action()
                return 'break'

        self.root.bind_all('<Control-KeyPress>', on_ctrl)

    # ================================================================ document

    @property
    def groups(self):
        return self.doc['subnet_groups']

    def main_net(self):
        try:
            return ipaddress.ip_network(self.doc['main_subnet'].strip(), strict=False)
        except ValueError:
            return None

    def snap_size(self):
        return 2 ** (32 - int(self.snap_var.get().lstrip('/')))

    def load_document(self, doc, path):
        self.doc = doc
        self.path = path
        self.dirty = False
        self.undo_stack.clear()
        self.redo_stack.clear()
        self.undo_key = None
        self.selected = 0 if self.groups else None
        net = self.main_net()
        if net:
            self.snap_var.set(f'/{min(net.prefixlen + 8, 32)}')
        self.refresh_all()

    def refresh_all(self):
        self.loading = True
        self.main_var.set(self.doc['main_subnet'])
        self.title_var.set(self.doc['map_title'])
        self.loading = False
        self.update_snap_choices()
        self.refresh_tree()
        self.refresh_props()
        self.update_title()
        self.request_render()

    def changed(self, structure=False):
        # Called after any edit of self.doc
        self.dirty = True
        self.redo_stack.clear()
        self.update_title()
        if structure:
            self.refresh_tree()
        else:
            self.refresh_tree_row(self.selected)
        self.request_render()

    def update_title(self):
        name = os.path.basename(self.path) if self.path else 'Без назви'
        self.root.title(f"{'*' if self.dirty else ''}{name} — {APP_NAME}")

    # ------------------------------------------------------------- undo / redo

    def push_undo(self, key=None):
        # Consecutive edits with the same key (typing in one field) are one step
        if key is not None and key == self.undo_key:
            return
        self.undo_key = key
        self.undo_stack.append((copy.deepcopy(self.doc), self.selected))
        del self.undo_stack[:-200]

    def undo(self):
        self._restore(self.undo_stack, self.redo_stack)

    def redo(self):
        self._restore(self.redo_stack, self.undo_stack)

    def _restore(self, source, target):
        if not source:
            return
        target.append((copy.deepcopy(self.doc), self.selected))
        self.doc, self.selected = source.pop()
        if self.selected is not None and self.selected >= len(self.groups):
            self.selected = len(self.groups) - 1 if self.groups else None
        self.undo_key = None
        self.dirty = True
        self.refresh_all()

    # ------------------------------------------------------------- files

    def confirm_discard(self):
        if not self.dirty:
            return True
        answer = messagebox.askyesnocancel(APP_NAME, 'Зберегти зміни перед тим, як продовжити?')
        if answer is None:
            return False
        return self.save_file() if answer else True

    def new_file(self):
        if self.confirm_discard():
            self.load_document(model.new_document(), None)

    def open_file(self):
        if not self.confirm_discard():
            return
        path = filedialog.askopenfilename(title='Відкрити дані', filetypes=DATA_FILETYPES,
                                          initialdir=self.initial_dir())
        if path:
            self.open_path(path)

    def open_path(self, path, quiet=False):
        try:
            doc = model.load_data(path)
        except Exception as e:
            if not quiet:
                messagebox.showerror(APP_NAME, f'Не вдалося відкрити файл:\n{path}\n\n{e}')
            self.load_document(model.new_document(), None)
            return
        self.load_document(doc, path)
        self.remember_file(path)

    def save_file(self):
        if not self.path:
            return self.save_file_as()
        return self.write_file(self.path)

    def save_file_as(self):
        name = os.path.basename(self.path) if self.path else 'data.py'
        path = filedialog.asksaveasfilename(title='Зберегти дані', filetypes=DATA_FILETYPES,
                                            defaultextension='.py', initialfile=name,
                                            initialdir=self.initial_dir())
        return self.write_file(path) if path else False

    def write_file(self, path):
        try:
            model.save_data(path, self.doc)
        except Exception as e:
            messagebox.showerror(APP_NAME, f'Не вдалося зберегти файл:\n{e}')
            return False
        self.path = path
        self.dirty = False
        self.update_title()
        self.remember_file(path)
        self.status_var.set(f'Збережено: {path}')
        return True

    def remember_file(self, path):
        self.settings['last_file'] = os.path.abspath(path)
        save_settings(self.settings)

    def initial_dir(self):
        return os.path.dirname(self.path) if self.path else os.getcwd()

    def on_exit(self):
        if self.confirm_discard():
            self.settings['style'] = self.style_var.get()
            save_settings(self.settings)
            self.root.destroy()

    # ------------------------------------------------------------- export

    def export_image(self):
        if not self.check_exportable():
            return
        base = os.path.splitext(os.path.basename(self.path))[0] if self.path else 'subnet_map'
        suffix = '_bw' if self.style_var.get() == 'bw' else ''
        path = filedialog.asksaveasfilename(
            title='Експорт зображення', defaultextension='.png', initialfile=f'{base}{suffix}.png',
            initialdir=self.initial_dir(),
            filetypes=[('PNG', '*.png'), ('PDF (векторний, для друку)', '*.pdf'), ('SVG', '*.svg')])
        if path:
            self.save_figure(path, self.style_var.get())

    def export_both(self):
        if not self.check_exportable():
            return
        base = os.path.splitext(os.path.basename(self.path))[0] if self.path else 'subnet_map'
        path = filedialog.asksaveasfilename(
            title='Експорт PNG (кольоровий; Ч/Б буде поруч з суфіксом _bw)', defaultextension='.png',
            initialfile=f'{base}.png', initialdir=self.initial_dir(), filetypes=[('PNG', '*.png')])
        if path:
            root, ext = os.path.splitext(path)
            if self.save_figure(path, 'colored'):
                self.save_figure(f'{root}_bw{ext}', 'bw')

    def save_figure(self, path, style):
        try:
            fig, _, _ = build_figure(self.doc, style)
            fig.savefig(path, dpi=300)
        except Exception as e:
            messagebox.showerror(APP_NAME, f'Не вдалося експортувати:\n{e}')
            return False
        self.status_var.set(f'Експортовано: {path}')
        return True

    def check_exportable(self):
        if not self.main_net():
            messagebox.showerror(APP_NAME, 'Спершу вкажіть коректну мережу (наприклад 192.168.0.0/16).')
            return False
        return True

    # ================================================================ rendering

    def request_render(self):
        if not self.render_pending:
            self.render_pending = True
            self.root.after_idle(self.render)

    def render(self):
        self.render_pending = False
        cw, ch = self.cv.winfo_width(), self.cv.winfo_height()
        if cw < 50 or ch < 50:
            return
        self.cv.delete('map')
        self.view = None
        net = self.main_net()
        if not net:
            self.cv.create_text(cw / 2, ch / 2, text='Некоректна мережа — вкажіть, наприклад, 192.168.0.0/16',
                                font=('Segoe UI', 12), fill='#b91c1c', tags='map')
            self.set_warnings(['Некоректна головна мережа'])
            return

        dpi = min((cw - 24) / A4[0], (ch - 24) / A4[1])
        messages = []
        try:
            fig, ax, blocks = build_figure(self.doc, self.style_var.get(), dpi, messages)
            self.draw_overlays(ax, blocks)
            fig.canvas.draw()
        except Exception as e:
            self.cv.create_text(cw / 2, ch / 2, text=f'Помилка рендеру: {e}', font=('Segoe UI', 11),
                                fill='#b91c1c', width=cw - 40, tags='map')
            return

        w, h = fig.canvas.get_width_height()
        image = Image.frombuffer('RGBA', (w, h), fig.canvas.buffer_rgba(), 'raw', 'RGBA', 0, 1)
        self.photo = ImageTk.PhotoImage(image)
        ox, oy = (cw - w) // 2, (ch - h) // 2
        self.cv.create_rectangle(ox + 3, oy + 3, ox + w + 3, oy + h + 3, fill='#9ca3af', outline='', tags='map')
        self.cv.create_image(ox, oy, anchor='nw', image=self.photo, tags='map')
        self.cv.tag_raise('ghost')
        self.cv.tag_raise('tip')
        self.view = {'ax': ax, 'ox': ox, 'oy': oy, 'h': h, 'blocks': blocks, 'net': net}
        self.set_warnings([translate_message(m) for m in messages] + self.overlap_messages())

    def draw_overlays(self, ax, blocks):
        # Editor-only marks: overlapping address space and the selected group
        for start, end in self.overlap_intervals():
            ax.add_patch(Rectangle((start, BLOCK_Y0), end - start + 1, BLOCK_Y1 - BLOCK_Y0, fill=False,
                                   hatch='////', edgecolor=SELECT_COLOR, linewidth=0, zorder=5))
        extent = self.group_extent(self.selected, blocks)
        if extent:
            start, end = extent
            ax.add_patch(Rectangle((start, BLOCK_Y0 - 0.07), end - start + 1, BLOCK_Y1 - BLOCK_Y0 + 0.14,
                                   fill=False, edgecolor=SELECT_COLOR, linewidth=2, linestyle='--', zorder=10))

    def group_extent(self, index, blocks=None):
        if index is None:
            return None
        blocks = blocks if blocks is not None else (self.view['blocks'] if self.view else [])
        own = [(s, e) for s, e, g in blocks if g == index]
        if not own:
            return None
        return min(s for s, _ in own), max(e for _, e in own)

    def overlap_intervals(self):
        per_group = [model.group_intervals(g) for g in self.groups]
        result = []
        for i in range(len(per_group)):
            for j in range(i + 1, len(per_group)):
                result += model.intersect(per_group[i], per_group[j])
        return model.merge(result)

    def overlap_messages(self):
        per_group = [model.group_intervals(g) for g in self.groups]
        messages = []
        for i in range(len(per_group)):
            for j in range(i + 1, len(per_group)):
                for start, end in model.intersect(per_group[i], per_group[j]):
                    messages.append(f'Перекриття «{group_name(self.groups[i], i)}» і '
                                    f'«{group_name(self.groups[j], j)}»: {model.range_str(start, end)}')
        return messages

    def set_warnings(self, messages):
        self.warn_var.set(f'⚠ Попереджень: {len(messages)}' if messages else '')
        self.warn_text.config(state='normal')
        self.warn_text.delete('1.0', 'end')
        self.warn_text.insert('1.0', '\n'.join(f'• {m}' for m in messages) if messages else 'Немає')
        self.warn_text.config(state='disabled', fg='#b91c1c' if messages else '#6b7280')

    # ------------------------------------------------------------- coordinates

    def to_data(self, ex, ey):
        v = self.view
        return v['ax'].transData.inverted().transform((ex - v['ox'], v['h'] - (ey - v['oy'])))

    def to_px(self, x):
        v = self.view
        return v['ax'].transData.transform((x, 0))[0] + v['ox']

    def hit_test(self, ex, ey):
        # Returns (mode, group index) where mode is 'left', 'right' or 'move'.
        # A block under the cursor always wins over a neighbour's edge, so even
        # a block a few pixels wide can be grabbed.
        if not self.view:
            return None, None
        x, y = self.to_data(ex, ey)
        if not BLOCK_Y0 - 0.05 <= y <= BLOCK_Y1 + 0.05:
            return None, None
        hits = [(e - s, g) for s, e, g in self.view['blocks'] if s <= x < e + 1]
        if hits:
            g = next((h[1] for h in hits if h[1] == self.selected), min(hits)[1])
            left, right = self.edges_px(g)
            grab = min(EDGE_GRAB_PX, (right - left) / 4)
            if ex - left <= grab:
                return 'left', g
            if right - ex <= grab:
                return 'right', g
            return 'move', g
        # Empty space: an edge can be grabbed from the outside too
        for g in sorted(range(len(self.groups)), key=lambda g: g != self.selected):
            if not self.group_extent(g):
                continue
            left, right = self.edges_px(g)
            if 0 <= left - ex <= EDGE_GRAB_PX:
                return 'left', g
            if 0 <= ex - right <= EDGE_GRAB_PX:
                return 'right', g
        return None, None

    def edges_px(self, g):
        start, end = self.group_extent(g)
        return self.to_px(start), self.to_px(end + 1)

    # ================================================================ mouse

    def on_hover(self, event):
        if self.drag or not self.view:
            return
        mode, g = self.hit_test(event.x, event.y)
        self.cv.config(cursor={'left': 'sb_h_double_arrow', 'right': 'sb_h_double_arrow',
                               'move': 'fleur'}.get(mode, ''))
        x, _ = self.to_data(event.x, event.y)
        net = self.view['net']
        text = ''
        if int(net.network_address) <= x <= int(net.broadcast_address):
            text = model.ip_str(int(x))
        if g is not None:
            extent = self.group_extent(g)
            text += f'   ·   {group_name(self.groups[g], g)}: {model.range_str(*extent)}'
        self.status_var.set(text)

    def on_press(self, event):
        self.cv.focus_set()
        mode, g = self.hit_test(event.x, event.y)
        self.select(g)
        if g is None:
            return
        intervals = model.group_intervals(self.groups[g])
        if not intervals:
            return
        self.push_undo()
        self.drag = {
            'mode': mode, 'g': g, 'x0': self.to_data(event.x, event.y)[0],
            'orig': intervals, 'start': intervals[0][0], 'end': intervals[-1][1],
            'subnets': list(self.groups[g]['subnets']), 'moved': False,
        }

    def on_motion(self, event):
        d = self.drag
        if not d or not self.view:
            return
        net = self.view['net']
        lo, hi = int(net.network_address), int(net.broadcast_address)
        step = self.snap_size()
        snap = lambda v: lo + round((v - lo) / step) * step
        x = self.to_data(event.x, event.y)[0]
        start, end = d['start'], d['end']

        if d['mode'] == 'move':
            new_start = snap(start + x - d['x0'])
            new_start = max(lo, min(new_start, hi + 1 - (end - start + 1)))
            intervals = model.shift(d['orig'], new_start - start)
        elif d['mode'] == 'right':
            new_end = max(snap(x), start + min(step, end - start + 1)) - 1
            new_end = min(new_end, hi)
            intervals = (model.merge(d['orig'] + [(end + 1, new_end)]) if new_end > end
                         else model.clip(d['orig'], start, new_end))
        else:
            new_start = min(snap(x), end + 1 - min(step, end - start + 1))
            new_start = max(new_start, lo)
            intervals = (model.merge([(new_start, start - 1)] + d['orig']) if new_start < start
                         else model.clip(d['orig'], new_start, end))

        subnets = model.to_cidrs(intervals) if intervals != d['orig'] else d['subnets']
        group = self.groups[d['g']]
        if subnets != group['subnets']:
            group['subnets'] = subnets
            d['moved'] = True
            self.changed()
            self.refresh_subnets_text()
        a, b = intervals[0][0], intervals[-1][1]
        self.status_var.set(f'{model.range_str(a, b)}   ·   {b - a + 1} адрес')
        self.show_ghost(intervals)
        self.show_tip(event.x, event.y, model.range_str(a, b))

    def on_release(self, event):
        if self.drag and not self.drag['moved']:
            self.undo_stack.pop()  # nothing changed - drop the snapshot taken on press
        self.drag = None
        self.cv.delete('tip', 'ghost')

    def show_ghost(self, intervals):
        # Instant outline of the new position; the full map re-render follows
        v = self.view
        y0 = v['oy'] + v['h'] - v['ax'].transData.transform((0, BLOCK_Y1))[1]
        y1 = v['oy'] + v['h'] - v['ax'].transData.transform((0, BLOCK_Y0))[1]
        self.cv.delete('ghost')
        for start, end in intervals:
            self.cv.create_rectangle(self.to_px(start), y0, self.to_px(end + 1), y1, outline=SELECT_COLOR,
                                     width=2, dash=(5, 3), tags='ghost')

    def show_tip(self, x, y, text):
        self.cv.delete('tip')
        item = self.cv.create_text(x + 14, y - 18, text=text, anchor='w', font=('Segoe UI', 9), tags='tip')
        x0, y0, x1, y1 = self.cv.bbox(item)
        rect = self.cv.create_rectangle(x0 - 5, y0 - 3, x1 + 5, y1 + 3, fill='#fffbe6', outline='#a3a3a3', tags='tip')
        self.cv.tag_lower(rect, item)

    def nudge(self, direction, edge=None):
        # Keyboard move of the selected group, or of one of its edges, by one snap step
        g = self.selected
        net = self.main_net()
        if g is None or not net:
            return 'break'
        intervals = model.group_intervals(self.groups[g])
        if not intervals:
            return 'break'
        step, lo, hi = self.snap_size(), int(net.network_address), int(net.broadcast_address)
        start, end = intervals[0][0], intervals[-1][1]
        if edge == 'right':
            new_end = end + direction * step
            if new_end > hi or new_end < start:
                return 'break'
            intervals = (model.merge(intervals + [(end + 1, new_end)]) if direction > 0
                         else model.clip(intervals, start, new_end))
        elif edge == 'left':
            new_start = start + direction * step
            if new_start < lo or new_start > end:
                return 'break'
            intervals = (model.merge([(new_start, start - 1)] + intervals) if direction < 0
                         else model.clip(intervals, new_start, end))
        else:
            delta = max(lo - start, min(direction * step, hi - end))
            if delta == 0:
                return 'break'
            intervals = model.shift(intervals, delta)
        self.push_undo()
        self.groups[g]['subnets'] = model.to_cidrs(intervals)
        self.changed()
        self.refresh_subnets_text()
        return 'break'

    # ================================================================ groups list

    def select(self, index):
        if index == self.selected:
            return
        self.selected = index
        self.undo_key = None
        self.loading = True
        if index is None:
            self.tree.selection_remove(*self.tree.selection())
        else:
            self.tree.selection_set(str(index))
            self.tree.see(str(index))
        self.loading = False
        self.refresh_props()
        self.request_render()

    def on_tree_select(self, event):
        if self.loading:
            return
        sel = self.tree.selection()
        self.select(int(sel[0]) if sel else None)

    def refresh_tree(self):
        self.loading = True
        self.tree.delete(*self.tree.get_children())
        for i, group in enumerate(self.groups):
            self.tree.insert('', 'end', iid=str(i), text=group_name(group, i),
                             values=(self.group_range_text(group),), tags=(f'g{i}',))
            self.tree_tag(i)
        if self.selected is not None and self.selected < len(self.groups):
            self.tree.selection_set(str(self.selected))
            self.tree.see(str(self.selected))
        self.loading = False

    def refresh_tree_row(self, index):
        if index is None or not self.tree.exists(str(index)):
            return
        group = self.groups[index]
        self.tree.item(str(index), text=group_name(group, index), values=(self.group_range_text(group),))
        self.tree_tag(index)

    def tree_tag(self, index):
        color = group_color(self.groups[index], index)
        if is_color_like(color):
            self.tree.tag_configure(f'g{index}', background=to_hex(color))

    def group_range_text(self, group):
        intervals = model.group_intervals(group)
        if not intervals:
            return '—'
        return f'{model.ip_str(intervals[0][0])} – {model.ip_str(intervals[-1][1])}'

    def add_group(self):
        net = self.main_net()
        if not net:
            return
        step, lo, hi = self.snap_size(), int(net.network_address), int(net.broadcast_address)
        used = model.merge([iv for g in self.groups for iv in model.group_intervals(g)])
        start = lo
        for used_start, used_end in used + [(hi + 1, hi + 1)]:
            if used_start - start >= step:
                break
            start = max(start, lo + -(-(used_end + 1 - lo) // step) * step)  # next aligned address after used
        if start + step - 1 > hi:
            start = lo
        used_colors = {g.get('color') for g in self.groups}
        color = next((c for c in viz.COLORS if c not in used_colors), None)
        group = {'title': 'Нова група', 'comment': '', 'show_full': False,
                 'subnets': model.to_cidrs([(start, start + step - 1)])}
        if color:
            group['color'] = color
        self.push_undo()
        self.groups.append(group)
        self.selected = len(self.groups) - 1
        self.changed(structure=True)
        self.refresh_props()

    def duplicate_group(self):
        if self.selected is None:
            return
        self.push_undo()
        self.groups.insert(self.selected + 1, copy.deepcopy(self.groups[self.selected]))
        self.selected += 1
        self.changed(structure=True)
        self.refresh_props()

    def delete_group(self):
        if self.selected is None:
            return 'break'
        self.push_undo()
        del self.groups[self.selected]
        self.selected = min(self.selected, len(self.groups) - 1) if self.groups else None
        self.changed(structure=True)
        self.refresh_props()
        return 'break'

    def move_group_in_list(self, direction):
        i = self.selected
        if i is None or not 0 <= i + direction < len(self.groups):
            return
        self.push_undo()
        self.groups[i], self.groups[i + direction] = self.groups[i + direction], self.groups[i]
        self.selected = i + direction
        self.changed(structure=True)

    def normalize_group(self):
        if self.selected is None:
            return
        group = self.groups[self.selected]
        subnets = model.to_cidrs(model.group_intervals(group))
        if subnets != group['subnets']:
            self.push_undo()
            group['subnets'] = subnets
            self.changed()
            self.refresh_subnets_text()

    # ================================================================ properties

    def refresh_props(self):
        g = self.selected
        self.loading = True
        state = 'normal' if g is not None else 'disabled'
        for w in self.props_widgets:
            try:
                w.configure(state=state)
            except tk.TclError:
                pass
        group = self.groups[g] if g is not None else {}
        self.props.configure(text=f'Група №{g + 1}' if g is not None else 'Група (не вибрано)')
        self.g_title.set(group.get('title', ''))
        self.set_text(self.g_comment, group.get('comment') or '')
        self.g_color.set(group.get('color') or AUTO_COLOR if g is not None else '')
        self.g_full.set(bool(group.get('show_full', True)))
        self.color_combo.configure(state='normal' if g is not None else 'disabled')
        self.loading = False
        self.refresh_subnets_text()
        self.update_swatch()

    def refresh_subnets_text(self):
        g = self.selected
        self.loading = True
        self.set_text(self.g_subnets, '\n'.join(self.groups[g]['subnets']) if g is not None else '')
        self.loading = False
        self.subnets_error.configure(text='')
        self.update_group_info()

    def update_group_info(self):
        g = self.selected
        if g is None:
            self.g_info.configure(text='Виберіть групу на карті або в списку.')
            return
        intervals = model.group_intervals(self.groups[g])
        if not intervals:
            self.g_info.configure(text='Немає коректних підмереж')
            return
        total = sum(e - s + 1 for s, e in intervals)
        text = f'{model.range_str(intervals[0][0], intervals[-1][1])}\n{total} адрес'
        if len(intervals) > 1:
            text += f', {len(intervals)} {"окремі ділянки" if len(intervals) < 5 else "окремих ділянок"}'
        self.g_info.configure(text=text)

    @staticmethod
    def set_text(widget, text):
        state = widget.cget('state')
        widget.configure(state='normal')
        widget.delete('1.0', 'end')
        widget.insert('1.0', text)
        widget.edit_modified(False)
        widget.configure(state=state)

    def on_prop(self, key, value):
        if self.loading or self.selected is None:
            return
        group = self.groups[self.selected]
        if group.get(key) == value:
            return
        self.push_undo(f'{key}:{self.selected}')
        group[key] = value
        self.changed()

    def on_comment_modified(self, event):
        if not self.g_comment.edit_modified():
            return
        self.g_comment.edit_modified(False)
        self.on_prop('comment', self.g_comment.get('1.0', 'end-1c'))

    def on_subnets_modified(self, event):
        if not self.g_subnets.edit_modified():
            return
        self.g_subnets.edit_modified(False)
        if self.loading or self.selected is None:
            return
        lines = [l.strip() for l in self.g_subnets.get('1.0', 'end-1c').split('\n')]
        subnets = [l for l in lines if l]
        for cidr in subnets:
            try:
                model.cidr_interval(cidr)
            except ValueError:
                self.subnets_error.configure(text=f'«{cidr}» — некоректна підмережа, потрібен формат a.b.c.d/префікс')
                return
        self.subnets_error.configure(text='')
        group = self.groups[self.selected]
        if subnets != group['subnets']:
            self.push_undo(f'subnets:{self.selected}')
            group['subnets'] = subnets
            self.changed()
            self.update_group_info()

    def on_color_changed(self):
        if self.loading or self.selected is None:
            return
        value = self.g_color.get().strip()
        if value in ('', AUTO_COLOR):
            color = None
        elif value in viz.COLORS or is_color_like(value):
            color = value
        else:
            self.swatch.configure(bg=self.root.cget('bg'), text='?')
            return
        group = self.groups[self.selected]
        if group.get('color') != color:
            self.push_undo(f'color:{self.selected}')
            if color is None:
                group.pop('color', None)
            else:
                group['color'] = color
            self.changed()
        self.update_swatch()

    def update_swatch(self):
        if self.selected is None:
            self.swatch.configure(bg=self.root.cget('bg'), text='')
            return
        color = group_color(self.groups[self.selected], self.selected)
        self.swatch.configure(bg=to_hex(color) if is_color_like(color) else self.root.cget('bg'), text='')

    def pick_color(self):
        if self.selected is None:
            return
        current = group_color(self.groups[self.selected], self.selected)
        result = colorchooser.askcolor(color=to_hex(current) if is_color_like(current) else None,
                                       title='Колір групи', parent=self.root)
        if result and result[1]:
            self.g_color.set(result[1])

    # ================================================================ document fields

    def on_main_changed(self):
        if self.loading:
            return
        value = self.main_var.get().strip()
        try:
            ipaddress.ip_network(value, strict=False)
            self.main_entry.configure(bg='white')
        except ValueError:
            self.main_entry.configure(bg='#fde2e2')
            return
        if value != self.doc['main_subnet']:
            self.push_undo('main')
            self.doc['main_subnet'] = value
            self.update_snap_choices()
            self.changed()

    def on_map_title_changed(self):
        if self.loading or self.title_var.get() == self.doc['map_title']:
            return
        self.push_undo('map_title')
        self.doc['map_title'] = self.title_var.get()
        self.changed()

    def update_snap_choices(self):
        net = self.main_net()
        prefix = net.prefixlen if net else 0
        self.snap_combo.configure(values=[f'/{p}' for p in range(prefix, 33)])
        if int(self.snap_var.get().lstrip('/')) < prefix:
            self.snap_var.set(f'/{min(prefix + 8, 32)}')

    def on_style_changed(self):
        self.request_render()


def enable_dpi_awareness():
    # Crisp rendering on scaled Windows displays
    try:
        import ctypes
        ctypes.windll.shcore.SetProcessDpiAwareness(1)
    except Exception:
        pass


def main():
    parser = argparse.ArgumentParser(prog='SubnetEditor', description='Візуальний редактор карти підмереж')
    parser.add_argument('data', nargs='?', help='файл даних (.py або .json)')
    parser.add_argument('--export', metavar='FILE', help='без вікна: зберегти карту у FILE (.png/.pdf/.svg) і вийти')
    parser.add_argument('--bw', action='store_true', help='чорно-білий варіант для --export')
    args = parser.parse_args()

    if args.export:
        if not args.data:
            parser.error('для --export потрібен файл даних')
        fig, _, _ = build_figure(model.load_data(args.data), 'bw' if args.bw else 'colored')
        fig.savefig(args.export, dpi=300)
        return

    enable_dpi_awareness()
    root = tk.Tk()
    try:
        root.state('zoomed')
    except tk.TclError:
        root.geometry('1400x850')
    Editor(root, args.data)
    root.mainloop()


if __name__ == '__main__':
    main()
