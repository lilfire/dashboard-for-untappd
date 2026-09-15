// Linjediagram i SVG uten avhengigheter. Punkter: [{ date: 'YYYY-MM-DD', value }],
// eller flere serier: [{ points, cls, label }].
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

  const time = p => Date.parse(`${p.date}T12:00:00`);
  // Smal skjerm får smalere viewBox, ellers skaleres teksten ned til det uleselige.
  const narrow = globalThis.matchMedia?.('(max-width: 600px)');

  function lineChart(container, input, { fmtValue = String, fmtDate = String } = {}) {
    container.textContent = '';
    container._chart = [input, { fmtValue, fmtDate }];
    const single = !input.length || input[0]?.points === undefined;
    const series = (single ? [{ points: input, cls: '', label: '' }] : input).filter(s => s.points.length);
    if (!series.length) return;
    const [W, H, m] = narrow?.matches
      ? [360, 260, { t: 16, r: 44, b: 30, l: 40 }]
      : [720, 240, { t: 16, r: 64, b: 30, l: 52 }];
    const all = series.flatMap(s => s.points);
    const values = all.map(p => p.value);
    const times = all.map(time);

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

    const ends = [];
    for (const s of series) {
      const cls = s.cls ? ` ${s.cls}` : '';
      const xy = s.points.map(p => [X(time(p)), Y(p.value)]);
      if (xy.length > 1) {
        const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
        if (single) {
          const area = `${line}L${xy.at(-1)[0].toFixed(1)},${Y(lo)}L${xy[0][0].toFixed(1)},${Y(lo)}Z`;
          svg.append(el('path', { class: 'area', d: area }));
        }
        svg.append(el('path', { class: `line${cls}`, d: line }));
      }
      const [ex, ey] = xy.at(-1);
      svg.append(el('circle', { class: `dot${cls}`, cx: ex, cy: ey, r: 4.5 }));
      ends.push({ x: ex, y: ey + 4, text: fmtValue(s.points.at(-1).value), cls });
    }
    // Endeverdiene skyves fra hverandre så de ikke havner oppå hverandre.
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) {
      if (Math.abs(ends[i].x - ends[i - 1].x) < 40) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 14);
    }
    for (const e of ends) svg.append(el('text', { class: `end-label${e.cls}`, x: e.x + 8, y: e.y }, e.text));

    const dates = [...new Set(all.map(p => p.date))].sort();
    const labelIdx = [...new Set([0, Math.floor((dates.length - 1) / 2), dates.length - 1])];
    for (const i of labelIdx) {
      const anchor = dates.length === 1 ? 'middle' : i === 0 ? 'start' : i === dates.length - 1 ? 'end' : 'middle';
      svg.append(el('text', { class: 'axis', x: X(Date.parse(`${dates[i]}T12:00:00`)), y: H - 8, 'text-anchor': anchor }, fmtDate(dates[i])));
    }

    const describe = s => s.points.map(p => `${fmtDate(p.date)}: ${fmtValue(p.value)}`).join('\n');
    const title = el('title', {}, single ? describe(series[0]) : series.map(s => `${s.label}\n${describe(s)}`).join('\n\n'));
    svg.prepend(title);
    container.append(svg);
  }

  // Tegn på nytt når bredden krysser grensen (rotasjon, smalere vindu).
  narrow?.addEventListener?.('change', () => {
    for (const c of document.querySelectorAll('.chart')) if (c._chart) lineChart(c, ...c._chart);
  });

  root.DFU = root.DFU || {};
  root.DFU.charts = { lineChart };
})(globalThis);
