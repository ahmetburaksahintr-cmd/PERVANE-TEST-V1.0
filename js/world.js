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
  K: { token: "pervane.cesiumIon", src: "pervane.haritaKaynagi", place: "pervane.ucusYeri", recent: "pervane.sonYerler", area: "pervane.ucusAlani", ground: "pervane.zemin", ofm: "pervane.ofmAdres" },
  SOURCES: {
    google: { name: "Fotogerçekçi 3D · Google", short: "Google 3D", token: true,
      note: "Binalar, ağaçlar, arabalar gerçek fotoğraflarıyla, gerçek arazinin üstünde. Kapsam büyük şehirlerde en iyisidir; 3D çekimi olmayan yerlerde arazi ve uydu görüntüsü görünür." },
    osm3d: { name: "3D şehir + gerçek arazi · Cesium", short: "3D şehir + arazi", token: true,
      note: "Gerçek arazi (dağlar, yokuşlar) ve Bing uydu görüntüsü üstünde, OpenStreetMap'ten kurulan ayrıntılı binalar (kırma çatılar, balkonlar, dükkânlar) ve ağaçlar. Google 3D'nin olmadığı yerler için." },
    open: { name: "3D şehir · anahtarsız", short: "3D şehir",
      note: "Düz zemin üstünde OpenStreetMap'ten kurulan ayrıntılı binalar ve ağaçlar; zemin keskin vektör haritası ya da uydu görüntüsü. Kat bilgisi girilmemiş binaların yüksekliği taban alanından tahmin edilir." }
  },
  GROUNDS: {
    map: { name: "Harita", note: "Yollar, kaldırımlar, yaya geçitleri, parklar ve su; binalarla birebir örtüşür." },
    mix: { name: "Uydu + yollar", note: "Uydu fotoğrafının üstünde yollar ve bina tabanları." },
    sat: { name: "Uydu", note: "Yalnızca uydu fotoğrafı (alçaktan bakınca bulanıklaşır)." }
  },
  FALLBACK: { google: ["google", "osm3d", "open"], osm3d: ["osm3d", "open"], open: ["open"] },
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
  /** Kullanıcının girdiği anahtar; yoksa projeye gömülü anahtar (js/config.js) */
  token() { return this.userToken() || (typeof APP_CONFIG !== "undefined" && APP_CONFIG.cesiumIonToken ? APP_CONFIG.cesiumIonToken.trim() : ""); },
  userToken() { return (this.get("token", "") || "").trim(); },

  /* ---------------- CesiumJS'i yükle (yalnızca ilk kullanımda) ---------------- */
  load() {
    if (window.Cesium && window.Cesium.Viewer) return Promise.resolve();
    if (this._loading) return this._loading;
    window.CESIUM_BASE_URL = this.BASE;
    fileWorkerShim();
    if (!document.querySelector("link[data-cesium]")) {
      const css = document.createElement("link");
      css.rel = "stylesheet"; css.href = this.BASE + "Widgets/widgets.css"; css.dataset.cesium = "1";
      document.head.appendChild(css);
    }
    return (this._loading = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = this.BASE + "Cesium.js";
      s.onload = () => {
        // Aynı sunucuya aynı anda daha çok istek: karolar (arazi, uydu, 3D) daha hızlı gelir (HTTP/2 sunucular kaldırır)
        try { Cesium.RequestScheduler.maximumRequestsPerServer = 32; Cesium.RequestScheduler.maximumRequests = 96; } catch (e) { /* eski sürüm */ }
        res();
      };
      s.onerror = () => { this._loading = null; s.remove(); rej(new Error("3D harita kütüphanesi indirilemedi. İnternet bağlantını kontrol et.")); };
      document.head.appendChild(s);
    }));
  },

  /** Kütüphaneyi arka planda indirmeye başlar (Uçuş seçilince ya da son oturum gerçek dünyadaysa); hata sessizce yutulur */
  preload() { if (!this._loading && !(window.Cesium && window.Cesium.Viewer)) this.load().catch(() => {}); },
  /** Binaları ve ağaçları bu uygulama mı kuruyor (Google 3D'de binalar fotoğraftan gelir) */
  proc() { return this.src !== "google"; },
  /** Zemin görünümü: harita | uydu + yollar | uydu (kaynağa göre varsayılan) */
  groundStyle() { const g = this.get("ground", null); return this.GROUNDS[g] ? g : this.src === "osm3d" ? "mix" : "map"; },

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
      if (!this.viewer || this.viewerSrc !== this.src) await this.makeViewerSafe();
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
    for (const id of ["#worldStreet", "#worldStatus", "#worldRadar"]) { const el = document.querySelector(id); if (el) el.hidden = true; }
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
    this.viewer = v; this.viewerSrc = src; this.tileset = null; this.terrain = null; this.city = null; this.treePrim = null;
    const sc = v.scene;
    sc.screenSpaceCameraController.enableInputs = false;
    sc.globe.depthTestAgainstTerrain = true;
    sc.globe.enableLighting = false;
    sc.globe.maximumScreenSpaceError = 2;              // varsayılan: zemin karoları hızlı gelir (vektör harita zaten keskin)
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
      // Arazi ve (Google'da) 3D şehir aynı anda bağlanır
      this.status(src === "google" ? "Google fotogerçekçi 3D bağlanıyor…" : "Gerçek arazi bağlanıyor…", true);
      const [terrain, tileset] = await Promise.all([
        C.createWorldTerrainAsync(),
        src === "google" ? C.createGooglePhotorealistic3DTileset({ onlyUsingWithGoogleGeocoder: true }, { maximumScreenSpaceError: 12, cacheBytes: 768 * 1024 * 1024 }) : null
      ]);
      this.terrain = terrain;
      if (src === "osm3d") {
        // Binalar ve ağaçlar bu uygulamanın şehridir (Cesium'un gri kutuları değil); araziye oturtulur
        v.terrainProvider = terrain;
        v.creditDisplay.addStaticCredit(new C.Credit('Bina ve sokak verisi: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap katkıcıları</a> · <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · OpenMapTiles', true));
      } else {
        sc.globe.show = false;                         // Google karoları araziyi de içerir
        this.tileset = sc.primitives.add(tileset);
        // Karo yüklenemiyorsa (kota dolmuş, ağ kesik) kullanıcıya bir kez söyle
        this._tileFails = 0;
        this.tileset.tileFailed.addEventListener((e) => {
          if (++this._tileFails === 6) toast(`3D karolar yüklenemiyor${e && e.message ? ": " + String(e.message).slice(0, 80) : ""}. Kaynağı “3D şehir”e almayı dene.`, "warn");
        });
      }
    }
    this.applyGround();
    v.resize();
  },
  /** Bina ve ağaç gölgelendiricilerini önceden derletir: gidilecek noktanın 1 m üstüne piksel altı iki üçgen konur.
   *  Kamera oraya uçarken (logaritmik derinlikli asıl varyant) derlenir; derleme veri indirilirken olur, şehir kurulurken ayrıca donmaz.
   *  (D3D11'de büyük bina gölgelendiricisinin derlenmesi 1,5–2,5 sn sürüyor.) */
  warmShaders() {
    if (this.warm || !this.viewer || !this.ax) return;
    const v = this.viewer, ax = this.ax;
    const prims = [true, false].map((info) => {
      const M = new CityMesh(ax, 8, info), c = [200, 200, 200];
      const a = M.put(0, 0, 1, 0, 0, 1, c, 20, 0, 0, 1, info ? 1 : 0), b = M.put(0.002, 0, 1, 0, 0, 1, c, 20, 0, 0, 1, info ? 1 : 0), d = M.put(0, 0.002, 1, 0, 0, 1, c, 20, 0, 0, 1, info ? 1 : 0);
      M.tri(a, b, d);
      return v.scene.primitives.add(meshPrimitive(M, info ? CITY_VS : TREE_VS, info ? CITY_FS : TREE_FS, info));
    });
    // Kaldırılırsa Cesium derlenmiş programı da siler: şehir ve ağaçlar kurulana kadar (aynı programı kullanırlar) tutulur
    this.warm = prims;
  },
  dropWarm() {
    if (!this.warm || !this.viewer) return;
    for (const pr of this.warm) if (!pr.isDestroyed()) this.viewer.scene.primitives.remove(pr);
    this.warm = null;
  },
  /** Zemin katmanı: vektör harita (js/groundmap.js), uydu ya da ikisi birlikte; görüntüleyici yeniden kurulmadan değişir */
  applyGround() {
    const v = this.viewer;
    if (!v || this.src === "google" || typeof GroundMap === "undefined") return;
    const gs = this.groundStyle();
    if (this.groundLayer) { v.imageryLayers.remove(this.groundLayer, true); this.groundLayer = null; }
    const base = v.imageryLayers.length ? v.imageryLayers.get(0) : null;
    if (base) base.show = gs !== "map";
    if (gs !== "sat") this.groundLayer = GroundMap.addTo(v, { tileUrl: () => this.tileUrl(), overlay: gs === "mix" });
  },
  setGround(gs) {
    if (!this.GROUNDS[gs]) return;
    this.set("ground", gs);
    this.applyGround();
    WorldUI.sync();
  },
  /** Seçili kaynağı açar; açılamazsa (kota, ağ, anahtar) bir sonraki kaynağa geçer. Geçiş kaydedilmez: sonraki açılışta yine seçili kaynak denenir. */
  async makeViewerSafe() {
    const want = this.src, order = this.FALLBACK[want] || [want];
    let last = null;
    for (const s of order) {
      if (this.SOURCES[s].token && !this.token()) continue;
      try {
        this.src = s;
        await this.makeViewer();
        if (s !== want) toast(`${this.SOURCES[want].short} açılamadı (${(last && last.message) || "bilinmeyen hata"}). ${this.SOURCES[s].short} ile devam ediliyor.`, "warn");
        WorldUI.sync();
        return;
      } catch (err) { console.error(err); last = err; }
    }
    this.src = want;
    throw last || new Error("Harita açılamadı");
  },
  /** Anahtar değişince görüntüleyici yeniden kurulur */
  async reloadViewer() {
    if (!this.on) { this.destroyViewer(); return; }
    this.ready = false;
    try {
      await this.makeViewerSafe();
      if (this.place) await this.goTo(this.place, { quiet: true }); else this.startPick(true);
    } catch (err) { this.status(err.message || String(err), false, "bad"); }
  },
  destroyViewer() {
    if (!this.viewer) return;
    try { if (this.pickHandler) this.pickHandler.destroy(); } catch (e) { /* zaten silinmiş */ }
    this.pickHandler = null;
    const host = this.viewer.container;
    try { this.viewer.destroy(); } catch (e) { /* kapanırken hata önemsiz */ }
    host.remove();
    this.viewer = null; this.city = null; this.treePrim = null; this.tileset = null;
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
      await this.makeViewerSafe();
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
    // Adres haftada bir değişir: son bilinen adres 12 saat kullanılır (her açılışta bir istek eksik)
    const c = this.get("ofm", null);
    if (c && c.url && Date.now() - c.t < 12 * 3600 * 1000) return (this._tj = c.url);
    const r = await fetch(this.OFM, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error("Harita verisi sunucusu cevap vermedi (" + r.status + ")");
    const j = await r.json();
    this.set("ofm", { url: j.tiles[0], t: Date.now() });
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
      const layers = Mvt.decode(await r.arrayBuffer(), ["building", "transportation", "transportation_name", "landcover", "landuse", "park", "water"]);
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
  /** Karolardaki verileri başlangıç noktasına göre yerel koordinata çevirir ve dizinler.
   *  full: çatı biçimleri, çatı donatıları, cephe işaretleri, yeşil alanlar ve su da hazırlanır (açık veri kaynağında şehir kurulmadan önce) */
  buildLocal(full) {
    const blds = [], roads = [], names = [], greens = [], waters = [], R2 = (this.RADIUS + 250) ** 2, RB = this.RADIUS + 250;
    const open = this.proc();                          // binalar ve yeşil alanlar bu uygulamada kurulur
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
      if (open && L.building) {
        const E = L.building.extent;
        for (const f of L.building.features) {
          if (f.type !== 3 || f.tags.hide_3d) continue;
          for (const poly of Mvt.polygons(f)) {
            const outer = clipRing(poly.outer, E);
            if (outer.length < 6) continue;
            const ring = conv(t, outer, E);
            if (ring[0] * ring[0] + ring[1] * ring[1] > R2) continue;
            const holes = poly.holes.map((h) => clipRing(h, E)).filter((h) => h.length >= 6).map((h) => conv(t, h, E));
            // Karo sınırında kesilmiş bina: öbür parçası komşu karoda; kırma çatı ve korkuluk kesik kenarda yanlış görünür
            const cut = poly.outer.some((v) => v < 0 || v > E);
            const b = makeBuilding(ring, holes, f.tags, cut, full);
            if (b) blds.push(b);
          }
        }
      }
      if (L.transportation) {
        const E = L.transportation.extent;
        for (const f of L.transportation.features) {
          if (f.type !== 2 || !ROAD_CLASSES.has(f.tags.class) || f.tags.brunnel === "tunnel") continue;
          for (const r of f.rings) if (r.length >= 4) roads.push({ cls: f.tags.class, br: f.tags.brunnel || "", pts: conv(t, r, E) });
        }
      }
      // Yeşil alanlar (ağaç dikmek için) ve su (ağaç denize düşmesin)
      if (open && full) {
        for (const ln of ["landcover", "landuse", "park", "water"]) {
          const Lg = L[ln];
          if (!Lg) continue;
          const E = Lg.extent;
          for (const f of Lg.features) {
            if (f.type !== 3) continue;
            const kind = ln === "water" ? 9 : greenKind(ln, f.tags);
            if (kind < 0) continue;
            for (const poly of Mvt.polygons(f)) {
              const outer = clipRing(poly.outer, E);
              if (outer.length < 6) continue;
              const ring = conv(t, outer, E), bb = ringBox(ring);
              if (bb[0] > RB || bb[2] < -RB || bb[1] > RB || bb[3] < -RB) continue;
              const holes = poly.holes.map((h) => clipRing(h, E)).filter((h) => h.length >= 6).map((h) => conv(t, h, E));
              if (kind === 9) waters.push([ring, ...holes]);
              else greens.push({ kind, cls: f.tags.class, ring, holes, minE: bb[0], minN: bb[1], maxE: bb[2], maxN: bb[3] });
            }
          }
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
    this.blds = blds; this.roads = roads; this.names = names; this.greens = greens;
    this.grid = gridIndex(blds, 25, (b) => [b.minE, b.minN, b.maxE, b.maxN]);
    this.nameGrid = segGrid(names, 40);
    this.roadGrid = segGrid(roads, 30);
    this.water = waters.length ? rasterMask(waters, RB, 3) : null;
    if (full) for (const b of blds) b.ef = this.facadeFlags(b);
    this._lineSet = null;
  },

  /* ---------------- Arazi ızgarası (3D şehir + arazi) ----------------
     Bölge için bir kez, 16 m aralıklı bir yükseklik ızgarası örneklenir (Cesium Dünya Arazisi). Binalar, ağaçlar, halkalar
     ve drone'un zemini bu ızgaradan çift doğrusal ara değerle okunur: kare başına pahalı sahne örneklemesi gerekmez. */
  async buildTerrainGrid() {
    this.tgrid = null;
    if (this.src !== "osm3d" || !this.terrain) return;
    const C = Cesium, R = this.RADIUS + 120, step = 16, n = Math.ceil((2 * R) / step) + 1, pts = new Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const q = this.toGeo(-R + i * step, -R + j * step);
      pts[j * n + i] = C.Cartographic.fromDegrees(q.lon, q.lat);
    }
    let res;
    try { res = await C.sampleTerrainMostDetailed(this.terrain, pts); } catch (e) { return; }
    const h = new Float32Array(n * n);
    for (let k = 0; k < n * n; k++) h[k] = res[k] && isFinite(res[k].height) ? res[k].height - this.h0 : 0;
    this.tgrid = { R, step, n, h };
  },
  /** Yerel (m) noktada arazinin başlangıç zeminine göre yüksekliği (m); ızgara yoksa 0 */
  terrainLocal(e, n) {
    const g = this.tgrid;
    if (!g) return 0;
    const fx = Math.max(0, Math.min(g.n - 1.001, (e + g.R) / g.step)), fy = Math.max(0, Math.min(g.n - 1.001, (n + g.R) / g.step));
    const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j, H = g.h, N = g.n;
    const a = H[j * N + i], b = H[j * N + i + 1], c = H[(j + 1) * N + i], d = H[(j + 1) * N + i + 1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  },
  /** Her binanın oturduğu zemin: tabanının en alçak köşesi (yokuşta alt yan görünür, üst yan toprağa gömülür) */
  groundBuildings() {
    if (!this.tgrid) { for (const b of this.blds) b.g = 0; return; }
    for (const b of this.blds) {
      const cx = (b.minE + b.maxE) / 2, cy = (b.minN + b.maxN) / 2;
      b.g = Math.min(this.terrainLocal(cx, cy), this.terrainLocal(b.minE, b.minN), this.terrainLocal(b.maxE, b.minN), this.terrainLocal(b.minE, b.maxN), this.terrainLocal(b.maxE, b.maxN)) - 0.4;
    }
  },

  /* ---------------- Şehir modeli (açık veri) ---------------- */
  /** Binaları kurar: pencereli cepheler, kırma ya da korkuluklu düz çatılar, çatı üstü donatıları.
   *  Ana iş parçacığı uzun süre donmasın diye parça parça: her karede ~120 bin köşelik bir Primitive (yakındaki binalar önce).
   *  Cesium bir Primitive'i eklendikten sonraki ilk çizimde işler; parçalar arasında bir kare beklenir. */
  async buildCity() {
    const sc = this.viewer.scene;
    if (this.city) { sc.primitives.remove(this.city); this.city = null; }
    if (!this.blds.length) return;
    const t0 = performance.now(), blds = this.blds, job = this.job;
    const coll = (this.city = sc.primitives.add(new Cesium.PrimitiveCollection()));
    const d2 = (b) => ((b.minE + b.maxE) / 2) ** 2 + ((b.minN + b.maxN) / 2) ** 2;
    const order = blds.map((b, i) => [d2(b), i]).sort((a, b) => a[0] - b[0]);
    const st = { verts: 0, tris: 0, chunks: 0, workMs: 0, maxChunkMs: 0 };
    let i = 0;
    while (i < order.length) {
      const t1 = performance.now(), M = new CityMesh(this.ax, 140000, true);
      while (i < order.length && M.v < 120000) { const b = blds[order[i++][1]]; M.z = b.g || 0; cityBuilding(M, b, this); }
      coll.add(meshPrimitive(M, CITY_VS, CITY_FS, true));
      const ms = performance.now() - t1;
      st.verts += M.v; st.tris += M.k / 3; st.chunks++; st.workMs += ms; st.maxChunkMs = Math.max(st.maxChunkMs, ms);
      await nextFrame();                               // bu karede Cesium parçayı işler ve çizer
      if (this.city !== coll || job !== this.job) return;   // bu arada başka yere gidildi (yeni kurulum eskisini siler)
    }
    st.workMs = Math.round(st.workMs); st.maxChunkMs = Math.round(st.maxChunkMs);
    this.cityStats = Object.assign(this.cityStats || {}, st, { cityMs: Math.round(performance.now() - t0),
      hip: blds.filter((b) => b.hip).length, flat: blds.filter((b) => b.par).length });
  },

  /** Ağaçlar: parklarda, korularda, mezarlıklarda ve sokak kenarlarında alçak çokgenli ağaçlar (tek Primitive).
   *  Ağaçlar çarpışma engeli DEĞİLDİR: drone yapraklardan geçer (floorLocal yalnızca binalara bakar). */
  buildTrees() {
    const sc = this.viewer.scene;
    if (this.treePrim) { sc.primitives.remove(this.treePrim); this.treePrim = null; }
    const t0 = performance.now();
    const spots = this.treeSpots();
    if (!spots.length) { this.cityStats = Object.assign(this.cityStats || {}, { trees: 0, treeMs: Math.round(performance.now() - t0) }); return; }
    const M = new CityMesh(this.ax, (spots.length / 3) * 60 + 64, false);
    const south = this.lat0 < 39.2;                    // İzmir, Antalya…: sahil şeridinde palmiye
    for (let i = 0; i < spots.length; i += 3) {
      const x = spots[i], y = spots[i + 1], kind = spots[i + 2], s = hash01(x * 0.731, y * 1.317);
      // tür: 0 yapraklı (çınar, ıhlamur), 1 servi, 2 fıstık çamı, 3 palmiye
      let type = 0, H;
      if (kind === 4) type = s < 0.72 ? 1 : 0;
      else if (kind === 0) type = south && s < 0.3 ? 3 : 0;
      else if (kind === 1) type = s < 0.35 ? 2 : 0;
      else if (kind === 2) type = s < 0.1 ? 1 : s < 0.24 ? 2 : south && s > 0.9 ? 3 : 0;
      const k = hash01(y * 0.917, x * 0.613);
      if (type === 1) H = 8 + 6 * k;
      else if (type === 3) H = 7 + 4 * k;
      else if (kind === 0) H = 6 + 4.5 * k;
      else if (kind === 3) H = 4 + 5 * k;
      else H = 7.5 + 7 * k;
      M.z = this.tgrid ? this.terrainLocal(x, y) - 0.25 : 0;
      makeTree(M, x, y, type, H, s);
    }
    this.treePrim = sc.primitives.add(meshPrimitive(M, TREE_VS, TREE_FS, false));
    this.cityStats = Object.assign(this.cityStats || {}, { trees: spots.length / 3, treeMs: Math.round(performance.now() - t0), treeVerts: M.v });
  },
  /** Ağaç yerleri: [doğu, kuzey, tür, …]. Önce aday noktalar, sonra merkeze yakından uzağa eleme (bina, yol, su, 6 m aralık) */
  treeSpots() {
    const cand = [], R = this.RADIUS + 60, R2 = R * R;
    // 1) Sokak ağaçları: iki kaldırımda, yol ortasından yarı genişlik + 2 m uzakta, 9–14 m arayla
    for (const rd of this.roads) {
      const pr = TREE_STREET[rd.cls];
      if (!pr || rd.br === "bridge") continue;
      const p = rd.pts, h0 = hash01(Math.round(p[0] * 3), Math.round(p[1] * 3));
      if (h0 > pr) continue;                            // bazı sokaklar ağaçsız
      const off = ROAD_HALF[rd.cls] + 2, step = 9 + 5 * hash01(h0 * 97.1, 3.3);
      let acc = step * 0.5;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const ax = p[i], ay = p[i + 1], dx = p[i + 2] - ax, dy = p[i + 3] - ay, d = Math.hypot(dx, dy);
        if (d < 0.01) continue;
        const ux = dx / d, uy = dy / d;
        while (acc <= d) {
          const x = ax + ux * acc, y = ay + uy * acc;
          if (x * x + y * y < R2) { cand.push(x + uy * off, y - ux * off, 0); cand.push(x - uy * off, y + ux * off, 0); }
          acc += step * (0.85 + 0.3 * hash01(x, y));
        }
        acc -= d;
      }
    }
    // 2) Yeşil alanlar: düzenli ızgara + kayma (aynı yer her açılışta aynı ağacı alır)
    for (const g of this.greens) {
      const sp = GREEN_SPACING[g.kind], keep = GREEN_KEEP[g.kind];
      const x0 = Math.max(g.minE, -R), x1 = Math.min(g.maxE, R), y0 = Math.max(g.minN, -R), y1 = Math.min(g.maxN, R);
      if (x0 > x1 || y0 > y1) continue;
      for (let gx = Math.floor(x0 / sp); gx <= Math.floor(x1 / sp); gx++) {
        for (let gy = Math.floor(y0 / sp); gy <= Math.floor(y1 / sp); gy++) {
          if (hash01(gx + 0.5 + g.kind, gy - 0.5) > keep) continue;
          const x = (gx + 0.15 + 0.7 * hash01(gx * 1.37 + g.kind, gy * 0.71)) * sp, y = (gy + 0.15 + 0.7 * hash01(gy * 1.13 - 3, gx * 0.91 + g.kind)) * sp;
          if (x * x + y * y > R2 || !inRing(g.ring, x, y) || g.holes.some((h) => inRing(h, x, y))) continue;
          cand.push(x, y, g.kind);
        }
      }
    }
    // 3) Merkeze yakın olanlar önce: sınır (4000) dolunca uzaktakiler atılır
    const n = cand.length / 3, order = new Uint32Array(n), dd = new Float32Array(n);
    for (let i = 0; i < n; i++) { order[i] = i; dd[i] = cand[i * 3] ** 2 + cand[i * 3 + 1] ** 2; }
    order.sort((a, b) => dd[a] - dd[b]);
    const out = [], occ = new Map(), CELL = 6, MAX = 4000;
    for (const oi of order) {
      if (out.length >= MAX * 3) break;
      const x = cand[oi * 3], y = cand[oi * 3 + 1], kind = cand[oi * 3 + 2];
      if (this.water && maskAt(this.water, x, y)) continue;
      const gi = Math.floor(x / CELL), gj = Math.floor(y / CELL);
      let near = false;
      for (let a = -1; a <= 1 && !near; a++) for (let c = -1; c <= 1 && !near; c++) {
        const l = occ.get(gkey(gi + a, gj + c));
        if (l) for (const k of l) if ((out[k] - x) ** 2 + (out[k + 1] - y) ** 2 < 36) { near = true; break; }
      }
      if (near) continue;
      const cl = kind === 3 ? 1.1 : 1.7;                // taç binaya girmesin
      if (this.floorLocal(x, y) > 0 || this.floorLocal(x + cl, y) > 0 || this.floorLocal(x - cl, y) > 0 || this.floorLocal(x, y + cl) > 0 || this.floorLocal(x, y - cl) > 0) continue;
      if (this.roadGap(x, y) < (kind === 0 ? 1.2 : 1.5)) continue;     // yolun üstüne değil
      const key = gkey(gi, gj);
      let l = occ.get(key);
      if (!l) occ.set(key, (l = []));
      l.push(out.length);
      out.push(x, y, kind);
    }
    return out;
  },
  /** Noktanın en yakın yol kenarına uzaklığı (m; yol ortası − yarı genişlik). Yön verilirse yalnızca önündeki yollar sayılır. */
  roadGap(x, y, ne, nn) {
    const g = this.roadGrid;
    if (!g) return 99;
    let best = 99;
    const ci = Math.floor(x / g.size), cj = Math.floor(y / g.size);
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
      const list = g.cells.get(gkey(i, j));
      if (!list) continue;
      for (const [li, si] of list) {
        const rd = this.roads[li], p = rd.pts;
        const d = segNear(x, y, p[si], p[si + 1], p[si + 2], p[si + 3]);
        if (ne !== undefined && (_sn[0] - x) * ne + (_sn[1] - y) * nn < -0.5) continue;
        const gap = d - (ROAD_HALF[rd.cls] || 3);
        if (gap < best) best = gap;
      }
    }
    return best;
  },
  /** Cephe işaretleri (dış halkanın her kenarı için): 1 = sokağa bakan dükkânlı zemin kat, 2 = apartman giriş kapısı */
  facadeFlags(b) {
    const r = b.ring, m = r.length, ef = new Uint8Array(m / 2), bay = bayWidth(b.kind, b.seed);
    let best = -1, bs = -1e9;
    for (let i = 0; i < m; i += 2) {
      const ax = r[i], ay = r[i + 1], dx = r[(i + 2) % m] - ax, dy = r[(i + 3) % m] - ay, len = Math.hypot(dx, dy);
      if (len < 2.5) continue;
      const ne = dy / len, nn = -dx / len, mx = ax + dx / 2 + ne * 0.5, my = ay + dy / 2 + nn * 0.5;
      const gap = this.roadGap(mx, my, ne, nn), street = gap < 9;
      if (street && b.shops && len >= 3.5) ef[i / 2] |= 1;
      if (len >= bay + 1.2) {
        const sc = (street ? 50 : 0) + Math.min(len, 20) - Math.min(gap, 30) * 0.3;
        if (sc > bs) { bs = sc; best = i / 2; }
      }
    }
    if (best >= 0) ef[best] |= 2;
    return ef;
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
      // Genel bakış uçuşu, arazi yüksekliği ve harita verisi aynı anda (sırayla beklemek saniyeler kaybettiriyordu)
      const tPlace = this.src === "open" ? Promise.resolve(0) : this.terrainAt(place.lon, place.lat);
      tPlace.then((h) => {
        if (job !== this.job) return;
        this.overview(place.lon, place.lat, h);
        if (this.proc()) { this.setOrigin(place.lon, place.lat, h); this.warmShaders(); this.setOrigin(place.lon, place.lat, 0); }
      });
      await this.loadArea(place.lon, place.lat, this.RADIUS);
      if (job !== this.job) return;
      this.buildLocal();
      // Başlangıç: aranan sokağın (ya da en yakın yolun) üstüne otur; yön sokak boyunca
      const start = this.snapStart(place);
      let h0 = 0;
      if (this.src !== "open") { this.status(`${place.name} · zemin yüksekliği ölçülüyor…`, true); h0 = await this.groundHeight(start.lon, start.lat); }
      if (job !== this.job) return;
      this.setOrigin(start.lon, start.lat, h0);
      this.buildLocal(true);
      if (this.src === "osm3d") { this.status(`${place.name} · arazi ölçülüyor…`, true); await this.buildTerrainGrid(); if (job !== this.job) return; }
      if (this.proc()) this.groundBuildings();
      if (this.proc()) {
        this.status(`${place.name} · binalar kuruluyor…`, true); await nextFrame(); await this.buildCity();
        if (job !== this.job) return;
        this.status(`${place.name} · ağaçlar dikiliyor…`, true); await nextFrame(); if (job !== this.job) return; this.buildTrees();
        await nextFrame(); this.dropWarm();
      }
      this.setupLight();
      // Halkalar
      const path = start.path ? start.path.map(([lo, la]) => this.toLocal(lo, la, [0, 0])) : null;
      this.gates = path ? this.makeCourse(path) : [];
      if (this.src === "osm3d") for (const g of this.gates) g.g = this.terrainLocal(g.e, g.n);
      else if (this.src === "google" && this.gates.length) await this.gateGround(this.gates);
      if (job !== this.job) return;
      this.startYaw = start.heading;
      this.floorCache = null;
      this._gatesMm = this.gates.map((g) => ({ x: g.e * 1000, y: (g.g + g.h) * 1000, z: -g.n * 1000, ground: g.g * 1000, yaw: g.yaw }));
      this._sign = { text: signText(start.street || place.name), yaw: start.heading };
      this.reapply(true);
      this.ready = true;                              // önce hazır: Fly.reset başlangıç yönünü ve zemini buradan alır
      Fly.reset();
      Scene3D.worldView(this.src === "google");
      Scene3D.snapFollow();
      // 3D karolu kaynaklarda drone'un çevresindeki ayrıntılı karolar gelene kadar beklenir (kaba karoda zemin yanlış ölçülür)
      if (this.tileset) { await this.waitTiles(job, place.name); if (job !== this.job) return; Fly.reset(); Scene3D.snapFollow(); }
      Fly.hold = false;
      document.body.classList.add("world-ready");
      const cnt = this.proc() ? ` · ${fmt(this.blds.length)} bina` : "";
      this.status(`${place.name}${place.sub ? " · " + place.sub.split(",").slice(0, 2).join(",") : ""}`, false);
      if (!opts.quiet || !this._announced) log(`Gerçek dünya: ${place.name}${start.street && start.street !== place.name ? " (" + start.street + ")" : ""} · ${this.SOURCES[this.src].short}${cnt}${this.gates.length ? " · sokak boyunca " + this.gates.length + " halka" : ""}`, "ok");
      this._announced = true;
      WorldUI.sync();
      this.fetchWeather();
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
    const inside = this.proc() && this.floorLocal(0, 0) > 0.5;
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
        if (this.proc() && this.floorLocal(e, n) > 0.5) return out;     // yol binanın içinden geçiyorsa dur
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
  /** Drone kamerasından görünen 3D karolar yüklenene kadar bekler (en çok 40 sn); ilerleme durum yazısında */
  waitTiles(job, name) {
    const ts = this.tileset, t0 = performance.now();
    return new Promise((res) => {
      const tick = () => {
        if (job !== this.job || !this.tileset) return res();
        const st = ts.statistics, left = st ? st.numberOfPendingRequests + st.numberOfTilesProcessing : 0;
        if ((ts.tilesLoaded && performance.now() - t0 > 600) || performance.now() - t0 > 40000) return res();
        this.status(`${name} · 3D şehir yükleniyor${left ? " · " + left + " karo" : ""}`, true);
        setTimeout(tick, 250);
      };
      tick();
    });
  },
  /** Örnek yükseklik akla yatkın mı (henüz yüklenmemiş kaba karolar binlerce metre yanlış yükseklik verir) */
  okHeight(h) { return h != null && isFinite(h) && h > this.h0 - 60 && h < this.h0 + 900; },
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
        const r = await Promise.race([this.viewer.scene.sampleHeightMostDetailed([c.clone()]), new Promise((res) => setTimeout(() => res(null), 8000))]);
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
  /** Yerel (m) noktadaki en yüksek bina yüzeyi (m): kırma çatının o noktadaki yüksekliği, korkuluk, çatı donatıları; bina yoksa 0 */
  floorLocal(e, n) {
    let top = 0;
    const g = this.grid;
    if (!g) return 0;
    const list = g.cells.get(gkey(Math.floor(e / g.size), Math.floor(n / g.size)));
    if (!list) return 0;
    for (const i of list) {
      const b = this.blds[i], bg = b.g || 0;
      if (b.peak + bg <= top || e < b.minE || e > b.maxE || n < b.minN || n > b.maxN) continue;
      if (!inRing(b.ring, e, n) || b.holes.some((h) => inRing(h, e, n))) continue;
      const h = roofAt(b, e, n) + bg;
      if (h > top) top = h;
    }
    return top;
  },
  /**
   * Rüzgâr için kent örtüsü: (e, n) çevresinde 45 m içindeki binaların ortalama yüksekliği (taban alanıyla ağırlıklı)
   * ve doluluk oranı. Seyrek yapıda yükseklik azaltılır (açık araziye yaklaşır). Bina verisi yoksa null.
   */
  windCanopy(e, n) {
    if (!this.on || !this.ready || !this.grid || !this.blds || !this.blds.length) return null;
    const c = this._can;
    if (c && c.blds === this.blds && Math.abs(c.e - e) < 3 && Math.abs(c.n - n) < 3) return c;
    const R = 45, g = this.grid, s = g.size, seen = new Set();
    let area = 0, w = 0, wh = 0;
    for (let i = Math.floor((e - R) / s); i <= Math.floor((e + R) / s); i++) {
      for (let j = Math.floor((n - R) / s); j <= Math.floor((n + R) / s); j++) {
        const list = g.cells.get(gkey(i, j));
        if (!list) continue;
        for (const k of list) {
          if (seen.has(k)) continue;
          seen.add(k);
          const b = this.blds[k], dist = Math.hypot((b.minE + b.maxE) / 2 - e, (b.minN + b.maxN) / 2 - n);
          if (dist > R) continue;
          const a = b.A > 0 ? b.A : (b.maxE - b.minE) * (b.maxN - b.minN) * 0.7, k2 = a * (1 - (0.5 * dist) / R);
          area += a; w += k2; wh += k2 * b.top;
        }
      }
    }
    const cover = Math.min(1, area / (Math.PI * R * R)), hc = w ? (wh / w) * smoothstep(0.04, 0.22, cover) : 0;
    return (this._can = { blds: this.blds, e, n, hc, cover, ground: this.src === "osm3d" ? this.terrainLocal(e, n) : 0 });
  },
  /** Arazi ya da bina çatısı: hangisi yüksekse (m) */
  surface(e, n) { return Math.max(this.terrainLocal(e, n), this.floorLocal(e, n)); },
  /** Fly için: three.js koordinatında (mm) zemin yüksekliği (mm, başlangıç zeminine göre) */
  floorAt(xmm, zmm) {
    if (!this.ready) return 0;
    const e = xmm / 1000, n = -zmm / 1000;
    if (this.src === "open") return this.floorLocal(e, n) * 1000;
    if (this.src === "osm3d") return this.surface(e, n) * 1000;
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
    const rel = this.okHeight(h) ? h - this.h0 : c ? c.h : 0;
    this.floorCache = { e, n, h: rel, t: performance.now() };
    return rel;
  },
  /** Kamera bir binanın içine ya da zeminin altına girmesin (takip bakışında) */
  guardCamera(cam, target) {
    if (!this.ready) return;
    const ce = cam.position.x / 1000, cn = -cam.position.z / 1000, cu = cam.position.y / 1000;
    const te = target.x / 1000, tn = -target.z / 1000, tu = target.y / 1000;
    const want = this._gWant || (this._gWant = new THREE.Vector3());
    want.copy(cam.position);
    let hardMin = -Infinity;
    if (this.proc()) {
      // Drone'dan kameraya giden çizgide ilk engel (bina ya da yamaç): uzaktaysa kamera engelin önüne çekilir, yakındaysa
      // engelin üstüne çıkar. Çizgi drone'un en az 0,8 m üstünden başlar: drone yerdeyken zemin engel sayılmaz
      // (eskiden kalkışta kamera bir drone'a yapışıp bir bırakılıyordu).
      const surf = (e, n) => (this.src === "osm3d" ? this.surface(e, n) : this.floorLocal(e, n));
      const ground = (e, n) => (this.src === "osm3d" ? this.terrainLocal(e, n) : 0);
      const su = Math.max(tu, ground(te, tn) + 0.8), horiz = Math.hypot(ce - te, cn - tn);
      let hit = 2, top = -1e9;
      for (let i = 1; i <= 14; i++) {
        const m = i / 14, s = surf(te + (ce - te) * m, tn + (cn - tn) * m);
        top = Math.max(top, s);
        if (hit > 1 && s > su + (cu - su) * m - 0.2) hit = m;
      }
      if (hit <= 1) {
        if (hit >= 0.5 && horiz * (hit - 1 / 14) >= 2) want.lerpVectors(target, cam.position, hit - 1 / 14);
        else want.y = Math.max(want.y, (top + 1.2) * 1000);
      }
      want.y = Math.max(want.y, (surf(want.x / 1000, -want.z / 1000) + 0.6) * 1000);
      hardMin = (surf(ce, cn) + 0.25) * 1000;
    } else {
      // Arazili kaynaklar: kamera zeminin en az 40 cm üstünde
      const now = performance.now();
      if (!this._camFloor || now - this._camFloor.t > 200) {
        const q = this.toGeo(ce, cn);
        let h;
        try { h = this.viewer.scene.sampleHeight(Cesium.Cartographic.fromDegrees(q.lon, q.lat), undefined, 0.3); } catch (e) { h = undefined; }
        this._camFloor = { t: now, h: this.okHeight(h) ? h - this.h0 : -1e9 };
      }
      want.y = Math.max(want.y, (this._camFloor.h + 0.4) * 1000);
      hardMin = (this._camFloor.h + 0.2) * 1000;
    }
    // Düzeltme yumuşak uygulanır: engele hızlı uyar, engel kalkınca yavaşça bırakır (ani sıçrama ve titreme olmaz)
    const now = performance.now(), dt = Math.min(0.1, Math.max(0.001, (now - (this._gT || now)) / 1000));
    this._gT = now;
    const d = this._gD || (this._gD = new THREE.Vector3()), dx = want.x - cam.position.x, dy = want.y - cam.position.y, dz = want.z - cam.position.z;
    const grow = dx * dx + dy * dy + dz * dz > d.lengthSq();
    const k = 1 - Math.exp(-dt * (grow ? 16 : 4));
    d.x += (dx - d.x) * k; d.y += (dy - d.y) * k; d.z += (dz - d.z) * k;
    if (d.lengthSq() < 1 && cam.position.y >= hardMin) return;
    cam.position.add(d);
    cam.position.y = Math.max(cam.position.y, hardMin);   // yumuşatma sırasında bile zeminin altına inmez
    cam.lookAt(target);
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
    if (!this.on || !v) return;
    this._budget = 2;                                   // kare başına en çok 2 yükseklik örneği
    v.resize();
    this.adaptQuality(dt);
    if (!this.picking && this.ready && this.enu) this.syncCamera(Scene3D.camera);
    v.render();
    // Sokak adı ve radar: saniyede ~8 kez
    this._ui = (this._ui || 0) + dt;
    if (this._ui > 0.12 && this.ready && !this.picking) { this._ui = 0; WorldUI.tick(); }
  },
  /** Zayıf ekran kartında akıcılık: 2 sn'lik ortalama kare süresi 40 ms'yi geçerse çözünürlük %85'e iner (en az %55), 20 ms'nin altında geri çıkar */
  adaptQuality(dt) {
    const q = this._q || (this._q = { t: 0, n: 0, sum: 0 });
    q.t += dt; q.n++; q.sum += dt;
    if (q.t < 2) return;
    const avg = q.sum / q.n, v = this.viewer;
    q.t = q.n = q.sum = 0;
    if (!this.ready || this.picking) return;
    if (avg > 0.04 && v.resolutionScale > 0.56) v.resolutionScale = Math.max(0.55, v.resolutionScale * 0.85);
    else if (avg < 0.02 && v.resolutionScale < 1) v.resolutionScale = Math.min(1, v.resolutionScale * 1.12);
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

  /** Konumun o anki havası (Open-Meteo): hava yoğunluğu ve gerçek rüzgâr; 10 dakikada bir tazelenir */
  async fetchWeather() {
    const lat = this.lat0, lon = this.lon0, name = this.place ? this.place.name : "";
    clearTimeout(this._wxTimer);
    try {
      await Env.fetchWeather(lat, lon, name);
      if (this.on) envChanged();
    } catch (e) {
      Env.real = null;
      if (this.on) { envChanged(); if (Env.windMode === "real") toast("Hava durumu alınamadı; standart atmosfer kullanılıyor", "warn"); }
    }
    this._wxTimer = setTimeout(() => { if (this.on && this.ready) this.fetchWeather(); }, 10 * 60 * 1000);
  },

  /** Sahnenin üstündeki durum yazısı */
  status(text, busy, kind) {
    this.msg = text;
    WorldUI.status(text, busy, kind);
  }
};
World._c3 = undefined;

/* ---------------- file:// için worker düzeltmesi ----------------
   Cesium, CDN'deki worker dosyalarını sayfadan farklı bir kaynaktan geldiği için şöyle başlatır:
     new Worker(URL.createObjectURL(new Blob(['import "https://…/Workers/x.js";'])), { type: "module" })
   Chrome, index.html çift tıklanarak (file://) açıldığında blob adresli MODÜL worker'ı reddeder; sonuç:
   zemin (arazi ağı, uydu görüntüsü) ve Google 3D karoları hiç çizilmez, yalnızca siyah yıldız alanı görünür.
   Aynı içerikli data: adresli modül worker'a ise izin verir. Bu ara katman yalnızca file:// sayfada ve
   yalnızca bu tür blob'lar için adresi data: adresine çevirir; başka hiçbir şeye dokunmaz
   (Blob bir Proxy ile sarılır, "x instanceof Blob" ve diğer kütüphaneler eskisi gibi çalışır). */
function fileWorkerShim() {
  if (location.protocol !== "file:" || window.__pervaneWorkerShim) return;
  window.__pervaneWorkerShim = true;
  const srcOfBlob = new WeakMap(), srcOfUrl = new Map();
  const isImport = (t) => typeof t === "string" && /^import\s+"https?:\/\/[^"]+";$/.test(t.trim());
  const OB = window.Blob, OW = window.Worker, U = window.URL, oc = U.createObjectURL.bind(U);
  window.Blob = new Proxy(OB, {
    construct(target, args, nt) {
      const b = Reflect.construct(target, args, nt === window.Blob ? target : nt);
      const parts = args[0];
      if (Array.isArray(parts) && parts.length === 1 && isImport(parts[0])) srcOfBlob.set(b, parts[0]);
      return b;
    }
  });
  U.createObjectURL = function (obj) {
    const u = oc(obj);
    if (obj && srcOfBlob.has(obj)) srcOfUrl.set(u, srcOfBlob.get(obj));
    return u;
  };
  window.Worker = new Proxy(OW, {
    construct(target, args, nt) {
      let [url, opts] = args;
      const src = typeof url === "string" ? srcOfUrl.get(url) : undefined;
      if (src && opts && opts.type === "module") url = "data:text/javascript;charset=utf-8," + encodeURIComponent(src);
      return Reflect.construct(target, [url, opts], nt === window.Worker ? target : nt);
    }
  });
}

/* Sokak ve cadde sınıfları (OpenMapTiles "transportation" katmanı) */
const ROAD_CLASSES = new Set(["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service", "track", "raceway", "busway"]);
/* Yol yarı genişlikleri (m; şeritler ve park yeri, sınıfa göre tahmin) */
const ROAD_HALF = { motorway: 11, trunk: 9, primary: 7.5, secondary: 6, tertiary: 5, minor: 3.5, service: 2.5, track: 2, raceway: 5, busway: 4 };
/* Sokak ağacı olasılığı (yol sınıfına göre; geri kalan sokaklar ağaçsız) */
const TREE_STREET = { primary: 0.55, secondary: 0.75, tertiary: 0.75, minor: 0.6 };
/* Yeşil alan türleri: 1 koru/orman, 2 park/bahçe, 3 çayır/çalılık, 4 mezarlık → ağaç aralığı (m) ve doluluk oranı */
const GREEN_SPACING = [0, 5.5, 7.5, 10, 6];
const GREEN_KEEP = [0, 0.95, 0.72, 0.4, 0.75];
function greenKind(layer, t) {
  const c = t.class, sc = t.subclass;
  if (layer === "landcover") {
    if (c === "wood") return 1;
    if (c === "grass") return /^(park|garden|recreation_ground|village_green)$/.test(sc) ? 2 : /^(grass|grassland|meadow|scrub|heath)$/.test(sc) ? 3 : -1;
    return -1;
  }
  if (layer === "landuse") return c === "cemetery" ? 4 : c === "park" || c === "garden" ? 2 : -1;
  if (layer === "park") return c === "park" || c === "garden" ? 2 : -1;   // koruma alanları (çok büyük, içinde mahalleler) atlanır
  return -1;
}

/* ---------------- Bina: yükseklik, renk, cephe düzeni, çatı ---------------- */
// Cephe renkleri (Türkiye'de yaygın sıva tonları: krem, bej, kum, kirli beyaz, somon, açık sarı, okr, mint, açık mavi, gül, taş grisi)
const WALLS = [[236, 222, 192], [230, 204, 164], [218, 190, 150], [238, 232, 218], [206, 204, 198], [236, 194, 158], [222, 164, 132], [238, 214, 150],
  [222, 180, 118], [190, 210, 184], [184, 200, 214], [230, 190, 184], [200, 140, 106], [180, 174, 162], [244, 240, 230], [226, 208, 180]];
// Düz çatı (beton, gri membran, bitüm, açık membran, mıcır) ve kiremit renkleri
const FLATS = [[150, 148, 142], [170, 170, 166], [100, 100, 102], [188, 188, 182], [158, 150, 138], [134, 130, 124]];
const TILES = [[170, 86, 60], [156, 76, 54], [180, 100, 70], [146, 82, 64], [164, 96, 72], [138, 70, 54], [186, 110, 80]];
function hash01(a, b) { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); }
/** Pencere aralığı (m): gölgelendiricideki formülün aynısı (cephe klimaları pencerelerin yanına otursun) */
function bayWidth(kind, seed) {
  const f = seed * 0.6180339;
  return (kind === 4 ? 3.4 : kind === 3 ? 7.0 : kind === 2 ? 1.8 : 3.1) * (0.92 + 0.16 * (f - Math.floor(f)));
}

/** Taban halkasından bina kaydı: yükseklik (bilinmiyorsa taban alanından tahmin), renkler, cephe düzeni, çatı biçimi ve çatı donatıları.
 *  cut: karo sınırında kesilmiş; full: çatı biçimi ve donatılar da hesaplanır */
function makeBuilding(ring, holes, tags, cut, full) {
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
  const k = ring.length / 2, qx = Math.round(cx / k), qy = Math.round(cy / k);
  const r = hash01(qx, qy), r2 = hash01(qy, qx + 7), r3 = hash01(qx - 11, qy + 29);
  const seed = Math.floor(hash01(qx + 41, qy - 17) * 1024);          // gölgelendiricideki bina tohumu (0–1023)
  // Komşu binaların aynı düzlemdeki cepheleri titreşmesin: her taban kendine özgü 0,5–3,5 cm dışa genişletilir
  const grow = 0.005 + 0.03 * hash01(qx + 3, qy - 5);
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
  // Cephe düzeni: 1 apartman, 2 ofis/ticari (şerit pencere), 3 sanayi, 4 küçük bina
  const kind = A > 5000 && r > 0.6 ? 3 : big ? (r > 0.45 ? 2 : 1) : small ? 4 : 1;
  const b = { ring, holes, top, base, wall, roof: FLATS[Math.floor(r * 997) % FLATS.length], kind, seed, minE, minN, maxE, maxN, known, A,
    shops: kind === 1 ? r2 > 0.4 : kind === 2 ? r2 > 0.55 : kind === 4 ? r2 > 0.85 : false,     // sokağa bakan zemin katta dükkân
    balc: kind === 1 && r3 > 0.25,                                                                 // apartman balkonları
    hip: null, par: 0, items: null, parts: null, peak: top, ef: null };
  if (!full) return b;
  const ob = obb(ring);
  if (!ob) return b;
  const ratio = A / (4 * ob.hl * ob.hw);
  if (!cut && !holes.length && base < 0.3 && A >= 30 && A <= 1200 && ratio >= 0.8 && top < 32 && ob.hw > 2 && r3 < 0.68) {
    // Kırma çatı: dikdörtgene yakın küçük/orta binalar. Mahya uzun kenar boyunca, 25–30° eğim (geniş binada en çok 3,4 m yükselir), 45 cm saçak
    const ov = 0.45, t = Math.min(Math.tan(((25 + 5 * r) * Math.PI) / 180), 3.4 / ob.hw);
    b.hip = { cx: ob.cx, cy: ob.cy, ux: ob.ux, uy: ob.uy, hl: ob.hl + ov, hw: ob.hw + ov, t, eave: top - ov * t };
    b.peak = top + ob.hw * t;
    b.roof = TILES[Math.floor(r2 * 991) % TILES.length];
  } else if (!cut && base < 0.3 && A >= 30) {
    // Düz çatı: 90 cm korkuluk ve çatı donatıları
    b.par = 0.9;
    b.peak = top + b.par;
    if (A >= 45) roofItems(b, ob);
  }
  return b;
}
/** En küçük alanlı yönlendirilmiş dikdörtgen (kenar doğrultuları denenir): merkez, uzun eksen (ux, uy), yarı boylar hl ≥ hw */
function obb(r) {
  const m = r.length;
  let best = null;
  for (let i = 0; i < m; i += 2) {
    let dx = r[(i + 2) % m] - r[i], dy = r[(i + 3) % m] - r[i + 1];
    const l = Math.hypot(dx, dy);
    if (l < 0.4) continue;
    dx /= l; dy /= l;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (let j = 0; j < m; j += 2) {
      const pu = r[j] * dx + r[j + 1] * dy, pv = r[j + 1] * dx - r[j] * dy;
      if (pu < a0) a0 = pu; if (pu > a1) a1 = pu; if (pv < b0) b0 = pv; if (pv > b1) b1 = pv;
    }
    const ar = (a1 - a0) * (b1 - b0);
    if (!best || ar < best.ar) best = { ar, dx, dy, a0, a1, b0, b1 };
  }
  if (!best) return null;
  const { dx, dy, a0, a1, b0, b1 } = best, cu = (a0 + a1) / 2, cv = (b0 + b1) / 2, la = (a1 - a0) / 2, lb = (b1 - b0) / 2;
  const cx = cu * dx - cv * dy, cy = cu * dy + cv * dx;            // nokta = u·(dx, dy) + v·(−dy, dx)
  return la >= lb ? { cx, cy, ux: dx, uy: dy, hl: la, hw: lb } : { cx, cy, ux: -dy, uy: dx, hl: lb, hw: la };
}
/** Kırma çatının (x, y) noktasındaki yüksekliği: dört eğik düzlemin en alçağı */
function hipH(H, x, y) {
  const dx = x - H.cx, dy = y - H.cy;
  return H.eave + H.t * Math.min(H.hl - Math.abs(dx * H.ux + dy * H.uy), H.hw - Math.abs(dy * H.ux - dx * H.uy));
}
/** Duvarın üst kenarı kırma çatıya otursun: çatı düzlemlerinin değiştiği noktalar (0–1 arası, sıralı) */
function hipBreaks(H, ax, ay, bx, by, out) {
  const du0 = (ax - H.cx) * H.ux + (ay - H.cy) * H.uy, du1 = (bx - H.cx) * H.ux + (by - H.cy) * H.uy;
  const dv0 = (ay - H.cy) * H.ux - (ax - H.cx) * H.uy, dv1 = (by - H.cy) * H.ux - (bx - H.cx) * H.uy;
  const f0 = [H.hl - du0, H.hl + du0, H.hw - dv0, H.hw + dv0], f1 = [H.hl - du1, H.hl + du1, H.hw - dv1, H.hw + dv1];
  out.length = 0;
  out.push(0, 1);
  for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) {
    const a = f0[p] - f0[q], d = f1[p] - f1[q] - a;
    if (Math.abs(d) < 1e-9) continue;
    const t = -a / d;
    if (t > 0.01 && t < 0.99) out.push(t);
  }
  out.sort((a, b) => a - b);
}
/** Bir binanın (e, n) noktasındaki üst yüzeyi (m): kırma çatı, korkuluk şeridi ya da çatı donatısı */
function roofAt(b, e, n) {
  let h = b.top;
  if (b.hip) h = Math.max(b.top, hipH(b.hip, e, n));
  else if (b.par && ringsDist(b, e, n) < 0.3) h = b.top + b.par;
  if (b.parts) for (const p of b.parts) {
    if (p.top <= h) continue;
    const dx = e - p.cx, dy = n - p.cy;
    if (Math.abs(dx * p.ux + dy * p.uy) <= p.hx && Math.abs(dy * p.ux - dx * p.uy) <= p.hy) h = p.top;
  }
  return h;
}
const _sn = [0, 0];
/** Noktanın doğru parçasına uzaklığı (en yakın nokta _sn'ye yazılır; dizi üretmez) */
function segNear(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = ax + dx * t, y = ay + dy * t;
  _sn[0] = x; _sn[1] = y;
  return Math.hypot(px - x, py - y);
}
function ringDist(r, x, y) {
  let d = Infinity;
  for (let i = 0, m = r.length; i < m; i += 2) { const q = segNear(x, y, r[i], r[i + 1], r[(i + 2) % m], r[(i + 3) % m]); if (q < d) d = q; }
  return d;
}
function ringsDist(b, x, y) { let d = ringDist(b.ring, x, y); for (const h of b.holes) d = Math.min(d, ringDist(h, x, y)); return d; }
function ringBox(r) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (let i = 0; i < r.length; i += 2) { const x = r[i], y = r[i + 1]; if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; }
  return [a, b, c, d];
}

