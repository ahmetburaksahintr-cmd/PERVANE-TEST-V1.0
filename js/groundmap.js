/* =========================================================
   ZEMİN HARİTASI – gerçek dünya uçuşunda yerin kendisi
   ---------------------------------------------------------
   "Açık veri" kaynağında yer, Esri uydu görüntüsüdür: drone
   yüksekliğinde bulanıktır ve OpenStreetMap bina tabanlarıyla
   tam örtüşmez. Bu dosya aynı OpenFreeMap vektör karolarından
   (OpenMapTiles şeması) keskin bir zemin haritası çizer ve onu
   Cesium'a bir görüntü katmanı (ImageryProvider) olarak verir:

   · yollar gerçek genişlikleriyle: kaldırım, bordür, asfalt,
     şerit çizgileri, yaya geçitleri; köprüler gölgeleriyle
   · meydanlar ve yaya yolları (taş döşeme), merdivenler
   · park, bahçe, çim, orman (tek tek ağaçlar ve gölgeleri), kum
   · deniz, göl, dere (kıyı çizgisiyle), havuz
   · raylar (balast, travers, ray), tramvay
   · bina tabanları ve güneş yönündeki gölgeleri (World.setupLight
     ile aynı yön: 3D binalar yere gölge düşürüyormuş gibi görünür)

   Binalar world.js'te aynı karolardan kurulduğu için zemin ile
   binalar birebir oturur.

   Kullanım (Cesium yüklendikten sonra):
     const p = GroundMap.createProvider({ tileUrl: () => World.tileUrl(), overlay: false });
     viewer.imageryLayers.addImageryProvider(p);
   overlay: true → arka plan saydam; yalnızca yollar, meydanlar,
   raylar ve bina tabanları uydu görüntüsünün üstüne çizilir.

   Karolar: Web Mercator, 512 piksel, seviye 0–21
   · z < 10 : saydam (alttaki uydu görüntüsü görünür)
   · 10–14  : o seviyenin vektör karosu
   · z > 14 : z14 karosunun ilgili parçası büyük ölçekte çizilir
              (vektör olduğu için bulanıklaşmaz)
   Çizim ana iş parçacığında, karede en çok 3 karo (≈10 ms) olacak
   şekilde sıraya alınır; uçuş akıcılığı bozulmaz.
   ========================================================= */

