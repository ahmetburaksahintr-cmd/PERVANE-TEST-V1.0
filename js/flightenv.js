/* =========================================================
   UÇUŞ ORTAMI – Hava yoğunluğu, rüzgâr ve batarya
   ---------------------------------------------------------
   Hava yoğunluğu (nemli hava, ideal gaz):
       ρ = p_d / (R_d · T) + p_v / (R_v · T)
       p_v = RH · p_doyma(T)   (Tetens: 6,1078 · 10^(7,5·t/(t+237,3)) hPa)
       R_d = 287,05 J/(kg·K), R_v = 461,5 J/(kg·K)
     Pervane itkisi ve gücü ρ ile doğru orantılıdır: Ankara (~900 m)
     deniz seviyesine göre aynı devirde yaklaşık %9 daha az itki verir.
     Rakımla basınç (ISA): p = 1013,25 · (1 − 2,25577·10⁻⁵ · h)^5,25588 hPa

   Rüzgâr:
     · Ortalama rüzgâr 10 m yükseklikte (açık arazide) verilir; yere
       yaklaştıkça logaritmik yasayla azalır: U(z) = U₁₀ · ln(z/z₀) / ln(10/z₀)
       (z₀ = pürüzlülük: açık arazide ~0,05 m)
     · Şehirde (kent örtüsü modeli): çevredeki binaların ortalama
       yüksekliği h, kayma yüksekliği d = 0,7·h, pürüzlülük z₀ = 0,1·h.
       Çatıların üstünde U(z) = (u* ÷ κ) · ln((z − d)/z₀): yükseldikçe artar.
       Binaların arasında (z < h) rüzgâr üstel olarak söner:
       U(z) = U(h) · e^(2,5·(z/h − 1))  → sokak seviyesinde çok zayıf.
       60 m'nin (ya da 2,5·h'nin) üstünde şehir ve açık arazi profili birleşir.
     · Hamleler (türbülans) birinci dereceden Gauss–Markov süreciyle
       (Dryden modelinin basit hâli) üretilir:
       du = −u/τ · dt + σ · √(2·dt/τ) · N(0,1),  τ = L/U, L ≈ 40 m
       σ, raporlanan hamle hızından: hamle ≈ U + 2,5·σ
     · Gerçek rüzgâr: Open-Meteo (açık kaynak, anahtarsız) o anki
       hava durumu; yön meteorolojik ("nereden esiyor") verilir.

   Batarya (LiPo / Li-ion):
     · Hücre açık devre voltajı şarj durumuna (SoC) bağlıdır (tablo).
     · Yük altında voltaj düşer: V = n · OCV(SoC) − I · R_iç
     · Akım: I = P_elektrik / V,  P_elektrik = 4 · P_pervane / η + P_aviyonik
     · Motorun ulaşabildiği devir voltajla orantılıdır (KV · V); dolu
       bataryada drone daha güçlüdür, boşaldıkça ve yük altında
       voltaj düştükçe zayıflar. Şarj bitince ESC motorları keser.
   ========================================================= */