/** Düz çatı donatıları (bina tohumuna göre her açılışta aynı): yerleşim (items) ve çarpışma kutuları (parts).
 *  Türler: 0 merdiven kovası, 1 güneş enerjili su ısıtıcısı, 2 su deposu, 3 klima dış ünitesi, 4 çanak anten */
function roofItems(b, ob) {
  const items = [], parts = [], A = b.A;
  let q = 0;
  const rnd = () => { q++; return hash01(b.seed * 0.731 + q * 1.618, q * 2.71 - b.seed * 0.113); };
  const vx = -ob.uy, vy = ob.ux;
  // Dört köşe ve merkez çatının içinde (avluda değil), korkuluktan en az 35 cm içeride; başka donatıyla çakışmıyor
  const fits = (x, y, ux, uy, hx, hy) => {
    const r0 = Math.hypot(hx, hy);
    for (const p of parts) if (Math.hypot(p.cx - x, p.cy - y) < r0 + Math.hypot(p.hx, p.hy) + 0.25) return false;
    for (const [a, c] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const px = x + ux * hx * a - uy * hy * c, py = y + uy * hx * a + ux * hy * c;
      if (!inRing(b.ring, px, py) || b.holes.some((h) => inRing(h, px, py)) || ringsDist(b, px, py) < 0.35) return false;
    }
    return true;
  };
  const spot = (ux, uy, hx, hy) => {
    for (let i = 0; i < 14; i++) {
      const a = rnd() * 2 - 1, c = rnd() * 2 - 1;
      const x = ob.cx + ob.ux * a * ob.hl + vx * c * ob.hw, y = ob.cy + ob.uy * a * ob.hl + vy * c * ob.hw;
      if (fits(x, y, ux, uy, hx, hy)) return [x, y];
    }
    return null;
  };
  const add = (t, p, ux, uy, hx, hy, h, extra) => {
    parts.push({ cx: p[0], cy: p[1], ux, uy, hx, hy, top: h < 0 ? -1 : b.top + h });
    items.push(Object.assign({ t, x: p[0], y: p[1], ux, uy, hx, hy }, extra || {}));
  };
  // Merdiven kovası: 3 kattan yüksek ve geniş çatılarda
  if (A >= 90 && b.top >= 9 && rnd() < 0.85) { const p = spot(ob.ux, ob.uy, 1.45, 1.2); if (p) add(0, p, ob.ux, ob.uy, 1.45, 1.2, 2.7); }
  // Güneş enerjili su ısıtıcıları: güneye bakar, yan yana dizilir (Ege ve Akdeniz'de daha yaygın)
  if (rnd() < (World.lat0 < 39.2 ? 0.8 : 0.5)) {
    let n = 1 + Math.floor(rnd() * Math.min(4, A / 80)), last = null;
    while (n-- > 0) {
      const p = last && fits(last[0] + 1.25, last[1], 1, 0, 0.56, 1.05) ? [last[0] + 1.25, last[1]] : spot(1, 0, 0.56, 1.05);
      if (!p) break;
      add(1, p, 1, 0, 0.56, 1.05, 1.95);
      last = p;
    }
  }
  // Su deposu
  if (rnd() < 0.35) { const p = spot(1, 0, 0.6, 0.6); if (p) add(2, p, 1, 0, 0.6, 0.6, 1.35, { c: rnd() }); }
  // Klima dış üniteleri
  for (let n = Math.floor(rnd() * 3.3); n > 0; n--) {
    const rot = rnd() < 0.5, ux = rot ? -ob.uy : ob.ux, uy = rot ? ob.ux : ob.uy;
    const p = spot(ux, uy, 0.46, 0.2);
    if (p) add(3, p, ux, uy, 0.46, 0.2, 0.64);
  }
  // Çanak antenler (ince direk: çarpışmaya katılmaz, yalnızca yer ayırır)
  for (let n = Math.floor(rnd() * 2.6); n > 0; n--) {
    const p = spot(1, 0, 0.3, 0.3);
    if (p) add(4, p, 1, 0, 0.3, 0.3, -1, { az: ((155 + 20 * rnd()) * Math.PI) / 180, r: 0.38 + 0.12 * rnd(), hp: 0.9 + 0.5 * rnd() });
  }
  b.items = items; b.parts = parts;
  for (const p of parts) b.peak = Math.max(b.peak, p.top);
}

