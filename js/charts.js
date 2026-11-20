/* =========================================================
   GRAFİKLER – Kütüphanesiz canvas çizimleri
   ========================================================= */

const Chart = {
  /** Retina ekranlar için canvas'ı hazırlar */
  setup(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  },

  /**
   * opts: { series:[{points:[[x,y]], color, width, dash, dots, label}], xMax, yMax,
   *         xLabel, yLabel, hLines:[{y, color, label}], vLines:[{x,color,label}], yFmt }
   */
  line(canvas, opts) {
    const { ctx, w, h } = this.setup(canvas);
    const pad = { l: 46, r: 12, t: 14, b: 30 };
    const css = getComputedStyle(document.documentElement);
    const muted = css.getPropertyValue("--muted").trim() || "#8b93b0";
    const grid = css.getPropertyValue("--grid").trim() || "#2a3150";
    const xMax = opts.xMax || 1, yMax = opts.yMax || 1;
    const X = (x) => pad.l + (x / xMax) * (w - pad.l - pad.r);
    const Y = (y) => h - pad.b - (Math.min(y, yMax * 1.05) / yMax) * (h - pad.t - pad.b);

    ctx.font = "11px Inter, system-ui, sans-serif";
    ctx.fillStyle = muted; ctx.strokeStyle = grid; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const yv = (yMax * i) / 4, yy = Y(yv);
      ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(w - pad.r, yy); ctx.stroke();
      ctx.textAlign = "right"; ctx.fillText((opts.yFmt || fmtK)(yv), pad.l - 6, yy + 4);
    }
    for (let i = 0; i <= 5; i++) {
      const xv = (xMax * i) / 5, xx = X(xv);
      ctx.textAlign = "center"; ctx.fillText(fmtK(xv), xx, h - pad.b + 15);
    }
    ctx.textAlign = "left"; ctx.fillText(opts.yLabel || "", pad.l + 4, pad.t + 2);
    ctx.textAlign = "right"; ctx.fillText(opts.xLabel || "", w - pad.r, h - 4);

    for (const l of opts.hLines || []) {
      ctx.setLineDash([5, 4]); ctx.strokeStyle = l.color; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(pad.l, Y(l.y)); ctx.lineTo(w - pad.r, Y(l.y)); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle = l.color; ctx.textAlign = "right";
      ctx.fillText(l.label, w - pad.r - 2, Y(l.y) - 4);
    }
    for (const l of opts.vLines || []) {
      ctx.setLineDash([3, 3]); ctx.strokeStyle = l.color; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(X(l.x), pad.t); ctx.lineTo(X(l.x), h - pad.b); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle = l.color; ctx.textAlign = "left";
      ctx.fillText(l.label, X(l.x) + 3, pad.t + 10);
    }
    for (const s of opts.series) {
      if (!s.points.length) continue;
      ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = s.width || 2;
      ctx.setLineDash(s.dash || []);
      if (s.dots) {
        for (const [x, y] of s.points) { ctx.beginPath(); ctx.arc(X(x), Y(y), 3.2, 0, Math.PI * 2); ctx.fill(); }
      } else {
        ctx.beginPath();
        s.points.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    // Lejant
    let lx = pad.l + 8;
    const legend = opts.series.filter((s) => s.label);
    if (legend.length > 1) {
      for (const s of legend) {
        ctx.fillStyle = s.color; ctx.fillRect(lx, pad.t + 12, 10, 3);
        ctx.fillStyle = muted; ctx.textAlign = "left"; ctx.fillText(s.label, lx + 14, pad.t + 17);
        lx += ctx.measureText(s.label).width + 30;
      }
    }
    // Anlık nokta
    if (opts.cursor) {
      ctx.fillStyle = "#fff"; ctx.strokeStyle = opts.cursor.color; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(X(opts.cursor.x), Y(opts.cursor.y), 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  },

  /** Yatay çubuk grafik: items [{label, value, color, note}] */
  bars(canvas, items, { unit = "", max } = {}) {
    const { ctx, w, h } = this.setup(canvas);
    const css = getComputedStyle(document.documentElement);
    const muted = css.getPropertyValue("--muted").trim() || "#8b93b0";
    const text = css.getPropertyValue("--text").trim() || "#fff";
    const top = max || Math.max(1, ...items.map((i) => i.value));
    const rowH = Math.min(34, (h - 10) / Math.max(1, items.length));
    ctx.font = "12px Inter, system-ui, sans-serif";
    items.forEach((it, i) => {
      const y = 6 + i * rowH;
      const bw = Math.max(4, ((w - 290) * it.value) / top);
      ctx.fillStyle = muted; ctx.textAlign = "right";
      ctx.fillText(it.label, 108, y + rowH / 2 + 4);
      ctx.fillStyle = it.color;
      roundRect(ctx, 116, y + 5, bw, rowH - 10, Math.min(6, bw / 2)); ctx.fill();
      ctx.fillStyle = text; ctx.textAlign = "left";
      ctx.fillText(`${Math.round(it.value)} ${unit}${it.note ? "  · " + it.note : ""}`, 122 + bw, y + rowH / 2 + 4);
    });
  }
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function fmtK(v) { return v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + "k" : String(Math.round(v)); }
