// IPv4 / CIDR arithmetic for the editor. Addresses are plain numbers
// (0 .. 2^32-1); bitwise operators are avoided because they are 32-bit signed.
(function () {
  const MAX = 2 ** 32;

  function ipToInt(text) {
    const parts = String(text).trim().split('.');
    if (parts.length !== 4) throw new Error('потрібно 4 числа через крапку');
    let value = 0;
    for (const part of parts) {
      if (!/^\d{1,3}$/.test(part) || Number(part) > 255) throw new Error(`«${part}» — не число 0–255`);
      value = value * 256 + Number(part);
    }
    return value;
  }

  function intToIp(value) {
    const out = [];
    for (let i = 3; i >= 0; i--) out.push(Math.floor(value / 256 ** i) % 256);
    return out.join('.');
  }

  // Same interpretation as visualizer.py: the address is taken as written,
  // even if it is not aligned to the prefix.
  function parseCidr(text) {
    const match = String(text).trim().match(/^([\d.]+)\s*\/\s*(\d{1,2})$/);
    if (!match) throw new Error('формат a.b.c.d/префікс');
    const prefix = Number(match[2]);
    if (prefix > 32) throw new Error('префікс має бути 0–32');
    const start = ipToInt(match[1]);
    const end = start + 2 ** (32 - prefix) - 1;
    if (end >= MAX) throw new Error('виходить за межі IPv4');
    return { start, end, prefix };
  }

  // Network given as CIDR, aligned like ipaddress.ip_network(strict=False)
  function parseNetwork(text) {
    const { prefix, start } = parseCidr(text);
    const size = 2 ** (32 - prefix);
    const aligned = Math.floor(start / size) * size;
    return { start: aligned, end: aligned + size - 1, prefix, size };
  }

  function merge(intervals) {
    const sorted = intervals.map(iv => [iv[0], iv[1]]).sort((a, b) => a[0] - b[0]);
    const out = [];
    for (const [s, e] of sorted) {
      if (out.length && s <= out[out.length - 1][1] + 1) {
        out[out.length - 1][1] = Math.max(out[out.length - 1][1], e);
      } else {
        out.push([s, e]);
      }
    }
    return out;
  }

  const shift = (intervals, delta) => intervals.map(([s, e]) => [s + delta, e + delta]);

  const clip = (intervals, lo, hi) =>
    intervals.filter(([s, e]) => e >= lo && s <= hi).map(([s, e]) => [Math.max(s, lo), Math.min(e, hi)]);

  function intersect(a, b) {
    const out = [];
    for (const [s1, e1] of a) for (const [s2, e2] of b) {
      const s = Math.max(s1, s2), e = Math.min(e1, e2);
      if (s <= e) out.push([s, e]);
    }
    return merge(out);
  }

  // Parts of [lo, hi] not covered by intervals
  function complement(intervals, lo, hi) {
    const out = [];
    let cursor = lo;
    for (const [s, e] of merge(intervals)) {
      if (e < lo || s > hi) continue;
      if (s > cursor) out.push([cursor, s - 1]);
      cursor = Math.max(cursor, e + 1);
    }
    if (cursor <= hi) out.push([cursor, hi]);
    return out;
  }

  // Minimal list of aligned CIDRs covering the intervals exactly
  function toCidrs(intervals) {
    const out = [];
    for (let [s, e] of merge(intervals)) {
      while (s <= e) {
        let size = 1;
        while (size < MAX && s % (size * 2) === 0 && s + size * 2 - 1 <= e) size *= 2;
        out.push(`${intToIp(s)}/${32 - Math.log2(size)}`);
        s += size;
      }
    }
    return out;
  }

  function groupIntervals(group) {
    const out = [];
    for (const cidr of group.subnets || []) {
      try {
        const { start, end } = parseCidr(cidr);
        out.push([start, end]);
      } catch (e) { /* reported separately */ }
    }
    return merge(out);
  }

  const total = intervals => intervals.reduce((sum, [s, e]) => sum + e - s + 1, 0);

  // Human size: "/24" for exact powers of two, otherwise the address count
  function sizeLabel(count) {
    const bits = Math.log2(count);
    return Number.isInteger(bits) ? `/${32 - bits}` : null;
  }

  window.Net = {
    MAX, ipToInt, intToIp, parseCidr, parseNetwork, merge, shift, clip, intersect,
    complement, toCidrs, groupIntervals, total, sizeLabel,
  };
})();