/* ---------------- Şehir geometrisi ---------------- */
/** Büyüyebilen köşe/üçgen tamponu. Köşeler yerel ENU (m) verilir, yer merkezli (ECEF) saklanır.
 *  info: x, y, z, w (bina gölgelendiricisi için; ağaçlarda yok) */
class CityMesh {
  constructor(ax, nv, info) {
    nv = Math.max(1024, Math.ceil(nv));
    this.A = ax; this.v = 0; this.k = 0; this.z = 0;      // z: yukarı öteleme (araziye oturtma)
    this.pos = new Float64Array(nv * 3); this.nrm = new Float32Array(nv * 3); this.col = new Uint8Array(nv * 4);
    this.inf = info ? new Float32Array(nv * 4) : null;
    this.idx = new Uint32Array(nv * 2);
  }
  grow() {
    const n = (this.pos.length / 3) * 2, cp = (a, T, k) => { const b = new T(n * k); b.set(a); return b; };
    this.pos = cp(this.pos, Float64Array, 3); this.nrm = cp(this.nrm, Float32Array, 3); this.col = cp(this.col, Uint8Array, 4);
    if (this.inf) this.inf = cp(this.inf, Float32Array, 4);
  }
  put(e, n, u, ne, nn, nu, c, a, s, h, l, w) {
    if (this.v * 3 >= this.pos.length) this.grow();
    const A = this.A, E = A.e, N = A.n, U = A.u, O = A.o, v = this.v, i3 = v * 3, i4 = v * 4, p = this.pos, q = this.nrm, col = this.col, uz = u + this.z;
    p[i3] = O[0] + e * E[0] + n * N[0] + uz * U[0];
    p[i3 + 1] = O[1] + e * E[1] + n * N[1] + uz * U[1];
    p[i3 + 2] = O[2] + e * E[2] + n * N[2] + uz * U[2];
    q[i3] = ne * E[0] + nn * N[0] + nu * U[0];
    q[i3 + 1] = ne * E[1] + nn * N[1] + nu * U[1];
    q[i3 + 2] = ne * E[2] + nn * N[2] + nu * U[2];
    col[i4] = c[0]; col[i4 + 1] = c[1]; col[i4 + 2] = c[2]; col[i4 + 3] = a;
    if (this.inf) { const f = this.inf; f[i4] = s; f[i4 + 1] = h; f[i4 + 2] = l; f[i4 + 3] = w; }
    return this.v++;
  }
  tri(a, b, c) {
    if (this.k + 3 > this.idx.length) { const x = new Uint32Array(this.idx.length * 2); x.set(this.idx); this.idx = x; }
    const I = this.idx;
    I[this.k++] = a; I[this.k++] = b; I[this.k++] = c;
  }
}
/** Tampondan tek parça Cesium Primitive (özel gölgelendiricili) */
function meshPrimitive(M, vs, fs, info) {
  const C = Cesium, P = M.pos.subarray(0, M.v * 3);
  const attributes = {
    position: new C.GeometryAttribute({ componentDatatype: C.ComponentDatatype.DOUBLE, componentsPerAttribute: 3, values: P }),
    normal: new C.GeometryAttribute({ componentDatatype: C.ComponentDatatype.FLOAT, componentsPerAttribute: 3, values: M.nrm.subarray(0, M.v * 3) }),
    color: new C.GeometryAttribute({ componentDatatype: C.ComponentDatatype.UNSIGNED_BYTE, componentsPerAttribute: 4, normalize: true, values: M.col.subarray(0, M.v * 4) })
  };
  if (info) attributes.info = new C.GeometryAttribute({ componentDatatype: C.ComponentDatatype.FLOAT, componentsPerAttribute: 4, values: M.inf.subarray(0, M.v * 4) });
  const geometry = new C.Geometry({ attributes, indices: M.idx.subarray(0, M.k), primitiveType: C.PrimitiveType.TRIANGLES, boundingSphere: C.BoundingSphere.fromVertices(P) });
  const appearance = new C.Appearance({
    translucent: false, closed: true,
    renderState: { depthTest: { enabled: true }, depthMask: true, cull: { enabled: true, face: C.CullFace.BACK } },
    vertexShaderSource: vs, fragmentShaderSource: fs
  });
  return new C.Primitive({
    geometryInstances: new C.GeometryInstance({ geometry }), appearance,
    asynchronous: false, compressVertices: false, allowPicking: false, releaseGeometryInstances: true, vertexCacheOptimize: false
  });
}
/** Düz yüz (dörtgen ya da üçgen yelpazesi): köşeler [doğu, kuzey, yukarı, info.x, info.y]; sarım yönü normale göre düzeltilir */
function face(M, vs, nx, ny, nz, c, a, z, w) {
  const v0 = vs[0], v1 = vs[1], v2 = vs[2];
  const ex = v1[0] - v0[0], ey = v1[1] - v0[1], ez = v1[2] - v0[2], fx = v2[0] - v0[0], fy = v2[1] - v0[1], fz = v2[2] - v0[2];
  const flip = (ey * fz - ez * fy) * nx + (ez * fx - ex * fz) * ny + (ex * fy - ey * fx) * nz < 0;
  const first = M.v;
  for (const p of vs) M.put(p[0], p[1], p[2], nx, ny, nz, c, a, p[3], p[4], z, w);
  for (let i = 1; i + 1 < vs.length; i++) { if (flip) M.tri(first, first + i + 1, first + i); else M.tri(first, first + i, first + i + 1); }
}
const UP = [0, 0, 1];
/* Kutu yüzleri: +X, −X, +Y, −Y, +Z, −Z (köşe işaretleri) */
const BOX_F = [[[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]], [[-1, -1, -1], [-1, 1, -1], [-1, 1, 1], [-1, -1, 1]],
  [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]],
  [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1]]];
