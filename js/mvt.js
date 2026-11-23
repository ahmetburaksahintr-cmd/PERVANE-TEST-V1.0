/* =========================================================
   VEKTÖR KARO ÇÖZÜCÜ – Mapbox Vector Tile (MVT 2.1) okuyucu
   ---------------------------------------------------------
   OpenFreeMap'in .pbf karolarını (OpenMapTiles şeması) çözer.
   Gerçek dünya uçuşunda binalar (yükseklikleriyle) ve sokaklar
   (adlarıyla) buradan gelir. Dış kütüphane gerektirmez.

   Mvt.decode(arrayBuffer, ["building", "transportation"]) →
     { building: { extent, features: [{ type, tags, rings }] }, ... }
   type: 1 nokta, 2 çizgi, 3 alan. rings: [[x, y, x, y, …], …]
   (karo koordinatı; 0..extent, y aşağı doğru)
   ========================================================= */

const Mvt = {
  decode(buf, want) {
    const p = new MvtPbf(new Uint8Array(buf)), layers = {};
    while (p.pos < p.end) {
      const [field, wt] = p.tag();
      if (field === 3 && wt === 2) {
        const end = p.varint() + p.pos, layer = this.layer(p, end, want);
        if (layer) layers[layer.name] = layer;
        p.pos = end;
      } else p.skip(wt);
    }
    return layers;
  },

  layer(p, end, want) {
    const L = { name: "", extent: 4096, keys: [], values: [], raw: [] };
    while (p.pos < end) {
      const [field, wt] = p.tag();
      if (field === 1) { L.name = p.string(); if (want && !want.includes(L.name)) return null; }
      else if (field === 2) { const fe = p.varint() + p.pos; L.raw.push([p.pos, fe]); p.pos = fe; }
      else if (field === 3) L.keys.push(p.string());
      else if (field === 4) L.values.push(this.value(p));
      else if (field === 5) L.extent = p.varint();
      else p.skip(wt);
    }
    L.features = L.raw.map(([s, e]) => { p.pos = s; return this.feature(p, e, L); });
    delete L.raw;
    return L;
  },

  value(p) {
    const end = p.varint() + p.pos;
    let v = null;
    while (p.pos < end) {
      const [field, wt] = p.tag();
      if (field === 1) v = p.string();
      else if (field === 2) v = p.float();
      else if (field === 3) v = p.double();
      else if (field === 4 || field === 5) v = p.varint();
      else if (field === 6) v = p.svarint();
      else if (field === 7) v = !!p.varint();
      else p.skip(wt);
    }
    return v;
  },

  feature(p, end, L) {
    const f = { id: null, type: 0, tags: {}, rings: [] };
    let geom = null;
    while (p.pos < end) {
      const [field, wt] = p.tag();
      if (field === 1) f.id = p.varint();
      else if (field === 2) { const e = p.varint() + p.pos; while (p.pos < e) { const k = L.keys[p.varint()]; f.tags[k] = L.values[p.varint()]; } }
      else if (field === 3) f.type = p.varint();
      else if (field === 4) { const e = p.varint() + p.pos; geom = []; while (p.pos < e) geom.push(p.varint()); }
      else p.skip(wt);
    }
    if (geom) f.rings = this.geometry(geom);
    return f;
  },

  /** Komut dizisi: MoveTo(1) / LineTo(2) / ClosePath(7); koordinatlar zigzag kodlu farklar */
  geometry(g) {
    const rings = [];
    let x = 0, y = 0, cur = null, i = 0;
    const zz = (n) => (n >>> 1) ^ -(n & 1);
    while (i < g.length) {
      const cmd = g[i] & 7, cnt = g[i] >> 3;
      i++;
      if (cmd === 7) { continue; }
      for (let k = 0; k < cnt; k++) {
        x += zz(g[i++]); y += zz(g[i++]);
        if (cmd === 1) { cur = [x, y]; rings.push(cur); } else cur.push(x, y);
      }
    }
    return rings;
  },

  /** Halkanın işaretli alanı (karo koordinatında; MVT'de dış halka pozitif) */
  area(r) {
    let a = 0;
    for (let i = 0, n = r.length; i < n; i += 2) { const j = (i + 2) % n; a += r[i] * r[j + 1] - r[j] * r[i + 1]; }
    return a / 2;
  },

  /** Alan özelliğini çokgenlere böler: [{ outer, holes: [] }] */
  polygons(f) {
    const out = [];
    for (const r of f.rings) {
      if (r.length < 6) continue;
      const a = this.area(r);
      if (a > 0 || !out.length) out.push({ outer: r, holes: [] });
      else if (a < 0) out[out.length - 1].holes.push(r);
    }
    return out;
  }
};

/** Küçük protobuf okuyucu (yalnızca MVT'nin kullandığı türler) */
class MvtPbf {
  constructor(buf) { this.buf = buf; this.pos = 0; this.end = buf.length; this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength); }
  varint() {
    let r = 0, s = 0, b;
    do { b = this.buf[this.pos++]; if (s < 28) r |= (b & 0x7f) << s; else r += (b & 0x7f) * Math.pow(2, s); s += 7; } while (b >= 0x80);
    return r >>> 0 === r ? r : r < 0 ? r >>> 0 : r;
  }
  svarint() { const n = this.varint(); return n % 2 === 1 ? (n + 1) / -2 : n / 2; }
  tag() { const t = this.varint(); return [t >>> 3, t & 7]; }
  string() { const len = this.varint(), s = this.pos; this.pos += len; return MvtPbf.td.decode(this.buf.subarray(s, this.pos)); }
  float() { const v = this.view.getFloat32(this.pos, true); this.pos += 4; return v; }
  double() { const v = this.view.getFloat64(this.pos, true); this.pos += 8; return v; }
  skip(wt) {
    if (wt === 0) this.varint();
    else if (wt === 1) this.pos += 8;
    else if (wt === 2) this.pos += this.varint();
    else if (wt === 5) this.pos += 4;
    else throw new Error("MVT: bilinmeyen alan türü " + wt);
  }
}
MvtPbf.td = new TextDecoder();
if (typeof module !== "undefined") module.exports = { Mvt, MvtPbf };
