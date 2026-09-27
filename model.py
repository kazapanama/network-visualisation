"""Data model for the subnet editor: loading/saving data files and
address-range arithmetic used when groups are moved or resized.

A group's address space is handled as a list of inclusive (start, end)
integer intervals. After an edit the intervals are converted back into the
minimal list of properly aligned CIDRs.
"""
import ast
import ipaddress
import json
import os

DATA_KEYS = ('main_subnet', 'map_title', 'subnet_groups')
GROUP_KEY_ORDER = ('title', 'comment', 'show_full', 'color', 'subnets')


def new_document():
    return {
        'main_subnet': '192.168.0.0/16',
        'map_title': '',
        'subnet_groups': [],
    }


# ---------------------------------------------------------------- load / save

def load_data(path):
    # .json is read as JSON. Anything else is treated as a python data file:
    # it is parsed, not executed, so only literal assignments are accepted.
    with open(path, encoding='utf-8-sig') as f:
        text = f.read()
    if path.lower().endswith('.json'):
        data = json.loads(text)
    else:
        data = {}
        for node in ast.parse(text, filename=path).body:
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name) and target.id in DATA_KEYS:
                        try:
                            data[target.id] = ast.literal_eval(node.value)
                        except ValueError:
                            raise ValueError(f"'{target.id}' (рядок {node.lineno}) має бути простим значенням, без обчислень")
    return normalize_document(data)


def normalize_document(data):
    if not isinstance(data, dict) or 'main_subnet' not in data or 'subnet_groups' not in data:
        raise ValueError("У файлі немає 'main_subnet' і 'subnet_groups'")
    doc = new_document()
    doc['main_subnet'] = str(data['main_subnet'])
    doc['map_title'] = str(data.get('map_title') or '')
    groups = data['subnet_groups']
    if not isinstance(groups, list):
        raise ValueError("'subnet_groups' має бути списком")
    for i, group in enumerate(groups):
        if not isinstance(group, dict):
            raise ValueError(f"Група №{i + 1} має бути словником")
        group = dict(group)
        # Subnets may be given as {'cidr': ...} dicts; the editor works with strings
        group['subnets'] = [s.get('cidr', '') if isinstance(s, dict) else str(s)
                            for s in group.get('subnets', [])]
        doc['subnet_groups'].append(group)
    return doc


def save_data(path, doc):
    if path.lower().endswith('.json'):
        text = json.dumps(_ordered(doc), ensure_ascii=False, indent=4) + '\n'
    else:
        doc = _ordered(doc)
        text = (
            '# Subnet map data for visualizer.py / SubnetEditor\n'
            f"main_subnet = {_py_literal(doc['main_subnet'])}\n"
            f"map_title = {_py_literal(doc['map_title'])}\n"
            '\n'
            f"subnet_groups = {_py_literal(doc['subnet_groups'])}\n"
        )
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    os.replace(tmp, path)


def _ordered(doc):
    groups = []
    for group in doc['subnet_groups']:
        keys = [k for k in GROUP_KEY_ORDER if k in group] + [k for k in group if k not in GROUP_KEY_ORDER]
        groups.append({k: group[k] for k in keys})
    return {'main_subnet': doc['main_subnet'], 'map_title': doc['map_title'], 'subnet_groups': groups}


def _py_literal(value, indent=0):
    # Pretty python literal in the same style as the hand-written data files
    pad, inner = '    ' * indent, '    ' * (indent + 1)
    if isinstance(value, dict):
        if not value:
            return '{}'
        items = [f'{inner}{_py_literal(k)}: {_py_literal(v, indent + 1)}' for k, v in value.items()]
        return '{\n' + ',\n'.join(items) + f',\n{pad}}}'
    if isinstance(value, list):
        if not value:
            return '[]'
        items = [f'{inner}{_py_literal(v, indent + 1)}' for v in value]
        return '[\n' + ',\n'.join(items) + f',\n{pad}]'
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)  # JSON string escapes are valid python
    return repr(value)  # bool, None, numbers


# ------------------------------------------------------------ address ranges

def cidr_interval(cidr):
    # Same interpretation as visualizer.py: the address is taken as written,
    # even if it is not aligned to the prefix.
    ip_part, prefix_part = cidr.strip().split('/')
    prefix = int(prefix_part)
    if not 0 <= prefix <= 32:
        raise ValueError(f'префікс /{prefix} поза межами 0–32')
    start = int(ipaddress.IPv4Address(ip_part.strip()))
    end = start + 2 ** (32 - prefix) - 1
    if end > 0xFFFFFFFF:
        raise ValueError('виходить за межі IPv4')
    return start, end


def group_intervals(group):
    intervals = []
    for cidr in group.get('subnets', []):
        try:
            intervals.append(cidr_interval(cidr))
        except (ValueError, AttributeError):
            pass
    return merge(intervals)


def merge(intervals):
    result = []
    for start, end in sorted(intervals):
        if result and start <= result[-1][1] + 1:
            result[-1] = (result[-1][0], max(result[-1][1], end))
        else:
            result.append((start, end))
    return result


def shift(intervals, delta):
    return [(s + delta, e + delta) for s, e in intervals]


def clip(intervals, lo, hi):
    return [(max(s, lo), min(e, hi)) for s, e in intervals if e >= lo and s <= hi]


def intersect(a, b):
    result = []
    for s1, e1 in a:
        for s2, e2 in b:
            s, e = max(s1, s2), min(e1, e2)
            if s <= e:
                result.append((s, e))
    return merge(result)


def to_cidrs(intervals):
    cidrs = []
    for start, end in merge(intervals):
        for net in ipaddress.summarize_address_range(ipaddress.IPv4Address(start), ipaddress.IPv4Address(end)):
            cidrs.append(str(net))
    return cidrs


def ip_str(value):
    return str(ipaddress.IPv4Address(value))


def range_str(start, end):
    return f'{ip_str(start)} – {ip_str(end)}'