/** Yönlendirilmiş kutu. info.y = köşenin çatıdan yüksekliği (dip gölgesi için). skip: 1 alt yüz yok, 2 arka (−Y) yüz yok, 4 üst yüz yok. topW: üst yüze ayrı düzen */
function gbox(M, c, X, Y, Z, hx, hy, hz, col, w, roofZ, skip, topW) {
  for (let f = 0; f < 6; f++) {
    if ((f === 5 && skip & 1) || (f === 3 && skip & 2) || (f === 4 && skip & 4)) continue;
    const ax = f >> 1, sg = f & 1 ? -1 : 1, N = ax === 0 ? X : ax === 1 ? Y : Z, top = f === 4 && topW;
    const vs = BOX_F[f].map(([sx, sy, sz]) => {
      const e = c[0] + X[0] * hx * sx + Y[0] * hy * sy + Z[0] * hz * sz, n = c[1] + X[1] * hx * sx + Y[1] * hy * sy + Z[1] * hz * sz, u = c[2] + X[2] * hx * sx + Y[2] * hy * sy + Z[2] * hz * sz;
      return [e, n, u, top ? (sx + 1) * hx : 0, top ? (sy + 1) * hy : u - roofZ];
    });
    face(M, vs, N[0] * sg, N[1] * sg, N[2] * sg, col, 255, 0, top ? topW : w);
  }
}
/** Silindir (depo): a → b ekseni, yumuşak yan yüzler, istenirse uç kapakları */
function cyl(M, a, b, r, S, col, w, roofZ, capA, capB) {
  let dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const L = Math.hypot(dx, dy, dz); dx /= L; dy /= L; dz /= L;
  let px = Math.abs(dz) < 0.9 ? -dy : 1, py = Math.abs(dz) < 0.9 ? dx : 0, pz = 0;
  const pl = Math.hypot(px, py, pz); px /= pl; py /= pl;
  const qx = dy * pz - dz * py, qy = dz * px - dx * pz, qz = dx * py - dy * px;      // q = d × p
  const ring = [];
  for (let i = 0; i < S; i++) { const t = (i / S) * Math.PI * 2, cs = Math.cos(t), sn = Math.sin(t); ring.push([px * cs + qx * sn, py * cs + qy * sn, pz * cs + qz * sn]); }
  const first = M.v;
  for (const [nx, ny, nz] of ring) {
    M.put(a[0] + nx * r, a[1] + ny * r, a[2] + nz * r, nx, ny, nz, col, 255, 0, a[2] + nz * r - roofZ, 0, w);
    M.put(b[0] + nx * r, b[1] + ny * r, b[2] + nz * r, nx, ny, nz, col, 255, 0, b[2] + nz * r - roofZ, 0, w);
  }
  for (let i = 0; i < S; i++) { const a0 = first + 2 * i, a1 = first + 2 * ((i + 1) % S); M.tri(a0, a1, a1 + 1); M.tri(a0, a1 + 1, a0 + 1); }
  for (const [end, sg, on] of [[b, 1, capB], [a, -1, capA]]) {
    if (!on) continue;
    const c0 = M.put(end[0], end[1], end[2], dx * sg, dy * sg, dz * sg, col, 255, 0, 9, 0, w);
    for (const [nx, ny, nz] of ring) M.put(end[0] + nx * r, end[1] + ny * r, end[2] + nz * r, dx * sg, dy * sg, dz * sg, col, 255, 0, 9, 0, w);
    for (let i = 0; i < S; i++) { const i0 = c0 + 1 + i, i1 = c0 + 1 + ((i + 1) % S); if (sg > 0) M.tri(c0, i0, i1); else M.tri(c0, i1, i0); }
  }
}
/** Çanak anten: önü içbükey, arkası dışbükey sığ koni */
function dish(M, c, D, r, col, w) {
  let px = -D[1], py = D[0];
  const pl = Math.hypot(px, py) || 1; px /= pl; py /= pl;
  const qx = D[1] * 0 - D[2] * py, qy = D[2] * px - D[0] * 0, qz = D[0] * py - D[1] * px;     // q = D × p
  const S = 10;
  for (const sg of [1, -1]) {
    const back = sg < 0, d0 = back ? 0.17 : 0.1;
    const c0 = M.put(c[0] - D[0] * d0, c[1] - D[1] * d0, c[2] - D[2] * d0, D[0] * sg, D[1] * sg, D[2] * sg, col, 255, 0, 9, 0, w);
    for (let i = 0; i < S; i++) {
      const t = (i / S) * Math.PI * 2, cs = Math.cos(t), sn = Math.sin(t), rx = px * cs + qx * sn, ry = py * cs + qy * sn, rz = qz * sn;
      const k = back ? 0.35 : -0.35;                // ön yüz normali eksene, arka yüz dışa eğik
      M.put(c[0] + rx * r, c[1] + ry * r, c[2] + rz * r, D[0] * sg + rx * k, D[1] * sg + ry * k, D[2] * sg + rz * k, col, 255, 0, 9, 0, w);
    }
    for (let i = 0; i < S; i++) { const i0 = c0 + 1 + i, i1 = c0 + 1 + ((i + 1) % S); if (back) M.tri(c0, i1, i0); else M.tri(c0, i0, i1); }
  }
}

