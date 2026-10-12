// Subnet Editor UI. State lives here; Python (editor.py) is used for files,
// dialogs and the print render. See window.pywebview.api / dev fetch bridge.
(() => {
  'use strict';

  // ================================================================ helpers

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const fmt = n => Math.round(n).toLocaleString('uk-UA');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const basename = p => String(p || '').split(/[\\/]/).pop();
  const ip = Net.intToIp;

  function plural(n, one, few, many) {
    const n100 = Math.abs(n) % 100, n10 = n100 % 10;
    if (n100 > 10 && n100 < 20) return many;
    if (n10 > 1 && n10 < 5) return few;
    return n10 === 1 ? one : many;
  }
  const addrWord = n => plural(n, 'адреса', 'адреси', 'адрес');

  // End address without the octets it shares with the start: 10.0.0.0 – 3.255
  function rangeText(start, end) {
    const a = ip(start).split('.'), b = ip(end).split('.');
    let k = 0;
    while (k < 3 && a[k] === b[k]) k++;
    return `${a.join('.')} – ${b.slice(k).join('.')}`;
  }
  const fullRange = (s, e) => `${ip(s)} – ${ip(e)}`;

  function sizeText(count) {
    const label = Net.sizeLabel(count);
    return label || `${fmt(count)} ${addrWord(count)}`;
  }

  let uidCounter = 0;
  const newUid = () => `g${++uidCounter}`;

  const ICONS = {
    'file-plus': '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 11v6M9 14h6"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    save: '<path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8M7 21v-7h10v7"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    printer: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    wand: '<path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5"/>',
    mouse: '<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 7v4"/>',
    keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    pointer: '<path d="m4 4 7 17 2.5-7.5L21 11z"/>',
    move: '<path d="m5 9-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    error: '<circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>',
    split: '<path d="M12 3v18"/><path d="m8 8-4 4 4 4M16 8l4 4-4 4"/>',
    expand: '<path d="M3 12h18"/><path d="m7 8-4 4 4 4M17 8l4 4-4 4"/>',
    'arrow-up': '<path d="M12 19V5M5 12l7-7 7 7"/>',
    'arrow-down': '<path d="M12 5v14M19 12l-7 7-7-7"/>',
    'zoom-out': '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M8 11h6"/>',
    'zoom-in': '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M8 11h6M11 8v6"/>',
    clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  };
  const icon = name => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  const hydrateIcons = (root = document) => $$('i[data-icon]', root).forEach(i => { i.outerHTML = icon(i.dataset.icon); });

  const measureCtx = document.createElement('canvas').getContext('2d');
  function textWidth(text, font) {
    measureCtx.font = font;
    return measureCtx.measureText(text).width;
  }

  // ================================================================ bridge

  // ?dev / ?http: the UI runs in a normal browser and talks to Python over http
  const params = new URLSearchParams(location.search);
  const HTTP = params.has('dev') || params.has('http');
  const api = new Proxy({}, {
    get: (_, name) => (...args) => HTTP
      ? fetch(`/api/${name}`, { method: 'POST', body: JSON.stringify(args) }).then(r => r.json())
      : window.pywebview.api[name](...args),
  });
  const bridgeReady = () => (HTTP || (window.pywebview && window.pywebview.api && window.pywebview.api.init))
    ? Promise.resolve()
    : new Promise(resolve => window.addEventListener('pywebviewready', resolve, { once: true }));

  // ================================================================ state

  const state = {
    doc: null, path: null, saved: '', selected: null, mode: 'edit',
    printStyle: 'colored', exportStyle: 'colored', snap: 'auto', theme: null, miniPreview: true, recent: [],
  };
  let COLORS = {}, DEFAULT_COLORS = ['#ff9999'];
  let D = null;               // derived data, see derive()
  const born = new Set();     // uids of just created groups (pop-in animation)
  const history = { undo: [], redo: [], key: null, time: 0 };
  let lastDirty = null;

  function cleanDoc() {
    return {
      main_subnet: state.doc.main_subnet,
      map_title: state.doc.map_title,
      subnet_groups: state.doc.subnet_groups.map(({ _uid, ...rest }) => rest),
    };
  }
  const docJson = () => JSON.stringify(cleanDoc());
  const isDirty = () => docJson() !== state.saved;
  const group = uid => state.doc.subnet_groups.find(g => g._uid === uid);

  // --- history

  const snapshot = () => ({ doc: JSON.stringify(state.doc), selected: state.selected });

  // Call BEFORE mutating the document. Calls with the same key within a short
  // time (typing in one field) are merged into one undo step.
  function checkpoint(key = null) {
    const now = Date.now();
    if (key && key === history.key && now - history.time < 1500) {
      history.time = now;
      return;
    }
    history.undo.push(snapshot());
    if (history.undo.length > 300) history.undo.shift();
    history.redo = [];
    history.key = key;
    history.time = now;
  }

  function restore(from, to) {
    if (!from.length) return;
    to.push(snapshot());
    const s = from.pop();
    state.doc = JSON.parse(s.doc);
    state.selected = state.doc.subnet_groups.some(g => g._uid === s.selected) ? s.selected : null;
    history.key = null;
    changed();
  }
  const undo = () => restore(history.undo, history.redo);
  const redo = () => restore(history.redo, history.undo);

  // ================================================================ derived data

  function resolveColor(g, index) {
    const c = g.color ? (COLORS[g.color] || g.color) : DEFAULT_COLORS[index % DEFAULT_COLORS.length];
    return CSS.supports('color', c) ? c : '#d0d4dc';
  }

  function textColorFor(color) {
    measureCtx.fillStyle = '#000';
    measureCtx.fillStyle = color;
    const hex = measureCtx.fillStyle;
    if (!hex.startsWith('#')) return '#1b1f24';
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.3 ? '#ffffff' : '#1b1f24';
  }

  function groupName(g, index) {
    const title = (g.title || '').trim();
    if (title) return title;
    const comment = (g.comment || '').trim().split('\n')[0];
    return comment || `Група ${index + 1}`;
  }

  function derive() {
    const doc = state.doc;
    let net = null;
    try { net = Net.parseNetwork(doc.main_subnet); } catch (e) { /* shown in the field */ }

    const groups = doc.subnet_groups.map((g, index) => {
      const errors = [], raw = [];
      for (const cidr of g.subnets || []) {
        try {
          const p = Net.parseCidr(cidr);
          raw.push([p.start, p.end]);
        } catch (e) {
          errors.push({ cidr, msg: e.message });
        }
      }
      const intervals = Net.merge(raw);
      const color = resolveColor(g, index);
      return {
        g, uid: g._uid, index, intervals, errors, color, fg: textColorFor(color),
        name: groupName(g, index), total: Net.total(intervals),
        start: intervals.length ? intervals[0][0] : null,
        end: intervals.length ? intervals[intervals.length - 1][1] : null,
      };
    });

    const warnings = [];
    if (!net) warnings.push({ kind: 'err', text: 'Некоректна мережа', detail: doc.main_subnet || '(порожньо)' });
    const overlaps = [];
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        for (const iv of Net.intersect(groups[i].intervals, groups[j].intervals)) {
          overlaps.push(iv);
          warnings.push({
            kind: 'warn', uid: groups[j].uid, range: iv,
            text: `Перекриття «${groups[i].name}» і «${groups[j].name}»`,
            detail: fullRange(iv[0], iv[1]),
          });
        }
      }
    }
    for (const x of groups) {
      for (const er of x.errors) {
        const comma = /\/\d+\d\.\d/.test(er.cidr) ? ' · схоже, бракує коми між двома підмережами' : '';
        warnings.push({ kind: 'err', uid: x.uid, text: `«${x.name}»: некоректна підмережа`, detail: `${er.cidr} — ${er.msg}${comma}` });
      }
      if (net && x.intervals.length && (x.start < net.start || x.end > net.end)) {
        warnings.push({ kind: 'warn', uid: x.uid, text: `«${x.name}» виходить за межі мережі`, detail: fullRange(x.start, x.end) });
      }
      if (!x.intervals.length && !x.errors.length) {
        warnings.push({ kind: 'warn', uid: x.uid, text: `«${x.name}» не має жодної підмережі`, detail: 'Додайте підмережу в панелі праворуч' });
      }
    }

    const union = Net.merge(groups.flatMap(x => x.intervals));
    D = {
      net, groups, warnings,
      byUid: new Map(groups.map(x => [x.uid, x])),
      overlaps: Net.merge(overlaps),
      free: net ? Net.complement(union, net.start, net.end) : [],
      used: net ? Net.total(Net.clip(union, net.start, net.end)) : 0,
    };
  }

  // ================================================================ view (zoom / pan)

  const PAD = 36;
  const viewport = $('#viewport');
  const lane = $('#lane');
  const geo = { W: 1, H: 1, laneTop: 80, laneH: 150, axisY: 300 };
  let view = { lo: 0, hi: 1 }, target = { lo: 0, hi: 1 }, raf = 0, instantTimer = 0;

  function measure() {
    const r = viewport.getBoundingClientRect();
    geo.W = Math.max(200, r.width);
    geo.H = Math.max(200, r.height);
    geo.laneH = clamp(Math.round(geo.H * 0.42), 100, 260);
    geo.laneTop = Math.max(74, Math.round((geo.H - geo.laneH - 110) / 2 - 10));
    geo.axisY = geo.laneTop + geo.laneH + 44;
    lane.style.top = `${geo.laneTop}px`;
    lane.style.height = `${geo.laneH}px`;
    for (const c of [$('#gridCanvas'), $('#minimapCanvas')]) {
      const rect = c.getBoundingClientRect();
      c.width = Math.round(rect.width * devicePixelRatio);
      c.height = Math.round(rect.height * devicePixelRatio);
    }
  }

  const pxOf = v => PAD + (v - view.lo) / (view.hi - view.lo) * (geo.W - 2 * PAD);
  const ipAt = x => view.lo + (x - PAD) / (geo.W - 2 * PAD) * (view.hi - view.lo);
  const addrPerPx = () => (view.hi - view.lo) / (geo.W - 2 * PAD);

  function clampView(lo, hi) {
    const net = D && D.net;
    if (!net) return { lo, hi };
    const span = clamp(hi - lo, Math.min(net.size, 16), net.size * 1.06);
    let center = (lo + hi) / 2;
    if (span >= net.size) {
      center = net.start + net.size / 2;
    } else {
      const margin = span * 0.06;
      center = clamp(center, net.start - margin + span / 2, net.end + 1 + margin - span / 2);
    }
    return { lo: center - span / 2, hi: center + span / 2 };
  }

  // Blocks follow the view instantly while it moves (no CSS transitions)
  function setInstant() {
    lane.classList.remove('animate');
    clearTimeout(instantTimer);
    instantTimer = setTimeout(() => lane.classList.add('animate'), 140);
  }

  function setView(lo, hi, animate = true) {
    target = clampView(lo, hi);
    if (!animate) {
      cancelAnimationFrame(raf);
      raf = 0;
      view = { ...target };
      setInstant();
      renderStage();
      return;
    }
    if (!raf) raf = requestAnimationFrame(stepView);
  }

  function stepView() {
    const k = 0.2;
    view.lo += (target.lo - view.lo) * k;
    view.hi += (target.hi - view.hi) * k;
    const eps = (target.hi - target.lo) * 0.0004;
    if (Math.abs(target.lo - view.lo) < eps && Math.abs(target.hi - view.hi) < eps) {
      view = { ...target };
      raf = 0;
    } else {
      raf = requestAnimationFrame(stepView);
    }
    setInstant();
    renderStage();
  }

  function fitView(animate = true) {
    const net = D.net;
    if (net) setView(net.start - net.size * 0.02, net.end + 1 + net.size * 0.02, animate);
  }

  function focusRange(start, end, animate = true) {
    const width = end - start + 1;
    const pad = Math.max(width * 0.7, 8);
    setView(start - pad, end + 1 + pad, animate);
  }

  function zoomBy(factor, anchor) {
    const { lo, hi } = target;
    const a = anchor ?? (lo + hi) / 2;
    setView(a - (a - lo) * factor, a + (hi - a) * factor);
  }

  function snapStep() {
    const net = D.net;
    if (!net) return 256;
    if (state.snap !== 'auto') return Math.min(net.size, 2 ** (32 - Number(state.snap)));
    const perPx = addrPerPx();
    let step = 1;
    while (step * 2 <= net.size && step / perPx < 14) step *= 2;
    return step;
  }
  const snapRound = v => D.net.start + Math.round((v - D.net.start) / snapStep()) * snapStep();
  const snapFloor = v => D.net.start + Math.floor((v - D.net.start) / snapStep()) * snapStep();
  const snapCeil = v => D.net.start + Math.ceil((v - D.net.start) / snapStep()) * snapStep();

  // ================================================================ stage rendering

  const layers = { free: $('#freeLayer'), blocks: $('#blockLayer'), overlap: $('#overlapLayer'), ghost: $('#ghostLayer') };

  function reconcile(layer, items, keyOf, create, update, remove) {
    const existing = new Map();
    for (const el of layer.children) if (!el.classList.contains('leaving')) existing.set(el.dataset.key, el);
    for (const item of items) {
      const key = keyOf(item);
      let el = existing.get(key);
      if (el) {
        existing.delete(key);
      } else {
        el = create(item);
        el.dataset.key = key;
        layer.appendChild(el);
      }
      update(el, item);
    }
    for (const [key, el] of existing) (remove ? remove(el, key) : el.remove());
  }

  function renderStage() {
    const net = D.net;
    $('#invalidState').classList.toggle('show', !net);
    $('#emptyState').classList.toggle('show', !!net && !D.groups.length);
    if (!net) {
      Object.values(layers).forEach(l => { l.innerHTML = ''; });
      $('#flagLayer').innerHTML = '';
      $('#badgeLayer').innerHTML = '';
      drawGrid();
      drawMinimap();
      return;
    }
    renderBlocks();
    renderFree();
    renderOverlaps();
    renderFlags();
    renderBadges();
    drawGrid();
    drawMinimap();
    updateZoomUi();
  }

  function segmentGeometry(iv) {
    let x1 = pxOf(iv[0]);
    let w = pxOf(iv[1] + 1) - x1;
    if (w < 2) {
      x1 += w / 2 - 1;
      w = 2;
    }
    return { x1, w };
  }

  function blockMeta(x, iv) {
    const cidrs = Net.toCidrs([iv]);
    return cidrs.length === 1 ? cidrs[0] : rangeText(iv[0], iv[1]);
  }

  function renderBlocks() {
    const items = [];
    for (const x of D.groups) {
      x.intervals.forEach((iv, si) => {
        const { x1, w } = segmentGeometry(iv);
        if (x1 + w < -60 || x1 > geo.W + 60) return;
        items.push({ x, iv, si, x1, w, first: si === 0, last: si === x.intervals.length - 1 });
      });
    }
    reconcile(layers.blocks, items, it => `${it.x.uid}:${it.si}`,
      it => {
        const el = document.createElement('div');
        if (born.has(it.x.uid)) el.classList.add('born');
        return el;
      },
      (el, it) => {
        const { x, iv, x1, w } = it;
        const layout = w < 10 ? 'l-none tiny' : w < 26 ? 'l-none' : w < 96 ? 'l-vert' : 'l-wide';
        const cls = ['block', layout];
        if (x.uid === state.selected) cls.push('selected');
        if (drag && drag.active && drag.uid === x.uid && drag.mode !== 'create') cls.push('dragging');
        if (born.has(x.uid)) cls.push('born');
        if (el.classList.contains('flash')) cls.push('flash');
        const className = cls.join(' ');
        if (el.className !== className) el.className = className;
        el.style.left = `${x1}px`;
        el.style.width = `${w}px`;
        el.style.setProperty('--c', x.color);
        el.style.setProperty('--fg', x.fg);
        el.style.setProperty('--r', `${Math.min(9, w / 2)}px`);
        el.dataset.uid = x.uid;

        let dividers = '';
        if (x.g.show_full && w >= 30) {
          const size = iv[1] - iv[0] + 1;
          for (const cidr of x.g.subnets || []) {
            try {
              const { start } = Net.parseCidr(cidr);
              if (start > iv[0] && start <= iv[1]) dividers += `<i class="divider" style="left:${((start - iv[0]) / size * 100).toFixed(3)}%"></i>`;
            } catch (e) { /* invalid entries are listed in warnings */ }
          }
        }
        const meta = blockMeta(x, iv) + (w > 200 ? ` · ${fmt(iv[1] - iv[0] + 1)} ${addrWord(iv[1] - iv[0] + 1)}` : '');
        const comment = (x.g.title || '').trim() ? (x.g.comment || '') : '';
        const sig = [layout, x.name, meta, comment, it.first, it.last, dividers].join('|');
        if (el.dataset.sig !== sig) {
          el.dataset.sig = sig;
          el.innerHTML = `${dividers}<div class="bl-inner"><div class="bl-title">${esc(x.name)}</div>` +
            `<div class="bl-meta">${esc(meta)}</div>${comment ? `<div class="bl-comment">${esc(comment)}</div>` : ''}</div>` +
            `${it.first ? '<div class="handle l"></div>' : ''}${it.last ? '<div class="handle r"></div>' : ''}`;
        }
      },
      (el) => {
        if (D.byUid.has(el.dataset.uid)) {
          el.remove();
        } else {
          el.classList.add('leaving');
          setTimeout(() => el.remove(), 300);
        }
      });
  }

  function renderFree() {
    const items = [];
    for (const iv of D.free) {
      const { x1, w } = segmentGeometry(iv);
      if (x1 + w < -60 || x1 > geo.W + 60 || w < 6) continue;
      items.push({ iv, x1, w });
    }
    reconcile(layers.free, items, it => `f${it.iv[0]}`,
      () => document.createElement('div'),
      (el, it) => {
        el.className = 'free';
        el.style.left = `${it.x1 + 2}px`;
        el.style.width = `${Math.max(2, it.w - 4)}px`;
        el.dataset.s = it.iv[0];
        el.dataset.e = it.iv[1];
        const count = it.iv[1] - it.iv[0] + 1;
        const label = it.w >= 84 ? `<span>Вільно<b>${esc(sizeText(count))}</b></span>` : '';
        if (el.dataset.sig !== label) {
          el.dataset.sig = label;
          el.innerHTML = label;
        }
      });
  }

  function renderOverlaps() {
    reconcile(layers.overlap, D.overlaps, iv => `o${iv[0]}-${iv[1]}`,
      () => document.createElement('div'),
      (el, iv) => {
        const { x1, w } = segmentGeometry(iv);
        el.className = 'overlap';
        el.style.left = `${x1}px`;
        el.style.width = `${Math.max(3, w)}px`;
      });
  }

  // Name tags above blocks too narrow to hold their own label
  function renderFlags() {
    const layer = $('#flagLayer');
    const flags = [];
    for (const x of D.groups) {
      let best = null;
      for (const iv of x.intervals) {
        const { x1, w } = segmentGeometry(iv);
        if (x1 + w < 0 || x1 > geo.W) continue;
        if (!best || w > best.w) best = { x1, w };
      }
      if (!best || best.w >= 26) continue;
      flags.push({ x, cx: best.x1 + best.w / 2, width: textWidth(x.name, `600 11.5px ${getComputedStyle(document.body).fontFamily}`) + 28 });
    }
    flags.sort((a, b) => a.cx - b.cx);
    const pos = spreadVar(flags.map(f => f.cx), flags.map(f => f.width), 6, 6, geo.W - 6);
    const top = geo.laneTop - 36;
    let html = '';
    flags.forEach((f, i) => {
      const x0 = pos[i], x1 = f.cx, y0 = top + 22, y1 = geo.laneTop;
      const len = Math.hypot(x1 - x0, y1 - y0), angle = Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI - 90;
      html += `<i class="flag-line" style="left:${x0}px;top:${y0}px;height:${len}px;transform-origin:0 0;transform:rotate(${angle}deg)"></i>`;
      html += `<div class="flag${f.x.uid === state.selected ? ' selected' : ''}" data-uid="${f.x.uid}" style="left:${x0}px;top:${top}px;--c:${f.x.color}"><span class="dot"></span>${esc(f.x.name)}</div>`;
    });
    if (layer.dataset.sig !== html) {
      layer.dataset.sig = html;
      layer.innerHTML = html;
    }
  }

  // Spread labels of given widths apart around their preferred centers
  function spreadVar(centers, widths, gap, lo, hi) {
    const place = items => {
      const off = [0];
      for (let k = 1; k < items.length; k++) off[k] = off[k - 1] + (widths[items[k - 1]] + widths[items[k]]) / 2 + gap;
      let start = items.reduce((sum, idx, k) => sum + centers[idx] - off[k], 0) / items.length;
      start = Math.min(Math.max(start, lo + widths[items[0]] / 2), hi - widths[items[items.length - 1]] / 2 - off[off.length - 1]);
      return off.map(o => start + o);
    };
    const clusters = [];
    centers.forEach((_, i) => {
      clusters.push([i]);
      while (clusters.length > 1) {
        const a = clusters[clusters.length - 2], b = clusters[clusters.length - 1];
        const pa = place(a), pb = place(b);
        const aEnd = pa[pa.length - 1] + widths[a[a.length - 1]] / 2;
        const bStart = pb[0] - widths[b[0]] / 2;
        if (bStart - aEnd >= gap) break;
        clusters.splice(-2, 2, a.concat(b));
      }
    });
    const out = [];
    for (const c of clusters) place(c).forEach((p, k) => { out[c[k]] = p; });
    return out;
  }

  // Start / end addresses of the selected group under its edges
  function renderBadges() {
    const layer = $('#badgeLayer');
    const x = D.byUid.get(state.selected);
    let html = '';
    if (x && x.intervals.length) {
      const top = geo.laneTop + geo.laneH + 12;
      const font = `11px ${getComputedStyle(document.body).getPropertyValue('--mono')}`;
      const a = pxOf(x.start), b = pxOf(x.end + 1);
      const ta = ip(x.start), tb = ip(x.end);
      const wa = textWidth(ta, font) + 16, wb = textWidth(tb, font) + 16;
      if (b - a < (wa + wb) / 2 + 8) {
        html = `<div class="badge" style="left:${(a + b) / 2}px;top:${top}px">${ta} – ${tb}</div>`;
      } else {
        html = `<div class="badge" style="left:${a}px;top:${top}px">${ta}</div><div class="badge" style="left:${b}px;top:${top}px">${tb}</div>`;
      }
    }
    if (layer.dataset.sig !== html) {
      layer.dataset.sig = html;
      layer.innerHTML = html;
    }
  }

  let themeColors = null;
  function colors() {
    if (!themeColors) {
      const cs = getComputedStyle(document.documentElement);
      const v = name => cs.getPropertyValue(name).trim();
      themeColors = { border: v('--border'), strong: v('--border-strong'), muted: v('--muted'), text: v('--text'), accent: v('--accent'), panel: v('--panel'), mono: v('--mono') };
    }
    return themeColors;
  }

  function drawGrid() {
    const canvas = $('#gridCanvas');
    const ctx = canvas.getContext('2d');
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, geo.W, geo.H);
    const net = D.net;
    if (!net) return;
    const c = colors();
    const top = geo.laneTop, bottom = geo.laneTop + geo.laneH, axis = geo.axisY;
    const xs = pxOf(net.start), xe = pxOf(net.end + 1);

    // outside the network
    ctx.save();
    ctx.fillStyle = c.border;
    ctx.globalAlpha = 0.3;
    if (xs > 0) ctx.fillRect(0, top - 18, xs, axis - top + 24);
    if (xe < geo.W) ctx.fillRect(xe, top - 18, geo.W - xe, axis - top + 24);
    ctx.restore();

    // snap grid inside the lane
    const perPx = addrPerPx();
    const step = snapStep();
    if (step / perPx >= 6) {
      ctx.strokeStyle = c.strong;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const first = Math.max(net.start, snapCeil(view.lo));
      for (let v = first, n = 0; v <= Math.min(net.end + 1, view.hi) && n < 1500; v += step, n++) {
        const x = Math.round(pxOf(v)) + 0.5;
        ctx.moveTo(x, top - 6);
        ctx.lineTo(x, bottom + 6);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // axis
    ctx.strokeStyle = c.strong;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.max(0, xs), axis + 0.5);
    ctx.lineTo(Math.min(geo.W, xe), axis + 0.5);
    ctx.stroke();

    let major = 1;
    while (major * 2 <= net.size && major / perPx < 130) major *= 2;
    const fixedOctets = Math.floor(net.prefix / 8);
    ctx.font = `11px ${c.mono}`;
    ctx.textBaseline = 'top';
    let lastLabelEnd = -Infinity;
    const label = (value, x, align) => {
      const parts = ip(value).split('.');
      const head = parts.slice(0, fixedOctets).join('.') + (fixedOctets ? '.' : '');
      const tail = parts.slice(fixedOctets).join('.');
      const wh = ctx.measureText(head).width, wt = ctx.measureText(tail).width;
      let x0 = align === 'right' ? x - wh - wt : x - (wh + wt) / 2;
      if (x0 < lastLabelEnd + 10) return;
      ctx.fillStyle = c.muted;
      ctx.fillText(head, x0, axis + 12);
      ctx.fillStyle = c.text;
      ctx.fillText(tail, x0 + wh, axis + 12);
      lastLabelEnd = x0 + wh + wt;
    };
    const firstMajor = net.start + Math.ceil((Math.max(view.lo, net.start) - net.start) / major) * major;
    for (let v = firstMajor, n = 0; v <= Math.min(net.end, view.hi) && n < 400; v += major, n++) {
      const x = Math.round(pxOf(v)) + 0.5;
      ctx.strokeStyle = c.strong;
      ctx.beginPath();
      ctx.moveTo(x, axis);
      ctx.lineTo(x, axis + 7);
      ctx.stroke();
      label(v, x, 'center');
    }
    if (xe >= 0 && xe <= geo.W) {
      ctx.beginPath();
      ctx.moveTo(xe - 0.5, axis);
      ctx.lineTo(xe - 0.5, axis + 7);
      ctx.stroke();
      label(net.end, xe, 'right');
    }

    // network edges
    ctx.strokeStyle = c.muted;
    ctx.setLineDash([3, 3]);
    for (const x of [xs, xe]) {
      if (x < 0 || x > geo.W) continue;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, top - 18);
      ctx.lineTo(Math.round(x) + 0.5, axis);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  function drawMinimap() {
    const canvas = $('#minimapCanvas');
    const ctx = canvas.getContext('2d');
    const W = canvas.width / devicePixelRatio, H = canvas.height / devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const net = D.net;
    const win = $('#minimapWindow');
    if (!net) {
      win.style.display = 'none';
      return;
    }
    win.style.display = '';
    const x = v => 4 + (v - net.start) / net.size * (W - 8);
    for (const g of D.groups) {
      ctx.fillStyle = g.color;
      ctx.globalAlpha = g.uid === state.selected ? 1 : 0.85;
      for (const [s, e] of g.intervals) ctx.fillRect(x(s), 8, Math.max(1.5, x(e + 1) - x(s)), H - 16);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#e5484d';
    for (const [s, e] of D.overlaps) ctx.fillRect(x(s), 4, Math.max(2, x(e + 1) - x(s)), 3);
    const l = clamp(x(view.lo), 1, W - 7), r = clamp(x(view.hi), l + 6, W - 1);
    win.style.left = `${l}px`;
    win.style.width = `${r - l}px`;
  }

  function updateZoomUi() {
    const net = D.net;
    const z = net.size / (view.hi - view.lo);
    $('#zoomLabel').textContent = `×${z < 10 ? (Math.round(z * 10) / 10).toString().replace('.', ',') : fmt(z)}`;
    const opt = $('#snapSelect option[value="auto"]');
    const autoText = `Авто (/${32 - Math.log2(state.snap === 'auto' ? snapStep() : 1)})`;
    if (opt && state.snap === 'auto' && opt.textContent !== autoText) opt.textContent = autoText;
  }

  // ================================================================ stage interaction

  let drag = null;
  let autoPanRaf = 0;
  const tooltip = $('#tooltip');

  function showTip(html, clientX, clientY) {
    tooltip.innerHTML = html;
    tooltip.classList.add('show');
    const w = tooltip.offsetWidth, h = tooltip.offsetHeight;
    let left = clientX + 16, top = clientY + 18;
    if (left + w > innerWidth - 8) left = clientX - w - 12;
    if (top + h > innerHeight - 8) top = clientY - h - 12;
    tooltip.style.transform = 'none';
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }
  const hideTip = () => tooltip.classList.remove('show');

  function groupTip(x) {
    const cidrs = Net.toCidrs(x.intervals);
    const list = cidrs.slice(0, 5).join('<br>') + (cidrs.length > 5 ? `<br>… ще ${cidrs.length - 5}` : '');
    const tiny = x.intervals.some(iv => segmentGeometry(iv).w < 16)
      ? '<div class="tt-muted" style="margin-top:4px">Наблизьте колесом миші, щоб змінити розмір, або Shift/Ctrl + ←/→</div>' : '';
    return `<div class="tt-title">${esc(x.name)}</div>` +
      (x.intervals.length ? `<div class="tt-mono">${fullRange(x.start, x.end)}</div><div class="tt-muted">${fmt(x.total)} ${addrWord(x.total)}</div><div class="tt-mono" style="margin-top:4px">${list}</div>` : '') +
      (x.g.comment ? `<div class="tt-muted" style="margin-top:4px;white-space:pre-line">${esc(x.g.comment)}</div>` : '') + tiny;
  }

  function localX(e) { return e.clientX - viewport.getBoundingClientRect().left; }
  function localY(e) { return e.clientY - viewport.getBoundingClientRect().top; }

  viewport.addEventListener('pointerdown', e => {
    if (!D.net || e.target.closest('.empty-state .btn')) return;
    if (e.button !== 0 && e.button !== 1) return;
    hideTip();
    const handle = e.target.closest('.handle');
    const hit = e.target.closest('.block, .flag');
    const x = localX(e), y = localY(e);
    let mode;
    if (e.button === 1) mode = 'pan';
    else if (handle) mode = handle.classList.contains('l') ? 'left' : 'right';
    else if (hit) mode = 'move';
    else if (y > geo.laneTop + geo.laneH + 26) mode = 'pan';
    else mode = 'create';

    const uid = hit ? hit.dataset.uid : null;
    const x0 = D.byUid.get(uid);
    drag = {
      mode, uid, active: mode === 'pan', startX: e.clientX, startY: e.clientY, lastX: e.clientX,
      ip0: ipAt(x), view0: { ...view },
      orig: x0 ? x0.intervals.map(iv => [...iv]) : null,
      origSubnets: x0 ? [...x0.g.subnets] : null,
    };
    if (uid && uid !== state.selected) select(uid);
    if (mode === 'pan') viewport.classList.add('panning');
    viewport.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  viewport.addEventListener('pointermove', e => {
    if (!drag) return hover(e);
    drag.lastX = e.clientX;
    if (!drag.active) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 4) return;
      drag.active = true;
      if (drag.orig) checkpoint();
      if (drag.mode !== 'pan') startAutoPan();
    }
    updateDrag(e.clientX, e.clientY);
  });

  viewport.addEventListener('pointerup', e => endDrag(e, false));
  viewport.addEventListener('pointercancel', e => endDrag(e, true));
  viewport.addEventListener('pointerleave', () => { if (!drag) { hideTip(); setHint(); } });

  function updateDrag(clientX, clientY) {
    const d = drag;
    const x = clientX - viewport.getBoundingClientRect().left;
    const net = D.net;
    const cursor = ipAt(x);

    if (d.mode === 'pan') {
      const dx = clientX - d.startX;
      const shift = dx * (d.view0.hi - d.view0.lo) / (geo.W - 2 * PAD);
      setView(d.view0.lo - shift, d.view0.hi - shift, false);
      return;
    }

    if (d.mode === 'create') {
      const step = snapStep();
      let a = snapFloor(Math.min(d.ip0, cursor)), b = snapCeil(Math.max(d.ip0, cursor));
      if (b - a < step) b = a + step;
      a = Math.max(a, net.start);
      b = Math.min(b, net.end + 1);
      d.range = [a, b - 1];
      const { x1, w } = segmentGeometry(d.range);
      const count = b - a;
      const cidrs = Net.toCidrs([d.range]);
      layers.ghost.innerHTML = `<div class="create-ghost" style="left:${x1}px;width:${w}px">${w > 120 ? 'Нова група · ' : ''}${w > 60 ? esc(cidrs.length === 1 ? cidrs[0] : sizeText(count)) : ''}</div>`;
      showTip(`<div class="tt-title">Нова група</div><div class="tt-mono">${fullRange(a, b - 1)}</div><div class="tt-muted">${fmt(count)} ${addrWord(count)} · ${cidrs.length === 1 ? cidrs[0] : cidrs.length + ' CIDR'}</div>`, clientX, clientY);
      return;
    }

    const g = group(d.uid);
    if (!g || !d.orig || !d.orig.length) return;
    const start = d.orig[0][0], end = d.orig[d.orig.length - 1][1];
    const step = snapStep();
    let intervals;
    if (d.mode === 'move') {
      let newStart = snapRound(start + cursor - d.ip0);
      newStart = clamp(newStart, net.start, net.end + 1 - (end - start + 1));
      intervals = Net.shift(d.orig, newStart - start);
    } else if (d.mode === 'right') {
      let endEx = Math.max(snapRound(cursor), start + Math.min(step, end - start + 1));
      endEx = Math.min(endEx, net.end + 1);
      intervals = endEx - 1 > end ? Net.merge([...d.orig, [end + 1, endEx - 1]]) : Net.clip(d.orig, start, endEx - 1);
    } else {
      let newStart = Math.min(snapRound(cursor), end + 1 - Math.min(step, end - start + 1));
      newStart = Math.max(newStart, net.start);
      intervals = newStart < start ? Net.merge([[newStart, start - 1], ...d.orig]) : Net.clip(d.orig, newStart, end);
    }
    const same = JSON.stringify(intervals) === JSON.stringify(d.orig);
    const subnets = same ? d.origSubnets : Net.toCidrs(intervals);
    if (JSON.stringify(subnets) !== JSON.stringify(g.subnets)) {
      g.subnets = subnets;
      changed({ light: true });
    } else {
      renderStage();
    }
    const a = intervals[0][0], b = intervals[intervals.length - 1][1];
    const cidrs = Net.toCidrs(intervals);
    showTip(`<div class="tt-title">${d.mode === 'move' ? 'Переміщення' : 'Зміна розміру'}</div><div class="tt-mono">${fullRange(a, b)}</div>` +
      `<div class="tt-muted">${fmt(Net.total(intervals))} ${addrWord(Net.total(intervals))} · крок /${32 - Math.log2(step)}</div>` +
      `<div class="tt-mono" style="margin-top:4px">${cidrs.slice(0, 4).join('<br>')}${cidrs.length > 4 ? `<br>… ще ${cidrs.length - 4}` : ''}</div>`, clientX, clientY);
  }

  // Scroll the view while dragging near the left/right edge
  function startAutoPan() {
    cancelAnimationFrame(autoPanRaf);
    const tick = () => {
      if (!drag || !drag.active || drag.mode === 'pan') return;
      const r = viewport.getBoundingClientRect();
      const edge = 48;
      const x = drag.lastX - r.left;
      let speed = 0;
      if (x < edge) speed = -(edge - x) / edge;
      else if (x > r.width - edge) speed = (x - (r.width - edge)) / edge;
      if (speed) {
        const shift = speed * (view.hi - view.lo) * 0.012;
        const before = view.lo;
        setView(view.lo + shift, view.hi + shift, false);
        if (view.lo !== before) updateDrag(drag.lastX, drag.startY);
      }
      autoPanRaf = requestAnimationFrame(tick);
    };
    autoPanRaf = requestAnimationFrame(tick);
  }

  function endDrag(e, cancelled) {
    const d = drag;
    if (!d) return;
    drag = null;
    cancelAnimationFrame(autoPanRaf);
    viewport.classList.remove('panning');
    layers.ghost.innerHTML = '';
    hideTip();
    if (!d.active) {
      if (d.mode === 'create') select(null);
      renderStage();
      return;
    }
    if (d.mode === 'create') {
      if (!cancelled && d.range) createGroup([d.range]);
      return;
    }
    if (d.orig) {
      const g = group(d.uid);
      if (cancelled && g) {
        g.subnets = d.origSubnets;
        history.undo.pop();
        changed();
      } else if (g && JSON.stringify(g.subnets) === JSON.stringify(d.origSubnets)) {
        history.undo.pop();  // nothing changed
      }
    }
    changed();
  }

  function hover(e) {
    const handle = e.target.closest('.handle');
    const hit = e.target.closest('.block, .flag');
    const free = e.target.closest('.free');
    const y = localY(e);
    const inAxis = y > geo.laneTop + geo.laneH + 26;
    viewport.style.cursor = handle ? 'ew-resize' : hit ? 'grab' : inAxis ? 'grab' : 'crosshair';
    if (!D.net) return;
    const v = clamp(Math.floor(ipAt(localX(e))), 0, Net.MAX - 1);
    setHint(`<span class="mono">${ip(v)}</span>`);
    if (hit) {
      const x = D.byUid.get(hit.dataset.uid);
      if (x) return showTip(groupTip(x), e.clientX, e.clientY);
    }
    if (free) {
      const s = Number(free.dataset.s), en = Number(free.dataset.e), count = en - s + 1;
      const cidrs = Net.toCidrs([[s, en]]);
      return showTip(`<div class="tt-title">Вільно</div><div class="tt-mono">${fullRange(s, en)}</div><div class="tt-muted">${fmt(count)} ${addrWord(count)} · ${cidrs.length === 1 ? cidrs[0] : cidrs.length + ' блоків CIDR'}</div><div class="tt-muted" style="margin-top:4px">Потягніть тут, щоб створити групу</div>`, e.clientX, e.clientY);
    }
    hideTip();
  }

  viewport.addEventListener('dblclick', e => {
    if (!D.net || e.target.closest('.block, .flag') || localY(e) > geo.laneTop + geo.laneH + 26) return;
    const a = Math.max(snapFloor(ipAt(localX(e))), D.net.start);
    createGroup([[a, Math.min(a + snapStep(), D.net.end + 1) - 1]]);
  });

  viewport.addEventListener('wheel', e => {
    if (!D.net) return;
    e.preventDefault();
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      const delta = (e.shiftKey ? e.deltaY : e.deltaX) * (target.hi - target.lo) / geo.W;
      setView(target.lo + delta, target.hi + delta);
      return;
    }
    zoomBy(Math.exp(e.deltaY * 0.0016), ipAt(localX(e)));
  }, { passive: false });

  // --- minimap
  (() => {
    const mm = $('#minimap');
    let dragging = null;
    const ipAtMini = clientX => {
      const r = mm.getBoundingClientRect();
      return D.net.start + (clientX - r.left - 4) / (r.width - 8) * D.net.size;
    };
    mm.addEventListener('pointerdown', e => {
      if (!D.net) return;
      const span = view.hi - view.lo;
      if (e.target.id === 'minimapWindow') {
        dragging = { offset: ipAtMini(e.clientX) - view.lo };
      } else {
        const c = ipAtMini(e.clientX);
        setView(c - span / 2, c + span / 2);
        dragging = { offset: span / 2 };
      }
      mm.setPointerCapture(e.pointerId);
    });
    mm.addEventListener('pointermove', e => {
      if (!dragging) return;
      const span = target.hi - target.lo;
      const lo = ipAtMini(e.clientX) - dragging.offset;
      setView(lo, lo + span, false);
    });
    mm.addEventListener('pointerup', () => { dragging = null; });
  })();

  function setHint(html) {
    const hint = $('#stageHint');
    if (html) {
      hint.innerHTML = html;
      return;
    }
    hint.innerHTML = state.selected
      ? '<kbd>←</kbd><kbd>→</kbd> зсунути · <kbd>Shift</kbd> правий край · <kbd>Ctrl</kbd> лівий край · <kbd>Del</kbd> видалити'
      : 'Колесо — масштаб · тягніть по порожньому — нова група · тягніть шкалу — прокрутка';
  }

  // ================================================================ document operations

  function changed({ light = false } = {}) {
    derive();
    renderStage();
    renderList();
    renderInspector();
    renderWarnings();
    if (!light) renderDocFields();
    updateDirty();
    updateUndoButtons();
    schedulePreview();
  }

  function updateDirty() {
    const dirty = isDirty();
    $('#dirtyDot').classList.toggle('on', dirty);
    $('#docName').textContent = state.path ? basename(state.path) : 'Без назви';
    const title = `${dirty ? '• ' : ''}${state.path ? basename(state.path) : 'Без назви'} — Subnet Editor`;
    if (document.title !== title) {
      document.title = title;
      api.set_title(title);
    }
    if (dirty !== lastDirty) {
      lastDirty = dirty;
      api.set_dirty(dirty);
    }
  }

  function updateUndoButtons() {
    $('[data-action="undo"]').disabled = !history.undo.length;
    $('[data-action="redo"]').disabled = !history.redo.length;
  }

  function select(uid, { reveal = false } = {}) {
    state.selected = uid;
    renderStage();
    renderList();
    renderInspector();
    setHint();
    if (uid && reveal) revealGroup(uid);
  }

  function revealGroup(uid, flash = true) {
    const x = D.byUid.get(uid);
    if (!x || !x.intervals.length) return;
    // Pan to the group; zoom in only as much as needed to make it comfortably wide
    const width = x.end - x.start + 1;
    const inView = x.start >= view.lo && x.end + 1 <= view.hi;
    const px = segmentGeometry([x.start, x.end]).w;
    const visible = inView && px > 24;
    if (!visible) {
      const span = Math.min(view.hi - view.lo, px > 24 ? Infinity : width * (geo.W - 2 * PAD) / 140);
      const center = x.start + width / 2;
      setView(center - span / 2, center + span / 2);
    }
    if (flash) {
      setTimeout(() => {
        for (const el of $$(`.block[data-uid="${uid}"]`, layers.blocks)) {
          el.classList.remove('flash');
          void el.offsetWidth;
          el.classList.add('flash');
          setTimeout(() => el.classList.remove('flash'), 900);
        }
      }, visible ? 0 : 280);
    }
  }

  function nextColor() {
    const used = new Set(state.doc.subnet_groups.map(g => g.color));
    return Object.keys(COLORS).find(c => !used.has(c)) || null;
  }

  function createGroup(intervals, props = {}) {
    checkpoint();
    const g = { title: 'Нова група', comment: '', show_full: false, ...props, subnets: Net.toCidrs(intervals), _uid: newUid() };
    if (!('color' in props)) {
      const color = nextColor();
      if (color) g.color = color;
    }
    state.doc.subnet_groups.push(g);
    born.add(g._uid);
    setTimeout(() => born.delete(g._uid), 600);
    state.selected = g._uid;
    changed();
    revealGroup(g._uid, false);
    setTimeout(() => { const t = $('#gTitle'); if (t) { t.focus(); t.select(); } }, 60);
  }

  // First free aligned slot of `size` addresses, searching from `from`
  function findFree(size, from) {
    const net = D.net;
    const align = Net.sizeLabel(size) ? size : snapStep();
    const slots = D.free.flatMap(([s, e]) => {
      const a = net.start + Math.ceil((s - net.start) / align) * align;
      return a + size - 1 <= e ? [a] : [];
    });
    return slots.find(a => a >= (from ?? net.start)) ?? slots[0] ?? null;
  }

  function addGroup() {
    if (!D.net) return;
    const step = Math.min(snapStep(), D.net.size);
    const start = findFree(step) ?? D.net.start;
    createGroup([[start, start + step - 1]]);
  }

  function duplicateGroup() {
    const x = D.byUid.get(state.selected);
    if (!x) return;
    checkpoint();
    const copy = JSON.parse(JSON.stringify(x.g));
    copy._uid = newUid();
    if (x.intervals.length === 1) {
      const size = x.total;
      const at = findFree(size, x.end + 1);
      if (at != null) copy.subnets = Net.toCidrs([[at, at + size - 1]]);
    }
    state.doc.subnet_groups.splice(x.index + 1, 0, copy);
    born.add(copy._uid);
    setTimeout(() => born.delete(copy._uid), 600);
    state.selected = copy._uid;
    changed();
    revealGroup(copy._uid);
    toast(`Створено копію «${x.name}»`);
  }

  function deleteGroup(uid = state.selected) {
    const x = D.byUid.get(uid);
    if (!x) return;
    checkpoint();
    state.doc.subnet_groups.splice(x.index, 1);
    if (state.selected === uid) state.selected = null;
    changed();
    setHint();
    toast(`Групу «${x.name}» видалено`, { action: undo, actionLabel: 'Скасувати', icon: 'trash' });
  }

  function nudge(direction, edge) {
    const x = D.byUid.get(state.selected);
    const net = D.net;
    if (!x || !net || !x.intervals.length) return;
    const step = snapStep();
    let ivs = x.intervals, { start, end } = x;
    if (edge === 'right') {
      const newEnd = end + direction * step;
      if (newEnd > net.end || newEnd < start) return;
      ivs = direction > 0 ? Net.merge([...ivs, [end + 1, newEnd]]) : Net.clip(ivs, start, newEnd);
    } else if (edge === 'left') {
      const newStart = start + direction * step;
      if (newStart < net.start || newStart > end) return;
      ivs = direction < 0 ? Net.merge([[newStart, start - 1], ...ivs]) : Net.clip(ivs, newStart, end);
    } else {
      const delta = clamp(direction * step, net.start - start, net.end - end);
      if (!delta) return;
      ivs = Net.shift(ivs, delta);
    }
    checkpoint(`nudge:${x.uid}:${edge || 'move'}`);
    x.g.subnets = Net.toCidrs(ivs);
    changed();
    revealGroup(x.uid, false);
  }

  function setGroupRange(uid, start, end) {
    const g = group(uid);
    checkpoint();
    g.subnets = Net.toCidrs([[start, end]]);
    changed();
    revealGroup(uid, false);
  }

  // ================================================================ sidebar

  function renderDocFields() {
    const main = $('#mainInput'), title = $('#titleInput');
    if (document.activeElement !== main) main.value = state.doc.main_subnet;
    if (document.activeElement !== title) title.value = state.doc.map_title;
    validateMain();
  }

  function validateMain() {
    const main = $('#mainInput'), hint = $('#mainHint');
    try {
      const n = Net.parseNetwork(main.value);
      main.classList.remove('invalid');
      hint.classList.remove('error');
      hint.textContent = `${fmt(n.size)} ${addrWord(n.size)} · ${ip(n.start)} – ${ip(n.end)}`;
      $('#titleInput').placeholder = `${ip(n.start)}/${n.prefix}`;
      return n;
    } catch (e) {
      main.classList.add('invalid');
      hint.classList.add('error');
      hint.textContent = e.message;
      return null;
    }
  }

  $('#mainInput').addEventListener('input', e => {
    const n = validateMain();
    if (!n || e.target.value.trim() === state.doc.main_subnet) return;
    const netChanged = !D.net || D.net.start !== n.start || D.net.size !== n.size;
    checkpoint('main');
    state.doc.main_subnet = e.target.value.trim();
    changed({ light: true });
    rebuildSnapOptions();
    if (netChanged) fitView(true);
  });
  $('#mainInput').addEventListener('blur', () => renderDocFields());
  $('#titleInput').addEventListener('input', e => {
    checkpoint('title');
    state.doc.map_title = e.target.value;
    changed({ light: true });
  });

  function renderUsage() {
    const net = D.net;
    const pct = net ? D.used / net.size * 100 : 0;
    $('#usageFill').style.width = `${pct}%`;
    $('#usageUsed').textContent = net ? `Зайнято ${pct < 1 && pct > 0 ? '<1' : Math.round(pct)}%` : '';
    const free = net ? net.size - D.used : 0;
    $('#usageFree').textContent = net ? `Вільно ${fmt(free)} ${addrWord(free)}` : '';
  }

  function renderList() {
    renderUsage();
    const list = $('#groupList');
    $('#groupCount').textContent = D.groups.length || '';
    const before = new Map([...list.children].map(el => [el.dataset.key, el.getBoundingClientRect().top]));
    const warnUids = new Set(D.warnings.map(w => w.uid));

    reconcile(list, D.groups, x => x.uid,
      x => {
        const el = document.createElement('div');
        if (born.has(x.uid)) el.classList.add('enter');
        el.addEventListener('pointerdown', onCardPointerDown);
        return el;
      },
      (el, x) => {
        el.className = `gcard${x.uid === state.selected ? ' selected' : ''}${el.classList.contains('dragging') ? ' dragging' : ''}${el.classList.contains('enter') ? ' enter' : ''}`;
        el.dataset.uid = x.uid;
        el.style.setProperty('--c', x.color);
        const range = x.intervals.length ? rangeText(x.start, x.end) : 'немає підмереж';
        const size = x.intervals.length ? (Net.sizeLabel(x.total) || fmt(x.total)) : '—';
        const sig = [x.name, range, size, warnUids.has(x.uid)].join('|');
        if (el.dataset.sig !== sig) {
          el.dataset.sig = sig;
          el.innerHTML = `<span class="dot"></span><div class="gcard-body"><div class="gname">${esc(x.name)}</div><div class="grange">${esc(range)}</div></div>` +
            `<span class="gsize">${esc(size)}</span>${warnUids.has(x.uid) ? '<i class="gwarn" title="Є попередження"></i>' : ''}`;
        }
      });

    // keep DOM order equal to the document order
    D.groups.forEach((x, i) => {
      const el = list.querySelector(`[data-key="${x.uid}"]`);
      if (list.children[i] !== el) list.insertBefore(el, list.children[i]);
    });

    // FLIP: animate cards that moved
    for (const el of list.children) {
      const old = before.get(el.dataset.key);
      if (old == null || el.classList.contains('dragging')) continue;
      const dy = old - el.getBoundingClientRect().top;
      if (!dy) continue;
      el.style.transition = 'none';
      el.style.transform = `translateY(${dy}px)`;
      requestAnimationFrame(() => {
        el.style.transition = 'transform .28s var(--ease)';
        el.style.transform = '';
      });
    }
  }

  let cardDrag = null;
  function onCardPointerDown(e) {
    if (e.button !== 0) return;
    const card = e.currentTarget;
    const uid = card.dataset.uid;
    const rect = card.getBoundingClientRect();
    cardDrag = { uid, card, startY: e.clientY, grab: e.clientY - rect.top, active: false, moved: false };
    // window-level listeners: reordering moves the card in the DOM, which would drop pointer capture
    window.addEventListener('pointermove', onCardMove);
    window.addEventListener('pointerup', onCardUp, { once: true });
    window.addEventListener('pointercancel', onCardUp, { once: true });
    if (uid !== state.selected) select(uid, { reveal: true });
    else revealGroup(uid);
  }

  function onCardMove(e) {
    const d = cardDrag;
    if (!d) return;
    if (!d.active) {
      if (Math.abs(e.clientY - d.startY) < 5) return;
      d.active = true;
      d.card.classList.add('dragging');
    }
    const list = $('#groupList');
    const listTop = list.getBoundingClientRect().top - list.scrollTop;
    // which slot is the pointer over?
    const cards = [...list.children];
    let index = cards.length - 1;
    for (let i = 0; i < cards.length; i++) {
      const mid = listTop + cards[i].offsetTop + cards[i].offsetHeight / 2;
      if (e.clientY < mid) { index = i; break; }
    }
    const from = state.doc.subnet_groups.findIndex(g => g._uid === d.uid);
    if (index !== from) {
      if (!d.moved) checkpoint();
      d.moved = true;
      const [g] = state.doc.subnet_groups.splice(from, 1);
      state.doc.subnet_groups.splice(index, 0, g);
      changed({ light: true });
    }
    d.card.style.transition = 'none';
    d.card.style.transform = `translateY(${e.clientY - d.grab - (listTop + d.card.offsetTop)}px)`;
  }

  function onCardUp() {
    const d = cardDrag;
    cardDrag = null;
    if (!d) return;
    window.removeEventListener('pointermove', onCardMove);
    window.removeEventListener('pointerup', onCardUp);
    window.removeEventListener('pointercancel', onCardUp);
    d.card.classList.remove('dragging');
    d.card.style.transition = 'transform .25s var(--ease)';
    d.card.style.transform = '';
  }

  // ================================================================ inspector

  const insp = $('#inspector');
  let inspUid = undefined;

  function renderInspector() {
    const x = D.byUid.get(state.selected);
    const uid = x ? x.uid : null;
    if (uid !== inspUid) {
      inspUid = uid;
      insp.innerHTML = x ? inspectorGroupHtml() : inspectorEmptyHtml();
      hydrateIcons(insp);
      if (x) bindInspector();
    }
    if (x) patchInspector(x);
  }

  function inspectorEmptyHtml() {
    return `<div class="insp">
      <div class="empty-insp"><div class="circle">${icon('pointer')}</div><h3>Нічого не вибрано</h3><div>Клікніть блок на шкалі або групу в списку</div></div>
      <div class="tips">
        <div class="tip"><div class="ic">${icon('plus')}</div><div><b>Створити групу</b><span>Потягніть мишею по порожньому місцю шкали або двічі клікніть по ньому</span></div></div>
        <div class="tip"><div class="ic">${icon('move')}</div><div><b>Перемістити та змінити розмір</b><span>Тягніть блок або ручки на його краях. Межі прилипають до сітки кроку</span></div></div>
        <div class="tip"><div class="ic">${icon('mouse')}</div><div><b>Масштаб</b><span>Колесо миші — наблизити до курсора. Тягніть шкалу з адресами, щоб прокрутити</span></div></div>
        <div class="tip"><div class="ic">${icon('printer')}</div><div><b>Друк</b><span>Вкладка «Друк» показує точний вигляд експорту в PNG/PDF</span></div></div>
      </div>
    </div>`;
  }

  function inspectorGroupHtml() {
    const swatches = Object.entries(COLORS).map(([name, hex]) =>
      `<button class="swatch" data-color="${esc(name)}" style="--c:${hex}" data-tip="${esc(name)}"></button>`).join('');
    const net = D.net;
    const sizes = net ? Array.from({ length: 33 - net.prefix }, (_, k) => net.prefix + k)
      .map(p => `<option value="${p}">/${p} · ${fmt(2 ** (32 - p))}</option>`).join('') : '';
    return `<div class="insp">
      <div class="insp-head">
        <div class="swatch-big" id="gSwatch"></div>
        <div style="min-width:0"><h2 id="gHeadName"></h2><div class="sub" id="gHeadRange"></div></div>
        <div class="actions">
          <button class="btn ghost icon" data-action="duplicate" data-tip="Дублювати · Ctrl+D"><i data-icon="copy"></i></button>
          <button class="btn ghost icon danger" data-action="delete" data-tip="Видалити · Delete"><i data-icon="trash"></i></button>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Назва</div>
        <input id="gTitle" class="input" spellcheck="false" placeholder="Без назви — буде показано коментар">
      </div>
      <div class="section">
        <div class="section-title">Коментар <span style="text-transform:none;font-weight:400">над блоком на друці</span></div>
        <textarea id="gComment" class="input" rows="2" spellcheck="false"></textarea>
      </div>
      <div class="section">
        <div class="section-title">Колір</div>
        <div class="swatches" id="gSwatches">
          <button class="swatch auto" data-color="" data-tip="Авто — за порядком групи"></button>
          ${swatches}
          <label class="swatch custom" data-tip="Свій колір">${icon('plus')}<input type="color" id="gCustomColor"></label>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Діапазон</div>
        <div class="row2">
          <label>Початок<input id="gStart" class="input mono" spellcheck="false"></label>
          <label>Кінець<input id="gEnd" class="input mono" spellcheck="false"></label>
        </div>
        <label class="row2" style="align-items:center"><span style="color:var(--muted);font-size:11.5px">Розмір одним блоком</span><select id="gSize" class="select mono"><option value="">—</option>${sizes}</select></label>
        <div id="gRangeNote" class="note"></div>
      </div>

      <div class="stats">
        <div class="stat"><b id="gAddr"></b><span id="gAddrWord">адрес</span></div>
        <div class="stat"><b id="gCidrCount"></b><span>блоків CIDR</span></div>
      </div>

      <div class="section">
        <div class="section-title">Підмережі
          <button class="btn ghost small" data-action="normalize" data-tip="Звести до мінімального набору вирівняних CIDR (прибрати вкладені, об'єднати сусідні)"><i data-icon="wand"></i>Нормалізувати</button>
        </div>
        <div class="chips" id="gChips"></div>
        <div class="chip-add">
          <input id="gAdd" class="input mono" spellcheck="false" placeholder="10.0.0.0/24 — Enter, щоб додати">
          <button class="btn soft small" data-action="add-subnet">${icon('plus')}</button>
        </div>
        <div id="gAddErr" class="note error"></div>
      </div>

      <label class="toggle">
        <input type="checkbox" id="gFull"><span class="track"></span>
        <span class="t-text">Кожна підмережа окремим блоком<br><span class="note">на друці; у редакторі — пунктирні межі</span></span>
      </label>
    </div>`;
  }

  function bindInspector() {
    const uid = () => state.selected;
    $('#gTitle').addEventListener('input', e => {
      checkpoint(`title:${uid()}`);
      group(uid()).title = e.target.value;
      changed({ light: true });
    });
    $('#gTitle').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
    const comment = $('#gComment');
    comment.addEventListener('input', e => {
      autoGrow(e.target);
      checkpoint(`comment:${uid()}`);
      group(uid()).comment = e.target.value;
      changed({ light: true });
    });
    $('#gSwatches').addEventListener('click', e => {
      const sw = e.target.closest('.swatch[data-color]');
      if (!sw) return;
      setColor(sw.dataset.color || null);
    });
    $('#gCustomColor').addEventListener('input', e => setColor(e.target.value, true));
    $('#gFull').addEventListener('change', e => {
      checkpoint();
      group(uid()).show_full = e.target.checked;
      changed();
    });

    const commitRange = () => {
      const s = $('#gStart'), en = $('#gEnd');
      let a, b;
      try { a = Net.ipToInt(s.value); } catch (err) { return fail(s, `Початок: ${err.message}`); }
      try { b = Net.ipToInt(en.value); } catch (err) { return fail(en, `Кінець: ${err.message}`); }
      if (b < a) return fail(en, 'Кінець менший за початок');
      const x = D.byUid.get(uid());
      if (x && x.intervals.length === 1 && x.start === a && x.end === b) return;
      setGroupRange(uid(), a, b);
    };
    for (const id of ['gStart', 'gEnd']) {
      const input = $(`#${id}`);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { commitRange(); input.blur(); } });
      input.addEventListener('change', commitRange);
      input.addEventListener('input', () => { input.classList.remove('invalid'); $('#gRangeNote').className = 'note'; patchRangeNote(); });
    }
    $('#gSize').addEventListener('change', e => {
      const p = Number(e.target.value);
      const x = D.byUid.get(uid());
      if (!e.target.value || !x) return;
      const size = 2 ** (32 - p);
      let a = Math.floor((x.start ?? D.net.start) / size) * size;
      a = clamp(a, D.net.start, D.net.end + 1 - size);
      setGroupRange(uid(), a, a + size - 1);
    });

    const add = $('#gAdd');
    add.addEventListener('keydown', e => { if (e.key === 'Enter') addSubnet(); });
    add.addEventListener('input', () => { add.classList.remove('invalid'); $('#gAddErr').textContent = ''; });
    const chipBox = $('#gChips');
    chipBox.addEventListener('click', e => {
      const del = e.target.closest('.chip-del');
      if (del) {
        checkpoint();
        group(uid()).subnets.splice(Number(del.dataset.i), 1);
        changed();
        return;
      }
      const text = e.target.closest('.chip-text');
      if (text) startChipEdit(Number(text.dataset.i));
    });
    // hovering a chip highlights its subnet on the map
    chipBox.addEventListener('pointerover', e => {
      const chip = e.target.closest('.chip');
      if (drag || !chip) return;
      try {
        const { start, end } = Net.parseCidr(group(uid()).subnets[Number(chip.dataset.i)]);
        layers.ghost.innerHTML = previewRanges([[start, end]])();
      } catch (err) { layers.ghost.innerHTML = ''; }
    });
    chipBox.addEventListener('pointerleave', () => { if (!drag) layers.ghost.innerHTML = ''; });
  }

  // Edit a subnet chip in place: Enter / click away saves, Esc cancels,
  // an empty value removes the subnet, Up/Down moves to the neighbouring block
  function startChipEdit(i) {
    const uid = state.selected;
    const g = group(uid);
    const chip = $(`#gChips .chip[data-i="${i}"]`);
    if (!g || !chip || chip.classList.contains('editing')) return;
    hideTip();
    const original = g.subnets[i];
    const input = document.createElement('input');
    input.className = 'chip-input';
    input.spellcheck = false;
    input.value = original;
    const fit = () => { input.style.width = `${Math.max(input.value.length, 11) + 1}ch`; };
    fit();
    chip.classList.add('editing');
    chip.querySelector('.chip-text').replaceWith(input);
    input.focus();
    input.select();
    const err = $('#gAddErr');
    let done = false;

    const redraw = () => {
      layers.ghost.innerHTML = '';
      const box = $('#gChips');
      if (box) box.dataset.sig = '';
      const x = D.byUid.get(state.selected);
      if (x) patchInspector(x);
    };
    const finish = mode => {
      if (done) return;
      const value = input.value.trim();
      if (mode !== 'cancel' && value && value !== original) {
        try {
          Net.parseCidr(value);
        } catch (e) {
          if (mode === 'enter') {
            input.classList.add('invalid');
            chip.classList.remove('shake');
            void chip.offsetWidth;
            chip.classList.add('shake');
            err.textContent = `«${value}» — ${e.message}`;
            return;  // keep editing
          }
          mode = 'cancel';
          toast(`Підмережу не змінено: «${value}» — ${e.message}`, { kind: 'error' });
        }
      }
      done = true;
      if (document.activeElement === input) input.blur();  // let the chips re-render
      err.textContent = '';
      if (mode === 'cancel' || value === original || !group(uid)) return redraw();
      checkpoint();
      const list = group(uid).subnets;
      if (value) list[i] = value; else list.splice(i, 1);
      layers.ghost.innerHTML = '';
      changed();
    };

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish('enter');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish('cancel');
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        try {
          const p = Net.parseCidr(input.value);
          const size = 2 ** (32 - p.prefix);
          const next = p.start + (e.key === 'ArrowUp' ? size : -size);
          if (next >= 0 && next + size <= Net.MAX) {
            input.value = `${ip(next)}/${p.prefix}`;
            fit();
            layers.ghost.innerHTML = previewRanges([[next, next + size - 1]])();
          }
        } catch (e2) { /* not a valid CIDR yet */ }
      }
    });
    input.addEventListener('input', () => {
      fit();
      input.classList.remove('invalid');
      err.textContent = '';
      try {
        const p = Net.parseCidr(input.value);
        layers.ghost.innerHTML = previewRanges([[p.start, p.end]])();
      } catch (e) { layers.ghost.innerHTML = ''; }
    });
    input.addEventListener('blur', () => finish('blur'));
  }

  function fail(input, message) {
    input.classList.add('invalid', 'shake');
    setTimeout(() => input.classList.remove('shake'), 400);
    const note = $('#gRangeNote');
    note.textContent = message;
    note.className = 'note error';
  }

  function autoGrow(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight + 2}px`;
  }

  function setColor(color, coalesce = false) {
    const g = group(state.selected);
    if (!g) return;
    checkpoint(coalesce ? `color:${g._uid}` : null);
    if (color) g.color = color; else delete g.color;
    changed({ light: true });
  }

  function addSubnet() {
    const input = $('#gAdd');
    const value = input.value.trim();
    if (!value) return;
    try {
      Net.parseCidr(value);
    } catch (e) {
      input.classList.add('invalid', 'shake');
      setTimeout(() => input.classList.remove('shake'), 400);
      $('#gAddErr').textContent = `Некоректна підмережа: ${e.message}`;
      return;
    }
    checkpoint();
    group(state.selected).subnets.push(value);
    input.value = '';
    changed();
  }

  function normalizeGroup() {
    const x = D.byUid.get(state.selected);
    if (!x) return;
    const cidrs = Net.toCidrs(x.intervals);
    if (JSON.stringify(cidrs) === JSON.stringify(x.g.subnets)) {
      toast('Список уже мінімальний', { icon: 'check' });
      return;
    }
    checkpoint();
    x.g.subnets = cidrs;
    changed();
    toast('Список підмереж нормалізовано', { icon: 'wand' });
  }

  function setValue(input, value) {
    if (input && document.activeElement !== input && input.value !== value) input.value = value;
  }

  function patchRangeNote() {
    const x = D.byUid.get(state.selected);
    const note = $('#gRangeNote');
    if (!x || note.classList.contains('error')) return;
    note.textContent = x.intervals.length > 1
      ? `Група має розриви (${x.intervals.length} ${plural(x.intervals.length, 'ділянка', 'ділянки', 'ділянок')}). Зміна діапазону їх заповнить.`
      : '';
    note.className = x.intervals.length > 1 ? 'note warn' : 'note';
  }

  function patchInspector(x) {
    $('#gSwatch').style.setProperty('--c', x.color);
    $('#gHeadName').textContent = x.name;
    $('#gHeadRange').textContent = x.intervals.length ? rangeText(x.start, x.end) : 'немає підмереж';
    setValue($('#gTitle'), x.g.title || '');
    const comment = $('#gComment');
    if (document.activeElement !== comment && comment.value !== (x.g.comment || '')) comment.value = x.g.comment || '';
    autoGrow(comment);
    for (const sw of $$('.swatch[data-color]', insp)) sw.classList.toggle('active', (sw.dataset.color || null) === (x.g.color || null));
    const custom = $('.swatch.custom', insp);
    const isCustom = !!x.g.color && !(x.g.color in COLORS);
    custom.classList.toggle('active', isCustom);
    custom.style.setProperty('--c', isCustom ? x.color : 'transparent');
    $('#gFull').checked = x.g.show_full === undefined ? true : !!x.g.show_full;  // visualizer default is True

    const s = $('#gStart'), e = $('#gEnd');
    if (x.intervals.length) {
      if (!s.classList.contains('invalid')) setValue(s, ip(x.start));
      if (!e.classList.contains('invalid')) setValue(e, ip(x.end));
    }
    const sizeSel = $('#gSize');
    const single = x.intervals.length === 1 ? Net.toCidrs(x.intervals) : [];
    const exact = single.length === 1 ? single[0].split('/')[1] : '';
    if (document.activeElement !== sizeSel) sizeSel.value = exact;
    patchRangeNote();

    $('#gAddr').textContent = fmt(x.total);
    $('#gAddrWord').textContent = addrWord(x.total);
    $('#gCidrCount').textContent = x.intervals.length ? Net.toCidrs(x.intervals).length : 0;

    const chips = (x.g.subnets || []).map((c, i) => {
      let bad = '';
      try { Net.parseCidr(c); } catch (err) { bad = err.message; }
      const tip = bad ? `${bad} — клікніть, щоб виправити` : 'Клікніть, щоб змінити · ↑/↓ — сусідній блок того ж розміру';
      return `<span class="chip${bad ? ' bad' : ''}" data-i="${i}"><span class="chip-text" data-i="${i}" data-tip="${esc(tip)}">${esc(c)}</span>` +
        `<button class="chip-del" data-i="${i}" data-tip="Прибрати">${icon('x')}</button></span>`;
    }).join('');
    const chipBox = $('#gChips');
    if (chipBox.dataset.sig !== chips && !chipBox.contains(document.activeElement)) {
      chipBox.dataset.sig = chips;
      chipBox.innerHTML = chips || '<span class="note">Немає підмереж — додайте нижче</span>';
    }
    const normalized = JSON.stringify(Net.toCidrs(x.intervals)) === JSON.stringify(x.g.subnets);
    $('[data-action="normalize"]', insp).disabled = normalized || !x.intervals.length;
  }

  // ================================================================ warnings, popovers, toasts, modals

  let lastWarnCount = 0;
  function renderWarnings() {
    const n = D.warnings.length;
    const pill = $('#warnBtn');
    $('#warnCount').textContent = n;
    pill.classList.toggle('show', n > 0);
    if (n > lastWarnCount && lastWarnCount > 0) {
      pill.classList.remove('bump');
      void pill.offsetWidth;
      pill.classList.add('bump');
    }
    lastWarnCount = n;
  }

  const pop = $('#popover');
  let popAnchor = null;
  function openPopover(anchor, html, onClick) {
    if (popAnchor === anchor && pop.classList.contains('show')) return closePopover();
    popAnchor = anchor;
    pop.innerHTML = html;
    hydrateIcons(pop);
    pop.onclick = e => onClick(e);
    pop.classList.add('show');
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth;
    pop.style.left = `${clamp(r.right - w, 8, innerWidth - w - 8)}px`;
    pop.style.top = `${r.bottom + 8}px`;
  }
  function closePopover() {
    pop.classList.remove('show');
    popAnchor = null;
  }
  document.addEventListener('pointerdown', e => {
    if (pop.classList.contains('show') && !pop.contains(e.target) && !e.target.closest('[data-action="recent"],[data-action="export"],[data-action="warnings"]')) closePopover();
  });

  function showWarnings(anchor) {
    const items = D.warnings.map((w, i) => `<button class="pop-item ${w.kind === 'err' ? 'err' : 'warn'}" data-i="${i}">
      <span class="pi-ic">${icon(w.kind === 'err' ? 'error' : 'alert')}</span>
      <span class="pi-text"><b>${esc(w.text)}</b><span>${esc(w.detail || '')}</span></span></button>`).join('');
    openPopover(anchor, `<div class="pop-title">Попередження</div>${items || '<div class="pop-empty">Все гаразд</div>'}`, e => {
      const btn = e.target.closest('.pop-item');
      if (!btn) return;
      const w = D.warnings[Number(btn.dataset.i)];
      closePopover();
      if (state.mode !== 'edit') setMode('edit');
      if (w.uid) select(w.uid, { reveal: true });
      if (w.range) focusRange(w.range[0], w.range[1]);
    });
  }

  function showRecent(anchor) {
    const items = state.recent.map((p, i) => `<button class="pop-item" data-i="${i}"><span class="pi-ic">${icon('file')}</span>
      <span class="pi-text"><b>${esc(basename(p))}</b><span>${esc(p)}</span></span></button>`).join('');
    openPopover(anchor, `<div class="pop-title">Нещодавні</div>${items || '<div class="pop-empty">Поки що порожньо</div>'}`, e => {
      const btn = e.target.closest('.pop-item');
      if (!btn) return;
      closePopover();
      openPath(state.recent[Number(btn.dataset.i)]);
    });
  }

  function showExport(anchor) {
    const seg = ['colored', 'bw', 'both'].map(s =>
      `<button data-style="${s}" class="${state.exportStyle === s ? 'active' : ''}">${{ colored: 'Кольорова', bw: 'Ч/Б', both: 'Обидві' }[s]}</button>`).join('');
    const html = `<div class="pop-title">Експорт карти</div>
      <div class="pop-seg"><div class="segmented small" id="expStyle"><span class="seg-thumb"></span>${seg}</div></div>
      <button class="pop-item" data-fmt="png"><span class="pi-ic">${icon('image')}</span><span class="pi-text"><b>PNG</b><span>Зображення 300 dpi</span></span></button>
      <button class="pop-item" data-fmt="pdf"><span class="pi-ic">${icon('file')}</span><span class="pi-text"><b>PDF</b><span>A4, векторний — найкраще для друку</span></span></button>
      <button class="pop-item" data-fmt="svg"><span class="pi-ic">${icon('code')}</span><span class="pi-text"><b>SVG</b><span>Вектор для подальшого редагування</span></span></button>`;
    openPopover(anchor, html, e => {
      const s = e.target.closest('#expStyle button');
      if (s) {
        state.exportStyle = s.dataset.style;
        $$('#expStyle button').forEach(b => b.classList.toggle('active', b === s));
        moveThumb($('#expStyle'));
        return;
      }
      const item = e.target.closest('[data-fmt]');
      if (!item) return;
      closePopover();
      exportMap(item.dataset.fmt, state.exportStyle);
    });
    moveThumb($('#expStyle'), false);
  }

  function toast(message, { kind = 'ok', action = null, actionLabel = '', icon: ic = null, timeout = 4200 } = {}) {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.innerHTML = `<span class="t-ic">${icon(ic || (kind === 'error' ? 'error' : 'check'))}</span><span class="t-msg">${esc(message)}</span>` +
      (action ? `<button class="t-btn">${esc(actionLabel)}</button>` : '');
    const close = () => {
      if (!el.isConnected) return;
      el.classList.add('out');
      setTimeout(() => el.remove(), 260);
    };
    if (action) el.querySelector('.t-btn').onclick = () => { action(); close(); };
    const box = $('#toasts');
    box.appendChild(el);
    while (box.children.length > 3) box.firstElementChild.remove();
    setTimeout(close, kind === 'error' ? 7000 : timeout);
  }

  const modalBox = $('#modal');
  let modalResolve = null;
  function openModal(html, { wide = false } = {}) {
    const m = $('.modal', modalBox);
    m.className = `modal${wide ? ' wide' : ''}`;
    m.innerHTML = html;
    hydrateIcons(m);
    modalBox.classList.add('show');
    return new Promise(resolve => {
      modalResolve = resolve;
      m.onclick = e => {
        const b = e.target.closest('[data-result]');
        if (b) closeModal(b.dataset.result);
      };
      setTimeout(() => { const p = $('.btn.primary', m); if (p) p.focus(); }, 50);
    });
  }
  function closeModal(result = 'cancel') {
    modalBox.classList.remove('show');
    if (modalResolve) modalResolve(result);
    modalResolve = null;
  }
  modalBox.addEventListener('pointerdown', e => { if (e.target === modalBox) closeModal('cancel'); });

  function askSave() {
    const name = state.path ? basename(state.path) : 'новий документ';
    return openModal(`<h2>Зберегти зміни?</h2><p>У «${esc(name)}» є незбережені зміни. Якщо не зберегти, їх буде втрачено.</p>
      <div class="modal-actions"><button class="btn ghost" data-result="cancel">Скасувати</button>
      <button class="btn soft" data-result="discard">Не зберігати</button><button class="btn primary" data-result="save">Зберегти</button></div>`);
  }

  function showHelp() {
    const row = (a, b) => `<div class="help-row"><span>${a}</span><span>${b}</span></div>`;
    openModal(`<h2>Як користуватися</h2>
      <div class="help-grid">
        <div><h4>Миша</h4>
          ${row('Меню дій', 'правий клік')}
          ${row('Нова група', 'тягнути по порожньому')}
          ${row('Нова група на один крок', 'подвійний клік')}
          ${row('Перемістити групу', 'тягнути блок')}
          ${row('Змінити розмір', 'тягнути ручку на краю')}
          ${row('Масштаб', 'колесо миші')}
          ${row('Прокрутка', 'тягнути шкалу / Shift+колесо')}
          ${row('Перейти в інше місце', 'мінікарта внизу')}
          ${row('Порядок у легенді', 'тягнути картку в списку')}
          ${row('Змінити підмережу', 'клік по ній у панелі групи')}
        </div>
        <div><h4>Клавіатура</h4>
          ${row('Зсунути групу', '<kbd>←</kbd> <kbd>→</kbd>')}
          ${row('Правий край', '<kbd>Shift</kbd>+<kbd>←</kbd>/<kbd>→</kbd>')}
          ${row('Лівий край', '<kbd>Ctrl</kbd>+<kbd>←</kbd>/<kbd>→</kbd>')}
          ${row('Видалити / дублювати', '<kbd>Del</kbd> · <kbd>Ctrl</kbd>+<kbd>D</kbd>')}
          ${row('Копіювати / вставити групу', '<kbd>Ctrl</kbd>+<kbd>C</kbd> · <kbd>Ctrl</kbd>+<kbd>V</kbd>')}
          ${row('Перейменувати · меню', '<kbd>F2</kbd> · <kbd>Shift</kbd>+<kbd>F10</kbd>')}
          ${row('Скасувати / повторити', '<kbd>Ctrl</kbd>+<kbd>Z</kbd> · <kbd>Ctrl</kbd>+<kbd>Y</kbd>')}
          ${row('Масштаб', '<kbd>+</kbd> <kbd>−</kbd> · <kbd>0</kbd> вся мережа · <kbd>F</kbd> до групи')}
          ${row('Зберегти / відкрити', '<kbd>Ctrl</kbd>+<kbd>S</kbd> · <kbd>Ctrl</kbd>+<kbd>O</kbd>')}
          ${row('Експорт', '<kbd>Ctrl</kbd>+<kbd>E</kbd>')}
        </div>
      </div>
      <p class="note">«Крок» визначає, до якого розміру вирівнюються межі. В режимі «Авто» крок дрібнішає, коли наближаєте карту. Після перетягування список підмереж групи перераховується в мінімальний набір вирівняних CIDR.</p>
      <div class="modal-actions"><button class="btn primary" data-result="ok">Зрозуміло</button></div>`, { wide: true });
  }

  // generic hover hints for [data-tip]
  (() => {
    let timer = 0, current = null;
    document.addEventListener('pointerover', e => {
      const el = e.target.closest('[data-tip]');
      if (el === current) return;
      current = el;
      clearTimeout(timer);
      if (drag) return;
      if (!el) { if (!e.target.closest('#viewport')) hideTip(); return; }
      timer = setTimeout(() => {
        if (current !== el || drag) return;
        const r = el.getBoundingClientRect();
        tooltip.innerHTML = esc(el.dataset.tip);
        tooltip.classList.add('show');
        const w = tooltip.offsetWidth;
        tooltip.style.left = `${clamp(r.left + r.width / 2 - w / 2, 8, innerWidth - w - 8)}px`;
        tooltip.style.top = `${r.bottom + 8 + tooltip.offsetHeight > innerHeight ? r.top - tooltip.offsetHeight - 8 : r.bottom + 8}px`;
      }, 450);
    });
    document.addEventListener('pointerdown', () => { clearTimeout(timer); if (!drag) hideTip(); });
  })();

  // ================================================================ context menu

  const ctxEl = $('#ctxMenu');
  let ctxItems = [], ctxActive = -1;
  let groupClipboard = null;   // { group, intervals } - copied with Ctrl+C or from the menu

  // items: {label, icon, kbd, action, disabled, danger, checked} | 'sep' | {swatches: uid} | {head: html} | null
  function openMenu(items, clientX, clientY) {
    hideTip();
    closePopover();
    ctxItems = [];
    const parts = [];
    for (const it of items) {
      if (!it) continue;
      if (it === 'sep') {
        if (parts.length && parts[parts.length - 1] !== 'sep') parts.push('sep');
      } else if (it.head) {
        parts.push(it.head);
      } else if (it.swatches) {
        const g = group(it.swatches);
        parts.push(`<div class="ctx-swatches"><button class="swatch auto${g.color ? '' : ' active'}" data-color="" data-tip="Авто — за порядком групи"></button>` +
          Object.entries(COLORS).map(([name, hex]) =>
            `<button class="swatch${g.color === name ? ' active' : ''}" data-color="${esc(name)}" style="--c:${hex}" data-tip="${esc(name)}"></button>`).join('') +
          '</div>');
      } else {
        const i = ctxItems.push(it) - 1;
        const lead = it.checked === undefined
          ? icon(it.icon || '')
          : `<span class="check${it.checked ? ' on' : ''}">${it.checked ? icon('check') : ''}</span>`;
        parts.push(`<button class="ctx-item${it.danger ? ' danger' : ''}" data-i="${i}"${it.disabled ? ' disabled' : ''}>` +
          `${lead}<span>${esc(it.label)}</span>${it.kbd ? `<span class="k">${esc(it.kbd)}</span>` : ''}</button>`);
      }
    }
    if (parts[parts.length - 1] === 'sep') parts.pop();
    ctxEl.innerHTML = parts.map(p => (p === 'sep' ? '<div class="ctx-sep"></div>' : p)).join('');
    ctxEl.onclick = e => {
      const sw = e.target.closest('.swatch');
      if (sw) {
        setColor(sw.dataset.color || null);
        closeMenu();
        return;
      }
      const b = e.target.closest('.ctx-item');
      if (b) runMenuItem(Number(b.dataset.i));
    };
    ctxEl.onpointermove = e => {
      const b = e.target.closest('.ctx-item');
      setMenuActive(b ? Number(b.dataset.i) : -1);
    };
    ctxEl.classList.add('show');
    // keep on screen; grow from the cursor
    const w = ctxEl.offsetWidth, h = ctxEl.offsetHeight;
    const left = Math.max(6, clientX + w > innerWidth - 6 ? clientX - w : clientX);
    const top = Math.max(6, clientY + h > innerHeight - 6 ? clientY - h : clientY);
    ctxEl.style.transformOrigin = `${clientX - left}px ${clientY - top}px`;
    ctxEl.style.left = `${left}px`;
    ctxEl.style.top = `${top}px`;
    ctxActive = -1;
    layers.ghost.innerHTML = '';
  }

  function runMenuItem(i) {
    const it = ctxItems[i];
    if (!it || it.disabled) return;
    closeMenu();
    it.action();
  }

  function setMenuActive(i) {
    if (ctxActive === i) return;
    ctxActive = i;
    $$('.ctx-item', ctxEl).forEach(b => b.classList.toggle('active', Number(b.dataset.i) === i));
    // show on the map what the hovered action would do
    const it = ctxItems[i];
    if (!drag) layers.ghost.innerHTML = it && it.preview && !it.disabled ? it.preview() : '';
  }

  const previewRanges = intervals => () => intervals.map(iv => {
    const { x1, w } = segmentGeometry(iv);
    return `<div class="create-ghost preview" style="left:${x1}px;width:${w}px"></div>`;
  }).join('');
  const previewSplit = at => () => `<div class="split-mark" style="left:${pxOf(at)}px"><span>${ip(at)}</span></div>`;

  const menuOpen = () => ctxEl.classList.contains('show');
  function closeMenu() {
    if (!menuOpen()) return;
    ctxEl.classList.remove('show');
    ctxActive = -1;
    if (!drag) layers.ghost.innerHTML = '';
  }

  function menuKey(e) {
    e.preventDefault();
    const enabled = ctxItems.map((it, i) => (it.disabled ? -1 : i)).filter(i => i >= 0);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const pos = enabled.indexOf(ctxActive);
      const n = enabled.length;
      if (n) setMenuActive(e.key === 'ArrowDown' ? enabled[(pos + 1) % n] : enabled[(pos - 1 + n) % n]);
    } else if (e.key === 'Enter' && ctxActive >= 0) {
      runMenuItem(ctxActive);
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      closeMenu();
    }
  }

  document.addEventListener('pointerdown', e => { if (menuOpen() && !ctxEl.contains(e.target)) closeMenu(); }, true);
  window.addEventListener('blur', closeMenu);
  window.addEventListener('resize', closeMenu);
  viewport.addEventListener('wheel', closeMenu, { passive: true });

  async function copyText(text, message) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast(message, { icon: 'copy' });
  }

  // Ctrl+C: the group goes to the internal clipboard (for Ctrl+V), its CIDR list to the system one
  function copyGroup(uid = state.selected) {
    const x = D.byUid.get(uid);
    if (!x) return;
    const { _uid, ...props } = x.g;
    groupClipboard = { group: JSON.parse(JSON.stringify(props)), intervals: x.intervals.map(iv => [...iv]) };
    const cidrs = x.g.subnets || [];
    copyText(cidrs.join('\n'), `Скопійовано «${x.name}» · ${cidrs.length} ${plural(cidrs.length, 'підмережа', 'підмережі', 'підмереж')}`);
  }

  // Paste the copied group at `at` (snapped) or into the first free slot of its size
  function pastePlacement(at = null) {
    const { intervals } = groupClipboard;
    const start = intervals[0][0], size = intervals[intervals.length - 1][1] - start + 1;
    let target = at != null ? snapFloor(at) : findFree(size, start);
    if (target == null) target = start;
    target = clamp(target, D.net.start, D.net.end + 1 - size);
    return Net.shift(intervals, target - start);
  }

  function pasteGroup(at = null) {
    if (!groupClipboard || !D.net || !groupClipboard.intervals.length) return;
    const props = groupClipboard.group;
    createGroup(pastePlacement(at), JSON.parse(JSON.stringify(props)));
    toast(`Вставлено «${groupName(props, D.groups.length)}»`, { icon: 'clipboard' });
  }

  function splitGroup(uid, at) {
    const x = D.byUid.get(uid);
    if (!x || !(at > x.start && at <= x.end)) return;
    const left = Net.clip(x.intervals, x.start, at - 1), right = Net.clip(x.intervals, at, x.end);
    if (!left.length || !right.length) return;
    checkpoint();
    x.g.subnets = Net.toCidrs(left);
    const copy = JSON.parse(JSON.stringify(x.g));
    copy._uid = newUid();
    copy.subnets = Net.toCidrs(right);
    if ((copy.title || '').trim()) copy.title = `${copy.title} (2)`;
    state.doc.subnet_groups.splice(x.index + 1, 0, copy);
    born.add(copy._uid);
    setTimeout(() => born.delete(copy._uid), 600);
    state.selected = copy._uid;
    changed();
    toast(`«${x.name}» розділено на дві групи`, { icon: 'split' });
  }

  const neighbourFree = x => D.free.filter(([s, e]) => e === x.start - 1 || s === x.end + 1);

  function expandGroup(uid) {
    const x = D.byUid.get(uid);
    const add = x ? neighbourFree(x) : [];
    if (!add.length) return;
    checkpoint();
    x.g.subnets = Net.toCidrs([...x.intervals, ...add]);
    changed();
    revealGroup(uid, false);
  }

  function moveInList(uid, direction) {
    const list = state.doc.subnet_groups;
    const i = list.findIndex(g => g._uid === uid), j = i + direction;
    if (i < 0 || j < 0 || j >= list.length) return;
    checkpoint();
    [list[i], list[j]] = [list[j], list[i]];
    changed();
  }

  function renameGroup(uid) {
    if (state.selected !== uid) select(uid);
    setTimeout(() => { const t = $('#gTitle'); if (t) { t.focus(); t.select(); } }, 30);
  }

  function toggleShowFull(uid) {
    const g = group(uid);
    checkpoint();
    g.show_full = !(g.show_full === undefined ? true : !!g.show_full);
    changed();
  }

  function groupMenu(uid, at = null) {
    const x = D.byUid.get(uid);
    if (!x) return [];
    const has = x.intervals.length > 0;
    const canSplit = at != null && has && at > x.start && at <= x.end && Net.clip(x.intervals, x.start, at - 1).length > 0;
    const normalized = JSON.stringify(Net.toCidrs(x.intervals)) === JSON.stringify(x.g.subnets);
    return [
      { head: `<div class="ctx-head" style="--c:${x.color}"><i class="dot"></i><b>${esc(x.name)}</b><span>${has ? esc(sizeText(x.total)) : ''}</span></div>` },
      { label: 'Перейменувати', icon: 'edit', kbd: 'F2', action: () => renameGroup(uid) },
      { swatches: uid },
      'sep',
      { label: 'Копіювати', icon: 'copy', kbd: 'Ctrl+C', action: () => copyGroup(uid) },
      { label: 'Копіювати діапазон', icon: 'clipboard', disabled: !has, action: () => copyText(fullRange(x.start, x.end), `Скопійовано ${fullRange(x.start, x.end)}`) },
      { label: 'Дублювати', icon: 'layers', kbd: 'Ctrl+D', action: () => { select(uid); duplicateGroup(); } },
      'sep',
      at != null ? { label: canSplit ? `Розділити тут · ${ip(at)}` : 'Розділити тут', icon: 'split', disabled: !canSplit, action: () => splitGroup(uid, at), preview: previewSplit(at) } : null,
      { label: 'Розширити до сусідів', icon: 'expand', disabled: !neighbourFree(x).length, action: () => expandGroup(uid), preview: previewRanges(neighbourFree(x)) },
      x.intervals.length > 1 ? { label: 'Заповнити розриви', icon: 'maximize', action: () => setGroupRange(uid, x.start, x.end) } : null,
      { label: 'Нормалізувати підмережі', icon: 'wand', disabled: normalized || !has, action: () => { select(uid); normalizeGroup(); } },
      { label: 'Кожна підмережа окремим блоком', checked: x.g.show_full === undefined ? true : !!x.g.show_full, action: () => toggleShowFull(uid) },
      'sep',
      { label: 'Наблизити до групи', icon: 'target', kbd: 'F', disabled: !has, action: () => { state.mode === 'edit' || setMode('edit'); focusRange(x.start, x.end); } },
      { label: 'Вище в легенді', icon: 'arrow-up', disabled: x.index === 0, action: () => moveInList(uid, -1) },
      { label: 'Нижче в легенді', icon: 'arrow-down', disabled: x.index === D.groups.length - 1, action: () => moveInList(uid, 1) },
      'sep',
      { label: 'Видалити', icon: 'trash', kbd: 'Del', danger: true, action: () => deleteGroup(uid) },
    ];
  }

  function freeMenu(s, e, at) {
    const count = e - s + 1;
    const cellStart = clamp(snapFloor(at), s, e);
    const cellEnd = Math.min(cellStart + snapStep() - 1, e);
    const cell = Net.toCidrs([[cellStart, cellEnd]]);
    const cidrs = Net.toCidrs([[s, e]]);
    return [
      { head: `<div class="ctx-head"><b>Вільно</b><span>${esc(rangeText(s, e))} · ${esc(sizeText(count))}</span></div>` },
      { label: `Створити групу тут · ${cell.length === 1 ? cell[0] : sizeText(cellEnd - cellStart + 1)}`, icon: 'plus', action: () => createGroup([[cellStart, cellEnd]]), preview: previewRanges([[cellStart, cellEnd]]) },
      { label: 'Заповнити проміжок групою', icon: 'maximize', action: () => createGroup([[s, e]]), preview: previewRanges([[s, e]]) },
      { label: 'Вставити групу сюди', icon: 'clipboard', kbd: 'Ctrl+V', disabled: !groupClipboard, action: () => pasteGroup(at), preview: () => previewRanges(pastePlacement(at))() },
      'sep',
      { label: `Копіювати як CIDR (${cidrs.length})`, icon: 'code', action: () => copyText(cidrs.join('\n'), `Скопійовано ${cidrs.length} ${plural(cidrs.length, 'вільну підмережу', 'вільні підмережі', 'вільних підмереж')}`) },
      { label: 'Наблизити сюди', icon: 'target', action: () => focusRange(s, e) },
    ];
  }

  function emptyMenu(at) {
    return [
      { label: 'Додати групу у вільне місце', icon: 'plus', action: addGroup },
      { label: 'Вставити групу', icon: 'clipboard', kbd: 'Ctrl+V', disabled: !groupClipboard, action: () => pasteGroup(at) },
      'sep',
      { label: 'Наблизити', icon: 'zoom-in', kbd: '+', action: () => zoomBy(1 / 2.5, at) },
      { label: 'Віддалити', icon: 'zoom-out', kbd: '−', action: () => zoomBy(2.5, at) },
      { label: 'Вся мережа', icon: 'maximize', kbd: '0', action: () => fitView() },
    ];
  }

  // Menu key / Shift+F10: menu for the selected group, anchored on its block
  function openMenuForSelection() {
    const x = D.byUid.get(state.selected);
    const r = viewport.getBoundingClientRect();
    const y = r.top + geo.laneTop + geo.laneH / 2;
    if (x && x.intervals.length && state.mode === 'edit') {
      const g = segmentGeometry([x.start, x.end]);
      openMenu(groupMenu(x.uid), r.left + clamp(g.x1 + g.w / 2, 10, geo.W - 10), y);
    } else if (D.net) {
      openMenu(emptyMenu((view.lo + view.hi) / 2), r.left + geo.W / 2, y);
    }
    setMenuActive(ctxItems.findIndex(it => !it.disabled));
  }

  viewport.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (!D.net) return;
    if (drag) endDrag(e, true);
    const hit = e.target.closest('.block, .flag');
    const free = e.target.closest('.free');
    const at = clamp(Math.round(ipAt(localX(e))), D.net.start, D.net.end);
    if (hit) {
      const uid = hit.dataset.uid;
      if (uid !== state.selected) select(uid);
      openMenu(groupMenu(uid, hit.classList.contains('block') ? snapRound(ipAt(localX(e))) : null), e.clientX, e.clientY);
    } else if (free) {
      openMenu(freeMenu(Number(free.dataset.s), Number(free.dataset.e), at), e.clientX, e.clientY);
    } else {
      openMenu(emptyMenu(at), e.clientX, e.clientY);
    }
  });

  $('#groupList').addEventListener('contextmenu', e => {
    e.preventDefault();
    const card = e.target.closest('.gcard');
    if (!card) {
      openMenu([
        { label: 'Додати групу', icon: 'plus', action: addGroup },
        { label: 'Вставити групу', icon: 'clipboard', kbd: 'Ctrl+V', disabled: !groupClipboard, action: () => pasteGroup() },
      ], e.clientX, e.clientY);
      return;
    }
    if (card.dataset.uid !== state.selected) select(card.dataset.uid, { reveal: true });
    openMenu(groupMenu(card.dataset.uid), e.clientX, e.clientY);
  });

  // No browser menu (Back / Refresh / Inspect) anywhere except text fields
  document.addEventListener('contextmenu', e => {
    if (!e.target.closest('input, textarea')) e.preventDefault();
  });

  // ================================================================ modes, theme, print preview

  function moveThumb(seg, animate = true) {
    if (!seg) return;
    const active = $('button.active', seg);
    const thumb = $('.seg-thumb', seg);
    if (!active || !thumb) return;
    if (!animate) thumb.style.transition = 'none';
    thumb.style.width = `${active.offsetWidth}px`;
    thumb.style.transform = `translateX(${active.offsetLeft - 3}px)`;
    if (!animate) requestAnimationFrame(() => { thumb.style.transition = ''; });
  }

  function setMode(mode) {
    state.mode = mode;
    $('#app').classList.toggle('mode-print', mode === 'print');
    $$('#modeSwitch button').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    moveThumb($('#modeSwitch'));
    hideTip();
    if (mode === 'print') {
      layoutPaper();
      if (!$('#printImg').src) $('#paper').classList.add('loading');
      schedulePreview(0);
    } else {
      schedulePreview(100);
    }
  }

  function setPrintStyle(style) {
    state.printStyle = style;
    $$('#styleSwitch button').forEach(b => b.classList.toggle('active', b.dataset.style === style));
    moveThumb($('#styleSwitch'));
    api.set_settings({ printStyle: style });
    schedulePreview(0);
  }

  function applyTheme() {
    const dark = state.theme ? state.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const btn = $('[data-action="theme"]');
    btn.innerHTML = icon(dark ? 'sun' : 'moon');
    themeColors = null;
    if (D) renderStage();
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

  function layoutPaper() {
    const wrap = $('.paper-wrap');
    const w = Math.max(200, Math.min(wrap.clientWidth - 56, (wrap.clientHeight - 56) * 297 / 210));
    $('#paper').style.width = `${w}px`;
    $('#paper').style.height = `${w * 210 / 297}px`;  // aspect-ratio is not supported by older browsers
  }

  let previewTimer = 0, previewSeq = 0;
  function schedulePreview(delay = 450) {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(updatePreview, delay);
  }

  async function updatePreview() {
    if (!D || !D.net) return;
    const print = state.mode === 'print';
    if (!print && !state.miniPreview) return;
    const img = print ? $('#printImg') : $('#miniPreviewImg');
    const width = Math.round((print ? $('#paper').clientWidth : 208) * devicePixelRatio * (print ? 1 : 1.6));
    const seq = ++previewSeq;
    if (print) $('#paper').classList.add('updating'); else img.classList.add('updating');
    const r = await api.preview(cleanDoc(), state.printStyle, width);
    if (seq !== previewSeq) return;
    if (r.error) {
      $('#paper').classList.remove('updating', 'loading');
      img.classList.remove('updating');
      return;
    }
    const tmp = new Image();
    tmp.onload = () => {
      img.src = r.image;
      $('#paper').classList.remove('updating', 'loading');
      img.classList.remove('updating');
    };
    tmp.src = r.image;
  }

  function setMiniPreview(show) {
    state.miniPreview = show;
    $('#miniPreview').classList.toggle('hidden', !show);
    $('#miniPreviewShow').classList.toggle('show', !show);
    api.set_settings({ miniPreview: show });
    if (show) schedulePreview(0);
  }

  // ================================================================ files

  function assignUids(doc) {
    for (const g of doc.subnet_groups) g._uid = newUid();
    return doc;
  }

  function rebuildSnapOptions() {
    const net = D && D.net;
    const sel = $('#snapSelect');
    const prefixes = net ? Array.from({ length: 33 - net.prefix }, (_, k) => net.prefix + k) : [];
    if (state.snap !== 'auto' && net && Number(state.snap) < net.prefix) state.snap = 'auto';
    sel.innerHTML = `<option value="auto">Авто</option>` + prefixes.map(p => `<option value="${p}">/${p} · ${fmt(2 ** (32 - p))}</option>`).join('');
    sel.value = state.snap;
  }

  function loadDoc(doc, path) {
    state.doc = assignUids(doc);
    state.path = path;
    state.saved = docJson();
    state.selected = null;
    history.undo = [];
    history.redo = [];
    history.key = null;
    inspUid = undefined;
    lastDirty = null;
    Object.values(layers).forEach(l => { l.innerHTML = ''; });
    $('#groupList').innerHTML = '';
    derive();
    rebuildSnapOptions();
    measure();
    fitView(false);
    changed();
    setHint();
  }

  async function guardUnsaved() {
    if (!isDirty()) return true;
    const answer = await askSave();
    if (answer === 'cancel') return false;
    if (answer === 'save') return save();
    return true;
  }

  async function newDoc() {
    if (!await guardUnsaved()) return;
    loadDoc({ main_subnet: '192.168.0.0/16', map_title: '', subnet_groups: [] }, null);
    toast('Новий документ', { icon: 'file-plus' });
  }

  function handleOpened(r) {
    if (!r || r.cancelled) return;
    if (r.error) return toast(r.error, { kind: 'error' });
    loadDoc(r.doc, r.path);
    if (r.recent) state.recent = r.recent;
    toast(`Відкрито ${basename(r.path)}`, { icon: 'folder' });
  }

  async function openDialog() {
    if (!await guardUnsaved()) return;
    handleOpened(await api.open_dialog());
  }

  async function openPath(path) {
    if (!await guardUnsaved()) return;
    handleOpened(await api.open_path(path));
  }

  async function save(asNew = false) {
    const r = await api.save(cleanDoc(), asNew ? null : state.path);
    if (!r || r.cancelled) return false;
    if (r.error) {
      toast(r.error, { kind: 'error' });
      return false;
    }
    state.path = r.path;
    state.saved = docJson();
    if (r.recent) state.recent = r.recent;
    updateDirty();
    toast(`Збережено ${basename(r.path)}`, { icon: 'save' });
    return true;
  }

  async function exportMap(fmtName, style) {
    if (!D.net) return toast('Спершу вкажіть коректну мережу', { kind: 'error' });
    const base = state.path ? basename(state.path).replace(/\.[^.]+$/, '') : 'subnet_map';
    const r = await api.export(cleanDoc(), fmtName, style, base);
    if (!r || r.cancelled) return;
    if (r.error) return toast(r.error, { kind: 'error' });
    toast(`Експортовано ${r.paths.map(basename).join(', ')}`, { action: () => api.reveal(r.paths[0]), actionLabel: 'Показати в папці', icon: 'download', timeout: 6000 });
  }

  async function requestClose() {
    const answer = await askSave();
    if (answer === 'cancel') return;
    if (answer === 'save' && !await save()) return;
    api.close();
  }

  // files dropped onto the window (pywebview adds the full path)
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    const path = file && file.pywebviewFullPath;
    if (path && /\.(py|json)$/i.test(path)) openPath(path);
  });

  // ================================================================ commands

  const actions = {
    new: newDoc, open: openDialog, save: () => save(), undo, redo,
    recent: el => showRecent(el), export: el => showExport(el), warnings: el => showWarnings(el),
    help: showHelp, theme: () => {
      const dark = document.documentElement.dataset.theme === 'dark';
      state.theme = dark ? 'light' : 'dark';
      api.set_settings({ theme: state.theme });
      applyTheme();
    },
    add: addGroup, duplicate: duplicateGroup, delete: () => deleteGroup(), normalize: normalizeGroup, 'add-subnet': addSubnet,
    'zoom-in': () => zoomBy(1 / 1.8), 'zoom-out': () => zoomBy(1.8), fit: () => fitView(),
    focus: () => { const x = D.byUid.get(state.selected); if (x && x.intervals.length) focusRange(x.start, x.end); },
    'hide-mini': () => setMiniPreview(false), 'show-mini': () => setMiniPreview(true),
  };

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (el && !el.disabled && actions[el.dataset.action]) {
      e.stopPropagation();
      actions[el.dataset.action](el);
      return;
    }
    const exp = e.target.closest('[data-export]');
    if (exp) exportMap(exp.dataset.export, state.printStyle);
  });
  $('#modeSwitch').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.mode); });
  $('#styleSwitch').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setPrintStyle(b.dataset.style); });
  $('#miniPreview').addEventListener('click', e => { if (!e.target.closest('[data-action]')) setMode('print'); });
  $('#snapSelect').addEventListener('change', e => {
    state.snap = e.target.value;
    api.set_settings({ snap: state.snap });
    renderStage();
    e.target.blur();
  });

  window.addEventListener('keydown', e => {
    const inField = e.target.closest('input, textarea, select');
    const ctrl = e.ctrlKey || e.metaKey;

    if (modalBox.classList.contains('show')) {
      if (e.key === 'Escape') closeModal('cancel');
      return;
    }
    if (menuOpen()) {
      menuKey(e);
      return;
    }
    if (e.key === 'Escape') {
      if (drag) {
        endDrag(e, true);
      } else if (pop.classList.contains('show')) {
        closePopover();
      } else if (inField) {
        e.target.blur();
      } else if (state.mode === 'print') {
        setMode('edit');
      } else {
        select(null);
      }
      return;
    }
    if (e.key === 'F1') { e.preventDefault(); showHelp(); return; }
    if (!inField && e.key === 'F2' && state.selected) { e.preventDefault(); renameGroup(state.selected); return; }
    if (!inField && (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) {
      e.preventDefault();
      openMenuForSelection();
      return;
    }

    if (!inField && (e.code === 'ArrowLeft' || e.code === 'ArrowRight') && state.selected && state.mode === 'edit') {
      e.preventDefault();
      nudge(e.code === 'ArrowLeft' ? -1 : 1, e.shiftKey ? 'right' : ctrl ? 'left' : null);
      return;
    }

    if (ctrl) {
      const map = {
        KeyZ: () => (e.shiftKey ? redo() : undo()), KeyY: redo,
        KeyS: () => save(e.shiftKey), KeyO: openDialog, KeyN: newDoc,
        KeyE: () => showExport($('[data-action="export"]')),
      };
      if (!inField) {
        map.KeyD = duplicateGroup;
        map.KeyC = () => copyGroup();
        map.KeyV = () => pasteGroup();
      }
      if (map[e.code]) {
        e.preventDefault();
        map[e.code]();
      }
      return;
    }
    if (inField || state.mode !== 'edit') return;
    const keys = {
      Delete: () => deleteGroup(), Backspace: () => deleteGroup(),
      Equal: () => zoomBy(1 / 1.8), NumpadAdd: () => zoomBy(1 / 1.8),
      Minus: () => zoomBy(1.8), NumpadSubtract: () => zoomBy(1.8),
      Digit0: () => fitView(), Numpad0: () => fitView(), KeyF: actions.focus,
    };
    if (keys[e.code]) {
      e.preventDefault();
      keys[e.code]();
    }
  });

  // In a browser window the close can't be intercepted by Python - use the browser's own prompt
  window.addEventListener('beforeunload', e => {
    if (HTTP && state.doc && isDirty()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  new ResizeObserver(() => {
    if (!D) return;
    measure();
    setView(target.lo, target.hi, false);
    moveThumb($('#modeSwitch'), false);
    moveThumb($('#styleSwitch'), false);
    layoutPaper();
    schedulePreview(600);
  }).observe($('.stage'));

  // ================================================================ boot

  async function boot() {
    applyTheme();
    hydrateIcons();
    await bridgeReady();
    const r = await api.init();
    COLORS = r.colors || {};
    DEFAULT_COLORS = r.defaultColors && r.defaultColors.length ? r.defaultColors : Object.values(COLORS);
    const s = r.settings || {};
    state.theme = s.theme || null;
    state.printStyle = s.printStyle || 'colored';
    state.exportStyle = state.printStyle;
    state.snap = s.snap || 'auto';
    state.miniPreview = s.miniPreview !== false;
    state.recent = r.recent || [];
    applyTheme();
    loadDoc(r.doc, r.path);
    $$('#styleSwitch button').forEach(b => b.classList.toggle('active', b.dataset.style === state.printStyle));
    $('#miniPreview').classList.toggle('hidden', !state.miniPreview);
    $('#miniPreviewShow').classList.toggle('show', !state.miniPreview);
    $('#app').classList.remove('booting');
    requestAnimationFrame(() => {
      moveThumb($('#modeSwitch'), false);
      moveThumb($('#styleSwitch'), false);
    });
    if (r.error) toast(r.error, { kind: 'error' });
  }

  window.app = {
    requestClose,
    // for automated tests
    get state() { return state; }, get derived() { return D; }, get view() { return { ...view }; },
    pxOf, ipAt, geo, select, undo, redo, loadDoc, setMode, snapStep,
  };

  boot();
})();