const GroundMap = (() => {
  const TAU = Math.PI * 2, EARTH = 6378137;

  const GM = {
    SIZE: 512,                 // karo kenarı (piksel)
    MAX_LEVEL: 21,             // en ayrıntılı seviye (41° enlemde 1 piksel ≈ 3 cm)
    SRC_MAX: 14,               // OpenFreeMap'in en ayrıntılı vektör seviyesi
    MIN_LEVEL: 10,             // bunun altındaki seviyeler saydam
    CACHE: 48,                 // bellekte tutulan çözülmüş vektör karosu
    PER_FRAME: 3,              // bir karede en çok kaç karo çizilir
    FRAME_MS: 10,              // bir karede çizime ayrılan süre (ms)
    MAX_PENDING: 48,           // aynı anda bekleyen istek sınırı; fazlasını Cesium sonraki karede yeniden ister
    RETRY_MS: 15000,           // indirilemeyen karo bu süre dolmadan yeniden denenmez
    LAYERS: ["water", "waterway", "landcover", "landuse", "transportation", "building", "aeroway"],
    SUN: { e: -0.8, n: 0.7, u: -1.3 },   // ışığın gidiş yönü (doğu, kuzey, yukarı) – World.setupLight ile aynı; gölgeler kuzeybatıya düşer
    BRIDGE_H: 5.5,             // köprü katı başına yükseklik (m), gölge uzunluğu için

    /* ---------------- Renkler ---------------- */
    COLORS: {
      base: "#d6d1c7",                                   // şehir zemini (beton, avlu)
      land: {                                            // arazi kullanımı tonları
        residential: "#d9d2c6", commercial: "#dbcec5", retail: "#ddccc3", industrial: "#cfcbcc", garages: "#ccc8c4",
        railway: "#cac2b7", school: "#dfd5bd", university: "#dfd5bd", college: "#dfd5bd", kindergarten: "#dfd5bd",
        hospital: "#dfcfca", cemetery: "#b6c1a0", military: "#cecabe", stadium: "#cdc8bf", pitch: "#76a956",
        playground: "#cdb898", track: "#b06f58", zoo: "#bccb9b", theme_park: "#d2c8b0", quarry: "#c5bcae",
        construction: "#d2c5a9", brownfield: "#cfc5ae", dam: "#c4bfb5", bus_station: "#cbc6bf", library: "#dcd1c1"
      },
      cover: {                                           // bitki örtüsü (önce alt sınıf, yoksa sınıf)
        grass: "#9db86a", park: "#8fb35f", garden: "#92b463", golf_course: "#8bb960", meadow: "#abba74", grassland: "#abba74",
        scrub: "#8ea464", heath: "#a2a773", allotments: "#a7b46d", recreation_ground: "#94b563", village_green: "#94b563",
        wood: "#58803f", forest: "#58803f", farmland: "#ccc58f", farm: "#ccc58f", orchard: "#a8b773", vineyard: "#b4b578",
        plant_nursery: "#a2b46e", sand: "#e3d4a5", beach: "#e7d7aa", dune: "#e1d09f", wetland: "#9bb192", marsh: "#9bb192",
        rock: "#bab4a8", bare_rock: "#bab4a8", scree: "#c1bbaf", ice: "#ecf1f3", glacier: "#ecf1f3"
      },
      water: "#3c6e98", pool: "#56b3d2", coping: "#e6e4de", shore: "#6d9fc4", foam: "#dfe9ef", stream: "#4a7ca5",
      building: ["#bbb1a5", "#b2a89d", "#ae8e7b", "#a59f99"],   // çatı tonları (beton, koyu beton, kiremit, gri)
      buildingLine: "#7b7269", shadow: "rgba(26, 32, 50, 0.30)", treeShadow: "rgba(22, 40, 20, 0.34)", ao: "rgba(20, 24, 30, 0.10)",
      sidewalk: "#ccc6bb", sidewalkEdge: "#b1aba1", curb: "#e8e6e0",
      paving: "#e0d9cc", pavingEdge: "#b6afa3", platform: "#d0cbc1", tactile: "#d4ae3a", pier: "#cdc4b3", pierEdge: "#8d8477",
      dirt: "#cdb58f", dirtEdge: "#ad9873", track: "#b39f80", trackEdge: "#98856a", construction: "#8e8a83",
      marking: "#f1f1ec", bridgeEdge: "#6e6a65", deck: "#c3beb5",
      rail: { bed: "#9a9086", sleeper: "#67584a", steel: "#c4c7ca", far: "#8d857c", tram: "#8a8d90" },
      aero: { aerodrome: "#cdd2bb", apron: "#bcb9b3", runway: "#54575b", taxiway: "#65676a", helipad: "#7a7c7f", line: "#e1b83b" }
    },

    /* ---------------- Yollar: genişlik (m), kaldırım (m), çizim sırası ----------------
       one: tek yönlü yolda genişlik çarpanı (bölünmüş yolun bir yarısı) · verge: kaldırımsız yolda kenar şeridi
       mark: dash kesikli orta çizgi · solid düz · double çift düz · motor: kenar çizgileri de çizilir */
    ROADS: {
      motorway:  { w: 22, one: 0.55, side: 0,   verge: 1.4, rank: 9, col: "#4a4d51", edge: "#a39b8e", mark: "dash", motor: true, minPx: 2.2 },
      trunk:     { w: 18, one: 0.6,  side: 0,   verge: 1.2, rank: 8, col: "#4c4f53", edge: "#a39b8e", mark: "double", motor: true, minPx: 2 },
      primary:   { w: 14, one: 0.62, side: 3,   rank: 7, col: "#4e5155", mark: "double", minPx: 1.8 },
      secondary: { w: 12, one: 0.62, side: 2.6, rank: 6, col: "#525559", mark: "solid", minPx: 1.6 },
      tertiary:  { w: 10, one: 0.7,  side: 2.4, rank: 5, col: "#55585c", mark: "dash", minPx: 1.4 },
      minor:     { w: 7,  one: 0.75, side: 2,   rank: 4, col: "#595c5f", mark: "dash", minPx: 1 },
      busway:    { w: 7,  one: 1,    side: 0,   verge: 0.4, rank: 4, col: "#5d5353", edge: "#d9d5cd", minPx: 1 },
      raceway:   { w: 10, one: 1,    side: 0,   verge: 1, rank: 4, col: "#4b4d51", edge: "#c9c4ba", minPx: 1 },
      service:   { w: 4.5, one: 1,   side: 0,   verge: 0.3, rank: 3, col: "#606265", edge: "#d6d2ca", minPx: 0.7 }
    },
    SERVICE_W: { parking_aisle: 4.2, driveway: 3.5, alley: 3.6, "drive-through": 3.5, emergency_access: 3.5 },
    PATHS: {                   // yaya yolları (transportation: class path, alt sınıfa göre)
      footway:    { w: 2.2, col: "#ddd6c8", edge: "#b6afa3", pave: true },
      pedestrian: { w: 8,   col: "#e2dcd0", edge: "#bcb5a9", pave: true, rank: 1.5 },
      cycleway:   { w: 2,   col: "#b88577", edge: "#9a6d61" },
      steps:      { w: 2.6, col: "#d8d2c6", edge: "#a19a8d", steps: true, rank: 1.2 },
      path:       { w: 1.6, col: "#ddd6c8", edge: "#b6afa3", dirt: true },
      bridleway:  { w: 2,   col: "#ddd6c8", edge: "#b6afa3", dirt: true },
      platform:   { w: 3,   col: "#d0cbc1", edge: "#a7a196" },
      pier:       { w: 4,   col: "#cdc4b3", edge: "#8d8477", rank: 1.3 },
      other:      { w: 2,   col: "#ddd6c8", edge: "#b6afa3" }
    },
    WATERWAYS: { river: 18, canal: 12, stream: 3, drain: 2, ditch: 1.5 },
    /* Ağaçlar: aralık (m), bir hücrede ağaç olma olasılığı, taç yarıçapı (m), taç yüksekliği (m, gölge boyu) */
    TREES: {
      wood:     { gap: 4.6, keep: 0.9,  r: 3.0, h: 9, set: 0, seed: 1 },
      forest:   { gap: 4.6, keep: 0.9,  r: 3.0, h: 9, set: 0, seed: 1 },
      park:     { gap: 9,   keep: 0.5,  r: 3.3, h: 7, set: 0, seed: 2 },
      garden:   { gap: 8,   keep: 0.35, r: 2.4, h: 5, set: 0, seed: 3 },
      recreation_ground: { gap: 13, keep: 0.25, r: 3, h: 6, set: 0, seed: 4 },
      village_green: { gap: 13, keep: 0.25, r: 3, h: 6, set: 0, seed: 4 },
      scrub:    { gap: 4,   keep: 0.45, r: 1.3, h: 1.5, set: 2, seed: 5 },
      orchard:  { gap: 6,   keep: 0.95, r: 1.9, h: 3.5, set: 2, seed: 6 },
      cemetery: { gap: 6,   keep: 0.55, r: 1.5, h: 7, set: 1, seed: 7 }
    },
    TEX: { mottle: 0.07, grain: 0.06, grass: 0.14, pavers: 0.85, canopy: 0.9 },   // doku yoğunlukları
    TREE_MAX: 6000,            // bir karoda en çok ağaç
    SHADOW_MPP: 2,             // bina gölgeleri piksel başına en çok bu kadar metrede çizilir (z15 ve üstü)

    /** Cesium görüntü sağlayıcısı (ImageryProvider arayüzü). Cesium yüklendikten sonra çağrılmalı. */
    createProvider(opts = {}) {
      const C = Cesium, ts = new C.WebMercatorTilingScheme(), src = new Source(opts);
      // Boş karo (z < 10, veri yok, indirilemedi): Cesium bu karoyu atar; yerine bu katmanın hazır bir üst seviyesi,
      // o da yoksa alttaki katman (uydu görüntüsü) görünür. Doku yüklenmez.
      src.empty = C.DiscardEmptyTileImagePolicy.EMPTY_IMAGE;
      return {
        tilingScheme: ts, rectangle: ts.rectangle, tileWidth: GM.SIZE, tileHeight: GM.SIZE,
        minimumLevel: 0, maximumLevel: GM.MAX_LEVEL, tileDiscardPolicy: new C.DiscardEmptyTileImagePolicy(), proxy: undefined,
        hasAlphaChannel: true, errorEvent: new C.Event(), source: src,
        credit: new C.Credit('Zemin haritası: <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap katkıcıları</a>', false),
        getTileCredits() { return undefined; },
        requestImage(x, y, level) { return src.request(x, y, level); },
        pickFeatures() { return undefined; }
      };
    },
    /** Kısayol: sağlayıcıyı kurar, görüntüleyiciye katman olarak ekler ve katmanı döndürür */
    addTo(viewer, opts) { return viewer.imageryLayers.addImageryProvider(GM.createProvider(opts)); }
  };

  /* =========================================================
     Karo kaynağı: indirme, önbellek, çizim sırası
     ========================================================= */
  class Source {
    constructor(opts) {
      this.tileUrl = opts.tileUrl; this.overlay = !!opts.overlay; this.fallback = opts.fallback || "empty"; this.empty = null;
      this.cache = new Map(); this.loading = new Map(); this.failed = new Map();
      this.queue = []; this.prepQ = []; this.raf = 0; this.pending = 0; this.tpl = null; this.warned = false;
      this.stats = { drawn: 0, ms: 0, max: 0, fetched: 0, failed: 0, prepMs: 0, levels: {} };
    }

    /** Cesium'un istediği karo: söz (canvas) ya da şu an çok istek varsa undefined (sonra yeniden istenir) */
    request(x, y, z) {
      if (z < GM.MIN_LEVEL) return Promise.resolve(this.blank());
      if (this.pending >= GM.MAX_PENDING) return undefined;
      this.pending++;
      const zs = Math.min(z, GM.SRC_MAX), k = 2 ** (z - zs);
      return this.load(zs, Math.floor(x / k), Math.floor(y / k))
        .then((T) => this.schedule(() => this.render(T, z, x, y)), () => this.blank(true))
        .finally(() => { this.pending--; });
    }
    /** Boş karo: Cesium'da atılan boş görüntü; fallback "base" ise (ya da Cesium dışında) düz zemin / saydam */
    blank(failed) {
      if (this.empty && !(failed && this.fallback === "base" && !this.overlay)) return this.empty;
      return still(!!failed && !this.overlay);
    }

    /** Karo adresi kalıbı (World.tileUrl gibi zaman uyumsuz bir işlev ya da doğrudan metin) */
    template() {
      if (!this.tpl) {
        this.tpl = Promise.resolve().then(() => (typeof this.tileUrl === "function" ? this.tileUrl() : this.tileUrl))
          .then((t) => { if (!t) throw new Error("Zemin karosu adresi yok"); return t; })
          .catch((e) => { this.tpl = null; throw e; });
      }
      return this.tpl;
    }

    /** Vektör karosunu indirir, çözer ve hazırlar (önbellekli; aynı anda gelen istekler tek indirmede birleşir) */
    load(z, x, y) {
      const key = z + "/" + x + "/" + y, c = this.cache.get(key);
      if (c) { this.cache.delete(key); this.cache.set(key, c); return Promise.resolve(c); }
      const f = this.failed.get(key);
      if (f && performance.now() - f < GM.RETRY_MS) return Promise.reject(new Error("Zemin karosu yok"));
      let p = this.loading.get(key);
      if (p) return p;
      p = this.template()
        .then((tpl) => fetch(tpl.replace("{z}", z).replace("{x}", x).replace("{y}", y), { signal: AbortSignal.timeout(20000) }))
        .then((r) => { if (!r.ok) throw new Error("Zemin karosu indirilemedi (" + r.status + ")"); return r.arrayBuffer(); })
        .then((buf) => this.schedule(() => {
          const t0 = performance.now(), T = prepare(Mvt.decode(buf, GM.LAYERS), z, x, y);
          this.stats.prepMs += performance.now() - t0; this.stats.fetched++;
          return T;
        }, true));
      this.loading.set(key, p);
      p.then((T) => {
        this.cache.set(key, T); this.failed.delete(key);
        while (this.cache.size > GM.CACHE) this.cache.delete(this.cache.keys().next().value);
      }, (e) => {
        this.failed.set(key, performance.now()); this.stats.failed++;
        if (!this.warned) { this.warned = true; console.warn("Zemin haritası:", e && e.message ? e.message : e); }
      }).finally(() => this.loading.delete(key));
      return p;
    }

    /** İşi sıraya koyar. Her karede önce en fazla bir karo çözümü (prep), sonra çizimler (en son istenen önce);
        toplam en çok PER_FRAME iş ve FRAME_MS süre. Böylece uçuş sırasında kare süresi kısa kalır. */
    schedule(fn, prep) {
      return new Promise((res, rej) => {
        (prep ? this.prepQ : this.queue).push({ fn, res, rej });
        if (!this.raf) this.raf = requestAnimationFrame(() => this.run());
      });
    }
    run() {
      this.raf = 0;
      const t0 = performance.now();
      let n = 0;
      const exec = (job) => { n++; try { job.res(job.fn()); } catch (e) { job.rej(e); } };
      if (this.prepQ.length) exec(this.prepQ.shift());
      while (this.queue.length && n < GM.PER_FRAME && (n === 0 || performance.now() - t0 < GM.FRAME_MS)) exec(this.queue.pop());
      if (this.queue.length || this.prepQ.length) this.raf = requestAnimationFrame(() => this.run());
    }

    /** Bir karoyu çizer; hata olursa düz zemin döner (katman hiçbir zaman bozulmaz) */
    render(T, z, x, y) {
      const t0 = performance.now();
      let cv;
      try { cv = draw(T, z, x, y, this.overlay); } catch (e) {
        if (!this.warnedDraw) { this.warnedDraw = true; console.warn("Zemin haritası çizilemedi:", e); }
        return still(!this.overlay);
      }
      const ms = performance.now() - t0, s = this.stats, L = s.levels[z] || (s.levels[z] = { n: 0, ms: 0, max: 0 });
      s.drawn++; s.ms += ms; if (ms > s.max) s.max = ms;
      L.n++; L.ms += ms; if (ms > L.max) L.max = ms;
      return cv;
    }
  }
  GM.Source = Source;

  /* ---------------- Ortak düz karolar ---------------- */
  let BLANK = null, BASE = null;
  function canvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
  /** opaque: düz zemin rengi (veri yok / hata), değilse saydam */
  function still(opaque) {
    if (opaque) {
      if (!BASE) { BASE = canvas(GM.SIZE, GM.SIZE); const g = BASE.getContext("2d"); g.fillStyle = GM.COLORS.base; g.fillRect(0, 0, GM.SIZE, GM.SIZE); }
      return BASE;
    }
    return BLANK || (BLANK = canvas(GM.SIZE, GM.SIZE));
  }

  /* =========================================================
     Hazırlık: çözülmüş vektör karosunu çizime uygun listelere ayırır
     ========================================================= */
  const LAND_PRI = { residential: 1, commercial: 2, retail: 2, industrial: 2, garages: 2, railway: 2, pitch: 4, playground: 4, track: 4 };
  const COVER_PRI = { farmland: 1, rock: 1, ice: 1, grass: 2, sand: 2, wetland: 2, wood: 3 };
  /** Güneş: 1 m yüksekliğin yere düşen gölgesinin yatay kayması, karo yönünde (x doğu, y güney) */
  const sunX = () => GM.SUN.e / -GM.SUN.u, sunY = () => GM.SUN.n / GM.SUN.u;
  const hash = (a, b, s) => { const v = Math.sin(a * 12.9898 + b * 78.233 + s * 37.719) * 43758.5453; return v - Math.floor(v); };
  function bbox(r) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < r.length; i += 2) {
      const x = r[i], y = r[i + 1];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return [x0, y0, x1, y1];
  }
  function area(r) { let a = 0; for (let i = 0, n = r.length; i < n; i += 2) { const j = (i + 2) % n; a += r[i] * r[j + 1] - r[j] * r[i + 1]; } return a / 2; }
  /** Nokta çokgenin (delikleriyle) içinde mi (çift-tek kuralı) */
  function inPoly(rings, x, y) {
    let c = false;
    for (const r of rings) {
      for (let i = 0, n = r.length, j = n - 2; i < n; j = i, i += 2) {
        const yi = r[i + 1], yj = r[j + 1];
        if ((yi > y) !== (yj > y) && x < ((r[j] - r[i]) * (y - yi)) / (yj - yi) + r[i]) c = !c;
      }
    }
    return c;
  }
  const scaled = (r, f) => (f === 1 ? r : r.map((v) => v * f));
  function eachPoly(layer, E, cb) {
    if (!layer) return;
    const f = E / layer.extent;
    for (const ft of layer.features) {
      if (ft.type !== 3) continue;
      for (const p of Mvt.polygons(ft)) {
        const rings = [scaled(p.outer, f)];
        for (const h of p.holes) if (h.length >= 6) rings.push(scaled(h, f));
        cb(ft.tags, rings, bbox(rings[0]), ft);
      }
    }
  }
  function eachLine(layer, E, cb) {
    if (!layer) return;
    const f = E / layer.extent;
    for (const ft of layer.features) {
      if (ft.type !== 2) continue;
      for (const r of ft.rings) if (r.length >= 4) { const q = scaled(r, f); cb(ft.tags, q, bbox(q)); }
    }
  }
  /** Bilinmeyen bina yüksekliği: world.js'teki (makeBuilding) taban alanı tahmininin ortalaması */
  function bldHeight(t, A) {
    let top = Number(t.render_height);
    const base = Number(t.render_min_height) || 0;
    if (!(isFinite(top) && top > 0 && top !== 5)) {
      const floors = A < 30 ? 1 : A < 90 ? 2.5 : A < 260 ? 4 : A < 1400 ? 5.5 : 2.5;
      top = base + floors * (A >= 1400 ? 4.2 : 3) + 0.7;
    }
    return [Math.max(base + 2.4, Math.min(top, 400)), base];
  }

  const styleCache = new Map();
  /** Yol çizgisinin görünüşü (genişlik, kaldırım, renk, şerit çizgisi) */
  function roadStyle(t) {
    let cls = String(t.class || "");
    const con = cls.endsWith("_construction");
    if (con) cls = cls.slice(0, -13);
    const sub = String(t.subclass || ""), one = t.oneway === 1 || t.oneway === -1, ramp = t.ramp === 1;
    const svc = String(t.service || ""), surf = String(t.surface || "");
    const key = cls + "|" + sub + "|" + (one ? 1 : 0) + (ramp ? 1 : 0) + (con ? 1 : 0) + "|" + svc + "|" + surf;
    let st = styleCache.get(key);
    if (st !== undefined) return st;
    const C = GM.COLORS;
    st = null;
    if (cls === "path" || cls === "pier") {
      const P = GM.PATHS[cls === "pier" ? "pier" : sub] || GM.PATHS.other;
      const soft = surf === "unpaved" || (P.dirt && surf !== "paved");
      st = { kind: "path", rank: P.rank || 1, w: P.w, side: 0, col: soft ? C.dirt : P.col, edge: soft ? C.dirtEdge : P.edge,
        pave: !!P.pave && !soft, steps: !!P.steps, minPx: sub === "pedestrian" ? 1 : 0.6, dirt: soft };
    } else if (cls === "track") {
      const paved = surf === "paved";
      st = { kind: "path", rank: 2, w: 3, side: 0, col: paved ? "#77797b" : C.track, edge: paved ? "#5d5f61" : C.trackEdge, minPx: 0.6, dirt: !paved };
    } else {
      const R = GM.ROADS[cls];
      if (R) {
        let w = cls === "service" ? GM.SERVICE_W[svc] || R.w : R.w;
        if (one) w *= R.one;
        if (ramp) w = Math.min(w, R.w * 0.55, 7);
        let mark = con || cls === "service" ? null : ramp ? (R.motor ? "edge" : null) : R.mark;
        if (mark === "dash" && w < 5) mark = null;                    // dar sokakta orta çizgi yok
        if (one && mark && mark !== "edge") mark = "lanes";           // tek yönlü: yalnızca şerit ayırıcılar
        st = { kind: "road", rank: R.rank - (ramp ? 0.5 : 0), w, side: ramp ? 0 : R.side, verge: R.verge || 0,
          col: con ? C.construction : R.col, edge: R.edge || C.sidewalkEdge, mark, motor: !!R.motor, oneway: one, minPx: R.minPx };
      }
    }
    if (st) st.key = key;
    styleCache.set(key, st);
    return st;
  }

  /** Çözülmüş karo → çizim listeleri */
  function prepare(L, z, x, y) {
    const any = L.transportation || L.building || L.landuse || L.landcover || L.water;
    const E = any ? any.extent : 4096, n = 2 ** z;
    const lat = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / n)));
    const T = { z, x, y, E, mpu: (TAU * EARTH * Math.cos(lat)) / (n * E),
      land: [], cover: [], water: [], pools: [], wway: [], aeroA: [], aeroL: [], areas: [], bareas: [], lines: [], rails: [],
      blds: [], zebras: [], treeAreas: [], levels: [] };
    const C = GM.COLORS;
    eachPoly(L.landuse, E, (t, rings, bb) => {
      const col = C.land[t.class];
      if (!col) return;
      T.land.push({ col, pri: LAND_PRI[t.class] || 3, tex: "", rings, bb });
      const tr = GM.TREES[t.class];
      if (tr) T.treeAreas.push({ rings, bb, tree: tr });
    });
    eachPoly(L.landcover, E, (t, rings, bb) => {
      const col = C.cover[t.subclass] || C.cover[t.class];
      if (!col) return;
      const tex = t.class === "wood" ? "wood" : t.class === "grass" || t.class === "farmland" || t.class === "wetland" ? "grass" : "sand";
      T.cover.push({ col, pri: COVER_PRI[t.class] || 2, tex, rings, bb });
      const tr = GM.TREES[t.subclass] || GM.TREES[t.class];
      if (tr) T.treeAreas.push({ rings, bb, tree: tr });
    });
    eachPoly(L.water, E, (t, rings, bb) => {
      (t.class === "swimming_pool" ? T.pools : T.water).push({ rings, bb, dry: t.intermittent === 1 });
    });
    eachLine(L.waterway, E, (t, ring, bb) => {
      if (t.brunnel === "tunnel") return;
      T.wway.push({ w: GM.WATERWAYS[t.class] || 2, ring, bb });
    });
    eachPoly(L.aeroway, E, (t, rings, bb) => { const col = C.aero[t.class]; if (col) T.aeroA.push({ col, pri: t.class === "aerodrome" ? 0 : t.class === "apron" ? 1 : 2, tex: "", rings, bb }); });
    eachLine(L.aeroway, E, (t, ring, bb) => { if (t.class === "runway" || t.class === "taxiway") T.aeroL.push({ cls: t.class, ring, bb }); });

    // Ulaşım: yollar, yaya alanları, köprüler, raylar
    const tr = L.transportation;
    if (tr) {
      const f = E / tr.extent;
      for (const ft of tr.features) {
        const t = ft.tags, cls = t.class;
        if (t.brunnel === "tunnel" || cls === "ferry" || t.subclass === "corridor") continue;
        const bridge = t.brunnel === "bridge", lvl = bridge ? Math.max(1, Math.min(5, Number(t.layer) || 1)) : 0;
        if (ft.type === 3) {
          for (const p of Mvt.polygons(ft)) {
            const rings = [scaled(p.outer, f)].concat(p.holes.filter((h) => h.length >= 6).map((h) => scaled(h, f))), bb = bbox(rings[0]);
            if (cls === "bridge") T.bareas.push({ rings, bb, lvl: Math.max(1, Math.min(5, Number(t.layer) || 1)) });
            else T.areas.push({ rings, bb, kind: t.subclass === "platform" ? "platform" : cls === "pier" ? "pier" : "paving" });
          }
          continue;
        }
        if (ft.type !== 2) continue;
        if (cls === "rail" || cls === "transit") {
          if (t.subclass === "abandoned" || t.subclass === "razed") continue;
          const kind = t.subclass === "tram" ? "tram" : "rail";
          for (const r of ft.rings) if (r.length >= 4) { const q = scaled(r, f); T.rails.push({ kind, ring: q, bb: bbox(q), lvl, siding: !!t.service }); }
          continue;
        }
        const st = roadStyle(t);
        if (!st) continue;
        for (const r of ft.rings) if (r.length >= 4) { const q = scaled(r, f); T.lines.push({ st, ring: q, bb: bbox(q), lvl, spans: null }); }
      }
    }
    // Binalar
    eachPoly(L.building, E, (t, rings, bb) => {
      const A = Math.abs(area(rings[0])) * T.mpu * T.mpu;
      if (A < 2) return;
      const [h, base] = bldHeight(t, A);
      const k = Math.floor(hash(rings[0][0] + x * E, rings[0][1] + y * E, 1.7) * 20);
      T.blds.push({ rings, bb, h, base, tone: k < 8 ? 0 : k < 13 ? 1 : k < 17 ? 2 : 3, hide: !!t.hide_3d });
    });
    const lv = new Set();
    for (const a of [T.lines, T.rails, T.bareas]) for (const it of a) if (it.lvl > 0) lv.add(it.lvl);
    T.levels = [...lv].sort((a, b) => a - b);
    if (z >= GM.SRC_MAX) network(T);
    return T;
  }

  /** Kavşaklar, yaya geçitleri ve şerit çizgisi parçaları (yalnızca z14 karolarında) */
  function network(T) {
    const K = (x, y) => (x + 4096) * 16384 + (y + 4096);
    const nodes = new Map();
    for (const it of T.lines) {
      const st = it.st;
      if (st.kind !== "road" || st.rank < 4) continue;              // servis yolu ağzı kavşak sayılmaz
      const p = it.ring, n = p.length >> 1;
      for (let i = 0; i < n; i++) {
        const k = K(p[2 * i], p[2 * i + 1]);
        let o = nodes.get(k);
        if (!o) nodes.set(k, (o = { deg: 0, r: 0 }));
        o.deg += i === 0 || i === n - 1 ? 1 : 2;
        o.r = Math.max(o.r, st.w / 2 + st.side);
      }
    }
    // Yol boyunca uzunluk (m), şerit çizgisi kesimi için
    for (const it of T.lines) {
      if (it.st.kind !== "road" || it.st.rank < 4) continue;
      const p = it.ring, n = p.length >> 1, S = new Float64Array(n);
      for (let i = 1; i < n; i++) S[i] = S[i - 1] + Math.hypot(p[2 * i] - p[2 * i - 2], p[2 * i + 1] - p[2 * i - 1]) * T.mpu;
      it.S = S; it.zc = null;
    }
    // Yaya geçidi: yaya yolu şehir içi bir yolu kesiyor (OSM'de çizilmiş geçit). OpenMapTiles z14'te çizgileri
    // sadeleştirdiği için ortak nokta çoğu zaman kaybolur; bu yüzden kesişim geometriyle bulunur.
    const CELL = 96, grid = new Map(), gk = (i, j) => i * 4099 + j;
    for (const it of T.lines) {
      const st = it.st;
      if (st.kind !== "road" || st.rank < 4 || st.motor || it.lvl) continue;
      const p = it.ring;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const i0 = Math.floor(Math.min(p[i], p[i + 2]) / CELL), i1 = Math.floor(Math.max(p[i], p[i + 2]) / CELL);
        const j0 = Math.floor(Math.min(p[i + 1], p[i + 3]) / CELL), j1 = Math.floor(Math.max(p[i + 1], p[i + 3]) / CELL);
        for (let a = i0; a <= i1; a++) for (let b = j0; b <= j1; b++) { const k = gk(a, b); let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(it, i); }
      }
    }
    const near = (x, y, d) => T.zebras.some((z) => Math.abs(z.x - x) < d && Math.abs(z.y - y) < d);
    for (const it of T.lines) {
      const st = it.st;
      if (st.kind !== "path" || st.steps || st.w > 3 || it.lvl) continue;
      const p = it.ring;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const ax = p[i], ay = p[i + 1], bx = p[i + 2], by = p[i + 3], ex = bx - ax, ey = by - ay, el = Math.hypot(ex, ey);
        if (el < 1e-6) continue;
        const i0 = Math.floor(Math.min(ax, bx) / CELL), i1 = Math.floor(Math.max(ax, bx) / CELL), j0 = Math.floor(Math.min(ay, by) / CELL), j1 = Math.floor(Math.max(ay, by) / CELL);
        for (let ga = i0; ga <= i1; ga++) for (let gb = j0; gb <= j1; gb++) {
          const l = grid.get(gk(ga, gb));
          if (!l) continue;
          for (let k = 0; k < l.length; k += 2) {
            const rt = l[k], j = l[k + 1], q = rt.ring, cx = q[j], cy = q[j + 1], fx = q[j + 2] - cx, fy = q[j + 3] - cy, fl = Math.hypot(fx, fy);
            const den = ex * fy - ey * fx;
            if (fl < 1e-6 || Math.abs(den) < 0.5 * el * fl) continue;          // en az 30° açıyla kesmeli
            const t = ((cx - ax) * fy - (cy - ay) * fx) / den, u = ((cx - ax) * ey - (cy - ay) * ex) / den;
            if (t < 0 || t > 1 || u < 0 || u > 1) continue;
            const x = ax + ex * t, y = ay + ey * t;
            // kavşağın tam ortasındaki kesişim geçit değildir
            let bad = false;
            for (const v of [j, j + 2]) {
              const o = nodes.get(K(q[v], q[v + 1]));
              if (o && o.deg >= 3 && Math.hypot(q[v] - x, q[v + 1] - y) * T.mpu < o.r * 0.5 + 1) bad = true;
            }
            if (bad || near(x, y, 4 / T.mpu)) continue;
            T.zebras.push({ x, y, dx: fx / fl, dy: fy / fl, w: rt.st.w });
            if (rt.S) (rt.zc || (rt.zc = [])).push(rt.S[j >> 1] + Math.hypot(x - cx, y - cy) * T.mpu);
          }
        }
      }
    }
    // Şerit çizgileri kavşak ağzında ve yaya geçidinde kesilir
    for (const it of T.lines) {
      if (!it.st.mark || !it.S) continue;
      const p = it.ring, n = p.length >> 1, S = it.S, cuts = [];
      for (let i = 0; i < n; i++) {
        const o = nodes.get(K(p[2 * i], p[2 * i + 1]));
        if (o && o.deg >= 3) cuts.push([S[i] - o.r - 1.5, S[i] + o.r + 1.5]);
      }
      if (it.zc) for (const z of it.zc) cuts.push([z - 2.6, z + 2.6]);
      it.spans = spans(p, S, cuts);
    }
    for (const it of T.lines) { delete it.S; delete it.zc; }
  }
  function spans(p, S, cuts) {
    const total = S[S.length - 1], keep = [], out = [];
    cuts.sort((a, b) => a[0] - b[0]);
    let s = 0;
    for (const [a, b] of cuts) { if (a > s) keep.push([s, a]); s = Math.max(s, b); }
    if (s < total) keep.push([s, total]);
    for (const [a, b] of keep) if (b - a >= 2.5) out.push(subLine(p, S, a, b));
    return out;
  }
  function subLine(p, S, a, b) {
    const last = S.length - 1, q = [];
    const at = (j, s) => { const t = (s - S[j]) / (S[j + 1] - S[j] || 1); q.push(p[2 * j] + (p[2 * j + 2] - p[2 * j]) * t, p[2 * j + 1] + (p[2 * j + 3] - p[2 * j + 1]) * t); };
    let i = 0;
    while (i < last - 1 && S[i + 1] < a) i++;
    at(i, a);
    let j = i + 1;
    while (j < last && S[j] < b) { q.push(p[2 * j], p[2 * j + 1]); j++; }
    at(j - 1, b);
    return { p: q, bb: bbox(q) };
  }

  /* =========================================================
     Desenler (bir kez üretilir): kumlanma, lekelenme, taç dokusu,
     ağaç görüntüleri, parke taşı
     ========================================================= */
  let TX = null;
  function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  /** Döşenebilir gürültü: octaves = [[hücre sayısı, ağırlık], …]; 0 hücre = piksel gürültüsü. Açık/koyu, alfası sapmaya oranlı. */
  function noiseCanvas(N, octaves, rnd) {
    const v = new Float32Array(N * N);
    for (const [cells, wgt] of octaves) {
      if (!cells) { for (let i = 0; i < N * N; i++) v[i] += (rnd() - 0.5) * wgt; continue; }
      const lat = new Float32Array(cells * cells);
      for (let i = 0; i < lat.length; i++) lat[i] = rnd() - 0.5;
      for (let y = 0; y < N; y++) {
        const fy = (y / N) * cells, iy = Math.floor(fy), ty = fy - iy, sy = ty * ty * (3 - 2 * ty), y0 = iy % cells, y1 = (iy + 1) % cells;
        for (let x = 0; x < N; x++) {
          const fx = (x / N) * cells, ix = Math.floor(fx), tx = fx - ix, sx = tx * tx * (3 - 2 * tx), x0 = ix % cells, x1 = (ix + 1) % cells;
          const a = lat[y0 * cells + x0] + (lat[y0 * cells + x1] - lat[y0 * cells + x0]) * sx;
          const b = lat[y1 * cells + x0] + (lat[y1 * cells + x1] - lat[y1 * cells + x0]) * sx;
          v[y * N + x] += (a + (b - a) * sy) * wgt;
        }
      }
    }
    let mx = 1e-6;
    for (let i = 0; i < v.length; i++) mx = Math.max(mx, Math.abs(v[i]));
    const c = canvas(N, N), g = c.getContext("2d"), img = g.createImageData(N, N), d = img.data;
    for (let i = 0; i < v.length; i++) {
      const s = v[i] / mx, w = s > 0 ? 255 : 0;
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = w; d[i * 4 + 3] = Math.round(Math.abs(s) * 255);
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const rgb = (c, k) => `rgb(${Math.min(255, Math.round(c[0] * k))},${Math.min(255, Math.round(c[1] * k))},${Math.min(255, Math.round(c[2] * k))})`;
  /** Bir ağaç tacı: birkaç yumru, güneşe bakan (güneydoğu) yanı açık */
  function treeSprite(base, rnd, lumps, narrow) {
    const S = 64, c = canvas(S, S), g = c.getContext("2d"), col = hex(base), R = 30, L = [];
    for (let k = 0; k < lumps; k++) {
      const a = rnd() * TAU, main = k === 0, rr = main ? R * 0.74 : R * (0.36 + 0.18 * rnd()), d = main ? 0 : (R - rr) * (0.5 + 0.5 * rnd());
      L.push({ x: S / 2 + Math.cos(a) * d, y: S / 2 + Math.sin(a) * d * (narrow ? 0.6 : 1), r: rr });
    }
    L.sort((p, q) => p.x + p.y - (q.x + q.y));
    for (const p of L) {
      const gr = g.createRadialGradient(p.x + p.r * 0.38, p.y + p.r * 0.32, p.r * 0.08, p.x, p.y, p.r);
      gr.addColorStop(0, rgb(col, 1.32)); gr.addColorStop(0.55, rgb(col, 1.0)); gr.addColorStop(1, rgb(col, 0.66));
      g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill();
    }
    return c;
  }
  function textures() {
    if (TX) return TX;
    const rnd = rng(20261123), g0 = canvas(2, 2).getContext("2d"), pat = (c) => g0.createPattern(c, "repeat");
    const sprites = [[], [], []];
    for (const col of ["#4e7a36", "#5a8a3c", "#6a9646", "#45703a", "#5f8f44"]) for (let k = 0; k < 2; k++) sprites[0].push(treeSprite(col, rnd, 5 + k * 2));
    for (const col of ["#3b5c33", "#34532f"]) sprites[1].push(treeSprite(col, rnd, 4, true));   // servi (mezarlık)
    for (const col of ["#6f8f45", "#7a9a4e", "#647f3e"]) sprites[2].push(treeSprite(col, rnd, 3));   // çalı, meyve ağacı
    // Orman dokusu (uzaktan): sık, küçük taçlar
    const cn = canvas(128, 128), gc = cn.getContext("2d");
    for (let i = 0; i < 150; i++) {
      const sp = sprites[0][Math.floor(rnd() * sprites[0].length)], r = 3 + rnd() * 3.5, x = rnd() * 128, y = rnd() * 128;
      for (const dx of [-128, 0, 128]) for (const dy of [-128, 0, 128]) if (x + dx > -r && x + dx < 128 + r && y + dy > -r && y + dy < 128 + r) gc.drawImage(sp, x + dx - r, y + dy - r, 2 * r, 2 * r);
    }
    TX = {
      grain: pat(noiseCanvas(128, [[0, 1]], rnd)),
      mottle: pat(noiseCanvas(256, [[4, 0.45], [8, 0.3], [16, 0.17], [32, 0.08]], rnd)),
      canopy: pat(cn), sprites, pavers: {}, g0
    };
    return TX;
  }
  /** Dünyaya sabitlenmiş desen: zr seviyesinde 1:1, daha ayrıntılı seviyelerde büyür (karo sınırında dikiş olmaz) */
  function anchored(p, V, P0, zr) {
    const k = V.z > zr ? 2 ** (V.z - zr) : 1, per = P0 * k;
    p.setTransform(new DOMMatrix([k, 0, 0, k, k > 1 ? -((V.x * GM.SIZE) % per) : 0, k > 1 ? -((V.y * GM.SIZE) % per) : 0]));
    return p;
  }
  /** Parke taşı / plak deseni: z21'de 64 piksellik dönem (≈ 2 m), 8 taş (kaldırım) ya da 4 plak (meydan) */
  function pavers(z, slab) {
    if (z < 20) return null;
    const key = (slab ? "s" : "p") + z, tx = textures();
    if (tx.pavers[key]) return tx.pavers[key];
    const P = 64 >> (21 - Math.min(z, 21)), n = slab ? 4 : 8, cell = P / n, c = canvas(P, P), g = c.getContext("2d"), rnd = rng(z * 7 + (slab ? 3 : 1));
    for (let j = 0; j < n; j++) {
      const off = !slab && j % 2 ? cell / 2 : 0, row = [];
      for (let i = 0; i < n; i++) row.push(rnd());
      for (let i = 0; i <= n; i++) {
        const x = i * cell - off, v = row[i % n];
        g.fillStyle = v > 0.5 ? `rgba(255,255,255,${(v - 0.5) * 0.18})` : `rgba(0,0,0,${(0.5 - v) * 0.16})`;
        g.fillRect(x, j * cell, cell, cell);
        g.fillStyle = "rgba(0,0,0,0.20)";
        g.fillRect(x, j * cell, Math.max(0.6, cell / 12), cell);
      }
      g.fillStyle = "rgba(0,0,0,0.20)";
      g.fillRect(0, j * cell, P, Math.max(0.6, cell / 12));
    }
    return (tx.pavers[key] = tx.g0.createPattern(c, "repeat"));
  }

  /* =========================================================
     Çizim
     ========================================================= */
  const vis = (V, bb, m) => bb[2] >= V.x0 - m && bb[0] <= V.x1 + m && bb[3] >= V.y0 - m && bb[1] <= V.y1 + m;
  function addLine(P, r, V) {
    const s = V.s, ox = V.x0, oy = V.y0;
    P.moveTo((r[0] - ox) * s, (r[1] - oy) * s);
    for (let i = 2; i < r.length; i += 2) P.lineTo((r[i] - ox) * s, (r[i + 1] - oy) * s);
  }
  /** Halkalar: closePath yerine ilk noktaya çizgi (Chrome'da Path2D.closePath çok yavaş: 8 bin çağrı ≈ 0,4 sn) */
  function addRings(P, rings, V) { for (const r of rings) { addLine(P, r, V); P.lineTo((r[0] - V.x0) * V.s, (r[1] - V.y0) * V.s); } }
  function toPx(r, V) {
    const s = V.s, ox = V.x0, oy = V.y0, out = new Array(r.length);
    for (let i = 0; i < r.length; i += 2) { out[i] = (r[i] - ox) * s; out[i + 1] = (r[i + 1] - oy) * s; }
    return out;
  }
  function addPoly(P, q) { P.moveTo(q[0], q[1]); for (let i = 2; i < q.length; i += 2) P.lineTo(q[i], q[i + 1]); }
  /** Çizgiye d piksel paralel çizgi (sol normal yönünde; köşelerde gönye) */
  function addOffset(P, q, d) {
    const n = q.length >> 1;
    for (let i = 0; i < n; i++) {
      let nx = 0, ny = 0, ax = 0, ay = 0;
      if (i > 0) { const dx = q[2 * i] - q[2 * i - 2], dy = q[2 * i + 1] - q[2 * i - 1], l = Math.hypot(dx, dy) || 1; ax = -dy / l; ay = dx / l; nx += ax; ny += ay; }
      if (i < n - 1) {
        const dx = q[2 * i + 2] - q[2 * i], dy = q[2 * i + 3] - q[2 * i + 1], l = Math.hypot(dx, dy) || 1;
        nx -= dy / l; ny += dx / l;
        if (i === 0) { ax = -dy / l; ay = dx / l; }
      }
      const l = Math.hypot(nx, ny);
      if (l < 1e-6) { nx = ax; ny = ay; } else { nx /= l; ny /= l; }
      const k = d / Math.max(0.5, nx * ax + ny * ay), x = q[2 * i] + nx * k, y = q[2 * i + 1] + ny * k;
      if (i === 0) P.moveTo(x, y); else P.lineTo(x, y);
    }
  }
  function stroke(g, P, w, style) { g.lineWidth = w; g.strokeStyle = style; g.stroke(P); }
  function texStroke(g, P, w, pat, a) { g.globalAlpha = a; stroke(g, P, w, pat); g.globalAlpha = 1; }
  function texFill(g, P, pat, a) { g.globalAlpha = a; g.fillStyle = pat; g.fill(P); g.globalAlpha = 1; }

  /** Bir karoyu çizer: T kaynak (vektör) karo, (z, x, y) istenen karo */
  function draw(T, z, x, y, overlay) {
    const S = GM.SIZE, k = 2 ** (z - T.z), size = T.E / k;
    const V = { T, z, x, y, overlay, size, s: S / size, x0: (x - T.x * k) * size, y0: (y - T.y * k) * size };
    V.x1 = V.x0 + size; V.y1 = V.y0 + size; V.mpp = T.mpu / V.s;
    const cv = canvas(S, S), g = cv.getContext("2d", GM.CPU ? { willReadFrequently: true } : undefined);
    V.g = g;
    g.lineCap = "round"; g.lineJoin = "round";
    const PR = GM.PROFILE ? (GM.prof = GM.prof || {}) : null;
    let t = performance.now();
    const tk = (n) => { if (PR) { const q = performance.now(); PR[n] = (PR[n] || 0) + q - t; t = q; } };
    if (!overlay) ground(V);
    tk("ground");
    areas(V);
    tk("areas");
    if (!overlay) trees(V);
    tk("trees");
    const list = roads(V, 0);
    tk("roads");
    rails(V, 0);
    tk("rails");
    surface(V);
    tk("surface");
    if (list) marks(V, list, true);
    tk("marks");
    buildings(V);
    tk("blds");
    for (const l of T.levels) bridges(V, l);
    tk("bridges");
    return cv;
  }

  /** Dolgu grupları: aynı renk ve doku tek yolda (path) toplanır, önceliğe göre çizilir */
  function fills(V, items) {
    const groups = new Map();
    for (const it of items) {
      if (!vis(V, it.bb, 0)) continue;
      const key = it.col + it.tex;
      let G = groups.get(key);
      if (!G) groups.set(key, (G = { col: it.col, tex: it.tex, pri: it.pri, P: new Path2D() }));
      if (it.pri < G.pri) G.pri = it.pri;
      addRings(G.P, it.rings, V);
    }
    return [...groups.values()].sort((a, b) => a.pri - b.pri);
  }

  /** Zemin: şehir tabanı, arazi kullanımı, bitki örtüsü, su, havaalanı */
  function ground(V) {
    const { g, T, mpp } = V, C = GM.COLORS, A = GM.TEX, tx = textures(), S = GM.SIZE;
    g.fillStyle = C.base; g.fillRect(0, 0, S, S);
    for (const G of fills(V, T.land)) { g.fillStyle = G.col; g.fill(G.P); }
    for (const G of fills(V, T.aeroA)) { g.fillStyle = G.col; g.fill(G.P); }
    for (const G of fills(V, T.cover)) {
      g.fillStyle = G.tex === "wood" && mpp <= 1.05 ? rgb(hex(G.col), 0.78) : G.col;
      g.fill(G.P);
      if (G.tex === "wood" && mpp > 1.05) { tx.canopy.setTransform(new DOMMatrix()); texFill(g, G.P, tx.canopy, A.canopy); }
      else if (G.tex === "grass") texFill(g, G.P, anchored(tx.mottle, V, 256, 16), A.grass);
    }
    // Su: kıyıda açık renkli bant ve ince köpük çizgisi
    const W = new Path2D();
    let nw = 0;
    for (const it of T.water) if (vis(V, it.bb, 0)) { addRings(W, it.rings, V); nw++; }
    if (nw) {
      g.fillStyle = C.water; g.fill(W);
      if (mpp <= 2.5) {
        g.save(); g.clip(W);
        g.globalAlpha = 0.45; stroke(g, W, (2 * 5) / mpp, C.shore);
        g.globalAlpha = 0.55; stroke(g, W, Math.max(1, (2 * 0.7) / mpp), C.foam);
        g.restore(); g.globalAlpha = 1;
      }
    }
    const WW = new Map();
    for (const it of T.wway) {
      if (!vis(V, it.bb, it.w / T.mpu)) continue;
      let P = WW.get(it.w);
      if (!P) WW.set(it.w, (P = new Path2D()));
      addLine(P, it.ring, V);
    }
    for (const [w, P] of WW) stroke(g, P, Math.max(w / mpp, w >= 10 ? 1.2 : 0.7), w >= 10 ? C.water : C.stream);
    const PL = new Path2D();
    let np = 0;
    for (const it of T.pools) if (vis(V, it.bb, 0)) { addRings(PL, it.rings, V); np++; }
    if (np) { g.fillStyle = C.pool; g.fill(PL); if (mpp <= 0.6) stroke(g, PL, Math.max(0.8, 0.6 / mpp), C.coping); }
    // Pist ve taksi yolları
    const R = new Path2D(), Tw = new Path2D();
    for (const it of T.aeroL) if (vis(V, it.bb, 40 / T.mpu)) addLine(it.cls === "runway" ? R : Tw, it.ring, V);
    stroke(g, Tw, Math.max(18 / mpp, 1), C.aero.taxiway);
    stroke(g, R, Math.max(45 / mpp, 1.5), C.aero.runway);
    if (mpp <= 0.6) {
      g.lineCap = "butt";
      g.setLineDash([30 / mpp, 20 / mpp]); stroke(g, R, 0.9 / mpp, C.marking);
      g.setLineDash([]); stroke(g, Tw, 0.3 / mpp, C.aero.line);
      g.lineCap = "round";
    }
  }

  /** Yaya alanları: meydan, peron, iskele */
  function areas(V) {
    const { g, T, mpp, z } = V, C = GM.COLORS, A = GM.TEX;
    const P = { paving: new Path2D(), platform: new Path2D(), pier: new Path2D() }, cnt = { paving: 0, platform: 0, pier: 0 };
    for (const it of T.areas) if (vis(V, it.bb, 0)) { addRings(P[it.kind], it.rings, V); cnt[it.kind]++; }
    const ew = Math.max(0.6, 0.3 / mpp);
    if (cnt.paving) {
      g.fillStyle = C.paving; g.fill(P.paving);
      const pv = pavers(z, true);
      if (pv) texFill(g, P.paving, pv, A.pavers);
      if (mpp <= 2) stroke(g, P.paving, ew, C.pavingEdge);
    }
    if (cnt.platform) {
      g.fillStyle = C.platform; g.fill(P.platform);
      if (mpp <= 0.3) { g.save(); g.clip(P.platform); stroke(g, P.platform, 1.2 / mpp, C.tactile); g.restore(); }
      if (mpp <= 2) stroke(g, P.platform, ew, C.pavingEdge);
    }
    if (cnt.pier) { g.fillStyle = C.pier; g.fill(P.pier); if (mpp <= 2) stroke(g, P.pier, ew, C.pierEdge); }
  }

  /** Ağaçlar (z17 ve üstü): dünya ızgarasında rastgele kaydırılmış noktalar, gölgeleri tek seferde */
  function trees(V) {
    const { g, T, mpp } = V;
    if (mpp > 1.05 || !T.treeAreas.length) return;
    const E = T.E, gx0 = T.x * E, gy0 = T.y * E, pts = [], max = GM.TREE_MAX * 5;
    const sux = sunX(), suy = sunY();
    for (const it of T.treeAreas) {
      const tr = it.tree, gap = Math.max(2, Math.round(tr.gap / T.mpu)), rm = (tr.r * 1.3) / T.mpu, sh = (tr.h * 0.9) / T.mpu;
      const x0 = Math.max(it.bb[0], V.x0 - rm), x1 = Math.min(it.bb[2], V.x1 + rm + sh), y0 = Math.max(it.bb[1], V.y0 - rm), y1 = Math.min(it.bb[3], V.y1 + rm + sh);
      if (x0 > x1 || y0 > y1) continue;
      const i1 = Math.floor((x1 + gx0) / gap), j1 = Math.floor((y1 + gy0) / gap);
      for (let i = Math.floor((x0 + gx0) / gap); i <= i1; i++) {
        for (let j = Math.floor((y0 + gy0) / gap); j <= j1; j++) {
          if (hash(i, j, tr.seed) > tr.keep) continue;
          const u = (i + 0.12 + 0.76 * hash(j, i, 3.1 + tr.seed)) * gap - gx0, v = (j + 0.12 + 0.76 * hash(i, j, 7.7 + tr.seed)) * gap - gy0;
          if (u < it.bb[0] || u > it.bb[2] || v < it.bb[1] || v > it.bb[3] || !inPoly(it.rings, u, v)) continue;
          pts.push(u, v, tr.r * (0.72 + 0.56 * hash(i, j, 11.3)), tr.set + hash(j, i, 5.9) * 0.999, tr.h);
        }
        if (pts.length > max) break;
      }
      if (pts.length > max) break;
    }
    if (!pts.length) return;
    const sh = new Path2D(), s = V.s, sp = textures().sprites;
    for (let i = 0; i < pts.length; i += 5) {
      const cx = (pts[i] - V.x0) * s, cy = (pts[i + 1] - V.y0) * s, r = pts[i + 2] / mpp, h = pts[i + 4] / mpp;
      const x = cx + sux * h * 0.85, y = cy + suy * h * 0.85;
      sh.moveTo(x + r * 0.92, y); sh.arc(x, y, r * 0.92, 0, TAU);
    }
    g.fillStyle = GM.COLORS.treeShadow; g.fill(sh);
    for (let i = 0; i < pts.length; i += 5) {
      const cx = (pts[i] - V.x0) * s, cy = (pts[i + 1] - V.y0) * s, r = pts[i + 2] / mpp, set = sp[Math.floor(pts[i + 3])];
      if (cx < -r || cy < -r || cx > GM.SIZE + r || cy > GM.SIZE + r) continue;
      g.drawImage(set[Math.floor((pts[i + 3] % 1) * set.length)], cx - r * 1.07, cy - r * 1.07, r * 2.14, r * 2.14);
    }
  }

  /** Tüm yüzeye tek geçişte doku: geniş lekeler (dünyaya sabit) ve ince kumlanma; yalnızca çizilmiş piksellere (source-atop) */
  function surface(V) {
    const { g, mpp } = V, A = GM.TEX, tx = textures(), S = GM.SIZE;
    g.globalCompositeOperation = "source-atop";
    g.globalAlpha = A.mottle; g.fillStyle = anchored(tx.mottle, V, 256, 17); g.fillRect(0, 0, S, S);
    if (mpp <= 1.2) { tx.grain.setTransform(new DOMMatrix()); g.globalAlpha = A.grain; g.fillStyle = tx.grain; g.fillRect(0, 0, S, S); }
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
  }

  /** Yollar (lvl 0 zemin, 1+ köprü katı): önce tüm kenarlar ve kaldırımlar, sonra asfaltlar (yüksek sınıf üstte) */
  function roads(V, lvl) {
    const { g, T, mpp, z } = V, C = GM.COLORS, A = GM.TEX, groups = new Map();
    for (const it of T.lines) {
      if (it.lvl !== lvl) continue;
      const st = it.st;
      if (!vis(V, it.bb, (st.w / 2 + st.side + 2) / T.mpu)) continue;
      let G = groups.get(st.key);
      if (!G) groups.set(st.key, (G = { st, P: new Path2D(), items: [] }));
      addLine(G.P, it.ring, V);
      G.items.push(it);
    }
    if (!groups.size) return null;
    const list = [...groups.values()].sort((a, b) => a.st.rank - b.st.rank);
    const W = (st) => Math.max(st.w / mpp, st.minPx), outer = (st) => W(st) + (2 * (st.side || st.verge)) / mpp;
    if (lvl > 0) {
      // Köprü: yere düşen gölge, sonra korkuluk
      const h = GM.BRIDGE_H * lvl, dx = (sunX() * h) / mpp, dy = (sunY() * h) / mpp;
      g.save(); g.translate(dx, dy);
      for (const G of list) stroke(g, G.P, outer(G.st) + 0.6 / mpp, C.shadow);
      g.restore();
      for (const G of list) stroke(g, G.P, outer(G.st) + Math.max(1, 0.9 / mpp), C.bridgeEdge);
    }
    // 1) kaldırımın dış kenarı ya da kaldırımsız yolun kenar şeridi
    for (const G of list) {
      const st = G.st, w = W(st);
      if (st.side && st.side / mpp >= 1.2) stroke(g, G.P, w + (2 * (st.side + 0.35)) / mpp, C.sidewalkEdge);
      else if (st.verge && st.verge / mpp >= 0.4) stroke(g, G.P, w + (2 * st.verge) / mpp, st.edge);
      else if (st.kind === "path" && w >= 2.5) stroke(g, G.P, w + 2 * Math.max(0.6, 0.3 / mpp), st.edge);
    }
    // 2) kaldırımlar (taş döşeme)
    const pv = pavers(z, false);
    for (const G of list) {
      const st = G.st;
      if (!st.side || st.side / mpp < 0.3) continue;
      const w = W(st) + (2 * st.side) / mpp;
      stroke(g, G.P, w, C.sidewalk);
      if (pv) texStroke(g, G.P, w, pv, A.pavers);
    }
    // 3) bordür taşı
    if (0.22 / mpp >= 0.4) for (const G of list) if (G.st.side) stroke(g, G.P, W(G.st) + 0.44 / mpp, C.curb);
    // 4) asfalt ve yaya yolu dolgusu
    for (const G of list) {
      const st = G.st, w = W(st);
      stroke(g, G.P, w, st.col);
      if (st.pave && pv) texStroke(g, G.P, w, pv, A.pavers);
      if (st.steps && mpp <= 0.3) {
        g.lineCap = "butt"; g.setLineDash([0.1 / mpp, 0.26 / mpp]);
        stroke(g, G.P, w, st.edge);
        g.setLineDash([]); g.lineCap = "round";
      }
    }
    return list;
  }

  /** Yol çizgileri (z18 ve üstü): orta çizgi, şerit ayırıcılar, kenar çizgileri, yaya geçitleri. Türkiye: beyaz. */
  function marks(V, list, ground) {
    const { g, T, mpp } = V;
    if (mpp > 0.32) return;
    const solid = new Path2D(), dash = new Path2D(), C = GM.COLORS;
    let ns = 0, nd = 0;
    for (const G of list) {
      const st = G.st;
      if (!st.mark) continue;
      const w = st.w / mpp, m = st.w / T.mpu;
      for (const it of G.items) {
        if (!it.spans) continue;
        for (const sp of it.spans) {
          if (!vis(V, sp.bb, m)) continue;
          const q = toPx(sp.p, V);
          if (st.mark === "lanes") {
            const n = Math.max(1, Math.floor(st.w / 3.4));
            for (let i = 1; i < n; i++) { addOffset(dash, q, -w / 2 + (i * w) / n); nd++; }
          } else if (st.mark !== "edge") {
            if (st.mark === "dash") { addPoly(dash, q); nd++; }
            else if (st.mark === "solid") { addPoly(solid, q); ns++; }
            else { addOffset(solid, q, 0.12 / mpp); addOffset(solid, q, -0.12 / mpp); ns++; }
            const n = Math.max(1, Math.floor(st.w / 2 / 3.4));
            for (let i = 1; i < n; i++) { const o = (i * w) / 2 / n; addOffset(dash, q, o); addOffset(dash, q, -o); nd++; }
          }
          if (st.motor) { const e = w / 2 - 0.6 / mpp; addOffset(solid, q, e); addOffset(solid, q, -e); ns++; }
        }
      }
    }
    g.lineCap = "butt"; g.strokeStyle = C.marking; g.lineWidth = Math.max(0.15 / mpp, 0.9);
    if (ns) g.stroke(solid);
    if (nd) { g.setLineDash([3 / mpp, 5 / mpp]); g.stroke(dash); g.setLineDash([]); }
    if (ground && T.zebras.length) {
      const zp = new Path2D(), s = V.s;
      let nz = 0;
      for (const zb of T.zebras) {
        const hw = zb.w / 2 - 0.4, mu = (hw + 2) / T.mpu;
        if (zb.x < V.x0 - mu || zb.x > V.x1 + mu || zb.y < V.y0 - mu || zb.y > V.y1 + mu) continue;
        const cx = (zb.x - V.x0) * s, cy = (zb.y - V.y0) * s, h = hw / mpp;
        zp.moveTo(cx + zb.dy * h, cy - zb.dx * h); zp.lineTo(cx - zb.dy * h, cy + zb.dx * h);
        nz++;
      }
      if (nz) { g.setLineDash([0.5 / mpp, 0.5 / mpp]); stroke(g, zp, 3 / mpp, C.marking); g.setLineDash([]); }
    }
    g.lineCap = "round";
  }

  /** Raylar: yakında balast + travers + iki ray, uzakta tek çizgi; tramvay yalnızca raylar */
  function rails(V, lvl) {
    const { g, T, mpp } = V, C = GM.COLORS.rail, heavy = new Path2D(), tram = new Path2D(), H = [], TR = [];
    for (const it of T.rails) {
      if (it.lvl !== lvl || !vis(V, it.bb, 4 / T.mpu)) continue;
      if (it.kind === "tram") { addLine(tram, it.ring, V); TR.push(it); } else { addLine(heavy, it.ring, V); H.push(it); }
    }
    if (H.length) {
      if (mpp > 2.5) stroke(g, heavy, Math.max(3.4 / mpp, 0.8), C.far);
      else {
        stroke(g, heavy, Math.max(3.6 / mpp, 1), C.bed);
        if (mpp <= 0.35) {
          g.lineCap = "butt"; g.setLineDash([0.24 / mpp, 0.36 / mpp]);
          stroke(g, heavy, 2.6 / mpp, C.sleeper);
          g.setLineDash([]); g.lineCap = "round";
          const R = new Path2D();
          for (const it of H) { const q = toPx(it.ring, V); addOffset(R, q, 0.72 / mpp); addOffset(R, q, -0.72 / mpp); }
          stroke(g, R, Math.max(0.09 / mpp, 0.9), C.steel);
        } else stroke(g, heavy, Math.max(1.5 / mpp, 0.8), C.sleeper);
      }
    }
    if (TR.length) {
      if (mpp <= 0.6) {
        g.globalAlpha = 0.25; stroke(g, tram, 2.4 / mpp, "#3c3e41"); g.globalAlpha = 1;
        const R = new Path2D();
        for (const it of TR) { const q = toPx(it.ring, V); addOffset(R, q, 0.72 / mpp); addOffset(R, q, -0.72 / mpp); }
        stroke(g, R, Math.max(0.08 / mpp, 0.8), C.tram);
      } else stroke(g, tram, Math.max(1.4 / mpp, 0.7), C.tram);
    }
  }

  /** Binalar: güneş yönündeki gölge (tek dolgu, üst üste binen gölgeler koyulaşmaz), taban, ince koyu kenar */
  function buildings(V) {
    const { g, T, mpp, overlay } = V, C = GM.COLORS, PR = GM.PROFILE ? GM.prof : null;
    if (!T.blds.length) return;
    let t = performance.now();
    const tk = (n) => { if (PR) { const q = performance.now(); PR[n] = (PR[n] || 0) + q - t; t = q; } };
    const sux = sunX(), suy = sunY();
    const shadow = !overlay && mpp <= GM.SHADOW_MPP, mode = GM.SHADOW_MODE || 0, chunk = GM.CHUNK || 24;
    const tones = C.building.map(() => new Path2D()), all = new Path2D();
    let sh = new Path2D(), ns = 0, n = 0;
    const M = shadow && mode ? mask() : null;
    if (M) { M.g.clearRect(0, 0, GM.SIZE, GM.SIZE); M.g.fillStyle = "#1a2032"; }
    for (const b of T.blds) {
      const hx = (sux * b.h) / T.mpu, hy = (suy * b.h) / T.mpu, bb = b.bb;
      if (bb[2] + Math.max(0, hx) < V.x0 - 1 || bb[0] + Math.min(0, hx) > V.x1 + 1 || bb[3] + Math.max(0, hy) < V.y0 - 1 || bb[1] + Math.min(0, hy) > V.y1 + 1) continue;
      if (shadow && !b.hide) {
        addShadow(sh, b.rings[0], V, (sux * b.h) / mpp, (suy * b.h) / mpp, (sux * b.base) / mpp, (suy * b.base) / mpp);
        if (M && ++ns >= chunk) { M.g.fill(sh); sh = new Path2D(); ns = 0; }
      }
      if (!vis(V, bb, 1)) continue;
      addRings(tones[b.tone], b.rings, V); addRings(all, b.rings, V);
      n++;
    }
    if (shadow) {
      if (M) { if (ns) M.g.fill(sh); g.globalAlpha = 0.3; g.drawImage(M.c, 0, 0); g.globalAlpha = 1; }
      else { g.fillStyle = C.shadow; g.fill(sh); }
    }
    tk("b_shadow");
    if (!n) return;
    if (!overlay && mpp <= 0.6) stroke(g, all, 1.4 / mpp, C.ao);
    tk("b_ao");
    tones.forEach((P, i) => { g.fillStyle = C.building[i]; g.fill(P); });
    tk("b_fill");
    stroke(g, all, Math.min(2, Math.max(0.6, 0.3 / mpp)), C.buildingLine);
    tk("b_line");
  }
  let MASK = null;
  function mask() {
    if (!MASK) { const c = canvas(GM.SIZE, GM.SIZE); MASK = { c, g: c.getContext("2d", GM.CPU ? { willReadFrequently: true } : undefined) }; }
    return MASK;
  }
  /** Bina gölgesi: tabanın gölge yönünde süpürdüğü alanın dış çizgisi (bina başına tek kontur).
      Gölgeye bakan kenarlar ötelenmiş, güneşe bakanlar yerinde; geçişlerde gölge yönünde bağlantı. */
  function addShadow(P, r, V, dx, dy, bx, by) {
    const s = V.s, ox = V.x0, oy = V.y0, n = r.length >> 1, vx = dx - bx, vy = dy - by;
    if (n < 3 || Math.abs(vx) + Math.abs(vy) < 0.3) return;
    const sg = area(r) > 0 ? 1 : -1;
    let prev = false, first = true;
    // son kenarın yönü (ilk köşedeki geçiş için)
    {
      const i = n - 1, j = 0, ex = r[2 * j] - r[2 * i], ey = r[2 * j + 1] - r[2 * i + 1];
      prev = sg * (ex * vy - ey * vx) < 0;
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ex = r[2 * j] - r[2 * i], ey = r[2 * j + 1] - r[2 * i + 1];
      const face = sg * (ex * vy - ey * vx) < 0;                 // kenarın dış normali gölge yönüne bakıyor
      const x = (r[2 * i] - ox) * s + bx, y = (r[2 * i + 1] - oy) * s + by;
      if (prev && face) pt(P, x + vx, y + vy, first);
      else if (!prev && !face) pt(P, x, y, first);
      else if (prev) { pt(P, x + vx, y + vy, first); P.lineTo(x, y); }
      else { pt(P, x, y, first); P.lineTo(x + vx, y + vy); }
      first = false; prev = face;
    }
  }
  function pt(P, x, y, first) { if (first) P.moveTo(x, y); else P.lineTo(x, y); }

  /** Köprü katı: köprü alanları (döşeme, gölge, kenar), sonra bu kattaki yollar, raylar, çizgiler */
  function bridges(V, lvl) {
    const { g, T, mpp } = V, C = GM.COLORS, P = new Path2D();
    let n = 0;
    for (const it of T.bareas) if (it.lvl === lvl && vis(V, it.bb, 30 / T.mpu)) { addRings(P, it.rings, V); n++; }
    if (n) {
      const h = GM.BRIDGE_H * lvl;
      g.save(); g.translate((sunX() * h) / mpp, (sunY() * h) / mpp);
      g.fillStyle = C.shadow; g.fill(P);
      g.restore();
      g.fillStyle = C.deck; g.fill(P);
      stroke(g, P, Math.max(1, 0.6 / mpp), C.bridgeEdge);
    }
    const list = roads(V, lvl);
    rails(V, lvl);
    if (list) marks(V, list, false);
  }

  return GM;
})();
