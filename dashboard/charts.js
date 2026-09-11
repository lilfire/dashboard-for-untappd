// Linjediagram i SVG uten avhengigheter. Punkter: [{ date: 'YYYY-MM-DD', value }].
(function (root) {
  const NS = 'http://www.w3.org/2000/svg';

  function el(name, attrs, text) {
    const node = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text != null) node.textContent = text;
    return node;
  }

  function niceStep(raw) {
    const pow = 10 ** Math.floor(Math.log10(raw || 1));
    return [1, 2, 5, 10].map(m => m * pow).find(s => s >= raw) ?? 10 * pow;
  }

  function lineChart(container, points, { fmtValue = String, fmtDate = String } = {}) {
    container.textContent = '';
    const W = 720, H = 240, m = { t: 16, r: 64, b: 30, l: 52 };
    const times = points.map(p => Date.parse(`${p.date}T12:00:00`));
    const values = points.map(p => p.value);

    let lo = Math.min(...values), hi = Math.max(...values);
    if (lo === hi) { lo -= 1; hi += 1; }
    const step = niceStep((hi - lo) / 4);
    lo = Math.max(0, Math.floor(lo / step) * step);
    hi = Math.ceil(hi / step) * step;

    const t0 = Math.min(...times), t1 = Math.max(...times);
    const X = t => (t1 === t0 ? (m.l + W - m.r) / 2 : m.l + (t - t0) / (t1 - t0) * (W - m.l - m.r));
    const Y = v => H - m.b - (v - lo) / (hi - lo) * (H - m.t - m.b);

    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' });
    for (let v = lo; v <= hi + step / 2; v += step) {
      svg.append(el('line', { class: 'grid', x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v) }));
      svg.append(el('text', { class: 'axis', x: m.l - 8, y: Y(v) + 4, 'text-anchor': 'end' }, fmtValue(v)));
    }

    const xy = points.map((p, i) => [X(times[i]), Y(p.value)]);
    if (xy.length > 1) {
      const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
      const area = `${line}L${xy.at(-1)[0].toFixed(1)},${Y(lo)}L${xy[0][0].toFixed(1)},${Y(lo)}Z`;
      svg.append(el('path', { class: 'area', d: area }));
      svg.append(el('path', { class: 'line', d: line }));
    }
    const [ex, ey] = xy.at(-1);
    svg.append(el('circle', { class: 'dot', cx: ex, cy: ey, r: 4.5 }));
    svg.append(el('text', { class: 'end-label', x: ex + 8, y: ey + 4 }, fmtValue(values.at(-1))));

    const labelIdx = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
    for (const i of labelIdx) {
      const anchor = points.length === 1 ? 'middle' : i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle';
      svg.append(el('text', { class: 'axis', x: X(times[i]), y: H - 8, 'text-anchor': anchor }, fmtDate(points[i].date)));
    }

    const title = el('title', {}, points.map(p => `${fmtDate(p.date)}: ${fmtValue(p.value)}`).join('\n'));
    svg.prepend(title);
    container.append(svg);
  }

  root.DFU = root.DFU || {};
  root.DFU.charts = { lineChart };
})(globalThis);
