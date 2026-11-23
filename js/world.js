/* =========================================================
   GERÇEK DÜNYA – Uçuş bölümünde drone'u gerçek bir yerin üstünde uçurma
   ---------------------------------------------------------
   3D dünyayı CesiumJS çizer (ilk kullanımda internetten yüklenir).
   Drone, halkalar ve kalkış pedi three.js sahnesinde kalır. İki sahne
   aynı kamerayla üst üste çizilir: Cesium altta (dünya), three.js
   üstte (saydam arka planlı drone).

   Harita kaynakları
   · open   : Anahtarsız. Esri uydu görüntüsü + OpenFreeMap vektör
              karolarındaki OpenStreetMap bina tabanları; binalar bu
              dosyada pencereleri ve çatılarıyla üç boyutlu kurulur.
   · osm3d  : Cesium ion anahtarıyla. Cesium Dünya Arazisi + Bing uydu
              görüntüsü + Cesium OSM Binaları.
   · google : Cesium ion anahtarıyla. Google Fotogerçekçi 3D Karolar
              (binalar, ağaçlar, arabalar gerçek fotoğraflarıyla).

   Koordinatlar: başlangıç noktasında yere teğet düzlem (Doğu-Kuzey-
   Yukarı, metre). three.js sahnesiyle ilişki: x = doğu, y = yukarı,
   z = güney (milimetre).
   ========================================================= */