/** Bir binanın tüm geometrisi: duvarlar, çatı, korkuluk, çatı donatıları, cephe klimaları */
function cityBuilding(M, b, W) {
  const H = b.hip, wallTop = b.top + b.par, rings = [b.ring, ...b.holes], ts = [];
  for (let ri = 0; ri < rings.length; ri++) {
    const ring = rings[ri], m = ring.length;
    for (let i = 0; i < m; i += 2) {
      const ax = ring[i], ay = ring[i + 1], bx = ring[(i + 2) % m], by = ring[(i + 3) % m];
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
      if (len < 0.05) continue;
      const ne = dy / len, nn = -dx / len;                       // dışa bakan normal (sağ el)
      // info.w: düzen (0–7) + 8 × işaretler (1 dükkân, 2 kapı, 4 balkon, 8 korkuluk) + 128 × bina tohumu
      const ef = ri === 0 && b.ef ? b.ef[i / 2] : 0;
      const w = b.kind + 8 * ((ef & 3) | (b.balc ? 4 : 0) | (b.par ? 8 : 0)) + 128 * b.seed;
      if (H) {
        // Kırma çatılı binada duvarın üstü çatı yüzeyine kadar çıkar (çatıyla duvar arasında boşluk kalmaz)
        hipBreaks(H, ax, ay, bx, by, ts);
        for (let k = 0; k + 1 < ts.length; k++) {
          const t0 = ts[k], t1 = ts[k + 1];
          if (t1 - t0 < 1e-4) continue;
          const x0 = ax + dx * t0, y0 = ay + dy * t0, x1 = ax + dx * t1, y1 = ay + dy * t1;
          wallQuad(M, x0, y0, x1, y1, b.base, Math.max(b.top, hipH(H, x0, y0)), Math.max(b.top, hipH(H, x1, y1)), ne, nn, b.wall, b.top, t0 * len, t1 * len, len, w);
        }
      } else wallQuad(M, ax, ay, bx, by, b.base, wallTop, wallTop, ne, nn, b.wall, b.top, 0, len, len, w);
    }
  }
  if (H) hipRoof(M, b);
  else {
    capRings(M, b, rings, b.top, true);
    if (b.par) parapet(M, b);
  }
  if (b.base > 0.3) capRings(M, b, rings, b.base, false);
  if (b.items) for (const it of b.items) roofItem(M, b, it);
  if (b.kind === 1 || b.kind === 4) wallUnits(M, b, W);
}
function wallQuad(M, ax, ay, bx, by, z0, za, zb, ne, nn, c, top, s0, s1, len, w) {
  const a = Math.min(255, Math.round(top));
  const a0 = M.put(ax, ay, z0, ne, nn, 0, c, a, s0, z0, len, w);
  const b0 = M.put(bx, by, z0, ne, nn, 0, c, a, s1, z0, len, w);
  const b1 = M.put(bx, by, zb, ne, nn, 0, c, a, s1, zb, len, w);
  const a1 = M.put(ax, ay, za, ne, nn, 0, c, a, s0, za, len, w);
  M.tri(a0, b0, b1); M.tri(a0, b1, a1);
}
/** Düz çatı (ya da asma binanın tabanı): ear-clipping üçgenleme. Çatıda info.xy = yerel konum (doku için) */
function capRings(M, b, rings, z, up) {
  const C = Cesium, flat = [], holes = [];
  for (let r = 0; r < rings.length; r++) {
    if (r) holes.push(flat.length);
    const ring = rings[r];
    for (let i = 0; i < ring.length; i += 2) flat.push(new C.Cartesian2(ring[i], ring[i + 1]));
  }
  let tri;
  try { tri = C.PolygonPipeline.triangulate(flat, holes); } catch (e) { tri = null; }
  if (!tri || !tri.length) return;
  const first = M.v, c = up ? b.roof : b.wall, w = (up ? 0 : 6) + 128 * b.seed;
  for (const p of flat) M.put(p.x, p.y, z, 0, 0, up ? 1 : -1, c, 255, up ? p.x : 0, up ? p.y : 9, 0, w);
  for (let i = 0; i + 2 < tri.length; i += 3) {
    let a = tri[i], bb = tri[i + 1], cc = tri[i + 2];
    const cr = (flat[bb].x - flat[a].x) * (flat[cc].y - flat[a].y) - (flat[bb].y - flat[a].y) * (flat[cc].x - flat[a].x);
    if ((cr < 0) === up) { const t = bb; bb = cc; cc = t; }      // üstten saat yönünün tersi (yukarı bakan yüz)
    M.tri(first + a, first + bb, first + cc);
  }
}
/** Kırma çatı: iki yamuk + iki üçgen kiremit yüzü, saçak alnı ve saçak altı.
 *  Kiremit yüzünde info.x = saçak boyunca uzaklık, info.y = saçaktan içeri yatay derinlik, info.z = saçak boyu, color.a = yarı genişlik × 10 */