const Env = {
  R_D: 287.05, R_V: 461.5,
  KEY: "pervane.ruzgar",
  PRESETS: { off: { u: 0, name: "Yok" }, light: { u: 3, name: "Hafif" }, moderate: { u: 7, name: "Orta" }, strong: { u: 12, name: "Sert" }, real: { u: 0, name: "Gerçek" } },
  windMode: "off",
  lab: { tC: 15, altM: 0 },          // laboratuvar ortamı (Ortam bölümündeki kaydırıcılar)
  real: null,                        // { tC, pHpa, rh, u, dirFrom, gust, elev, time, name }
  g: [0, 0, 0],                      // anlık hamle (m/s; doğu, yukarı, güney)

  /** Doymuş su buharı basıncı (hPa), Tetens denklemi */
  pSat(tC) { return 6.1078 * Math.pow(10, (7.5 * tC) / (tC + 237.3)); },
  /** Nemli havanın yoğunluğu (kg/m³) */
  density(tC, pHpa, rh = 0) {
    const T = tC + 273.15, pv = (Math.max(0, Math.min(100, rh)) / 100) * this.pSat(tC) * 100, p = pHpa * 100;
    return (p - pv) / (this.R_D * T) + pv / (this.R_V * T);
  },
  /** Standart atmosferde (ISA) rakıma göre basınç (hPa) */
  isaPressure(altM) { return 1013.25 * Math.pow(Math.max(0.2, 1 - 2.25577e-5 * altM), 5.25588); },

  /** Uygulanan hava: gerçek dünyada konumun gerçek havası (yoksa rakıma göre standart atmosfer), değilse laboratuvar ayarı */
  current() {
    const world = typeof World !== "undefined" && World.on && World.ready;
    if (world && this.real) return { tC: this.real.tC, pHpa: this.real.pHpa, rh: this.real.rh, rho: this.density(this.real.tC, this.real.pHpa, this.real.rh), src: "real", altM: this.real.elev };
    if (world) {
      const alt = World.src === "open" ? 0 : Math.max(0, World.h0 - 36);      // elipsoit yüksekliği → deniz seviyesinden (Türkiye'de geoit ≈ 36 m)
      const tC = 15 - 0.0065 * alt, pHpa = this.isaPressure(alt);
      return { tC, pHpa, rh: 0, rho: this.density(tC, pHpa, 0), src: "isa", altM: alt };
    }
    const pHpa = this.isaPressure(this.lab.altM);
    return { tC: this.lab.tC, pHpa, rh: 0, rho: this.density(this.lab.tC, pHpa, 0), src: "lab", altM: this.lab.altM };
  },
  /** Kalkış noktasından dz metre yukarıda yoğunluk oranı (ISA sıcaklık düşüşüyle) */
  rhoFactor(dzM) { return Math.pow(Math.max(0.5, 1 - 2.25577e-5 * Math.max(0, dzM)), 4.25588); },

  /** 10 m'deki rüzgâr: { u (m/s), dirFrom (°), gust (m/s) } */
  wind10() {
    if (this.windMode === "real") return this.real ? { u: this.real.u, dirFrom: this.real.dirFrom, gust: this.real.gust } : { u: 0, dirFrom: 0, gust: 0 };
    const u = (this.PRESETS[this.windMode] || this.PRESETS.off).u;
    return { u, dirFrom: 45, gust: u * 1.5 };                 // hazır ayarlar: poyraz (kuzeydoğudan)
  },
  /**
   * Rüzgâr hız oranı U(z) / U₁₀ (açık arazide 10 m'deki rüzgâra göre).
   * zM: yerden (arazi zemininden) yükseklik (m) · canopy: null = açık arazi, { hc: binaların ortalama yüksekliği (m) } = şehir
   */
  profile(zM, canopy) {
    const z0o = 0.05, ref = Math.log(10 / z0o), z = Math.max(0, zM);
    const open = (h) => Math.log(Math.max(h, z0o * 1.6) / z0o) / ref;
    const hc = canopy ? canopy.hc : 0;
    if (hc < 2) return Math.max(0.12, open(z + 0.3));                     // açık arazi ya da çok seyrek yapı
    const d = 0.7 * hc, z0 = Math.max(0.3, 0.1 * hc), zb = Math.max(60, 2.5 * hc);
    if (z >= zb) return open(z);                                            // şehrin etkisi bitti
    const s = open(zb) / Math.log((zb - d) / z0);
    if (z >= hc) return s * Math.log((z - d) / z0);                         // çatıların üstü
    return s * Math.log((hc - d) / z0) * Math.exp(2.5 * (z / hc - 1));      // binaların arası
  },
  /**
   * Drone'un bulunduğu yükseklikte rüzgâr (mm/s; three.js eksenleri: x doğu, y yukarı, z güney).
   * zM: yerden yükseklik (m) · canopy: çevredeki binalar (bkz. profile; true = ortalama bir şehir)
   */
  windAt(zM, dt, canopy) {
    const w = this.wind10(), out = this._w || (this._w = { x: 0, y: 0, z: 0 });
    if (w.u <= 0.05 && w.gust <= 0.05) { this.g = [0, 0, 0]; out.x = out.y = out.z = 0; this.lastF = 1; return out; }
    const f = Math.min(1.8, this.profile(zM, canopy === true ? { hc: 12 } : canopy));
    this.lastF = f;
    // Hamleler: binaların arasında da biraz girdap kalır, ama ortalama rüzgârla birlikte zayıflar
    const U = w.u * f, sigma = (Math.max(w.gust - w.u, w.u * 0.25) / 2.5) * Math.max(0.2, Math.min(1.2, f));
    const tau = Math.max(0.6, Math.min(8, 40 / Math.max(1, U)));
    const a = Math.exp(-dt / tau), b = sigma * Math.sqrt(1 - a * a), sv = [1, 0.5, 1];
    for (let i = 0; i < 3; i++) this.g[i] = this.g[i] * a + b * sv[i] * gauss();
    const toward = ((w.dirFrom + 180) * Math.PI) / 180;        // esme yönü (kuzeyden saat yönünde)
    out.x = (Math.sin(toward) * U + this.g[0]) * 1000;
    out.y = this.g[1] * 1000;
    out.z = (-Math.cos(toward) * U + this.g[2]) * 1000;
    return out;
  },

  /** Open-Meteo'dan konumun o anki havası (sıcaklık, basınç, nem, rüzgâr) */
  async fetchWeather(lat, lon, name) {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=ms&timezone=auto`;
    const r = await fetch(u, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error("Hava durumu alınamadı (" + r.status + ")");
    const j = await r.json(), c = j.current;
    this.real = { tC: c.temperature_2m, pHpa: c.surface_pressure, rh: c.relative_humidity_2m, u: c.wind_speed_10m, dirFrom: c.wind_direction_10m, gust: c.wind_gusts_10m, elev: j.elevation, time: c.time, name };
    return this.real;
  },
  /** Rüzgâr yönünün Türkçe kısaltması (nereden esiyor): K, KD, D, GD, G, GB, B, KB */
  dirName(deg) { return ["K", "KD", "D", "GD", "G", "GB", "B", "KB"][Math.round((((deg % 360) + 360) % 360) / 45) % 8]; },
  /** "kuzeyden", "kuzeybatıdan" … */
  dirFrom(deg) { return ["kuzeyden", "kuzeydoğudan", "doğudan", "güneydoğudan", "güneyden", "güneybatıdan", "batıdan", "kuzeybatıdan"][Math.round((((deg % 360) + 360) % 360) / 45) % 8]; }
};

/** Standart normal dağılımlı rastgele sayı (Box–Muller) */
function gauss() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const Battery = {
  // Hücre açık devre voltajı – şarj durumu (dinlenmiş hücre, tipik eğriler)
  LIPO: [[0, 3.3], [0.05, 3.55], [0.1, 3.68], [0.2, 3.74], [0.3, 3.78], [0.4, 3.82], [0.5, 3.85], [0.6, 3.89], [0.7, 3.95], [0.8, 4.02], [0.9, 4.1], [1, 4.2]],
  LIION: [[0, 3.0], [0.05, 3.3], [0.1, 3.42], [0.2, 3.52], [0.3, 3.59], [0.4, 3.64], [0.5, 3.69], [0.6, 3.76], [0.7, 3.84], [0.8, 3.93], [0.9, 4.05], [1, 4.2]],
  ETA: 0.75,           // motor + ESC verimi (kısmi yükte)
  AVIONICS: 7,         // uçuş kartı, alıcı, görüntü vericisi (W)

  /** Drone'un bataryası: kapasite metinden, hücre sayısı motordan */
  make(d, m) {
    const txt = (d && d.battery) || "", mah = Number((/(\d[\d.]*)\s*mAh/i.exec(txt) || [0, 1300])[1]) || 1300;
    const cells = (m && m.cells) || 4, liion = /li-?ion/i.test(txt);
    const rCell = 0.010 * Math.pow(1300 / mah, 0.8) * (liion ? 1.8 : 1);       // hücre iç direnci (Ω); küçük ve Li-ion hücrede büyük
    return { cells, mah, capAh: mah / 1000, r: cells * rCell + 0.004, liion, av: (d && d.avionicsW) || this.AVIONICS, soc: 1, v: cells * 4.2, i: 0, used: 0, t: 0, vScale: 1, lowWarned: false, empty: false };
  },
  ocv(b) {
    const T = b.liion ? this.LIION : this.LIPO, s = Math.max(0, Math.min(1, b.soc));
    for (let i = 1; i < T.length; i++) if (s <= T[i][0]) { const [s0, v0] = T[i - 1], [s1, v1] = T[i]; return v0 + ((v1 - v0) * (s - s0)) / (s1 - s0); }
    return T[T.length - 1][1];
  },
  /** dt saniyede pervanelerin çektiği mekanik güçle (W) bataryayı ilerletir; motor devir oranını (vScale) döndürür */
  update(b, dt, propPowerW, flying) {
    const n = b.cells, oc = n * this.ocv(b), Pe = propPowerW / this.ETA + (b.av || this.AVIONICS);
    let I = Pe / oc, V = oc;
    for (let k = 0; k < 4; k++) { V = Math.max(n * 2.6, oc - I * b.r); I = Pe / V; }
    b.v = V; b.i = I;
    if (!b.empty) {
      b.soc = Math.max(0, b.soc - (I * dt) / (b.capAh * 3600));
      b.used += (I * dt) / 3.6;                                  // mAh
      if (flying) b.t += dt;
    }
    if (b.soc <= 0.005) b.empty = true;
    // Devir voltajla orantılı; model "nominal" voltajı (3,7 V/hücre) esas alır
    b.vScale = b.empty ? 0 : Math.max(0, Math.min(1.16, V / (n * 3.7)));
    return b;
  },
  /** Gösterge yüzdesi (dinlenmiş voltaja göre değil, harcanan kapasiteye göre) */
  pct(b) { return Math.round(b.soc * 100); }
};