const World = {
  VER: "1.147.0",
  get BASE() { return `https://cdn.jsdelivr.net/npm/cesium@${this.VER}/Build/Cesium/`; },
  ESRI: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  OFM: "https://tiles.openfreemap.org/planet",
  NOMINATIM: "https://nominatim.openstreetmap.org/search",
  K: { token: "pervane.cesiumIon", src: "pervane.haritaKaynagi", place: "pervane.ucusYeri", recent: "pervane.sonYerler", area: "pervane.ucusAlani" },
  SOURCES: {
    open: { name: "Açık veri · anahtarsız", short: "Açık veri",
      note: "Uydu görüntüsü (Esri) ve OpenStreetMap bina tabanları. Kat bilgisi girilmemiş binaların yüksekliği taban alanından tahmin edilir." },
    osm3d: { name: "3D binalar + arazi · Cesium ion", short: "Cesium 3D", token: true,
      note: "Cesium Dünya Arazisi (dağlar, yokuşlar), Bing uydu görüntüsü ve dünya çapında OpenStreetMap binaları." },
    google: { name: "Fotogerçekçi 3D · Google", short: "Google 3D", token: true,
      note: "Binalar, ağaçlar ve arabalar gerçek fotoğraflarıyla. Ücretsiz Cesium ion hesabıyla ayda 1.000 açılış; kapsam büyük şehirlerde en iyisidir." }
  },
  PRESETS: [
    { name: "Galata Kulesi", sub: "Beyoğlu, İstanbul", lon: 28.97416, lat: 41.02562 },
    { name: "Kızılay Meydanı", sub: "Çankaya, Ankara", lon: 32.85410, lat: 39.92077 },
    { name: "Konak Saat Kulesi", sub: "Konak, İzmir", lon: 27.12863, lat: 38.41890 },
    { name: "Kordon", sub: "Alsancak, İzmir", lon: 27.13540, lat: 38.43870 }
  ],
  RADIUS: 650,                 // bina ve sokak verisi yarıçapı (m)
  FIELD: 2500,                 // uçuş alanı yarıçapı (m); bunun dışına çıkılmaz

  on: false, ready: false, picking: false, viewer: null, src: "open", place: null,
  h0: 0, lon0: 0, lat0: 0, blds: [], grid: null, roads: [], names: [], nameGrid: null, gates: [],
  tiles: new Map(), job: 0, msg: "", _tj: null,

  /* ---------------- Kalıcı ayarlar ---------------- */
  get(k, def) { try { const v = localStorage.getItem(this.K[k]); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
  set(k, v) { try { if (v == null) localStorage.removeItem(this.K[k]); else localStorage.setItem(this.K[k], JSON.stringify(v)); } catch (e) { /* özel pencere: hatırlanmaz */ } },
  token() { return (this.get("token", "") || "").trim(); },

  /* ---------------- CesiumJS'i yükle (yalnızca ilk kullanımda) ---------------- */
  load() {
    if (window.Cesium && window.Cesium.Viewer) return Promise.resolve();
    if (this._loading) return this._loading;
    window.CESIUM_BASE_URL = this.BASE;
    if (!document.querySelector("link[data-cesium]")) {
      const css = document.createElement("link");
      css.rel = "stylesheet"; css.href = this.BASE + "Widgets/widgets.css"; css.dataset.cesium = "1";
      document.head.appendChild(css);
    }
    return (this._loading = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = this.BASE + "Cesium.js";
      s.onload = () => res();
      s.onerror = () => { this._loading = null; s.remove(); rej(new Error("3D harita kütüphanesi indirilemedi. İnternet bağlantını kontrol et.")); };
      document.head.appendChild(s);
    }));
  },

  /* ---------------- Aç / kapat ---------------- */
  /** Gerçek dünya modunu açar: kütüphane, görüntüleyici, son konum */
  async enter() {
    this.on = true;
    document.body.classList.add("world-on");
    WorldUI.sync();
    this.status("3D harita yükleniyor…", true);
    Fly.hold = true;
    try {
      await this.load();
      if (!this.on) return;
      if (!this.viewer || this.viewerSrc !== this.src) await this.makeViewer();
      if (!this.on) return;
      this.viewer.container.hidden = false;
      const last = this.place || this.get("place", null);
      if (last) await this.goTo(last, { quiet: true });
      else this.startPick(true);
    } catch (err) {
      console.error(err);
      this.status(err.message || String(err), false, "bad");
      toast(err.message || "Harita açılamadı", "bad");
    }
  },
  /** Parkura dönülürken: görüntüleyici gizlenir (tekrar açılışta hızlı olsun diye silinmez) */
  exit() {
    this.on = false; this.ready = false;
    this.job++;
    if (this.picking) this.endPick();
    document.body.classList.remove("world-on", "world-ready");
    if (this.viewer) this.viewer.container.hidden = true;
    Fly.hold = false;
    WorldUI.sync();
  },

  /** Cesium görüntüleyicisini seçili kaynakla kurar */
  async makeViewer() {
    const C = Cesium, src = this.src, token = this.token();
    this.destroyViewer();
    if (this.SOURCES[src].token && !token) throw new Error("Bu harita kaynağı için Cesium ion anahtarı gerekiyor.");
    if (token) C.Ion.defaultAccessToken = token;
    const host = document.createElement("div");
    host.className = "world3d";
    Scene3D.container.prepend(host);
    const credits = document.getElementById("worldCredits");
    credits.innerHTML = "";
    const opts = {
      baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false, navigationHelpButton: false,
      animation: false, timeline: false, fullscreenButton: false, infoBox: false, selectionIndicator: false,
      useDefaultRenderLoop: false, scene3DOnly: true, msaaSamples: 4, creditContainer: credits, shadows: false
    };
    if (src === "open") {
      opts.baseLayer = new C.ImageryLayer(new C.UrlTemplateImageryProvider({ url: this.ESRI, maximumLevel: 19,
        credit: new C.Credit("Uydu görüntüsü: Esri, Maxar, Earthstar Geographics") }));
    } else if (src === "google") opts.baseLayer = false;
    const v = new C.Viewer(host, opts);
    this.viewer = v; this.viewerSrc = src; this.tileset = null; this.terrain = null; this.city = null;
    const sc = v.scene;
    sc.screenSpaceCameraController.enableInputs = false;
    sc.globe.depthTestAgainstTerrain = true;
    sc.globe.enableLighting = false;
    sc.globe.maximumScreenSpaceError = 1.5;            // yakındaki uydu görüntüsü daha keskin
    sc.globe.showGroundAtmosphere = false;             // alçakta uydu görüntüsü gerçek renginde kalsın (mavi-yeşil ton olmasın)
    sc.globe.baseColor = C.Color.fromCssColorString("#5b5f63");
    sc.globe.tileCacheSize = 400;
    sc.highDynamicRange = false;
    sc.camera.frustum.near = 0.2;
    v.clock.shouldAnimate = false;
    v.clock.currentTime = C.JulianDate.fromIso8601("2026-06-21T09:30:00Z");   // öğle ışığı (Türkiye saati 12:30)
    if (src === "open") {
      v.creditDisplay.addStaticCredit(new C.Credit('Bina ve sokak verisi: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap katkıcıları</a> · <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · OpenMapTiles', true));
    } else {
      this.status("Arazi modeli bağlanıyor…", true);
      this.terrain = await C.createWorldTerrainAsync();
      if (src === "osm3d") {
        v.terrainProvider = this.terrain;
        this.status("Cesium OSM binaları yükleniyor…", true);
        this.tileset = sc.primitives.add(await C.createOsmBuildingsAsync());
      } else {
        sc.globe.show = false;                         // Google karoları araziyi de içerir
        this.status("Google fotogerçekçi 3D bağlanıyor…", true);
        this.tileset = sc.primitives.add(await C.createGooglePhotorealistic3DTileset({ onlyUsingWithGoogleGeocoder: true }));
      }
    }
    v.resize();
  },
  destroyViewer() {
    if (!this.viewer) return;
    try { if (this.pickHandler) this.pickHandler.destroy(); } catch (e) { /* zaten silinmiş */ }
    this.pickHandler = null;
    const host = this.viewer.container;
    try { this.viewer.destroy(); } catch (e) { /* kapanırken hata önemsiz */ }
    host.remove();
    this.viewer = null; this.city = null; this.tileset = null;
  },
  /** Harita kaynağını değiştirir (görüntüleyici yeniden kurulur, aynı yere dönülür) */
  async setSource(src) {
    if (!this.SOURCES[src] || src === this.src) return;
    if (this.SOURCES[src].token && !this.token()) { WorldUI.openKey(src); return; }
    this.src = src;
    this.set("src", src);
    WorldUI.sync();
    if (!this.on) return;
    this.ready = false;
    try {
      this.status("Harita kaynağı değişiyor…", true);
      await this.makeViewer();
      if (this.place) await this.goTo(this.place, { quiet: true }); else this.startPick(true);
    } catch (err) {
      console.error(err);
      this.status(err.message || String(err), false, "bad");
      toast(err.message || "Harita kaynağı açılamadı", "bad");
    }
  },

  /* ---------------- Koordinat dönüşümleri ---------------- */
  setOrigin(lon, lat, h) {
    const C = Cesium;
    this.lon0 = lon; this.lat0 = lat; this.h0 = h || 0;
    this.o = C.Cartesian3.fromDegrees(lon, lat, this.h0);
    this.enu = C.Transforms.eastNorthUpToFixedFrame(this.o);
    this.enuInv = C.Matrix4.inverseTransformation(this.enu, new C.Matrix4());
    const m = this.enu;
    this.ax = { e: [m[0], m[1], m[2]], n: [m[4], m[5], m[6]], u: [m[8], m[9], m[10]], o: [m[12], m[13], m[14]] };
  },
  /** boylam/enlem (derece) → yerel doğu/kuzey (m) */
  toLocal(lon, lat, out) {
    const C = Cesium, p = C.Cartesian3.fromDegrees(lon, lat, this.h0, C.Ellipsoid.WGS84, World._c3 || (World._c3 = new C.Cartesian3()));
    C.Matrix4.multiplyByPoint(this.enuInv, p, p);
    out = out || [0, 0]; out[0] = p.x; out[1] = p.y;
    return out;
  },
  /** yerel (m) → boylam/enlem (derece) */
  toGeo(e, n) {
    const C = Cesium, p = C.Matrix4.multiplyByPoint(this.enu, new C.Cartesian3(e, n, 0), new C.Cartesian3());
    const c = C.Cartographic.fromCartesian(p);
    return { lon: C.Math.toDegrees(c.longitude), lat: C.Math.toDegrees(c.latitude) };
  },

  /* ---------------- OpenFreeMap vektör karoları ---------------- */
  async tileUrl() {
    if (this._tj) return this._tj;
    const r = await fetch(this.OFM, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error("Harita verisi sunucusu cevap vermedi (" + r.status + ")");
    const j = await r.json();
    return (this._tj = j.tiles[0]);
  },
  /** Başlangıç noktası çevresindeki z14 karolarını indirir ve çözer (önbellekte olanlar atlanır) */
  async loadArea(lon, lat, radius) {
    const z = 14, n = 2 ** z;
    const dLat = radius / 111320, dLon = radius / (111320 * Math.cos((lat * Math.PI) / 180));
    const tx = (lo) => Math.floor(((lo + 180) / 360) * n);
    const ty = (la) => { const r = (la * Math.PI) / 180; return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n); };
    const x0 = tx(lon - dLon), x1 = tx(lon + dLon), y0 = ty(lat + dLat), y1 = ty(lat - dLat);
    const want = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) if (!this.tiles.has(`${x}/${y}`)) want.push([x, y]);
    if (!want.length) return;
    const url = await this.tileUrl();
    let done = 0;
    await Promise.all(want.map(async ([x, y]) => {
      const r = await fetch(url.replace("{z}", z).replace("{x}", x).replace("{y}", y), { signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error("Harita karosu indirilemedi (" + r.status + ")");
      const layers = Mvt.decode(await r.arrayBuffer(), ["building", "transportation", "transportation_name"]);
      this.tiles.set(`${x}/${y}`, { x, y, z, layers });
      done++;
      this.status(`Bina ve sokak verisi alınıyor… ${done}/${want.length}`, true);
    }));
    // Bellek sınırı: en fazla 16 karo tutulur
    while (this.tiles.size > 16) this.tiles.delete(this.tiles.keys().next().value);
  },
  /** Karo koordinatı → boylam/enlem */
  tileGeo(t, px, py, E) {
    const n = 2 ** t.z, lon = ((t.x + px / E) / n) * 360 - 180;
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (t.y + py / E)) / n))) * 180) / Math.PI;
    return [lon, lat];
  },

  /* ---------------- Yerel veri: binalar, yollar, sokak adları ---------------- */
  /** Karolardaki verileri başlangıç noktasına göre yerel koordinata çevirir ve dizinler */
  buildLocal() {
    const blds = [], roads = [], names = [], R2 = (this.RADIUS + 250) ** 2;
    const loc = [0, 0];
    const conv = (t, flat, E) => {
      const out = new Float64Array(flat.length);
      for (let i = 0; i < flat.length; i += 2) {
        const [lo, la] = this.tileGeo(t, flat[i], flat[i + 1], E);
        this.toLocal(lo, la, loc);
        out[i] = loc[0]; out[i + 1] = loc[1];
      }
      return out;
    };
    for (const t of this.tiles.values()) {
      const L = t.layers;
      if (this.src === "open" && L.building) {
        const E = L.building.extent;
        for (const f of L.building.features) {
          if (f.type !== 3 || f.tags.hide_3d) continue;
          for (const poly of Mvt.polygons(f)) {
            const outer = clipRing(poly.outer, E);
            if (outer.length < 6) continue;
            const ring = conv(t, outer, E);
            if (ring[0] * ring[0] + ring[1] * ring[1] > R2) continue;
            const holes = poly.holes.map((h) => clipRing(h, E)).filter((h) => h.length >= 6).map((h) => conv(t, h, E));
            const b = makeBuilding(ring, holes, f.tags);
            if (b) blds.push(b);
          }
        }
      }
      if (L.transportation) {
        const E = L.transportation.extent;
        for (const f of L.transportation.features) {
          if (f.type !== 2 || !ROAD_CLASSES.has(f.tags.class) || f.tags.brunnel === "tunnel") continue;
          for (const r of f.rings) if (r.length >= 4) roads.push({ cls: f.tags.class, pts: conv(t, r, E) });
        }
      }
      if (L.transportation_name) {
        const E = L.transportation_name.extent;
        for (const f of L.transportation_name.features) {
          if (f.type !== 2 || !f.tags.name) continue;
          for (const r of f.rings) if (r.length >= 4) names.push({ name: f.tags.name, cls: f.tags.class, pts: conv(t, r, E) });
        }
      }
    }
    this.blds = blds; this.roads = roads; this.names = names;
    this.grid = gridIndex(blds, 25, (b) => [b.minE, b.minN, b.maxE, b.maxN]);
    this.nameGrid = segGrid(names, 40);
    this._lineSet = null;
  },

  /* ---------------- Şehir modeli (açık veri) ---------------- */
  /** Tüm binaları tek bir Cesium Primitive olarak kurar: duvarlar pencereli, çatılar ayrı renkli */
  buildCity() {
    const C = Cesium, sc = this.viewer.scene;
    if (this.city) { sc.primitives.remove(this.city); this.city = null; }
    if (!this.blds.length) return;
    let nv = 0, ni = 0;
    for (const b of this.blds) {
      const rings = [b.ring, ...b.holes];
      let pts = 0;
      for (const r of rings) { const k = r.length / 2; nv += k * 4; ni += k * 6; pts += k; }
      nv += pts; ni += (pts - 2 + 2 * b.holes.length) * 3;
      if (b.base > 0.3) { nv += pts; ni += (pts - 2 + 2 * b.holes.length) * 3; }
    }
    const pos = new Float64Array(nv * 3), nrm = new Float32Array(nv * 3), col = new Uint8Array(nv * 4), inf = new Float32Array(nv * 4), idx = new Uint32Array(ni);
    const A = this.ax;
    let v = 0, k = 0;
    const put = (e, n, u, ne, nn, nu, c, top, s, h, len, style) => {
      pos[v * 3] = A.o[0] + e * A.e[0] + n * A.n[0] + u * A.u[0];
      pos[v * 3 + 1] = A.o[1] + e * A.e[1] + n * A.n[1] + u * A.u[1];
      pos[v * 3 + 2] = A.o[2] + e * A.e[2] + n * A.n[2] + u * A.u[2];
      nrm[v * 3] = ne * A.e[0] + nn * A.n[0] + nu * A.u[0];
      nrm[v * 3 + 1] = ne * A.e[1] + nn * A.n[1] + nu * A.u[1];
      nrm[v * 3 + 2] = ne * A.e[2] + nn * A.n[2] + nu * A.u[2];
      col[v * 4] = c[0]; col[v * 4 + 1] = c[1]; col[v * 4 + 2] = c[2]; col[v * 4 + 3] = Math.min(255, Math.round(top));
      inf[v * 4] = s; inf[v * 4 + 1] = h; inf[v * 4 + 2] = len; inf[v * 4 + 3] = style;
      return v++;
    };
    const cap = (b, ringsUp, z, up) => {
      // Çatı (ya da asma binanın tabanı): ear-clipping üçgenleme
      const flat = [], holes = [];
      for (let r = 0; r < ringsUp.length; r++) {
        if (r) holes.push(flat.length);
        const ring = ringsUp[r];
        for (let i = 0; i < ring.length; i += 2) flat.push(new C.Cartesian2(ring[i], ring[i + 1]));
      }
      let tri;
      try { tri = C.PolygonPipeline.triangulate(flat, holes); } catch (e) { tri = null; }
      if (!tri || !tri.length) return;
      const first = v, c = up ? b.roof : b.wall;
      for (const p of flat) put(p.x, p.y, z, 0, 0, up ? 1 : -1, c, b.top, 0, z, 0, 0);
      for (let i = 0; i + 2 < tri.length; i += 3) {
        let a = tri[i], bb = tri[i + 1], cc = tri[i + 2];
        const cr = (flat[bb].x - flat[a].x) * (flat[cc].y - flat[a].y) - (flat[bb].y - flat[a].y) * (flat[cc].x - flat[a].x);
        if ((cr < 0) === up) { const t = bb; bb = cc; cc = t; }      // üstten saat yönünün tersi (yukarı bakan yüz)
        idx[k++] = first + a; idx[k++] = first + bb; idx[k++] = first + cc;
      }
    };
    for (const b of this.blds) {
      for (const ring of [b.ring, ...b.holes]) {
        const m = ring.length;
        for (let i = 0; i < m; i += 2) {
          const ax = ring[i], ay = ring[i + 1], bx = ring[(i + 2) % m], by = ring[(i + 3) % m];
          const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
          if (len < 0.05) continue;
          const ne = dy / len, nn = -dx / len;                       // dışa bakan normal (sağ el)
          const a0 = put(ax, ay, b.base, ne, nn, 0, b.wall, b.top, 0, b.base, len, b.style);
          const b0 = put(bx, by, b.base, ne, nn, 0, b.wall, b.top, len, b.base, len, b.style);
          const b1 = put(bx, by, b.top, ne, nn, 0, b.wall, b.top, len, b.top, len, b.style);
          const a1 = put(ax, ay, b.top, ne, nn, 0, b.wall, b.top, 0, b.top, len, b.style);
          idx[k++] = a0; idx[k++] = b0; idx[k++] = b1;
          idx[k++] = a0; idx[k++] = b1; idx[k++] = a1;
        }
      }
      cap(b, [b.ring, ...b.holes], b.top, true);
      if (b.base > 0.3) cap(b, [b.ring, ...b.holes], b.base, false);
    }
    const P = pos.subarray(0, v * 3);
    const geometry = new C.Geometry({
      attributes: {
        position: new C.GeometryAttribute({ componentDatatype: C.ComponentDatatype.DOUBLE, componentsPerAttribute: 3, values: P }),
        normal: new C.GeometryAttribute({ componentDatatype: C.ComponentDatatype.FLOAT, componentsPerAttribute: 3, values: nrm.subarray(0, v * 3) }),
        color: new C.GeometryAttribute({ componentDatatype: C.ComponentDatatype.UNSIGNED_BYTE, componentsPerAttribute: 4, normalize: true, values: col.subarray(0, v * 4) }),
        info: new C.GeometryAttribute({ componentDatatype: C.ComponentDatatype.FLOAT, componentsPerAttribute: 4, values: inf.subarray(0, v * 4) })
      },
      indices: idx.subarray(0, k),
      primitiveType: C.PrimitiveType.TRIANGLES,
      boundingSphere: C.BoundingSphere.fromVertices(P)
    });
    const appearance = new C.Appearance({
      translucent: false, closed: true,
      renderState: { depthTest: { enabled: true }, depthMask: true, cull: { enabled: true, face: C.CullFace.BACK } },
      vertexShaderSource: CITY_VS, fragmentShaderSource: CITY_FS
    });
    this.city = sc.primitives.add(new C.Primitive({
      geometryInstances: new C.GeometryInstance({ geometry }), appearance,
      asynchronous: false, compressVertices: false, allowPicking: false, releaseGeometryInstances: true, vertexCacheOptimize: false
    }));
  },

  /** Halkaları ve sokak tabelasını three.js sahnesine (yeniden) kurar; drone değişince de çağrılır */
  reapply(force) {
    if ((!this.ready && !force) || !this._gatesMm) return;
    Scene3D.setWorldGates(this._gatesMm);
    Scene3D.setStreetSign(this._sign.text, this._sign.yaw);
  },

  /* ---------------- Başlangıç noktası, sokak ve parkur ---------------- */
  /** Bir yere gider: veri indirilir, başlangıç sokağa oturtulur, halkalar sokak boyunca dizilir */
  async goTo(place, opts = {}) {
    if (!this.viewer) return;
    const job = ++this.job;
    this.ready = false; Fly.hold = true;
    if (this.picking) this.endPick();
    this.place = place;
    this.set("place", { name: place.name, sub: place.sub || "", lon: place.lon, lat: place.lat, pick: !!place.pick });
    this.remember(place);
    WorldUI.sync();
    this.status(`${place.name} · yükleniyor…`, true);
    document.body.classList.remove("world-ready");
    try {
      this.setOrigin(place.lon, place.lat, 0);
      this.overview(place.lon, place.lat, this.src === "open" ? 0 : await this.terrainAt(place.lon, place.lat));
      await this.loadArea(place.lon, place.lat, this.RADIUS);
      if (job !== this.job) return;
      this.buildLocal();
      // Başlangıç: aranan sokağın (ya da en yakın yolun) üstüne otur; yön sokak boyunca
      const start = this.snapStart(place);
      let h0 = 0;
      if (this.src !== "open") { this.status(`${place.name} · zemin yüksekliği ölçülüyor…`, true); h0 = await this.groundHeight(start.lon, start.lat); }
      if (job !== this.job) return;
      this.setOrigin(start.lon, start.lat, h0);
      this.buildLocal();
      if (this.src === "open") { this.status(`${place.name} · binalar kuruluyor…`, true); await nextFrame(); this.buildCity(); }
      this.setupLight();
      // Halkalar
      const path = start.path ? start.path.map(([lo, la]) => this.toLocal(lo, la, [0, 0])) : null;
      this.gates = path ? this.makeCourse(path) : [];
      if (this.src !== "open" && this.gates.length) await this.gateGround(this.gates);
      if (job !== this.job) return;
      this.startYaw = start.heading;
      this.floorCache = null;
      this._gatesMm = this.gates.map((g) => ({ x: g.e * 1000, y: (g.g + g.h) * 1000, z: -g.n * 1000, ground: g.g * 1000, yaw: g.yaw }));
      this._sign = { text: signText(start.street || place.name), yaw: start.heading };
      this.reapply(true);
      this.ready = true;                              // önce hazır: Fly.reset başlangıç yönünü ve zemini buradan alır
      Fly.reset();
      Scene3D.snapFollow();
      Fly.hold = false;
      document.body.classList.add("world-ready");
      const cnt = this.src === "open" ? ` · ${fmt(this.blds.length)} bina` : "";
      this.status(`${place.name}${place.sub ? " · " + place.sub.split(",").slice(0, 2).join(",") : ""}`, false);
      if (!opts.quiet || !this._announced) log(`Gerçek dünya: ${place.name}${start.street && start.street !== place.name ? " (" + start.street + ")" : ""} · ${this.SOURCES[this.src].short}${cnt}${this.gates.length ? " · sokak boyunca " + this.gates.length + " halka" : ""}`, "ok");
      this._announced = true;
      WorldUI.sync();
    } catch (err) {
      if (job !== this.job) return;
      console.error(err);
      this.status(err.message || String(err), false, "bad");
      toast("Konum yüklenemedi: " + (err.message || err), "bad");
      Fly.hold = false;
    }
  },

  /** Başlangıcı en yakın sokağa oturtur; aranan yer bir sokaksa onun çizgisi kullanılır */
  snapStart(place) {
    let lines = [];
    if (place.line && place.line.length) lines = place.line.map((l) => ({ name: place.name, pts: Float64Array.from(l.flatMap(([lo, la]) => this.toLocal(lo, la, [0, 0]))) }));
    const useRoads = !lines.length;
    if (useRoads) lines = this.lineSet().filter((L) => L.cls && ROAD_CLASSES.has(L.cls) && !L.name);
    let best = null;
    for (const L of lines) {
      const p = L.pts;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const q = nearestOnSeg(0, 0, p[i], p[i + 1], p[i + 2], p[i + 3]);
        const d = q[2] + (useRoads && L.cls === "service" ? 12 : 0);       // servis yolu yerine sokağı tercih et
        if (!best || d < best.d) best = { d, L, i, x: q[0], y: q[1] };
      }
    }
    const inside = this.src === "open" && this.floorLocal(0, 0) > 0.5;
    if (!best || best.d > (place.pick ? 40 : 90)) return { lon: place.lon, lat: place.lat, heading: 0, path: null, street: this.streetAt(0, 0) };
    // Sokak çizgisini, başlangıç noktasından daha uzun kalan yöne doğru izle (komşu parçalara geçerek)
    const fwd = this.walk(best, 1), back = this.walk(best, -1);
    let path = fwd.len >= back.len ? fwd.pts : back.pts;
    if (path.length < 2) return { lon: place.lon, lat: place.lat, heading: 0, path: null, street: this.streetAt(0, 0) };
    const heading = Math.atan2(path[1][1] - path[0][1], path[1][0] - path[0][0]);
    const street = best.L.name || this.streetAt(best.x, best.y);
    const geo = (pts) => pts.map(([e, n]) => { const q = this.toGeo(e, n); return [q.lon, q.lat]; });
    // Haritadan seçilen nokta bir binanın içinde değilse başlangıç tıklanan yerde kalır; parkur yine sokak boyunca
    if (place.pick && !inside) return { lon: place.lon, lat: place.lat, heading, path: geo([[0, 0]].concat(path)), street };
    const g = this.toGeo(best.x, best.y);
    return { lon: g.lon, lat: g.lat, heading, path: geo(path), street };
  },
  /** Bir yol parçasından başlayıp verilen yönde en çok 180 m ilerler; uç noktada hizalı başka parça varsa ona geçer */
  walk(best, dir) {
    const pts = [[best.x, best.y]];
    let L = best.L, i = dir > 0 ? best.i + 2 : best.i, len = 0, used = new Set([L]), guard = 0;
    for (;;) {
      const p = L.pts;
      while (i >= 0 && i + 1 < p.length) {
        const last = pts[pts.length - 1], x = p[i], y = p[i + 1], d = Math.hypot(x - last[0], y - last[1]);
        if (d > 0.3) { pts.push([x, y]); len += d; }
        if (len > 180) return { pts, len };
        i += dir * 2;
      }
      // Uçtaki noktaya değen ve aynı doğrultuda devam eden başka parça
      const end = pts[pts.length - 1], prev = pts[Math.max(0, pts.length - 2)];
      const hx = end[0] - prev[0], hy = end[1] - prev[1], hl = Math.hypot(hx, hy) || 1;
      let next = null;
      for (const M of this.lineSet()) {
        if (used.has(M)) continue;
        const q = M.pts, n = q.length;
        for (const [j, sgn] of [[0, 1], [n - 2, -1]]) {
          if (Math.hypot(q[j] - end[0], q[j + 1] - end[1]) > 2) continue;
          const k = j + sgn * 2;
          if (k < 0 || k >= n) continue;
          const tx = q[k] - q[j], ty = q[k + 1] - q[j + 1], tl = Math.hypot(tx, ty) || 1;
          const cos = (tx * hx + ty * hy) / (tl * hl), same = M.name && M.name === L.name;
          const score = cos + (same ? 0.5 : 0);
          if (cos > 0.6 && (!next || score > next.score)) next = { M, i: k, dir: sgn, score };
        }
      }
      if (!next || ++guard > 12) return { pts, len };
      L = next.M; i = next.i; dir = next.dir; used.add(L);
    }
  },
  lineSet() { return this._lineSet || (this._lineSet = this.roads.map((r) => ({ name: null, pts: r.pts, cls: r.cls })).concat(this.names)); },

  /** Halkalar: başlangıçtan 16 m sonra başlar, 22 m arayla en çok 6 tane, 3–6 m yükseklikte */
  makeCourse(path) {
    const out = [], H = [3.2, 4.6, 3.6, 5.6, 4.2, 6];
    let acc = 0, want = 16;
    for (let i = 0; i + 1 < path.length && out.length < 6; i++) {
      const [ax, ay] = path[i], [bx, by] = path[i + 1], d = Math.hypot(bx - ax, by - ay);
      while (acc + d >= want && out.length < 6) {
        const t = (want - acc) / d, e = ax + (bx - ax) * t, n = ay + (by - ay) * t;
        if (this.src === "open" && this.floorLocal(e, n) > 0.5) return out;     // yol binanın içinden geçiyorsa dur
        out.push({ e, n, h: H[out.length], g: 0, yaw: Math.atan2(by - ay, bx - ax) });
        want += 22;
      }
      acc += d;
    }
    return out.length >= 2 ? out : [];
  },
  /** Arazili kaynaklarda halkaların altındaki zemin yüksekliği */
  async gateGround(gates) {
    const C = Cesium;
    const pts = gates.map((g) => { const q = this.toGeo(g.e, g.n); return C.Cartographic.fromDegrees(q.lon, q.lat); });
    try {
      const r = await C.sampleTerrainMostDetailed(this.terrain, pts);
      const g0 = (await C.sampleTerrainMostDetailed(this.terrain, [C.Cartographic.fromDegrees(this.lon0, this.lat0)]))[0].height || 0;
      gates.forEach((g, i) => { g.g = (r[i] && isFinite(r[i].height) ? r[i].height : g0) - g0; });
    } catch (e) { /* arazi örneklenemedi: düz kabul edilir */ }
  },
  /** Yüklenirken kamera: yerin 380 m üstünden, güneyden kuzeye bakış */
  overview(lon, lat, h) {
    const C = Cesium;
    this.viewer.camera.flyTo({ destination: C.Cartesian3.fromDegrees(lon, lat - 0.0033, h + 380), orientation: { heading: 0, pitch: -0.78, roll: 0 }, duration: 1.6 });
  },
  async terrainAt(lon, lat) {
    try { const r = await Cesium.sampleTerrainMostDetailed(this.terrain, [Cesium.Cartographic.fromDegrees(lon, lat)]); return r[0] && isFinite(r[0].height) ? r[0].height : 0; } catch (e) { return 0; }
  },
  /** Arazili kaynaklarda başlangıç noktasının zemin yüksekliği (elipsoit üstü, m) */
  async groundHeight(lon, lat) {
    const C = Cesium, c = C.Cartographic.fromDegrees(lon, lat);
    const ht = await this.terrainAt(lon, lat);
    if (this.src === "google" && this.tileset) {
      try {
        const r = await Promise.race([this.viewer.scene.sampleHeightMostDetailed([c.clone()]), new Promise((res) => setTimeout(() => res(null), 12000))]);
        if (r && r[0] && isFinite(r[0].height) && Math.abs(r[0].height - ht) < 60) return r[0].height;
      } catch (e) { /* karo yüklenemedi: arazi yüksekliği kullanılır */ }
    }
    return ht;
  },

  /** Sahne ışığı: three.js'teki güneşle aynı yönden (gölge ve bina gölgelemesi uyuşsun) */
  setupLight() {
    const C = Cesium, A = this.ax;
    // three.js: ışık drone'a göre (+800, +1300, +700) mm → yerel (doğu 0,8 · kuzey −0,7 · yukarı 1,3)
    const le = -0.8, ln = 0.7, lu = -1.3;
    const d = new C.Cartesian3(le * A.e[0] + ln * A.n[0] + lu * A.u[0], le * A.e[1] + ln * A.n[1] + lu * A.u[1], le * A.e[2] + ln * A.n[2] + lu * A.u[2]);
    C.Cartesian3.normalize(d, d);
    this.viewer.scene.light = new C.DirectionalLight({ direction: d, intensity: 2.2 });
  },

  /* ---------------- Zemin, duvar, çarpışma ---------------- */
  /** Yerel (m) noktadaki en yüksek bina çatısı (m); bina yoksa 0 */
  floorLocal(e, n) {
    let top = 0;
    const g = this.grid;
    if (!g) return 0;
    const list = g.cells.get(gkey(Math.floor(e / g.size), Math.floor(n / g.size)));
    if (!list) return 0;
    for (const i of list) {
      const b = this.blds[i];
      if (b.top <= top || e < b.minE || e > b.maxE || n < b.minN || n > b.maxN) continue;
      if (inRing(b.ring, e, n) && !b.holes.some((h) => inRing(h, e, n))) top = b.top;
    }
    return top;
  },
  /** Fly için: three.js koordinatında (mm) zemin yüksekliği (mm, başlangıç zeminine göre) */
  floorAt(xmm, zmm) {
    if (!this.ready) return 0;
    const e = xmm / 1000, n = -zmm / 1000;
    if (this.src === "open") return this.floorLocal(e, n) * 1000;
    return this.sampleFloor(e, n) * 1000;
  },
  /** Arazili kaynaklarda: sahnedeki geometriden yükseklik örneği (pahalı olduğu için önbellekli ve kareye bütçeli) */
  sampleFloor(e, n) {
    const C = Cesium, c = this.floorCache;
    if (c && Math.hypot(c.e - e, c.n - n) < 0.35 && performance.now() - c.t < 300) return c.h;
    if ((this._budget || 0) <= 0 && c) return c.h;
    this._budget = (this._budget || 0) - 1;
    const q = this.toGeo(e, n), t0 = performance.now();
    let h;
    try { h = this.viewer.scene.sampleHeight(C.Cartographic.fromDegrees(q.lon, q.lat), undefined, 0.3); } catch (err) { h = undefined; }
    this._sampleMs = (this._sampleMs || 2) * 0.8 + (performance.now() - t0) * 0.2;
    const rel = h == null || !isFinite(h) ? (c ? c.h : 0) : Math.max(-30, h - this.h0);
    this.floorCache = { e, n, h: rel, t: performance.now() };
    return rel;
  },
  /** Kamera bir binanın içine ya da zeminin altına girmesin (takip bakışında) */
  guardCamera(cam, target) {
    if (!this.ready) return;
    const ce = cam.position.x / 1000, cn = -cam.position.z / 1000, cu = cam.position.y / 1000;
    const te = target.x / 1000, tn = -target.z / 1000, tu = target.y / 1000;
    if (this.src === "open") {
      // Drone'dan kameraya giden çizgide ilk engel: yakındaysa kamera çatının üstüne çıkar, uzaktaysa engelin önüne çekilir
      let hit = 2;
      for (let i = 1; i <= 14 && hit > 1; i++) {
        const m = i / 14;
        if (this.floorLocal(te + (ce - te) * m, tn + (cn - tn) * m) > tu + (cu - tu) * m - 0.35) hit = m;
      }
      if (hit > 1) return;
      if (hit >= 0.5) cam.position.lerpVectors(target, cam.position, hit - 1 / 14);
      else {
        let top = 0;
        for (let i = 1; i <= 14; i++) { const m = i / 14; top = Math.max(top, this.floorLocal(te + (ce - te) * m, tn + (cn - tn) * m)); }
        cam.position.y = Math.max(cam.position.y, (top + 1.2) * 1000);
      }
      cam.lookAt(target);
      return;
    }
    // Arazili kaynaklar: kamera zeminin en az 40 cm üstünde
    const now = performance.now();
    if (!this._camFloor || now - this._camFloor.t > 200) {
      const q = this.toGeo(ce, cn);
      let h;
      try { h = this.viewer.scene.sampleHeight(Cesium.Cartographic.fromDegrees(q.lon, q.lat), undefined, 0.3); } catch (e) { h = undefined; }
      this._camFloor = { t: now, h: h == null ? -1e9 : h - this.h0 };
    }
    const minY = (this._camFloor.h + 0.4) * 1000;
    if (cam.position.y < minY) { cam.position.y = minY; cam.lookAt(target); }
  },
  /** Drone'un altındaki sokağın adı (en yakın 30 m içinde) */
  streetAt(e, n) {
    const g = this.nameGrid;
    if (!g) return "";
    let best = null;
    const ci = Math.floor(e / g.size), cj = Math.floor(n / g.size);
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
      for (const [li, si] of g.cells.get(gkey(i, j)) || []) {
        const p = this.names[li].pts, q = nearestOnSeg(e, n, p[si], p[si + 1], p[si + 2], p[si + 3]);
        if (q[2] < 30 && (!best || q[2] < best.d)) best = { d: q[2], name: this.names[li].name };
      }
    }
    return best ? best.name : "";
  },

  /* ---------------- Her kare ---------------- */
  /** three.js kamerasını Cesium kamerasına aktarır ve dünyayı çizer */
  frame(dt) {
    const v = this.viewer;
    if (!this.on || !v || (S.page && S.page !== "lab")) return;
    this._budget = 2;                                   // kare başına en çok 2 yükseklik örneği
    v.resize();
    if (!this.picking && this.ready && this.enu) this.syncCamera(Scene3D.camera);
    v.render();
    // Sokak adı ve radar: saniyede ~8 kez
    this._ui = (this._ui || 0) + dt;
    if (this._ui > 0.12 && this.ready && !this.picking) { this._ui = 0; WorldUI.tick(); }
  },
  syncCamera(cam3) {
    const C = Cesium, cam = this.viewer.camera, A = this.ax;
    cam3.updateMatrixWorld();
    const p = cam3.position, e = p.x / 1000, n = -p.z / 1000, u = p.y / 1000;
    const pos = World._p3 || (World._p3 = new C.Cartesian3());
    pos.x = A.o[0] + e * A.e[0] + n * A.n[0] + u * A.u[0];
    pos.y = A.o[1] + e * A.e[1] + n * A.n[1] + u * A.u[1];
    pos.z = A.o[2] + e * A.e[2] + n * A.n[2] + u * A.u[2];
    const vec = (x, y, z, out) => {                    // three.js yönü → yerel → yer merkezli
      const ve = x, vn = -z, vu = y;
      out.x = ve * A.e[0] + vn * A.n[0] + vu * A.u[0];
      out.y = ve * A.e[1] + vn * A.n[1] + vu * A.u[1];
      out.z = ve * A.e[2] + vn * A.n[2] + vu * A.u[2];
      return C.Cartesian3.normalize(out, out);
    };
    const m = cam3.matrixWorld.elements;                 // sütunlar: sağ, yukarı, geri
    C.Cartesian3.clone(pos, cam.position);
    vec(-m[8], -m[9], -m[10], cam.direction);
    vec(m[4], m[5], m[6], cam.up);
    C.Cartesian3.cross(cam.direction, cam.up, cam.right);
    C.Cartesian3.normalize(cam.right, cam.right);
    const f = cam.frustum, el = v3el(), aspect = el.clientWidth / Math.max(1, el.clientHeight);
    const vf = (cam3.fov * Math.PI) / 180;
    f.fov = aspect > 1 ? 2 * Math.atan(Math.tan(vf / 2) * aspect) : vf;
    f.near = 0.2;
  },

  /** Rapor görüntüsü için: Cesium karesini hemen çizip kopyalar */
  snapshotCanvas() {
    if (!this.on || !this.viewer) return null;
    this.viewer.render();
    return this.viewer.canvas;
  },

  /* ---------------- Haritadan başlangıç noktası seçme ---------------- */
  startPick(overview) {
    const v = this.viewer, C = Cesium;
    if (!v) return;
    this.picking = true; Fly.hold = true;
    document.body.classList.add("world-picking");
    v.scene.screenSpaceCameraController.enableInputs = true;
    const ctl = v.scene.screenSpaceCameraController;
    ctl.enableCollisionDetection = true;
    if (overview || !this.place) {
      v.camera.setView({ destination: C.Cartesian3.fromDegrees(34.8, 36.2, 1450000), orientation: { heading: 0, pitch: -1.2, roll: 0 } });
    } else {
      v.camera.setView({ destination: C.Cartesian3.fromDegrees(this.lon0, this.lat0 - 0.0028, this.h0 + 330), orientation: { heading: 0, pitch: -0.82, roll: 0 } });
    }
    this.pickHandler = this.pickHandler || new C.ScreenSpaceEventHandler(v.canvas);
    this.pickHandler.setInputAction((ev) => this.onPick(ev.position), C.ScreenSpaceEventType.LEFT_CLICK);
    WorldUI.sync();
    this.status(this.place ? "Başlangıç noktasına tıkla" : "Bir yer ara ya da haritada yakınlaştırıp tıkla", false);
  },
  endPick() {
    if (!this.viewer) return;
    this.picking = false;
    document.body.classList.remove("world-picking");
    this.viewer.scene.screenSpaceCameraController.enableInputs = false;
    if (this.pickHandler) this.pickHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);
    WorldUI.sync();
  },
  cancelPick() {
    this.endPick();
    if (this.place) { Fly.hold = !this.ready; this.status(this.place.name, false); }
  },
  onPick(pos) {
    const C = Cesium, v = this.viewer;
    let cart = null;
    try { if (v.scene.pickPositionSupported) cart = v.scene.pickPosition(pos); } catch (e) { cart = null; }
    if (!cart) cart = v.camera.pickEllipsoid(pos);
    if (!cart) return;
    const c = C.Cartographic.fromCartesian(cart), lon = C.Math.toDegrees(c.longitude), lat = C.Math.toDegrees(c.latitude);
    const camH = v.camera.positionCartographic.height - (c.height || 0);
    if (camH > 2500) {
      // Çok yüksekten tıklandı: önce oraya yaklaş
      v.camera.flyTo({ destination: C.Cartesian3.fromDegrees(lon, lat - Math.min(0.02, camH / 600000), Math.max(700, camH / 6)), orientation: { heading: 0, pitch: -0.95, roll: 0 }, duration: 1.4 });
      this.status("Yaklaştı. Şimdi başlangıç noktasına tıkla", false);
      return;
    }
    this.goTo({ name: "Seçilen nokta", sub: `${lat.toFixed(5)}, ${lon.toFixed(5)}`, lon, lat, pick: true, fromPick: true });
  },

  /* ---------------- Arama ---------------- */
  async search(q) {
    q = (q || "").trim();
    if (!q) return [];
    if (this.src === "google" && this.viewer && window.Cesium) {
      // Google 3D karoları yalnızca Google'ın adres aramasıyla birlikte kullanılabilir
      const C = Cesium, g = new C.IonGeocoderService({ scene: this.viewer.scene, geocodeProviderType: C.IonGeocodeProviderType.GOOGLE });
      const res = await g.geocode(q);
      return res.slice(0, 6).map((r) => {
        const d = r.destination, c = d instanceof C.Rectangle ? C.Rectangle.center(d) : C.Cartographic.fromCartesian(d);
        const parts = r.displayName.split(",");
        return { name: parts[0].trim(), sub: parts.slice(1).join(",").trim(), lon: C.Math.toDegrees(c.longitude), lat: C.Math.toDegrees(c.latitude) };
      });
    }
    let res = await this.nominatim(q, true);
    if (!res.length) res = await this.nominatim(q, false);
    return res;
  },
  /** OpenStreetMap Nominatim (saniyede en çok 1 istek kuralına uyulur) */
  async nominatim(q, trOnly) {
    const wait = (this._nomT || 0) + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this._nomT = Date.now();
    const u = `${this.NOMINATIM}?format=jsonv2&limit=6&accept-language=tr&polygon_geojson=1&polygon_threshold=0.00001${trOnly ? "&countrycodes=tr" : ""}&q=${encodeURIComponent(q)}`;
    const r = await fetch(u, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error("Adres araması cevap vermedi (" + r.status + ")");
    const j = await r.json();
    return j.map((it) => {
      const parts = it.display_name.split(",").map((s) => s.trim());
      const name = it.name || parts[0];
      const sub = parts.filter((s) => s !== name && !/^\d{5}$/.test(s) && s !== "Türkiye").slice(0, 3).join(", ");
      let line = null;
      const gj = it.geojson;
      if (gj && gj.type === "LineString") line = [gj.coordinates];
      else if (gj && gj.type === "MultiLineString") line = gj.coordinates;
      return { name, sub, lon: Number(it.lon), lat: Number(it.lat), line, kind: it.category + "/" + it.type };
    });
  },
  /** Tarayıcının konum izniyle */
  locate() {
    return new Promise((res, rej) => {
      if (!navigator.geolocation) { rej(new Error("Bu tarayıcı konum vermiyor.")); return; }
      navigator.geolocation.getCurrentPosition((p) => res({ name: "Konumum", sub: `±${Math.round(p.coords.accuracy)} m`, lon: p.coords.longitude, lat: p.coords.latitude }),
        (e) => rej(new Error(e.code === 1 ? "Konum izni verilmedi." : "Konum alınamadı.")), { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
    });
  },
  /** Son gidilen 5 yer */
  remember(p) {
    if (p.fromPick) return;
    const list = this.get("recent", []).filter((r) => Math.abs(r.lon - p.lon) > 1e-5 || Math.abs(r.lat - p.lat) > 1e-5);
    list.unshift({ name: p.name, sub: p.sub || "", lon: p.lon, lat: p.lat, line: p.line && JSON.stringify(p.line).length < 6000 ? p.line : null });
    this.set("recent", list.slice(0, 5));
  },

  /** Sahnenin üstündeki durum yazısı */
  status(text, busy, kind) {
    this.msg = text;
    WorldUI.status(text, busy, kind);
  }
};
World._c3 = undefined;

/* Sokak ve cadde sınıfları (OpenMapTiles "transportation" katmanı) */
const ROAD_CLASSES = new Set(["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service", "track", "raceway", "busway"]);

/* ---------------- Bina: yükseklik, renk, pencere düzeni ---------------- */
// Cephe renkleri (Türkiye'de yaygın sıva tonları) ve çatı renkleri
const WALLS = [[236, 230, 218], [227, 214, 193], [216, 199, 174], [239, 233, 223], [217, 207, 196], [230, 210, 184], [207, 200, 191], [232, 220, 203], [215, 185, 161], [233, 225, 207], [198, 205, 210], [222, 196, 170]];
const ROOFS = [[164, 82, 58], [155, 74, 53], [138, 74, 58], [170, 96, 70], [142, 142, 138], [118, 120, 120]];
function hash01(a, b) { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); }

/** Taban halkasından bina kaydı: yükseklik (bilinmiyorsa taban alanından tahmin), renkler, pencere düzeni */
function makeBuilding(ring, holes, tags) {
  // Dış halka saat yönünün tersine (üstten), delikler saat yönünde olsun
  const area = ringArea(ring);
  if (Math.abs(area) < 6) return null;
  if (area < 0) reverseRing(ring);
  for (const h of holes) if (ringArea(h) > 0) reverseRing(h);
  const A = Math.abs(area);
  let minE = Infinity, minN = Infinity, maxE = -Infinity, maxN = -Infinity, cx = 0, cy = 0;
  for (let i = 0; i < ring.length; i += 2) {
    const x = ring[i], y = ring[i + 1];
    if (x < minE) minE = x; if (x > maxE) maxE = x; if (y < minN) minN = y; if (y > maxN) maxN = y;
    cx += x; cy += y;
  }
  const k = ring.length / 2, r = hash01(Math.round(cx / k), Math.round(cy / k)), r2 = hash01(Math.round(cy / k), Math.round(cx / k) + 7);
  // Komşu binaların aynı düzlemdeki cepheleri titreşmesin: her taban kendine özgü 0,5–3,5 cm dışa genişletilir
  const grow = 0.005 + 0.03 * hash01(Math.round(cx / k) + 3, Math.round(cy / k) - 5);
  offsetRing(ring, grow);
  for (const h of holes) offsetRing(h, grow);
  let top = Number(tags.render_height), base = Number(tags.render_min_height) || 0;
  // OpenMapTiles yüksekliği bilinmeyen binaya 5 m yazar: kat sayısı taban alanından tahmin edilir
  const known = isFinite(top) && top > 0 && top !== 5;
  if (!known) {
    const floors = A < 30 ? 1 : A < 90 ? 2 + Math.floor(r * 2) : A < 260 ? 3 + Math.floor(r * 3) : A < 1400 ? 4 + Math.floor(r * 4) : 2 + Math.floor(r * 2);
    top = base + floors * (A >= 1400 ? 4.2 : 3) + 0.7;
  }
  top = Math.max(base + 2.4, top);
  let wall = WALLS[Math.floor(r2 * WALLS.length)];
  if (tags.colour) { try { const c = Cesium.Color.fromCssColorString(String(tags.colour)); if (c) wall = [c.red, c.green, c.blue].map((x) => Math.round(x * 255)); } catch (e) { /* tanınmayan renk */ } }
  const big = A >= 1400, small = A < 90;
  const roof = big ? ROOFS[4 + Math.floor(r * 2)] : ROOFS[Math.floor(r2 * 997) % (small ? 4 : 6)];
  // Pencere düzeni: 1 apartman, 2 ofis/ticari (şerit), 3 sanayi, 4 küçük bina; ,5 = zemin katta dükkân
  const style = A > 5000 && r > 0.6 ? 3 : big ? (r > 0.45 ? 2 : 1.5) : small ? 4 : 1 + (r2 > 0.55 ? 0.5 : 0);
  return { ring, holes, top, base, wall, roof, style, minE, minN, maxE, maxN, known };
}
/** Halkayı dış normalleri boyunca d kadar öteler (köşelerde gönye: çatlak kalmaz). Dış halka saat yönünün tersine, delik saat yönünde olmalı. */
function offsetRing(r, d) {
  const n = r.length / 2, src = Array.from(r);
  for (let i = 0; i < n; i++) {
    const p = (i + n - 1) % n, q = (i + 1) % n;
    let ax = src[i * 2] - src[p * 2], ay = src[i * 2 + 1] - src[p * 2 + 1], bx = src[q * 2] - src[i * 2], by = src[q * 2 + 1] - src[i * 2 + 1];
    const la = Math.hypot(ax, ay) || 1, lb = Math.hypot(bx, by) || 1;
    const n1x = ay / la, n1y = -ax / la, n2x = by / lb, n2y = -bx / lb;
    const k = Math.max(0.25, 1 + n1x * n2x + n1y * n2y);
    r[i * 2] = src[i * 2] + ((n1x + n2x) / k) * d;
    r[i * 2 + 1] = src[i * 2 + 1] + ((n1y + n2y) / k) * d;
  }
}
function ringArea(r) { let a = 0; for (let i = 0, n = r.length; i < n; i += 2) { const j = (i + 2) % n; a += r[i] * r[j + 1] - r[j] * r[i + 1]; } return a / 2; }
function reverseRing(r) { for (let i = 0, j = r.length - 2; i < j; i += 2, j -= 2) { const x = r[i], y = r[i + 1]; r[i] = r[j]; r[i + 1] = r[j + 1]; r[j] = x; r[j + 1] = y; } }
function inRing(r, x, y) {
  let c = false;
  for (let i = 0, n = r.length, j = n - 2; i < n; j = i, i += 2) {
    const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/** Karo sınırında kırpma (Sutherland–Hodgman): komşu karolardaki parçalar üst üste binmez */
function clipRing(flat, E) {
  let pts = [];
  for (let i = 0; i < flat.length; i += 2) pts.push([flat[i], flat[i + 1]]);
  if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
  const edges = [[(p) => p[0] >= 0, (a, b) => [0, a[1] + ((b[1] - a[1]) * (0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= E, (a, b) => [E, a[1] + ((b[1] - a[1]) * (E - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= 0, (a, b) => [a[0] + ((b[0] - a[0]) * (0 - a[1])) / (b[1] - a[1]), 0]],
    [(p) => p[1] <= E, (a, b) => [a[0] + ((b[0] - a[0]) * (E - a[1])) / (b[1] - a[1]), E]]];
  for (const [inside, cut] of edges) {
    if (!pts.length) break;
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length], b = pts[i], ia = inside(a), ib = inside(b);
      if (ib) { if (!ia) out.push(cut(a, b)); out.push(b); } else if (ia) out.push(cut(a, b));
    }
    pts = out;
  }
  // Ardışık aynı noktaları at
  const res = [];
  for (const p of pts) if (!res.length || Math.abs(p[0] - res[res.length - 2]) > 1e-6 || Math.abs(p[1] - res[res.length - 1]) > 1e-6) res.push(p[0], p[1]);
  return res;
}
/** Noktanın doğru parçasına en yakın noktası: [x, y, uzaklık] */
function nearestOnSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const x = ax + dx * t, y = ay + dy * t;
  return [x, y, Math.hypot(px - x, py - y)];
}
const gkey = (i, j) => i * 100003 + j;
/** Kutulara göre ızgara dizini */
function gridIndex(items, size, box) {
  const cells = new Map();
  items.forEach((it, idx) => {
    const [a, b, c, d] = box(it);
    for (let i = Math.floor(a / size); i <= Math.floor(c / size); i++) for (let j = Math.floor(b / size); j <= Math.floor(d / size); j++) {
      const k = gkey(i, j);
      let l = cells.get(k);
      if (!l) cells.set(k, (l = []));
      l.push(idx);
    }
  });
  return { size, cells };
}
/** Çizgi parçaları için ızgara: [çizgi, parça başlangıcı] */
function segGrid(lines, size) {
  const cells = new Map();
  lines.forEach((L, li) => {
    const p = L.pts;
    for (let s = 0; s + 3 < p.length; s += 2) {
      const i0 = Math.floor(Math.min(p[s], p[s + 2]) / size), i1 = Math.floor(Math.max(p[s], p[s + 2]) / size);
      const j0 = Math.floor(Math.min(p[s + 1], p[s + 3]) / size), j1 = Math.floor(Math.max(p[s + 1], p[s + 3]) / size);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const k = gkey(i, j);
        let l = cells.get(k);
        if (!l) cells.set(k, (l = []));
        l.push([li, s]);
      }
    }
  });
  return { size, cells };
}
/** Sokak tabelası metni: "Baran Sokak" → "BARAN SK." */
function signText(name) {
  if (!name) return "";
  const ab = [[/\bsoka[kğ](ı)?$/i, "SK."], [/\bcaddesi$/i, "CD."], [/\bbulvarı$/i, "BLV."], [/\bmahallesi$/i, "MAH."], [/\bmeydanı$/i, "MEYD."], [/\bçıkmazı$/i, "ÇKM."]];
  let s = name.trim();
  for (const [re, rep] of ab) if (re.test(s)) { s = s.replace(re, rep); break; }
  return s.toLocaleUpperCase("tr-TR");
}
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const v3el = () => Scene3D.container;

/* ---------------- Bina gölgelendiricisi ----------------
   info: x = duvar boyunca uzaklık (m), y = yükseklik (m), z = duvar uzunluğu (m), w = düzen (0 çatı)
   color.a = bina yüksekliği (m) → çatı korkuluğunda pencere çizilmez */
const CITY_VS = `
in vec3 position3DHigh;
in vec3 position3DLow;
in vec3 normal;
in vec4 color;
in vec4 info;
in float batchId;
out vec3 v_positionEC;
out vec3 v_normalEC;
out vec4 v_color;
out vec4 v_info;
void main() {
  vec4 p = czm_computePosition();
  v_positionEC = (czm_modelViewRelativeToEye * p).xyz;
  v_normalEC = czm_normal * normal;
  v_color = color;
  v_info = info;
  gl_Position = czm_modelViewProjectionRelativeToEye * p;
}`;
const CITY_FS = `
in vec3 v_positionEC;
in vec3 v_normalEC;
in vec4 v_color;
in vec4 v_info;
float band(float lo, float hi, float x, float w) { return smoothstep(lo - w, lo + w, x) * (1.0 - smoothstep(hi - w, hi + w, x)); }
void main() {
  vec3 n = normalize(v_normalEC);
  vec3 eye = normalize(-v_positionEC);
  float dist = length(v_positionEC);
  vec3 c = v_color.rgb;
  float style = floor(v_info.w + 0.01);
  if (style > 0.5) {
    float s = v_info.x, h = v_info.y, len = v_info.z, top = v_color.a * 255.0;
    float shops = step(0.25, fract(v_info.w));
    float bay = style > 3.5 ? 3.4 : style > 2.5 ? 7.0 : style > 1.5 ? 1.8 : 3.1;
    float fh = style > 2.5 && style < 3.5 ? 6.0 : 3.0;
    float nb = max(floor((len - 1.2) / bay), 0.0);
    float off = (len - nb * bay) * 0.5;
    float u = (s - off) / bay;
    float fu = fract(u), fv = fract(h / fh);
    float wu = fwidth(u) * 1.5 + 0.002, wv = fwidth(h / fh) * 1.5 + 0.002;
    float inside = band(0.0, nb, u, wu) * (1.0 - smoothstep(top - 1.1, top - 0.8, h)) * smoothstep(0.4, 0.7, h);
    float hw = style > 1.5 && style < 2.5 ? 0.43 : 0.24;
    float win = band(0.5 - hw, 0.5 + hw, fu, wu) * (style > 1.5 && style < 2.5 ? band(0.25, 0.88, fv, wv) : band(0.30, 0.78, fv, wv)) * inside;
    if (style > 2.5 && style < 3.5) win = band(0.62, 0.84, fv, wv) * band(0.12, 0.88, fu, wu) * inside;     // sanayi: üstte dar şerit
    float ground = 1.0 - smoothstep(fh - 0.05, fh + 0.05, h);
    float shop = shops * ground * band(0.04, 0.80, fv, wv) * band(0.07, 0.93, fu, wu) * band(0.0, nb, u, wu);
    win = mix(win, shop, shops * ground);
    float fres = 1.0 - abs(dot(n, eye));
    vec3 glass = mix(vec3(0.10, 0.12, 0.15), vec3(0.50, 0.58, 0.66), 0.18 + 0.55 * fres * fres);
    float slab = (style > 0.5 && style < 2.5) ? (1.0 - smoothstep(0.0, 0.05 + wv, fv)) * 0.12 : 0.0;
    float fade = 1.0 - smoothstep(260.0, 900.0, dist);       // uzakta desen titremesin: ortalama tona geç
    c = c * (1.0 - slab * fade);
    c = mix(c, mix(c * 0.78 + glass * 0.22, glass, fade), win);
    c *= mix(0.62, 1.0, smoothstep(0.0, 3.2, h));             // zemine yakın hafif gölge
  } else {
    c *= 0.96;
  }
  float diff = max(dot(n, czm_lightDirectionEC), 0.0);
  vec3 lit = c * (vec3(0.60, 0.63, 0.68) + vec3(0.52, 0.49, 0.44) * diff);
  float fog = 1.0 - exp(-dist * 0.00042);
  lit = mix(lit, vec3(0.74, 0.81, 0.89), clamp(fog, 0.0, 0.6));
  out_FragColor = vec4(lit, 1.0);
}`;

/* =========================================================
   ARAYÜZ – sol paneldeki "Uçuş alanı" bölümü, sahne üstü yazılar,
   radar ve Cesium ion anahtarı penceresi
   ========================================================= */
const WorldUI = {
  init() {
    const $ = (s) => document.querySelector(s);
    World.src = World.SOURCES[World.get("src", "open")] ? World.get("src", "open") : "open";
    if (World.SOURCES[World.src].token && !World.token()) World.src = "open";
    $("#flyAreaSeg").onclick = (e) => { const b = e.target.closest("button"); if (b) setFlyArea(b.dataset.area); };
    $("#worldSrc").innerHTML = Object.entries(World.SOURCES).map(([k, s]) => `<option value="${k}">${s.name}</option>`).join("");
    $("#worldSrc").onchange = (e) => { const v = e.target.value; e.target.value = World.src; World.setSource(v); };
    $("#worldSearch").onsubmit = (e) => { e.preventDefault(); this.doSearch(); };
    $("#worldResults").onclick = (e) => { const li = e.target.closest("[data-i]"); if (li) this.choose(this.results[Number(li.dataset.i)]); };
    $("#worldQuick").onclick = (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.act === "pick") { if (!World.on) setFlyArea("real"); else if (World.picking) World.cancelPick(); else World.startPick(); return; }
      if (b.dataset.act === "locate") { this.doLocate(); return; }
      const list = b.dataset.recent != null ? World.get("recent", []) : World.PRESETS;
      const p = list[Number(b.dataset.recent != null ? b.dataset.recent : b.dataset.preset)];
      if (p) this.choose(p);
    };
    $("#worldKeyBtn").onclick = () => this.openKey();
    $("#wkClose").onclick = $("#wkCancel").onclick = () => this.closeKey();
    $("#worldKeyModal").addEventListener("mousedown", (e) => { if (e.target.id === "worldKeyModal") this.closeKey(); });
    $("#wkSave").onclick = () => this.saveKey();
    $("#wkRemove").onclick = () => { World.set("token", null); $("#wkInput").value = ""; this.keyNote("Anahtar silindi.", ""); if (World.SOURCES[World.src].token) World.setSource("open"); this.sync(); };
    $("#worldPickCancel").onclick = () => World.cancelPick();
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!$("#worldKeyModal").hidden) this.closeKey();
      else if (World.picking && World.place) World.cancelPick();
    });
    this.sync();
  },

  /** Paneli duruma göre günceller */
  sync() {
    const $ = (s) => document.querySelector(s);
    if (!$("#worldBox")) return;
    const real = S.flyArea === "real";
    document.querySelectorAll("#flyAreaSeg button").forEach((b) => b.classList.toggle("active", b.dataset.area === (real ? "real" : "field")));
    $("#worldBox").hidden = !real;
    $("#worldSrc").value = World.src;
    $("#worldSrcNote").textContent = World.SOURCES[World.src].note;
    const tok = !!World.token();
    $("#worldKeyBtn").textContent = tok ? "Cesium ion anahtarı: kayıtlı" : "Cesium ion anahtarı ekle (ücretsiz)";
    $("#worldKeyBtn").classList.toggle("ok", tok);
    const p = World.place;
    $("#worldPlace").innerHTML = p ? `<b>${esc(p.name)}</b><span>${esc(p.sub || "")}</span>` : "<span>Henüz yer seçilmedi. Adresini ara ya da haritada bir noktaya tıkla.</span>";
    const recent = World.get("recent", []);
    $("#worldQuick").innerHTML =
      `<button class="chipbtn" data-act="locate" type="button">Konumum</button><button class="chipbtn${World.picking ? " on" : ""}" data-act="pick" type="button">${World.picking ? "Seçimi bitir" : "Haritada seç"}</button>` +
      recent.map((r, i) => `<button class="chipbtn recent" data-recent="${i}" type="button" title="${esc(r.sub || "")}">${esc(r.name)}</button>`).join("") +
      World.PRESETS.filter((p) => !recent.some((r) => r.name === p.name)).map((p) => `<button class="chipbtn" data-preset="${World.PRESETS.indexOf(p)}" type="button" title="${esc(p.sub)}">${esc(p.name)}</button>`).join("");
    $("#worldPickBar").hidden = !World.picking;
    $("#worldPickCancel").hidden = !World.place;
    $("#worldRadar").hidden = !World.on || World.picking || !World.ready;
  },

  status(text, busy, kind) {
    const el = document.querySelector("#worldStatus");
    if (!el) return;
    el.hidden = !World.on || !text;
    el.className = "world-status" + (busy ? " busy" : "") + (kind ? " " + kind : "");
    el.innerHTML = (busy ? '<i class="spin" aria-hidden="true"></i>' : "") + `<span>${esc(text)}</span>`;
    this.street = "";
  },

  async doSearch() {
    const $ = (s) => document.querySelector(s);
    const q = $("#worldQ").value.trim();
    if (!q) { $("#worldQ").focus(); return; }
    const ul = $("#worldResults");
    ul.hidden = false;
    ul.innerHTML = `<li class="muted">Aranıyor…</li>`;
    try {
      if (World.src === "google" && !World.viewer) { await World.load(); }
      const res = await World.search(q);
      this.results = res;
      ul.innerHTML = res.length ? res.map((r, i) => `<li data-i="${i}" tabindex="0"><b>${esc(r.name)}</b><span>${esc(r.sub || "")}</span></li>`).join("")
        : `<li class="muted">Sonuç bulunamadı. Sokak adına ilçe ya da şehir ekleyip tekrar dene (ör. “Baran Sokak, Keçiören”).</li>`;
    } catch (err) {
      ul.innerHTML = `<li class="bad">${esc(err.message || String(err))}</li>`;
    }
  },
  choose(p) {
    if (!p) return;
    document.querySelector("#worldResults").hidden = true;
    if (!World.on) { World.place = p; setFlyArea("real"); return; }
    World.goTo(p);
  },
  async doLocate() {
    try { this.choose(await World.locate()); } catch (err) { toast(err.message, "warn"); }
  },

  /** Saniyede birkaç kez: sokak adı ve radar */
  tick() {
    const f = Fly, e = f.p.x / 1000, n = -f.p.z / 1000;
    const st = World.streetAt(e, n);
    const el = document.querySelector("#worldStreet");
    if (el && el.textContent !== st) { el.textContent = st; el.hidden = !st; }
    this.radar(e, n, f.yaw);
  },
  /** Radar: üstten, burun yukarıda; binalar, yollar, halkalar, kalkış noktası */
  radar(e, n, yaw) {
    const cv = document.querySelector("#worldRadar");
    if (!cv || cv.hidden) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth || 168;
    if (cv.width !== Math.round(W * dpr)) { cv.width = cv.height = Math.round(W * dpr); }
    const ctx = cv.getContext("2d"), R = W / 2, range = 90, k = R / range;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, W);
    ctx.save();
    ctx.beginPath(); ctx.arc(R, R, R - 1, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = "rgba(14,17,22,.86)"; ctx.fillRect(0, 0, W, W);
    // Dünya → ekran: drone merkezde, burnu yukarıda. Fly.yaw: burun açısı, doğudan saat yönünün tersine (kuzey = +90°)
    const head = yaw;
    ctx.translate(R, R);
    ctx.rotate(head - Math.PI / 2);
    ctx.scale(k, -k);
    ctx.translate(-e, -n);
    const lw = 1 / k;
    const google = World.src === "google";
    if (!google) {
      ctx.fillStyle = "rgba(160,166,176,.55)";
      const g = World.grid;
      if (g) {
        const seen = new Set();
        for (let i = Math.floor((e - range) / g.size); i <= Math.floor((e + range) / g.size); i++) for (let j = Math.floor((n - range) / g.size); j <= Math.floor((n + range) / g.size); j++) {
          for (const bi of g.cells.get(gkey(i, j)) || []) {
            if (seen.has(bi)) continue;
            seen.add(bi);
            const r = World.blds[bi].ring;
            ctx.beginPath();
            ctx.moveTo(r[0], r[1]);
            for (let q = 2; q < r.length; q += 2) ctx.lineTo(r[q], r[q + 1]);
            ctx.closePath(); ctx.fill();
          }
        }
      }
      ctx.strokeStyle = "rgba(235,238,243,.5)"; ctx.lineWidth = 3 * lw; ctx.lineCap = "round"; ctx.lineJoin = "round";
      for (const rd of World.roads) {
        const p = rd.pts;
        if (Math.abs(p[0] - e) > 400 || Math.abs(p[1] - n) > 400) { let near = false; for (let q = 0; q < p.length && !near; q += 8) near = Math.abs(p[q] - e) < range * 1.5 && Math.abs(p[q + 1] - n) < range * 1.5; if (!near) continue; }
        ctx.beginPath(); ctx.moveTo(p[0], p[1]);
        for (let q = 2; q < p.length; q += 2) ctx.lineTo(p[q], p[q + 1]);
        ctx.stroke();
      }
    }
    // Halkalar
    for (const gt of Scene3D.flyGates || []) {
      const ge = gt.c.x / 1000, gn = -gt.c.z / 1000;
      ctx.fillStyle = gt.passed ? "#3ecf8e" : "#ff8a1f";
      ctx.beginPath(); ctx.arc(ge, gn, 3.2 * lw, 0, Math.PI * 2); ctx.fill();
    }
    // Kalkış noktası
    ctx.strokeStyle = "#f5c518"; ctx.lineWidth = 2 * lw;
    ctx.beginPath(); ctx.arc(0, 0, 4.5 * lw, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    // Drone (merkezde, burnu yukarı) ve kuzey işareti
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.moveTo(R, R - 8); ctx.lineTo(R + 5.5, R + 6); ctx.lineTo(R, R + 3); ctx.lineTo(R - 5.5, R + 6); ctx.closePath(); ctx.fill();
    const kx = R - Math.cos(head) * (R - 11), ky = R - Math.sin(head) * (R - 11);   // kuzeyin ekrandaki yeri
    ctx.font = "700 10px 'IBM Plex Mono', Consolas, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#ff5a4f"; ctx.fillText("K", kx, ky);
    ctx.strokeStyle = "rgba(255,255,255,.14)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(R, R, R * 0.5, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(R, R, R - 1, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.45)"; ctx.font = "600 9px 'IBM Plex Mono', Consolas, monospace";
    ctx.fillText("45 m", R, R + R * 0.5 - 7);
  },

  /* ---------------- Cesium ion anahtarı penceresi ---------------- */
  openKey(wantSrc) {
    const $ = (s) => document.querySelector(s);
    this.wantSrc = wantSrc || null;
    $("#wkInput").value = World.token();
    $("#wkRemove").hidden = !World.token();
    this.keyNote("", "");
    $("#worldKeyModal").hidden = false;
    setTimeout(() => $("#wkInput").focus(), 30);
  },
  closeKey() { document.querySelector("#worldKeyModal").hidden = true; },
  keyNote(text, kind) { const el = document.querySelector("#wkNote"); el.textContent = text; el.className = "wk-note " + (kind || ""); },
  async saveKey() {
    const $ = (s) => document.querySelector(s);
    const t = $("#wkInput").value.trim().replace(/^Bearer\s+/i, "");
    if (!/^[A-Za-z0-9._-]{40,}$/.test(t)) { this.keyNote("Bu bir Cesium ion anahtarına benzemiyor. Access Tokens sayfasındaki uzun metnin tamamını kopyala.", "bad"); return; }
    this.keyNote("Anahtar deneniyor…", "");
    try {
      // Cesium Dünya Arazisi (varlık 1) her hesapta açıktır: anahtar geçerliyse uç nokta cevap verir
      const r = await fetch("https://api.cesium.com/v1/assets/1/endpoint?access_token=" + encodeURIComponent(t), { signal: AbortSignal.timeout(12000) });
      if (r.status === 401 || r.status === 403) { this.keyNote("Anahtar geçersiz ya da süresi dolmuş.", "bad"); return; }
      if (!r.ok) { this.keyNote("Cesium sunucusu cevap vermedi (" + r.status + "). Biraz sonra tekrar dene.", "bad"); return; }
    } catch (e) { this.keyNote("Cesium sunucusuna ulaşılamadı. İnternet bağlantını kontrol et.", "bad"); return; }
    World.set("token", t);
    this.keyNote("Anahtar kaydedildi.", "good");
    this.sync();
    setTimeout(() => { this.closeKey(); World.setSource(this.wantSrc || "google"); }, 500);
  }
};
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); }