function hipRoof(M, b) {
  const H = b.hip, ux = H.ux, uy = H.uy, vx = -uy, vy = ux, L = H.hl, Wd = H.hw, rr = L - Wd, t = H.t, k = 1 / Math.hypot(1, t);
  const zE = H.eave, zR = H.eave + t * Wd;
  const P = (a, c, z, ix, iy) => [H.cx + ux * a + vx * c, H.cy + uy * a + vy * c, z, ix, iy];
  const col = b.roof, al = Math.min(255, Math.round(Wd * 10)), w = 5 + 128 * b.seed;
  face(M, [P(-L, -Wd, zE, 0, 0), P(L, -Wd, zE, 2 * L, 0), P(rr, 0, zR, 2 * L - Wd, Wd), P(-rr, 0, zR, Wd, Wd)], -vx * t * k, -vy * t * k, k, col, al, 2 * L, w);
  face(M, [P(L, Wd, zE, 0, 0), P(-L, Wd, zE, 2 * L, 0), P(-rr, 0, zR, 2 * L - Wd, Wd), P(rr, 0, zR, Wd, Wd)], vx * t * k, vy * t * k, k, col, al, 2 * L, w);
  face(M, [P(L, -Wd, zE, 0, 0), P(L, Wd, zE, 2 * Wd, 0), P(rr, 0, zR, Wd, Wd)], ux * t * k, uy * t * k, k, col, al, 2 * Wd, w);
  face(M, [P(-L, Wd, zE, 0, 0), P(-L, -Wd, zE, 2 * Wd, 0), P(-rr, 0, zR, Wd, Wd)], -ux * t * k, -uy * t * k, k, col, al, 2 * Wd, w);
  // Saçak alnı (beyaz sıva ya da ahşap) ve saçak altı
  const zF = zE - 0.16, fc = (b.seed & 3) === 0 ? [118, 84, 60] : [226, 222, 214], sc = b.wall.map((x) => Math.round(x * 0.88)), w6 = 6 + 128 * b.seed;
  const cs = [P(-L, -Wd, 0), P(L, -Wd, 0), P(L, Wd, 0), P(-L, Wd, 0)];
  for (let i = 0; i < 4; i++) {
    const p = cs[i], q = cs[(i + 1) % 4], ex = q[0] - p[0], ey = q[1] - p[1], el = Math.hypot(ex, ey) || 1;
    face(M, [[p[0], p[1], zF, 0, 9], [q[0], q[1], zF, 0, 9], [q[0], q[1], zE, 0, 9], [p[0], p[1], zE, 0, 9]], ey / el, -ex / el, 0, fc, 255, 0, w6);
  }
  face(M, cs.map((p) => [p[0], p[1], zF, 0, 9]), 0, 0, -1, sc, 255, 0, w6);
}
/** Düz çatı korkuluğu: iç yüz (çatıya bakar) ve üst harpuşta; dış yüz duvarın uzantısıdır */
function parapet(M, b) {
  const P = b.par, z0 = b.top, z1 = b.top + P, w = 6 + 128 * b.seed;
  const inC = b.wall.map((x) => Math.round(x * 0.9)), capC = [206, 202, 194];
  for (const ring of [b.ring, ...b.holes]) {
    const inner = Float64Array.from(ring), m = ring.length;
    offsetRing(inner, -0.22);
    for (let i = 0; i < m; i += 2) {
      const j = (i + 2) % m, ax = ring[i], ay = ring[i + 1], bx = ring[j], by = ring[j + 1], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
      if (len < 0.05) continue;
      const ne = dy / len, nn = -dx / len, iax = inner[i], iay = inner[i + 1], ibx = inner[j], iby = inner[j + 1];
      face(M, [[iax, iay, z0, 0, 0], [ibx, iby, z0, 0, 0], [ibx, iby, z1, 0, P], [iax, iay, z1, 0, P]], -ne, -nn, 0, inC, 255, 0, w);
      face(M, [[ax, ay, z1, 0, 9], [bx, by, z1, 0, 9], [ibx, iby, z1, 0, 9], [iax, iay, z1, 0, 9]], 0, 0, 1, capC, 255, 0, w);
    }
  }
}
/** Tek çatı donatısının geometrisi */
function roofItem(M, b, it) {
  const z0 = b.top, w6 = 6 + 128 * b.seed, X = [it.ux, it.uy, 0], Y = [-it.uy, it.ux, 0];
  if (it.t === 0) {
    // Merdiven kovası: sıvalı kutu, ince beton saçak, kapı
    gbox(M, [it.x, it.y, z0 + 1.3], X, Y, UP, it.hx, it.hy, 1.3, b.wall.map((x) => Math.round(x * 0.95)), w6, z0, 1);
    gbox(M, [it.x, it.y, z0 + 2.65], X, Y, UP, it.hx + 0.12, it.hy + 0.12, 0.05, [172, 170, 164], w6, z0 - 9, 0);
    gbox(M, [it.x + it.ux * (it.hx + 0.02), it.y + it.uy * (it.hx + 0.02), z0 + 1.0], X, Y, UP, 0.03, 0.45, 1.0, [96, 78, 62], w6, z0 - 9, 1);
  } else if (it.t === 1) {
    // Güneş enerjili su ısıtıcısı: güneye bakan 40° eğik koyu mavi kolektör, üstünde yatay beyaz depo, taşıyıcı ayaklar
    const s = 0.643, c = 0.766, y0 = it.y - 0.95;
    gbox(M, [it.x, y0 + c, z0 + 0.35 + s], [1, 0, 0], [0, c, s], [0, -s, c], 0.5, 1.0, 0.035, [150, 154, 160], w6, z0, 0, 7 + 128 * b.seed);
    const ty = y0 + 2 * c + 0.12, tz = z0 + 0.35 + 2 * s + 0.05;
    cyl(M, [it.x - 0.68, ty, tz], [it.x + 0.68, ty, tz], 0.27, 8, [238, 238, 234], w6, z0 - 9, true, true);
    // Arka ayaklar (üst ve alt yüzleri görünmez: yalnızca yan yüzler)
    for (const sx of [-0.42, 0.42]) gbox(M, [it.x + sx, ty, z0 + (tz - z0) / 2], [1, 0, 0], [0, 1, 0], UP, 0.03, 0.03, (tz - z0) / 2, [120, 124, 128], w6, z0, 5);
  } else if (it.t === 2) {
    // Su deposu: dik silindir (beyaz, mavi ya da gri)
    const col = it.c < 0.5 ? [234, 234, 230] : it.c < 0.8 ? [70, 112, 172] : [162, 164, 162];
    cyl(M, [it.x, it.y, z0], [it.x, it.y, z0 + 1.35], 0.58, 10, col, w6, z0, false, true);
  } else if (it.t === 3) {
    // Klima dış ünitesi
    gbox(M, [it.x, it.y, z0 + 0.32], X, Y, UP, it.hx, it.hy, 0.32, [230, 230, 226], w6, z0, 1);
  } else if (it.t === 4) {
    // Çanak anten: direk + Türksat'a (güney-güneydoğu, 40° yukarı) bakan çanak
    const dx = Math.sin(it.az), dy = Math.cos(it.az);
    gbox(M, [it.x, it.y, z0 + it.hp / 2], [1, 0, 0], [0, 1, 0], UP, 0.025, 0.025, it.hp / 2, [150, 152, 156], w6, z0, 1);
    dish(M, [it.x + dx * 0.08, it.y + dy * 0.08, z0 + it.hp], [dx * 0.766, dy * 0.766, 0.643], it.r, [224, 224, 220], w6);
  }
}
/** Cephe klimaları: konut cephelerinde bazı pencerelerin yanında (bitişik binaya bakan duvarlara konmaz) */
function wallUnits(M, b, W) {
  const r = b.ring, m = r.length, bay = bayWidth(b.kind, b.seed), floors = Math.floor((b.top - b.base - 0.5) / 3);
  if (floors < 2) return;
  let q = 0, n = Math.floor(hash01(b.seed * 1.3, 7.7) * 4);
  const rnd = () => { q++; return hash01(b.seed * 0.917 + q * 2.13, q * 1.41 + 5.5); };
  const side = b.kind === 4 ? 1.1 : 1.35;
  for (let tries = 0; n > 0 && tries < 10; tries++) {
    const i = Math.floor(rnd() * (m / 2)) * 2, ax = r[i], ay = r[i + 1], dx = r[(i + 2) % m] - ax, dy = r[(i + 3) % m] - ay, len = Math.hypot(dx, dy);
    const nb = Math.max(Math.floor((len - 1.2) / bay), 0);
    if (nb < 2) continue;
    const ux = dx / len, uy = dy / len, ne = uy, nn = -ux;
    const off = (len - nb * bay) / 2, bi = Math.floor(rnd() * nb), j = 1 + Math.floor(rnd() * (floors - 1));
    const s = off + (bi + 0.5) * bay + (rnd() < 0.5 ? -side : side);
    if (s < 0.6 || s > len - 0.6) continue;
    const x = ax + ux * s, y = ay + uy * s;
    if (W.floorLocal(x + ne * 0.9, y + nn * 0.9) > 0) continue;
    const z = b.base + j * 3 + 0.62;
    gbox(M, [x + ne * 0.17, y + nn * 0.17, z], [ux, uy, 0], [ne, nn, 0], UP, 0.42, 0.15, 0.3, [232, 232, 228], 6 + 128 * b.seed, z - 9, 2);
    n--;
  }
}

/* ---------------- Ağaçlar (alçak çokgenli) ---------------- */
// Taç topu: ikosahedron (12 köşe, 20 üçgen); yüzler dışa bakacak şekilde sıralanır
const ICO = (() => {
  const t = (1 + Math.sqrt(5)) / 2;
  const v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
    .map((p) => { const l = Math.hypot(p[0], p[1], p[2]); return [p[0] / l, p[1] / l, p[2] / l]; });
  const f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]].map(([a, b, c]) => {
    const A = v[a], B = v[b], C = v[c], e = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], g = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const cr = [e[1] * g[2] - e[2] * g[1], e[2] * g[0] - e[0] * g[2], e[0] * g[1] - e[1] * g[0]];
    return cr[0] * (A[0] + B[0] + C[0]) + cr[1] * (A[1] + B[1] + C[1]) + cr[2] * (A[2] + B[2] + C[2]) > 0 ? [a, b, c] : [a, c, b];
  });
  return { v, f };
})();
const LEAF = [[78, 114, 50], [64, 102, 46], [92, 126, 56], [58, 94, 42], [84, 110, 48], [100, 130, 62], [70, 98, 52]];
const BARK = [[98, 84, 68], [86, 74, 62], [112, 98, 82]];
/** Taç topu (elipsoit, köşeleri biraz düzensiz). color.a = alt kısımda koyulaşma (kendi gölgesi) */
function blob(M, e, n, u, rx, ry, rz, col, aoLow, sd) {
  const first = M.v;
  for (let i = 0; i < 12; i++) {
    const p = ICO.v[i], k = 0.84 + 0.3 * hash01(sd * 3.7 + i * 1.31, i * 0.77 - sd);
    let nx = p[0] / rx, ny = p[1] / ry, nz = p[2] / rz;
    const l = Math.hypot(nx, ny, nz);
    M.put(e + p[0] * rx * k, n + p[1] * ry * k, u + p[2] * rz * k, nx / l, ny / l, nz / l, col, Math.round(255 * (aoLow + (1 - aoLow) * (0.5 + 0.5 * p[2]))));
  }
  for (const [a, b, c] of ICO.f) M.tri(first + a, first + b, first + c);
}
/** Gövde: beş köşeli, yukarı doğru incelen prizma */
function trunk(M, e, n, h, r0, r1, col) {
  const S = 5, first = M.v;
  for (let i = 0; i < S; i++) {
    const a = (i / S) * Math.PI * 2, cs = Math.cos(a), sn = Math.sin(a);
    M.put(e + cs * r0, n + sn * r0, -0.15, cs, sn, 0, col, 150);
    M.put(e + cs * r1, n + sn * r1, h, cs, sn, 0, col, 235);
  }
  for (let i = 0; i < S; i++) { const a0 = first + 2 * i, a1 = first + 2 * ((i + 1) % S); M.tri(a0, a1, a1 + 1); M.tri(a0, a1 + 1, a0 + 1); }
}
/** Palmiye: ince gövde, tepede sarkık iki yüzlü yapraklar */
function palm(M, x, y, H, s, bark) {
  trunk(M, x, y, H, 0.22, 0.16, bark);
  blob(M, x, y, H, 0.42, 0.42, 0.32, [92, 104, 54], 0.7, s * 1000);
  const green = [72, 112, 48], N = 9;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2 + s * 6.28, ca = Math.cos(a), sa = Math.sin(a), L = 2.6 + 0.8 * hash01(s * 31 + k, k * 1.7);
    const B = [x, y, H + 0.1], T = [x + ca * L, y + sa * L, H - 0.8], mx = x + ca * L * 0.5, my = y + sa * L * 0.5, mz = H + 0.4;
    const Lf = [mx - sa * 0.38, my + ca * 0.38, mz - 0.08], Rt = [mx + sa * 0.38, my - ca * 0.38, mz - 0.08];
    for (const up of [1, -1]) {
      const nx = -ca * 0.3 * up, ny = -sa * 0.3 * up, nz = up, ao = up > 0 ? 235 : 170;
      const i0 = M.put(B[0], B[1], B[2], nx, ny, nz, green, ao), i1 = M.put(Rt[0], Rt[1], Rt[2], nx, ny, nz, green, ao);
      const i2 = M.put(T[0], T[1], T[2], nx, ny, nz, green, ao), i3 = M.put(Lf[0], Lf[1], Lf[2], nx, ny, nz, green, ao);
      if (up > 0) { M.tri(i0, i1, i2); M.tri(i0, i2, i3); } else { M.tri(i0, i2, i1); M.tri(i0, i3, i2); }
    }
  }
}
/** Tek ağaç. type: 0 yapraklı (çınar, ıhlamur), 1 servi, 2 fıstık çamı, 3 palmiye; H: boy (m); s: 0–1 tohum */
function makeTree(M, x, y, type, H, s) {
  const R = (k) => hash01(s * 91.7 + k * 7.31, s * 13.1 - k * 2.9);
  const tone = (c, f) => [Math.min(255, Math.round(c[0] * f)), Math.min(255, Math.round(c[1] * f)), Math.min(255, Math.round(c[2] * f))];
  const leaf = LEAF[Math.floor(R(1) * LEAF.length)], bark = BARK[Math.floor(R(2) * BARK.length)], sd = s * 1000;
  if (type === 1) {
    // Servi: dar, uzun, koyu yeşil
    const c = tone([44, 78, 46], 0.9 + 0.2 * R(3)), w = H * (0.1 + 0.03 * R(4));
    trunk(M, x, y, 1.2, 0.14, 0.1, bark);
    blob(M, x, y, H * 0.47, w, w, H * 0.47, c, 0.55, sd);
    blob(M, x + (R(5) - 0.5) * 0.3, y + (R(6) - 0.5) * 0.3, H * 0.8, w * 0.65, w * 0.65, H * 0.2, tone(c, 1.08), 0.7, sd + 1);
  } else if (type === 2) {
    // Fıstık çamı: uzun gövde, yayvan şemsiye taç
    const c = tone([62, 94, 54], 0.9 + 0.2 * R(3)), cw = H * (0.3 + 0.06 * R(4)), a = R(6) * 6.283;
    trunk(M, x, y, H * 0.8, 0.2, 0.13, bark);
    blob(M, x, y, H * 0.85, cw, cw * (0.85 + 0.2 * R(5)), H * 0.13, c, 0.5, sd);
    blob(M, x + Math.cos(a) * cw * 0.5, y + Math.sin(a) * cw * 0.5, H * 0.8, cw * 0.62, cw * 0.6, H * 0.11, tone(c, 0.94), 0.5, sd + 1);
  } else if (type === 3) {
    palm(M, x, y, H, s, bark);
  } else {
    // Yapraklı ağaç: gövde + üst üste binen üç taç topu
    const cw = H * (0.27 + 0.06 * R(3)), a = R(6) * 6.283, d = cw * 0.55;
    trunk(M, x, y, H * 0.55, 0.12 + H * 0.012, 0.08 + H * 0.007, bark);
    blob(M, x, y, H * 0.64, cw, cw * (0.9 + 0.2 * R(4)), H * 0.27, tone(leaf, 0.92 + 0.16 * R(5)), 0.55, sd);
    blob(M, x + Math.cos(a) * d, y + Math.sin(a) * d, H * 0.55, cw * 0.72, cw * 0.72, H * 0.2, tone(leaf, 0.86 + 0.16 * R(7)), 0.55, sd + 1);
    blob(M, x - Math.cos(a + 0.6) * d * 0.8, y - Math.sin(a + 0.6) * d * 0.8, H * 0.76, cw * 0.66, cw * 0.66, H * 0.2, tone(leaf, 0.98 + 0.14 * R(8)), 0.65, sd + 2);
  }
}
/** Çokgenleri ızgaraya işler (tarama çizgisi, çift-tek kuralı): hücre 1 = içeride. R: yarıçap (m), cell: hücre boyu (m) */
function rasterMask(polys, R, cell) {
  const n = Math.ceil((2 * R) / cell), bits = new Uint8Array(n * n), xs = [];
  for (const rings of polys) {
    let y0 = Infinity, y1 = -Infinity;
    for (const r of rings) for (let i = 1; i < r.length; i += 2) { if (r[i] < y0) y0 = r[i]; if (r[i] > y1) y1 = r[i]; }
    const j0 = Math.max(0, Math.floor((y0 + R) / cell)), j1 = Math.min(n - 1, Math.floor((y1 + R) / cell));
    for (let j = j0; j <= j1; j++) {
      const y = -R + (j + 0.5) * cell;
      xs.length = 0;
      for (const r of rings) for (let i = 0, m = r.length; i < m; i += 2) {
        const ay = r[i + 1], by = r[(i + 3) % m];
        if ((ay > y) !== (by > y)) { const ax = r[i], bx = r[(i + 2) % m]; xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay)); }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const i0 = Math.max(0, Math.ceil((xs[k] + R) / cell - 0.5)), i1 = Math.min(n - 1, Math.floor((xs[k + 1] + R) / cell - 0.5));
        for (let i = i0; i <= i1; i++) bits[j * n + i] = 1;
      }
    }
  }
  return { R, cell, n, bits };
}
function maskAt(m, x, y) {
  const i = Math.floor((x + m.R) / m.cell), j = Math.floor((y + m.R) / m.cell);
  return i >= 0 && j >= 0 && i < m.n && j < m.n && m.bits[j * m.n + i] === 1;
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
   info.w = düzen + 8 × işaretler + 128 × bina tohumu
     düzen: 0 düz çatı, 1 apartman, 2 ofis, 3 sanayi, 4 küçük bina, 5 kiremit çatı, 6 düz renk (korkuluk, saçak, donatı), 7 güneş kolektörü
     işaretler (cephede): 1 dükkânlı zemin kat, 2 giriş kapısı, 4 balkonlar, 8 korkuluklu düz çatı
   Cephe: info.x = duvar boyunca uzaklık (m), y = yerden yükseklik (m), z = duvar boyu (m); color.a = bina yüksekliği (m)
   Kiremit: info.x = saçak boyunca, y = saçaktan içeri yatay derinlik, z = saçak boyu; color.a = yarı genişlik × 10 (dm)
   Düz çatı: info.xy = yerel doğu/kuzey (m). Düz renk: info.y = çatıdan yükseklik (dipte gölge). Kolektör: info.xy = panel üstünde (m)
   Uzakta desenler titremesin: piksel başına düşen metre (fwidth) büyüdükçe ayrıntı ortalama tona karışır. */
const CITY_VS = `
in vec3 position3DHigh;
in vec3 position3DLow;
in vec3 normal;
in vec4 color;
in vec4 info;
in float batchId;
out vec3 v_positionEC;
out vec3 v_normalEC;
out vec3 v_upEC;
out vec4 v_color;
out vec4 v_info;
void main() {
  vec4 p = czm_computePosition();
  v_positionEC = (czm_modelViewRelativeToEye * p).xyz;
  v_normalEC = czm_normal * normal;
  v_upEC = czm_normal * normalize(position3DHigh + position3DLow);
  v_color = color;
  v_info = info;
  gl_Position = czm_modelViewProjectionRelativeToEye * p;
}`;
const CITY_FS = `
in vec3 v_positionEC;
in vec3 v_normalEC;
in vec3 v_upEC;
in vec4 v_color;
in vec4 v_info;
#ifdef LOG_DEPTH
float band(float lo, float hi, float x, float w) { return smoothstep(lo - w, lo + w, x) * (1.0 - smoothstep(hi - w, hi + w, x)); }
float hash2(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 signColor(float k) {
  if (k < 0.16) return vec3(0.70, 0.12, 0.10);
  if (k < 0.30) return vec3(0.10, 0.22, 0.48);
  if (k < 0.42) return vec3(0.12, 0.42, 0.22);
  if (k < 0.54) return vec3(0.90, 0.55, 0.10);
  if (k < 0.66) return vec3(0.92, 0.92, 0.90);
  if (k < 0.76) return vec3(0.86, 0.76, 0.16);
  if (k < 0.88) return vec3(0.18, 0.18, 0.20);
  return vec3(0.55, 0.12, 0.35);
}
void main() {
  vec3 n = normalize(v_normalEC);
  vec3 eye = normalize(-v_positionEC);
  float dist = length(v_positionEC);
  vec3 c = v_color.rgb;
  float code = floor(v_info.w + 0.5);
  float kind = mod(code, 8.0);
  float flags = mod(floor(code / 8.0), 16.0);
  float seed = floor(code / 128.0);
  float glassAmt = 0.0;
  float fres = 1.0 - abs(dot(n, eye));
  vec3 sky = vec3(0.60, 0.68, 0.78);
  if (kind > 0.5 && kind < 4.5) {
    // ---------------- Cephe ----------------
    float s = v_info.x, h = v_info.y, len = v_info.z, top = v_color.a * 255.0;
    float shopF = mod(flags, 2.0), doorF = mod(floor(flags / 2.0), 2.0), balcF = mod(floor(flags / 4.0), 2.0), parF = floor(flags / 8.0);
    float r0 = fract(seed * 0.6180339), r1 = fract(seed * 0.7548777), r2 = fract(seed * 0.5698403), r3 = fract(seed * 0.4142136);
    bool office = kind > 1.5 && kind < 2.5, industry = kind > 2.5 && kind < 3.5, house = kind > 3.5;
    float bay = (house ? 3.4 : industry ? 7.0 : office ? 1.8 : 3.1) * (0.92 + 0.16 * r0);
    float fh = industry ? 6.0 : 3.0;
    float nb = max(floor((len - 1.2) / bay), 0.0);
    float off = (len - nb * bay) * 0.5;
    float u = (s - off) / bay, v = h / fh;
    float bi = floor(u), j = floor(v);
    float xm = fract(u) * bay, ym = fract(v) * fh;            // pencere hücresi içinde (m)
    float px = max(max(fwidth(s), fwidth(h)), 0.001);          // piksel başına metre
    float aw = px * 0.8;
    float fine = 1.0 - smoothstep(0.035, 0.11, px);            // çerçeve, denizlik, panjur çıtası
    float mid = 1.0 - smoothstep(0.30, 0.95, px);              // pencere ölçeği
    float inBay = band(0.0, nb, u, fwidth(u) * 0.8 + 0.001);
    float floorOk = step((j + 0.85) * fh, top - 0.2);
    // Sıva: büyük lekeler, ince doku, çatıdan inen kir izleri
    float nl = vnoise(vec2(s, h) * 0.22 + seed);
    c *= 0.94 + 0.11 * nl + (vnoise(vec2(s, h) * 2.3) - 0.5) * 0.07 * fine;
    c *= 1.0 - 0.08 * vnoise(vec2(s * 1.7, h * 0.06 + seed)) * smoothstep(0.35, 1.0, nl);
    // İki renkli cephe: zemin kat taş kaplama ya da koyu sıva; en altta subasman
    if (r2 > 0.55 && j < 0.5) c *= vec3(0.84, 0.82, 0.80);
    c *= 1.0 - 0.26 * (1.0 - smoothstep(0.42, 0.48, h));
    // Kat silmesi (döşeme hizasında ince şerit)
    float dfl = min(ym, fh - ym);
    float slab = (1.0 - smoothstep(0.06, 0.08 + aw, dfl)) * step(1.0, h) * step(h, top - 0.3);
    c *= 1.0 - slab * (r1 > 0.5 ? 0.10 : -0.07);
    vec3 wallC = c;
    float cx = bay * 0.5, dx = abs(xm - cx);
    vec3 inC = vec3(0.06, 0.065, 0.075);
    bool inside = u >= 0.0 && u < nb;
    bool doorHere = doorF > 0.5 && j < 0.5 && inside && bi == floor(nb * 0.5);
    bool shopHere = shopF > 0.5 && j < 0.5 && inside;
    bool balc = balcF > 0.5 && kind < 1.5 && j > 0.5 && mod(bi + seed, 2.0) < 0.5;
    if (doorHere) {
      // Apartman girişi: mermer söve, ahşap ya da alüminyum kapı, üstte küçük beton saçak
      float dw = 0.62;
      float dm = (1.0 - smoothstep(dw - aw, dw + aw, dx)) * (1.0 - smoothstep(2.25 - aw, 2.25 + aw, ym));
      float df = (1.0 - smoothstep(dw + 0.12 - aw, dw + 0.12 + aw, dx)) * (1.0 - smoothstep(2.37 - aw, 2.37 + aw, ym));
      float dg = (1.0 - smoothstep(dw - 0.18 - aw, dw - 0.18 + aw, dx)) * band(1.0, 2.05, ym, aw);
      vec3 dc = r3 > 0.5 ? vec3(0.30, 0.20, 0.13) : vec3(0.42, 0.44, 0.46);
      float can = (1.0 - smoothstep(dw + 0.5 - aw, dw + 0.5 + aw, dx)) * band(2.46, 2.6, ym, aw);
      c *= 1.0 - 0.3 * (1.0 - smoothstep(dw + 0.5 - aw, dw + 0.5 + aw, dx)) * band(1.7, 2.46, ym, 0.3);
      c = mix(c, vec3(0.86, 0.85, 0.81), df);
      c = mix(c, dc, dm);
      c = mix(c, mix(inC, sky, 0.35), dg * (r3 > 0.5 ? 0.7 : 1.0));
      c = mix(c, vec3(0.58, 0.58, 0.56), can);
      glassAmt = dg;
    } else if (shopHere) {
      // Dükkân: büyük vitrin, koyu doğrama, renkli tabela ya da çizgili tente; bazılarında kepenk inik
      float sr = hash2(vec2(bi, seed) + 3.7);
      float shut = step(0.86, sr);
      float gm = band(0.16, bay - 0.16, xm, aw) * band(0.22, 2.36, ym, aw);
      float fm = band(0.08, bay - 0.08, xm, aw) * band(0.14, 2.44, ym, aw);
      vec3 shopIn = mix(vec3(0.20, 0.18, 0.16), vec3(0.72, 0.64, 0.52), 0.3 + 0.45 * hash2(vec2(bi, 9.0) + seed));
      vec3 sg = mix(shopIn, sky, 0.2 + 0.45 * fres * fres);
      if (shut > 0.5) sg = vec3(0.62, 0.63, 0.64) * (0.9 + 0.1 * step(0.5, fract(ym * 10.0)) * fine);
      c = mix(c, vec3(0.16, 0.16, 0.17), fm);
      c = mix(c, sg, gm);
      glassAmt = gm * (1.0 - shut);
      vec3 sc = signColor(hash2(vec2(bi * 1.3, seed * 0.7)));
      if (sr < 0.35) {
        float sb = band(0.05, bay - 0.05, xm, aw) * band(2.2, 2.96, ym, aw);
        vec3 tc = mix(sc, vec3(0.94), step(0.5, fract(xm * 2.2)) * fine * 0.85);
        c = mix(c, tc * (0.78 + 0.22 * smoothstep(2.2, 2.9, ym)), sb);
      } else {
        float sb = band(0.05, bay - 0.05, xm, aw) * band(2.48, 2.96, ym, aw);
        float txt = step(0.55, hash2(floor(vec2(xm * 5.0, ym * 7.0)) + bi * 7.1 + seed)) * band(0.45, bay - 0.45, xm, aw) * band(2.58, 2.86, ym, aw) * fine;
        vec3 tcol = dot(sc, vec3(0.333)) > 0.55 ? vec3(0.12) : vec3(0.95);
        c = mix(c, mix(sc, tcol, txt), sb);
      }
    } else {
      // Pencere: cam, doğrama, orta kayıt, mermer denizlik, altında kir izi
      float hw = house ? 0.55 : office ? bay * 0.5 - 0.09 : industry ? bay * 0.5 - 0.6 : 0.68;
      float y0 = house ? 0.95 : office ? 0.80 : industry ? 3.6 : 0.90;
      float y1 = house ? 2.25 : office ? 2.75 : industry ? 5.0 : 2.35;
      if (balc) { hw = 0.85; y0 = 0.06; }
      float fr = office ? 0.04 : 0.07;
      float k = inBay * floorOk;
      float gm = (1.0 - smoothstep(hw - aw, hw + aw, dx)) * band(y0, y1, ym, aw) * k;
      float om = (1.0 - smoothstep(hw + fr - aw, hw + fr + aw, dx)) * band(y0 - fr, y1 + fr, ym, aw) * k;
      float mul = office ? 0.0 : (1.0 - smoothstep(0.03, 0.03 + aw, dx)) * gm;
      float frame = max(om - gm, 0.0) + mul;
      gm *= 1.0 - mul;
      bool plain = office || industry;
      float sw = (1.0 - smoothstep(hw + 0.1 - aw, hw + 0.1 + aw, dx)) * k * (balc || plain ? 0.0 : 1.0);
      float sill = sw * band(y0 - fr - 0.06, y0 - fr, ym, aw);
      float sillSh = sw * band(y0 - fr - 0.14, y0 - fr - 0.06, ym, aw);
      float grime = (1.0 - smoothstep(hw - 0.2, hw + 0.1, dx)) * k * (balc || plain ? 0.0 : 1.0) * step(ym, y0 - fr - 0.06)
        * (1.0 - smoothstep(0.0, 1.2, y0 - fr - 0.06 - ym)) * (0.4 + 0.6 * vnoise(vec2(xm * 6.0, ym * 0.8 + bi * 3.0)));
      // Her pencere farklı: yansıma, tül perde, panjur, jaluzi, birkaçında içerisi aydınlık
      float wr = hash2(vec2(bi, j) + seed * 1.37), wr2 = hash2(vec2(j * 1.7, bi) - seed);
      float gy = clamp((ym - y0) / max(y1 - y0, 0.1), 0.0, 1.0);
      vec3 tint = office ? mix(vec3(0.42, 0.60, 0.66), vec3(0.55, 0.56, 0.58), r3) : vec3(1.0);
      // Yansıma: gökyüzü ya da karşıdaki cephe (sıcak gri); pencereden pencereye değişir
      float refl = clamp(0.22 + 0.5 * fres * fres + 0.32 * wr + 0.15 * gy, 0.0, 0.95);
      vec3 reflC = mix(sky, vec3(0.56, 0.53, 0.49), step(0.55, fract(wr * 5.3)) * 0.8) * tint;
      vec3 gcol = mix(inC, reflC, refl * (office ? 0.9 : 0.8));
      if (!plain) {
        if (wr2 < 0.32) {
          float gap = wr > 0.5 ? band(cx - 0.18 - 0.25 * wr, cx + 0.18 + 0.25 * wr, xm, aw) : 0.0;
          gcol = mix(gcol, vec3(0.86, 0.84, 0.79) * (0.88 + 0.12 * sin(xm * 40.0) * fine), 0.72 * (1.0 - gap));
        } else if (wr2 < 0.52) {
          float down = (0.15 + 0.85 * fract(wr * 7.13)) * (y1 - y0);
          vec3 pc = r3 > 0.6 ? vec3(0.64, 0.62, 0.58) : r3 > 0.3 ? vec3(0.86, 0.85, 0.82) : vec3(0.50, 0.38, 0.27);
          gcol = mix(gcol, pc * (0.9 + 0.1 * step(0.5, fract(ym * 16.0)) * fine), step(y1 - down, ym));
        } else if (wr2 < 0.60) {
          gcol = mix(gcol, vec3(0.80, 0.80, 0.78) * (0.88 + 0.12 * step(0.5, fract(ym * 22.0)) * fine), 0.8);
        } else if (wr2 > 0.975) {
          gcol = mix(gcol, vec3(0.95, 0.80, 0.55), 0.55);
        }
      }
      vec3 frC = office ? vec3(0.25, 0.27, 0.29) : r2 < 0.2 ? vec3(0.38, 0.27, 0.19) : vec3(0.93, 0.93, 0.91);
      c *= 1.0 - 0.12 * grime * fine;
      c = mix(c, c * 0.72, sillSh * fine);
      c = mix(c, vec3(0.90, 0.89, 0.86), sill * fine);
      // Balkon: içeri çekik kısım gölgede, döşeme alnı, korkuluk (dolu, demir ya da cam)
      if (balc) {
        float bx = band(0.12, bay - 0.12, xm, aw) * floorOk;
        c *= 1.0 - 0.24 * bx * step(0.22, ym);
      }
      c = mix(c, frC, frame * fine);
      c = mix(c, gcol, gm);
      glassAmt = gm;
      if (balc) {
        float bx = band(0.12, bay - 0.12, xm, aw) * floorOk;
        float sl = bx * (1.0 - smoothstep(0.20, 0.20 + aw, ym));
        c = mix(c, wallC * 1.1 + 0.03, sl);
        float rail = bx * band(0.22, 1.05, ym, aw);
        if (r1 < 0.45) {
          c = mix(c, wallC * (1.04 - 0.1 * smoothstep(0.9, 1.05, ym)), rail);
        } else if (r1 < 0.8) {
          float bars = mix(0.3, step(0.72, fract(xm / 0.12)), fine);
          float topBar = band(0.98, 1.05, ym, aw);
          c = mix(c, vec3(0.14, 0.14, 0.15), rail * max(bars, topBar));
        } else {
          c = mix(c, mix(c, vec3(0.55, 0.66, 0.72), 0.45), rail);
          c = mix(c, vec3(0.75, 0.76, 0.78), bx * band(0.98, 1.05, ym, aw));
        }
        glassAmt *= 1.0 - rail;
      }
      // Üst kattaki balkonun döşemesinin gölgesi
      float above = (balcF > 0.5 && kind < 1.5 && mod(bi + seed, 2.0) < 0.5) ? step((j + 1.85) * fh, top - 0.2) : 0.0;
      c *= 1.0 - 0.22 * above * band(0.12, bay - 0.12, xm, aw) * smoothstep(fh - 0.45, fh, ym);
    }
    // Uzakta: pencereler ortalama tona karışır
    float cov = office ? 0.55 : industry ? 0.15 : house ? 0.17 : 0.24;
    vec3 farC = mix(wallC, vec3(0.42, 0.44, 0.47), cov * inBay * (1.0 - smoothstep(top - 1.2, top - 0.6, h)) * smoothstep(0.5, 1.0, h));
    c = mix(farC, c, mid);
    glassAmt *= mid;
    // Korkuluk harpuştası
    if (parF > 0.5) c = mix(c, vec3(0.80, 0.78, 0.74), smoothstep(top + 0.76, top + 0.80, h));
    // Gölge: zemin, köşeler, saçak altı
    float ao = mix(0.72, 1.0, smoothstep(0.0, 2.4, h));
    ao *= mix(0.84, 1.0, smoothstep(0.0, 0.7, s)) * mix(0.84, 1.0, smoothstep(0.0, 0.7, len - s));
    ao *= 1.0 - 0.22 * (1.0 - parF) * smoothstep(top - 0.9, top - 0.05, h);
    c *= ao;
  } else if (kind > 4.5 && kind < 5.5) {
    // ---------------- Kiremit çatı ----------------
    float u = v_info.x, y = v_info.y, L = v_info.z, hwp = v_color.a * 25.5;
    float px = max(max(fwidth(u), fwidth(y)), 0.001);
    float fine = 1.0 - smoothstep(0.025, 0.08, px);
    float ry = y / 0.30, ri = floor(ry), fr = fract(ry);
    float cu = u / 0.22 + 0.5 * mod(ri, 2.0), fc = fract(cu), ci = floor(cu);
    float tv = hash2(vec2(ci, ri) + seed);
    float pat = (0.88 + 0.12 * cos(6.2832 * fc)) * (1.0 - 0.34 * smoothstep(0.78, 0.97, fr)) * (0.90 + 0.20 * tv);
    c *= mix(0.85, pat, fine);
    // Yaşlanma: koyu lekeler, yosun, büyük ölçekte renk değişimi
    float st = vnoise(vec2(u, y) * 0.45 + seed * 1.7);
    c = mix(c, c * vec3(0.70, 0.74, 0.68), smoothstep(0.55, 0.95, st) * 0.55);
    c *= 0.93 + 0.14 * vnoise(vec2(u, y) * 0.12 + seed);
    // Mahya ve kırma (köşe) kiremitleri
    float capd = min(min(u - y, L - y - u) * 0.7071, hwp - y);
    float cap = 1.0 - smoothstep(0.10 - px * 0.5, 0.13 + px * 0.5, capd);
    c = mix(c, c * (0.80 + 0.12 * cos(6.2832 * (u + y) / 0.4) * fine), cap);
    c *= 0.82 + 0.18 * smoothstep(0.0, 0.25, y);
  } else if (kind > 6.5) {
    // ---------------- Güneş kolektörü (1,0 × 2,0 m) ----------------
    vec2 p = v_info.xy;
    float px = max(max(fwidth(p.x), fwidth(p.y)), 0.001);
    float fine = 1.0 - smoothstep(0.01, 0.04, px);
    c = mix(vec3(0.05, 0.09, 0.20), vec3(0.50, 0.58, 0.70), 0.12 + 0.55 * fres * fres);
    c *= 0.92 + 0.08 * cos(p.x * 62.8) * fine;
    float edge = min(min(p.x, 1.0 - p.x), min(p.y, 2.0 - p.y));
    float fm = 1.0 - smoothstep(0.035, 0.035 + px, edge);
    c = mix(c, vec3(0.72, 0.74, 0.76), fm);
    glassAmt = 1.0 - fm;
  } else if (kind > 5.5) {
    // ---------------- Düz renk: dipte temas gölgesi ----------------
    c *= mix(0.70, 1.0, smoothstep(0.0, 0.5, v_info.y));
  } else {
    // ---------------- Düz çatı: beton/membran lekeleri, mıcır dokusu ----------------
    vec2 p = v_info.xy;
    float px = max(max(fwidth(p.x), fwidth(p.y)), 0.001);
    float fine = 1.0 - smoothstep(0.02, 0.08, px);
    c *= 0.93 + 0.12 * vnoise(p * 0.16 + seed) + (vnoise(p * 1.3) - 0.5) * 0.07 + (vnoise(p * 9.0) - 0.5) * 0.09 * fine;
    c = mix(c, c * 0.72, smoothstep(0.68, 0.76, vnoise(p * 0.4 + seed * 2.3)) * 0.4);
  }
  // Işık: gökyüzü/yer ortam ışığı + güneş; camda güneş parlaması; uzakta hava perspektifi
  vec3 up = normalize(v_upEC);
  float diff = max(dot(n, czm_lightDirectionEC), 0.0);
  float sk = 0.5 + 0.5 * dot(n, up);
  vec3 amb = mix(vec3(0.47, 0.45, 0.42), vec3(0.67, 0.71, 0.79), sk);
  vec3 lit = c * (amb + vec3(0.55, 0.52, 0.46) * diff);
  vec3 hv = normalize(czm_lightDirectionEC + eye);
  lit += glassAmt * pow(max(dot(n, hv), 0.0), 64.0) * 0.6;
  float fog = 1.0 - exp(-dist * 0.00042);
  lit = mix(lit, vec3(0.74, 0.81, 0.89), clamp(fog, 0.0, 0.6));
  out_FragColor = vec4(lit, 1.0);
}
#else
// Yedek (logaritmik derinlik kapalıysa): yalnız ışık
void main() {
  vec3 n = normalize(v_normalEC);
  float sk = 0.5 + 0.5 * dot(n, normalize(v_upEC));
  vec3 amb = mix(vec3(0.47, 0.45, 0.42), vec3(0.67, 0.71, 0.79), sk);
  out_FragColor = vec4(v_color.rgb * (amb + vec3(0.55, 0.52, 0.46) * max(dot(n, czm_lightDirectionEC), 0.0)), 1.0);
}
#endif
`;

/* ---------------- Ağaç gölgelendiricisi ----------------
   color.a = taç içinde koyulaşma (altı koyu). Yaprak kümeleri: köşe normaline bağlı yumuşak desen (kamerayla kaymaz) */
const TREE_VS = `
in vec3 position3DHigh;
in vec3 position3DLow;
in vec3 normal;
in vec4 color;
in float batchId;
out vec3 v_positionEC;
out vec3 v_normalEC;
out vec3 v_nMC;
out vec3 v_upEC;
out vec4 v_color;
void main() {
  vec4 p = czm_computePosition();
  v_positionEC = (czm_modelViewRelativeToEye * p).xyz;
  v_normalEC = czm_normal * normal;
  v_nMC = normal;
  v_upEC = czm_normal * normalize(position3DHigh + position3DLow);
  v_color = color;
  gl_Position = czm_modelViewProjectionRelativeToEye * p;
}`;
const TREE_FS = `
in vec3 v_positionEC;
in vec3 v_normalEC;
in vec3 v_nMC;
in vec3 v_upEC;
in vec4 v_color;
void main() {
  vec3 n = normalize(v_normalEC);
  float dist = length(v_positionEC);
  vec3 m = normalize(v_nMC);
  float leaf = sin(dot(m, vec3(21.0, 9.0, -13.0))) * sin(dot(m, vec3(-11.0, 19.0, 14.0))) + 0.6 * sin(dot(m, vec3(31.0, -27.0, 23.0)));
  float fade = 1.0 - smoothstep(80.0, 320.0, dist);
  vec3 c = v_color.rgb * v_color.a * (1.0 + leaf * 0.13 * fade);
  float d = dot(n, czm_lightDirectionEC);
  float wrap = max(d * 0.62 + 0.38, 0.0);
  float sk = 0.5 + 0.5 * dot(n, normalize(v_upEC));
  vec3 amb = mix(vec3(0.40, 0.42, 0.36), vec3(0.58, 0.64, 0.70), sk);
  vec3 lit = c * (amb + vec3(0.62, 0.58, 0.50) * wrap);
  float fog = 1.0 - exp(-dist * 0.00042);
  lit = mix(lit, vec3(0.74, 0.81, 0.89), clamp(fog, 0.0, 0.6));
  out_FragColor = vec4(lit, 1.0);
}`;

/* =========================================================
   ARAYÜZ – araç çubuğundaki "Uçuş alanı" penceresi, sahne üstü yazılar,
   radar ve Cesium ion anahtarı penceresi
   ========================================================= */
const WorldUI = {
  init() {
    const $ = (s) => document.querySelector(s);
    const def = World.token() ? "google" : "open", saved = World.get("src", def);
    World.src = World.SOURCES[saved] ? saved : def;
    if (World.SOURCES[World.src].token && !World.token()) World.src = "open";
    $("#flyAreaSeg").onclick = (e) => { const b = e.target.closest("button"); if (b) setFlyArea(b.dataset.area); };
    $("#worldSrc").innerHTML = Object.entries(World.SOURCES).map(([k, s]) => `<option value="${k}">${s.name}</option>`).join("");
    $("#worldSrc").onchange = (e) => { const v = e.target.value; e.target.value = World.src; World.setSource(v); };
    const gsel = $("#worldGround");
    if (gsel) {
      gsel.innerHTML = Object.entries(World.GROUNDS).map(([k, g]) => `<option value="${k}">${g.name}</option>`).join("");
      gsel.onchange = (e) => World.setGround(e.target.value);
    }
    // 3D harita kütüphanesi (~6 MB) Uçuş seçilince ya da son oturum gerçek dünyadaysa arka planda iner: "Gerçek dünya"ya basınca beklemek gerekmez
    if (World.get("area", "field") === "real") setTimeout(() => World.preload(), 1200);
    document.addEventListener("click", (e) => { if (e.target.closest && e.target.closest('#rigSeg [data-rig="fly"], #flyAreaSeg [data-area="real"]')) World.preload(); }, true);
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
    $("#wkRemove").onclick = () => {
      World.set("token", null);
      $("#wkInput").value = "";
      this.keyNote(World.token() ? "Kendi anahtarın silindi; projenin anahtarı kullanılacak." : "Anahtar silindi.", "");
      $("#wkRemove").hidden = true;
      if (!World.token() && World.SOURCES[World.src].token) World.setSource("open"); else World.reloadViewer();
      this.sync();
    };
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
    const gsel = $("#worldGround");
    if (gsel) {
      gsel.value = World.groundStyle();
      const wrap = gsel.closest("label");
      if (wrap) wrap.hidden = World.src === "google";
    }
    const own = !!World.userToken();
    $("#worldKeyBtn").innerHTML = ico("key") + (own ? "Kendi Cesium anahtarın kullanılıyor" : World.token() ? "Kendi Cesium anahtarını gir (isteğe bağlı)" : "Cesium ion anahtarı ekle (ücretsiz)");
    $("#worldKeyBtn").classList.toggle("ok", own);
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
    if (typeof syncTools === "function") syncTools();      // araç çubuğundaki "Uçuş alanı" değeri
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
    // Rüzgâr oku: rüzgârın estiği yön (burun yukarıdayken), yanında hız
    const wx = Fly.wind.x / 1000, wn = -Fly.wind.z / 1000, ws = Math.hypot(wx, wn);
    if (ws > 0.3) {
      const sa = head - Math.PI / 2 - Math.atan2(wn, wx), r0 = R * 0.62, L = Math.min(R * 0.3, 8 + ws * 2.2);
      const cx = R + Math.cos(sa) * r0, cy = R + Math.sin(sa) * r0;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(sa);
      ctx.strokeStyle = "#7fc4ff"; ctx.fillStyle = "#7fc4ff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.lineTo(L / 2 - 4, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(L / 2, 0); ctx.lineTo(L / 2 - 6, -4); ctx.lineTo(L / 2 - 6, 4); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = "#7fc4ff"; ctx.font = "600 9px 'IBM Plex Mono', Consolas, monospace";
      ctx.fillText(fmt(ws, 1) + " m/s", R, 14);
    }
    ctx.fillStyle = "rgba(255,255,255,.45)"; ctx.font = "600 9px 'IBM Plex Mono', Consolas, monospace";
    ctx.fillText("45 m", R, R + R * 0.5 - 7);
  },

  /* ---------------- Cesium ion anahtarı penceresi ---------------- */
  openKey(wantSrc) {
    const $ = (s) => document.querySelector(s);
    this.wantSrc = wantSrc || null;
    $("#wkInput").value = World.userToken();
    $("#wkRemove").hidden = !World.userToken();
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
    setTimeout(() => {
      this.closeKey();
      const to = this.wantSrc || "google";
      if (to !== World.src) World.setSource(to); else World.reloadViewer();
    }, 500);
  }
};
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); }
