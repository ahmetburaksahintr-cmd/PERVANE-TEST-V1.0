/* =========================================================
   UÇUŞ BÖLÜMÜ – Seçili drone'u klavye, gamepad ya da RC kumandayla uçurma
   ---------------------------------------------------------
   Dört uçuş modu vardır:

   · KOLAY   : yükseklik ve konum yardımlı. Çubuk/tuş bırakılınca drone
               olduğu yerde asılı kalır. Hız, en yüksek hızın %40'ıyla
               sınırlıdır (DJI'ın "Normal" moduna benzer).
   · ANGLE   : çubuklar eğim AÇISINI belirler (en çok 60°); bırakınca
               drone kendini düzler. Gaz elle verilir.
   · HORIZON : çubuklar ortadayken angle gibi düzler; çubuk %75'e
               yaklaştıkça acro'ya döner, takla atılabilir.
   · ACRO    : çubuklar dönüş HIZINI belirler (ortada 70°/sn duyarlılık,
               sonda 670°/sn); drone kendini düzlemez.
   Angle / horizon / acro değerleri Betaflight'ın varsayılanlarıdır.

   Fizik (angle, horizon, acro): drone tek bir gövdedir; itki gövdenin
   "yukarı" ekseni boyuncadır ve GERÇEK devirden, seçili pervane ve
   malzemenin itki eğrisinden gelir. Yer çekimi, hava direnci (hızın
   karesiyle) ve pervanenin ileri hızda itki kaybı (hatve hızı) hesaba
   katılır; bu yüzden her drone'un bir en yüksek hızı vardır. Zayıf
   pervane drone'u kaldıramaz, dayanıksız pervane havada kırılır.

   Tuşlar: W/S yunuslama (ileri/geri) · A/D yatış (sola/sağa)
           Z/X yön (sola/sağa dön) · E/Q gaz artır/azalt (kolay modda
           yüksel/alçal) · Boşluk gazı kes · H askı gazı · R baştan
           1–4 mod seç · V bakışı değiştir
   Birimler: milimetre, saniye (sahneyle aynı).

   Ortam (js/flightenv.js, sürüm 2.1):
   · Hava yoğunluğu: itki ve güç ρ ile orantılı; gerçek dünyada konumun
     o anki sıcaklık, basınç ve neminden, parkurda Ortam ayarından.
     Tırmandıkça ρ standart atmosfere göre azalır.
   · Rüzgâr ve hamleler: hava direnci havaya GÖRE hızdan (v − rüzgâr)
     hesaplanır. Kolay mod konumu tutmak için rüzgâra karşı eğilir;
     rüzgâr itkinin karşılayabileceğinden güçlüyse drone sürüklenir.
   · Batarya: voltaj şarjla ve yük altında düşer; motor devri voltajla
     orantılı olduğundan drone boşaldıkça zayıflar.
   · Yer etkisi (çok rotorlu, Sanchez-Cuevas 2017): pervane yere yakınken itki artar:
     T_YE / T = 1 / (1 − (R/4z)² − R²z/(d²+4z²)^1,5 − R²z/(2(2d²+4z²)^1,5) − 2R²z/(b²+4z²)^1,5)
   · Pervane girdabı (VRS): drone kendi aşağı akışının içine hızla
     dikey inerse (0,3–1,6 × askı indüklenmiş hızı v_h = √(T/(2ρA)))
     itki düşer ve gövde sarsılır; ileri uçarak ya da gaz vererek çıkılır.

   Gerçek dünya (js/world.js): zemin sabit 0 değildir; drone'un altındaki
   çatı ya da arazi yüksekliği "floor" olarak gelir. Binaya yandan hızlı
   çarpan drone çakılır, yavaş değerse geri seker.
   ========================================================= */

const Fly = {
  G: 9810,                    // yer çekimi (mm/s²)
  // Betaflight varsayılanları (pid.c, controlrate_profile.c)
  ANGLE_LIMIT: 60, ANGLE_GAIN: 5, HORIZON_STRENGTH: 0.75, HORIZON_STICKS: 0.75, HORIZON_DEGREES: 135,
  RATE_CENTER: 70, RATE_MAX: 670,
  IDLE: 0.08,                 // motorlar çalışırken en düşük gaz (rölanti)
  PITCH_SPEED_FACTOR: 1.3,    // pervane, geometrik hatve hızının yaklaşık %30 üstüne kadar itki üretir
  EASY_SPEED: 0.4,            // kolay modda hız sınırı: en yüksek hızın oranı
  FIELD: 450000, CEILING: 250000,                 // uçuş alanı yarıçapı ve tavan (mm)
  MODE_KEY: "pervane.ucusModu",
  MODES: { easy: "Kolay", angle: "Angle", horizon: "Horizon", acro: "Acro" },
  mode: "easy", keys: new Set(),
  p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(),
  yaw: 0, pitch: 0, roll: 0, thr: 0, hover: 0, auw: 0, inp: null,
  armed: false, crashed: false, needLow: false, noLift: false, hardLanded: false, air: false,
  time: 0, timing: false, done: false, passed: 0,
  hold: false, floor: 0,        // hold: gerçek dünya yüklenirken drone bekler · floor: altındaki zemin/çatı (mm)
  vScale: 1, kGE: 1, rhoK: 1, vrs: 0, capNow: 0, bat: null, wind: { x: 0, y: 0, z: 0 }, vh: 7,
  WORLD_FIELD: 2500000, WORLD_CEILING: 400000, LEGAL_ALT: 120000,

  // Eski adlarla erişim (gösterge ve testler)
  get x() { return this.p.x; }, set x(n) { this.p.x = n; },
  get y() { return this.p.y; }, set y(n) { this.p.y = n; },
  get z() { return this.p.z; }, set z(n) { this.p.z = n; },
  get vx() { return this.v.x; }, set vx(n) { this.v.x = n; },
  get vy() { return this.v.y; }, set vy(n) { this.v.y = n; },
  get vz() { return this.v.z; }, set vz(n) { this.v.z = n; },

  /** Drone'u pede geri koyar, halkaları ve süreyi sıfırlar */
  reset() {
    const world = this.inWorld();
    this.floor = world ? Math.max(0, World.floorAt(0, 0)) : 0;
    this.p.set(0, this.floor, 0); this.v.set(0, 0, 0); this.w.set(0, 0, 0);
    this.yaw = world ? World.startYaw || 0 : 0;
    this.q.setFromEuler(Fly._e.set(0, this.yaw, 0, "YXZ"));
    this.pitch = this.roll = this.thr = 0;
    this.wallWarned = 0; this.altWarned = false;
    this.bat = Battery.make(drone(), motor());          // yeni pervane = yeni (dolu) batarya
    this.vScale = 1; this.vrs = 0; this._vrsN = 0; Env.g = [0, 0, 0];
    this.armed = this.crashed = this.timing = this.done = this.noLift = this.needLow = this.air = this.boundsWarned = false;
    this.time = 0; this.passed = 0;
    Input.kbThr = 0;
    for (const g of Scene3D.flyGates || []) { g.passed = false; g.mesh.material.color.copy(g.base); g.mesh.material.emissive.copy(g.baseE); }
    this.push();
  },

  /** Uçuş modunu değiştirir (havadayken de olur) */
  setMode(m) {
    if (!this.MODES[m] || m === this.mode) return;
    const was = this.mode;
    this.mode = m;
    try { localStorage.setItem(this.MODE_KEY, m); } catch (e) { /* özel pencere: hatırlanmaz */ }
    if (was === "easy" && this.p.y > this.floor && !S.broken && !this.crashed) {
      // Havadayken yardımlı moddan çıkılıyor: motorlar çalışıyor sayılır, klavye gazı askı gazından başlar
      this.armed = true;
      Input.kbThr = this.hover || 0.3;
    }
    if (m === "easy") { this.pitch = this.roll = 0; this.w.set(0, 0, 0); }
  },

  /** Her karede çağrılır; S.throttle'ı ayarlar, konumu ve tutumu ilerletir */
  /** Gerçek dünya açık ve hazır mı */
  inWorld() { return typeof World !== "undefined" && World.on && World.ready; },

  step(dt) {
    const inp = (this.inp = Input.read(dt, this.mode));
    if (this.hold) { S.throttle = 0; this.v.set(0, 0, 0); this.push(); return; }
    const world = this.inWorld();
    this.floor = world ? World.floorAt(this.p.x, this.p.z) : 0;
    const curve = this.curve(), auw = drone().massG + 4 * curve.mass;
    this.auw = auw;
    this.env(dt, curve, auw, world);
    const kT = this.kGE * this.rhoK;
    this.hover = Math.max(0, Math.min(1, this.rFor(auw / kT, curve) / Math.max(0.05, this.vScale)));
    this.noLift = this.capNow < auw * 1.02;
    const px = this.p.x, py = this.p.y, pz = this.p.z;
    if (S.broken || this.crashed) this.stepFall(dt);
    else if (this.mode === "easy") this.stepEasy(dt, inp, curve, auw);
    else this.stepRate(dt, inp, curve, auw);
    // Gerçek dünya: binaya çarpma ve çatıya çıkma
    const p = this.p, v = this.v;
    if (world && !this.crashed && !S.broken) this.worldContact(px, py, pz);
    // Alan sınırı ve tavan
    const FIELD = world ? this.WORLD_FIELD : this.FIELD, CEIL = world ? this.WORLD_CEILING : this.CEILING, r = Math.hypot(p.x, p.z);
    if (r > FIELD) {
      const nx = p.x / r, nz = p.z / r, vn = v.x * nx + v.z * nz;
      p.x = nx * FIELD; p.z = nz * FIELD;
      if (vn > 0) { v.x -= 1.6 * vn * nx; v.z -= 1.6 * vn * nz; }
      if (!this.boundsWarned) { this.boundsWarned = true; log(`Alan sınırına ulaşıldı (${fmt(FIELD / 1000)} m); drone geri çevrildi.`, "warn"); }
    }
    if (p.y > CEIL) { p.y = CEIL; if (v.y > 0) v.y = 0; }
    if (world) {
      const agl = p.y - this.floor;
      if (agl > this.LEGAL_ALT && !this.altWarned) {
        this.altWarned = true;
        log("Yerden 120 m'nin üstündesin. Türkiye'de (SHGM) ve AB'de drone'lar yerden en çok 120 m yükseğe çıkabilir.", "warn");
        toast("120 m yasal yükseklik sınırı aşıldı", "warn");
      } else if (agl < this.LEGAL_ALT * 0.9) this.altWarned = false;
    }
    this.course(px, py, pz, dt);
    this.push();
  },

  /* ---------------- Kolay mod: yükseklik ve konum yardımlı ---------------- */
  stepEasy(dt, inp, curve, auw) {
    const p = this.p, v = this.v, cap = this.capNow, kT = this.kGE * this.rhoK, vs = Math.max(0.05, this.vScale);
    const maxSpeed = Math.max(2500, this.topSpeed(cap, auw) * this.EASY_SPEED), climb = Math.max(1500, Math.min(6000, maxSpeed * 0.4));
    this.thr = S.throttle;
    this.yaw -= inp.yaw * 2.3 * dt;                      // + = sağa (saat yönünde) döner
    const fx = Math.cos(this.yaw), fz = -Math.sin(this.yaw);     // burun yönü
    const rx = Math.sin(this.yaw), rz = Math.cos(this.yaw);      // sağ taraf
    const level = () => this.q.setFromEuler(Fly._e.set(this.roll, this.yaw, this.pitch, "YXZ"));
    const fl = this.floor;
    // Yerde ve kalkış istenmiyorsa: motorlar rölantide
    if (p.y <= fl && inp.climb <= 0.05) {
      v.set(0, 0, 0); p.y = fl;
      this.pitch += (0 - this.pitch) * Math.min(1, dt * 8); this.roll += (0 - this.roll) * Math.min(1, dt * 8);
      S.throttle = 0.1;
      this.air = false;
      return level();
    }
    // İstenen hız ve ona doğru yumuşak ivmelenme; yatay ivme itkinin izin verdiği kadar
    const norm = Math.max(1, Math.hypot(inp.pitch, inp.roll));
    const tvx = ((fx * inp.pitch + rx * inp.roll) / norm) * maxSpeed, tvz = ((fz * inp.pitch + rz * inp.roll) / norm) * maxSpeed, tvy = inp.climb * climb;
    // İstenen ivme (yer hızına göre); hava direnci havaya göre hızdan (rüzgâr dahil)
    const kc = Math.min(1, 1.8 * dt) / dt, wd = this.wind, kd = this.dragK(auw);
    const acx = (tvx - v.x) * kc, acz = (tvz - v.z) * kc;
    const relx = v.x - wd.x, relz = v.z - wd.z, rely = v.y - wd.y, rs = Math.hypot(relx, rely, relz), dg = 0.25 + (kd * rs) / 1000;
    const adx = -relx * dg, adz = -relz * dg, ady = -rely * dg;
    // İtkinin yatay bileşeni: istenen ivme − direnç; en çok aMax (eğim sınırı)
    const aMax = this.G * 0.6 * Math.sqrt(Math.max(0.04, Math.min(9, (cap / auw) ** 2 - 1)));
    let anx = acx - adx, anz = acz - adz;
    const an = Math.hypot(anx, anz);
    if (an > aMax) { anx *= aMax / an; anz *= aMax / an; }
    let dvx = (anx + adx) * dt, dvz = (anz + adz) * dt, dvy = (tvy - v.y) * Math.min(1, 3.2 * dt);
    // Pervane girdabı: hızlı dikey inişte itki kaybı ve sarsıntı (yardımlı modda yarı şiddette)
    const vrs = 0.5 * this.vrsLevel(-rely / 1000, Math.hypot(relx, relz) / 1000);
    this.vrs += (vrs - this.vrs) * Math.min(1, dt * 4);
    const ah = Math.hypot(anx, anz), av = dvy / dt - ady;
    const need = (auw * Math.max(0.25, Math.sqrt(1 + (ah / this.G) ** 2) + av / this.G)) / (1 - 0.28 * this.vrs);
    if (cap >= need) S.throttle = Math.max(0.1, Math.min(1, this.rFor(need / kT, curve) / vs));
    else { S.throttle = 1; dvy -= this.G * (1 - cap / need) * dt; }      // itki yetmiyor (zayıf pervane, boş batarya, sert rüzgâr): tam gaz, yine de alçalır
    v.x += dvx; v.z += dvz; v.y += dvy;
    const py = p.y;
    p.addScaledVector(v, dt);
    if (p.y <= fl) {                                     // yere (ya da çatıya) değdi
      if (v.y < -2600 && !this.hardLanded) { this.hardLanded = true; log("Sert iniş! Daha yavaş alçal.", "warn"); }
      p.y = fl; v.y = Math.max(0, v.y);
    } else if (p.y > fl + 30) { this.hardLanded = false; this.air = true; }
    // Görsel eğilme: gidilen yöne doğru yatar
    const vf = v.x * fx + v.z * fz, vr = v.x * rx + v.z * rz, kt = Math.min(1, dt * 6);
    // Eğim: itkinin yatay bileşeni yönünde (rüzgâra karşı tutunurken de eğilir); girdapta titrer
    const tf = (anx * fx + anz * fz) / this.G, tr = (anx * rx + anz * rz) / this.G, jit = this.vrs * 0.25;
    void vf; void vr;
    this.pitch += (-Math.atan(tf) * 0.9 + (Math.random() - 0.5) * jit - this.pitch) * kt;
    this.roll += (Math.atan(tr) * 0.9 - inp.yaw * 0.06 + (Math.random() - 0.5) * jit - this.roll) * kt;
    if (py <= fl && p.y > fl) this.armed = true;
    level();
  },

  /** Rüzgâr, irtifadaki hava yoğunluğu, batarya, yer etkisi; o anki güvenli en yüksek itki (capNow) */
  env(dt, curve, auw, world) {
    const agl = Math.max(0, (this.p.y - this.floor) / 1000), R = (S.prop.diameterIn * 0.0254) / 2;
    // Rüzgâr: gerçek dünyada çevredeki binaların yüksekliğine göre (binaların arasında kesilir, çatıların üstünde yükseldikçe artar);
    // yükseklik arazi zemininden ölçülür (çatının üstünde asılı drone sokak seviyesinde sayılmaz)
    let can = null, zW = agl;
    if (world) {
      const c = World.windCanopy(this.p.x / 1000, -this.p.z / 1000);
      if (c) { can = c; zW = Math.max(0, this.p.y / 1000 - c.ground); }
      else can = true;                                  // bina verisi yok (Google 3D): ortalama bir şehir
    }
    this.canopy = can;
    this.wind = Env.windAt(zW, dt, can);
    this.rhoK = Env.rhoFactor(this.p.y / 1000);
    if (!this.bat) this.bat = Battery.make(drone(), motor());
    const flying = this.p.y > this.floor + 30 && !this.crashed && !S.broken;
    Battery.update(this.bat, dt, S.lastEval && S.rpm > 50 ? 4 * S.lastEval.power : 0, flying);
    this.vScale = this.bat.vScale;
    if (this.bat.empty && !this.batEmptyLogged) { this.batEmptyLogged = true; log("Batarya bitti: ESC motorları kesti. R tuşu yeni batarya takar.", "bad"); toast("Batarya bitti", "bad"); }
    else if (this.bat.soc < 0.2 && !this.bat.lowWarned) { this.bat.lowWarned = true; log(`Batarya %${Battery.pct(this.bat)}: hücre başına ${fmt(this.bat.v / this.bat.cells, 2)} V. İnişe geç.`, "warn"); toast("Batarya azaldı: inişe geç", "warn"); }
    if (!this.bat.empty) this.batEmptyLogged = false;
    // Yer etkisi, çok rotorlu model (Sanchez-Cuevas vd., 2017): tek pervane terimi (Cheeseman–Bennett)
    // + komşu ve çapraz pervanelerin + gövdenin yerden yansıyan akışı. d: komşu motor arası, b: çapraz (m), Kb ≈ 2
    const z = agl + 0.04, b = (drone().wheelbaseMm || 225) / 1000, d = b / Math.SQRT2, R2z = R * R * z;
    const ge = (R / (4 * z)) ** 2 + R2z / Math.pow(d * d + 4 * z * z, 1.5) + R2z / (2 * Math.pow(2 * d * d + 4 * z * z, 1.5)) + (2 * R2z) / Math.pow(b * b + 4 * z * z, 1.5);
    this.kGE = 1 / (1 - Math.min(0.35, ge));
    // Askıda indüklenmiş hız (pervane başına itki = ağırlık / 4)
    this.vh = Math.sqrt(((auw / 1000) * 9.81) / 4 / (2 * Physics.rho * this.rhoK * Math.PI * R * R));
    const rMax = Math.min(1.2, this.vScale);
    this.capNow = this.thrustAt(Math.min(rMax, curve.capR), curve) * this.kGE * this.rhoK;
  },
  /** Pervane girdabı şiddeti (0–1): dikey iniş hızı (m/s, + aşağı) ve yatay hava hızına (m/s) göre */
  vrsLevel(vd, vhoriz) {
    const x = vd / this.vh;
    return smoothstep(0.25, 0.6, x) * (1 - smoothstep(1.3, 1.9, x)) * (1 - smoothstep(0.35, 0.8, vhoriz / this.vh));
  },

  /**
   * Gerçek dünya teması: yeni konumun altındaki zemin, eski yükseklikten 1,5 m'den fazla yüksekse orası bir duvardır.
   * Yatay hız 6 m/sn'yi (kolay modda 10 m/sn'yi) geçiyorsa drone çakılır; geçmiyorsa geri seker.
   */
  worldContact(px, py, pz) {
    const p = this.p, v = this.v, f2 = World.floorAt(p.x, p.z);
    if (f2 > Math.max(py, this.floor) + 1500 && f2 > p.y) {
      const hs = Math.hypot(v.x, v.z);
      p.x = px; p.z = pz;
      if (hs > (this.mode === "easy" ? 10000 : 6000)) { this.crash(0, hs, "binaya"); return; }
      v.x *= -0.3; v.z *= -0.3;
      if (performance.now() - (this.wallWarned || 0) > 2500) { this.wallWarned = performance.now(); toast("Binaya değdin", "warn"); }
      return;
    }
    if (f2 > p.y) { p.y = f2; if (v.y < 0) v.y = 0; }              // kaldırım, yokuş, çatı kenarı: drone zemine oturur
    this.floor = f2;
  },

  /* ---------------- Angle / Horizon / Acro: gerçek uçuş dinamiği ---------------- */
  stepRate(dt, inp, curve, auw) {
    // Gaz: yaysız kolda 0..1; yaylı çubukta orta = askı gazı (yerde ve çubuk ortada/aşağıdaysa rölanti)
    let thr = inp.centered ? (inp.thrRaw >= 0 ? this.hover + inp.thrRaw * (1 - this.hover) : this.hover * (1 + inp.thrRaw)) : inp.thr;
    if (inp.centered && this.p.y <= this.floor && inp.thrRaw <= 0.05) thr = 0;
    thr = Math.max(0, Math.min(1, thr));
    this.thr = thr;
    if (!this.armed) {
      // Motorlar ancak gaz en alttayken çalışır (gerçek kumandalardaki güvenlik kuralı)
      this.needLow = thr > 0.05;
      if (this.needLow) { S.throttle = 0; return; }
      this.armed = true;
    }
    S.throttle = Math.max(this.IDLE, thr);
    const T = this.thrustAt(S.rpm / Math.max(1, maxRpm()), curve) * this.kGE * this.rhoK;   // gerçek devirdeki toplam itki (g): yer etkisi ve irtifa dahil
    const n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n;           // küçük adımlarla: hızlı dönüşlerde kararlı
    for (let i = 0; i < n; i++) if (this.integrate(h, inp, T, auw)) break;
  },

  /** Bir zaman adımı. Çakılma olursa true döner. */
  integrate(h, inp, T, auw) {
    const q = this.q, w = this.w, v = this.v, p = this.p, D = Math.PI / 180, A = Fly._a, B = Fly._b, Cv = Fly._c, Dv = Fly._d, Q = Fly._q;
    const up = A.set(0, 1, 0).applyQuaternion(q), fwd = B.set(1, 0, 0).applyQuaternion(q);
    if (fwd.x * fwd.x + fwd.z * fwd.z > 0.02) this.yaw = Math.atan2(-fwd.z, fwd.x);
    // Çubuk → dönüş hızı (Betaflight "actual rates", expo 0): ortada 70°/sn duyarlılık, sonda 670°/sn
    const rate = (s) => (this.RATE_CENTER * s + (this.RATE_MAX - this.RATE_CENTER) * s * Math.abs(s)) * D;
    const rr = rate(inp.roll), rp = rate(inp.pitch);
    let cx = rr, cz = -rp;                               // gövde eksenleri: x ileri (yatış), z sağ (yunuslama; burun aşağı = −)
    const cy = -rate(inp.yaw);                           // y yukarı (yön; sağa dönüş = −)
    if (this.mode !== "acro") {
      // Hedef eğim = açı sınırı × (hız eğrisi ÷ en yüksek hız); hedefe dönüş hızı = hata × kazanç
      const lim = this.ANGLE_LIMIT * D, phi = (lim * rr) / (this.RATE_MAX * D), th = (lim * rp) / (this.RATE_MAX * D);
      const cyw = Math.cos(this.yaw), syw = Math.sin(this.yaw);
      const ux = Math.cos(phi) * Math.sin(th), uy = Math.cos(phi) * Math.cos(th), uz = Math.sin(phi);
      const des = Cv.set(ux * cyw + uz * syw, uy, -ux * syw + uz * cyw);       // istenen "yukarı" yönü (dünya)
      const e = Dv.crossVectors(up, des), s = e.length(), c = up.dot(des);
      let lx = 0, lz = 0;
      if (s > 1e-5) {
        e.multiplyScalar(Math.atan2(s, c) / s).applyQuaternion(Q.copy(q).invert());   // hata dönüşü, gövde eksenlerinde
        lx = this.ANGLE_GAIN * e.x; lz = this.ANGLE_GAIN * e.z;
      } else if (c < 0) lx = this.ANGLE_GAIN * Math.PI;                               // tam ters: yatış ekseninde döner
      if (this.mode === "angle") { cx = lx; cz = lz; }
      else {
        // Horizon: düzleme gücü çubuk %75'e ve eğim 135°'ye yaklaştıkça sıfıra iner
        const stick = Math.max(Math.abs(inp.roll), Math.abs(inp.pitch)), incl = Math.acos(Math.max(-1, Math.min(1, up.y))) / D;
        const sL = this.HORIZON_STRENGTH * Math.max(0, Math.min(1 - stick / this.HORIZON_STICKS, 1 - incl / this.HORIZON_DEGREES));
        cx = cx * (1 - sL) + lx * sL; cz = cz * (1 - sL) + lz * sL;
      }
    }
    // Kumanda otoritesi itkiyle gelir: motorlar itki üretmiyorsa drone dönemez
    const k = (1 - Math.exp(-h / 0.045)) * Math.min(1, T / (0.2 * auw));
    w.x += (cx - w.x) * k; w.y += (cy - w.y) * k; w.z += (cz - w.z) * k;
    const wm = w.length();
    if (wm > 1e-6) q.multiply(Q.setFromAxisAngle(Dv.copy(w).multiplyScalar(1 / wm), wm * h)).normalize();
    // Kuvvetler: itki (ileri hava hızında azalır), yer çekimi, hava direnci (havaya göre hızla: rüzgâr ve hamleler)
    up.set(0, 1, 0).applyQuaternion(q);
    const wd = this.wind, rx = v.x - wd.x, ry = v.y - wd.y, rz = v.z - wd.z;
    const vAx = (rx * up.x + ry * up.y + rz * up.z) / 1000, vp = Math.max(1, this.pitchSpeed(S.rpm));   // m/s
    // Pervane girdabı: kendi aşağı akışının içine dikey iniş
    const vhz = Math.sqrt(Math.max(0, (rx * rx + ry * ry + rz * rz) / 1e6 - vAx * vAx));
    const vrs = this.vrsLevel(-vAx, vhz);
    this.vrs += (vrs - this.vrs) * Math.min(1, h * 4);
    this._vrsN = this._vrsN * 0.92 + (Math.random() - 0.5) * 0.16;
    const acc = ((T * (1 - this.vrs * (0.28 + this._vrsN)) * Math.max(0, Math.min(1, 1 - Math.max(0, vAx) / vp))) / auw) * this.G;
    if (this.vrs > 0.05) { w.x += (Math.random() - 0.5) * 60 * this.vrs * h; w.z += (Math.random() - 0.5) * 60 * this.vrs * h; }
    const drag = 0.25 + (this.dragK(auw) * Math.hypot(rx, ry, rz)) / 1000;              // 1/sn
    v.x += (up.x * acc - rx * drag) * h;
    v.y += (up.y * acc - this.G - ry * drag) * h;
    v.z += (up.z * acc - rz * drag) * h;
    p.addScaledVector(v, h);
    const fl = this.floor;
    if (p.y > fl) { if (p.y > fl + 30) { this.air = true; this.hardLanded = false; } return false; }
    // Yer teması
    const tilt = Math.acos(Math.max(-1, Math.min(1, up.y))), vy = v.y, hs = Math.hypot(v.x, v.z);
    if (this.air && (vy < -4500 || hs > 9000 || (tilt > 1.1 && (hs > 1500 || vy < -1500)))) { this.crash(vy, hs); return true; }
    if (this.air && vy < -2600 && !this.hardLanded) { this.hardLanded = true; log("Sert iniş! Gazı daha yavaş kıs.", "warn"); }
    p.y = fl;
    if (v.y < 0) v.y = 0;
    const f = Math.pow(0.02, h);                          // yerde sürtünme
    v.x *= f; v.z *= f;
    if (acc * up.y < this.G) { w.set(0, 0, 0); q.slerp(Q.setFromAxisAngle(Dv.set(0, 1, 0), this.yaw), Math.min(1, h * 12)); }   // yerde düz durur
    this.air = false;
    return false;
  },

  /** Yere sert ya da yan çarpma */
  crash(vy, hs, what) {
    this.crashed = true; this.armed = false; this.timing = false;
    if (!what) this.p.y = this.floor;
    this.v.set(0, 0, 0); this.w.set(0, 0, 0);
    S.throttle = 0;
    log(`Çakıldı: ${what || "yere"} ${fmt(Math.hypot(vy, hs) * 0.0036)} km/sa hızla çarptı. R tuşu ya da “Yeni pervane tak” ile yeniden başla.`, "bad");
    toast("Çakıldı. Yeniden başlamak için R tuşuna bas.", "bad");
    if (typeof Sound !== "undefined") Sound.crack();
  },

  /** Pervane kırıldı ya da çakıldı: itki yok, drone takla atarak düşer ve yerde kalır */
  stepFall(dt) {
    const p = this.p, v = this.v, Q = Fly._q, Dv = Fly._d;
    S.throttle = 0;
    this.armed = false;
    const fl = this.floor;
    if (p.y > fl) {
      v.y -= this.G * dt;
      v.x *= Math.pow(0.5, dt); v.z *= Math.pow(0.5, dt);
      p.addScaledVector(v, dt);
      this.q.multiply(Q.setFromAxisAngle(Dv.set(0.83, 0.36, 0.43), 8 * dt)).normalize();
      if (p.y <= fl) { p.y = fl; v.set(0, 0, 0); }
    } else {
      v.set(0, 0, 0);
      if (S.broken) this.q.slerp(Q.setFromEuler(Fly._e.set(0.22, this.yaw, 0, "YXZ")), Math.min(1, dt * 8));   // yan yatmış durur
    }
    this.crashed = true;
    this.timing = false;
  },

  /** Süre ve halkalar */
  course(px, py, pz, dt) {
    const p = this.p;
    if (!this.timing && !this.done && !this.crashed && py <= this.floor && p.y > this.floor) { this.timing = true; this.time = 0; }
    if (this.timing) this.time += dt;
    const by = Scene3D.droneBaseY || 0;
    for (const g of Scene3D.flyGates || []) {
      if (g.passed) continue;
      const a = (px - g.c.x) * g.n.x + (pz - g.c.z) * g.n.z, b = (p.x - g.c.x) * g.n.x + (p.z - g.c.z) * g.n.z;
      if (a * b > 0) continue;                            // halka düzlemini geçmedi
      if (Math.hypot(p.x - g.c.x, p.y + by - g.c.y, p.z - g.c.z) > g.r) continue;
      g.passed = true; this.passed++;
      g.mesh.material.color.set(0x22c55e); g.mesh.material.emissive.set(0x14532d);
      const total = Scene3D.flyGates.length;
      if (this.passed === total) {
        this.timing = false; this.done = true;
        log(`Tüm halkalar geçildi: ${fmt(this.time, 1)} saniye (${drone().short}, ${mat().name} pervane, ${this.MODES[this.mode]} modu${this.inWorld() && World.place ? ", " + World.place.name : ""})`, "ok");
        toast(`Parkur tamam: ${fmt(this.time, 1)} sn`, "ok");
      } else toast(`Halka ${this.passed}/${total}`, "ok");
    }
  },

  /**
   * İtki eğrisi: gaz (0–1) → 4 pervanenin toplam itkisi. Esnek pervanede itki devirle düz artmaz
   * (aşırı esneme itkiyi düşürür), bu yüzden eğri taranır. cap: pervane kırılmadan ulaşılan en yüksek itki.
   * Ayarlar değişmedikçe yeniden hesaplanmaz.
   */
  curve() {
    const geo = Physics.geometry(S.prop), deform = S.plastic / (geo.R * 1000);
    const key = [S.droneKey, S.matKey, S.motorKey, S.tempC, deform.toFixed(3), JSON.stringify(S.prop), Physics.rho.toFixed(3)].join("|");
    if (this._key === key) return this._curve;
    const top = maxRpm(), pts = [];
    let cap = 0, capR = 1.2, mass = 0, broke = false;
    for (let i = 1; i <= 192; i++) {
      const ev = Physics.evaluate({ mat: mat(), motor: motor(), prop: S.prop, rpm: (top * i) / 160, tempC: S.tempC, deform });
      const total = ev.thrustG * 4;
      if (ev.sigma < ev.strength && !broke) { if (i <= 160) cap = Math.max(cap, total); }
      else if (!broke) { broke = true; capR = (i - 1) / 160; }
      pts.push([i / 160, total]);
      mass = ev.mass;
    }
    this._key = key;
    this._top = {};
    return (this._curve = { pts, cap, capR, mass });
  },
  /** Gereken toplam itkiyi veren en düşük devir oranı (devir / en yüksek devir; iki nokta arasında doğrusal) */
  rFor(need, curve) {
    let pt = 0, pv = 0;
    for (const [t, v] of curve.pts) {
      if (v >= need) return pt + ((t - pt) * (need - pv)) / Math.max(1e-6, v - pv);
      pt = t; pv = v;
    }
    return 1.2;
  },
  /** Verilen devir oranındaki (0–1,2) toplam itki; kırık pervanede bir motor %25 verir */
  thrustAt(frac, curve) {
    const n = curve.pts.length, x = Math.max(0, Math.min(n / 160, frac)) * 160, i = Math.floor(x);
    const a = i > 0 ? curve.pts[i - 1][1] : 0, b = i < n ? curve.pts[i][1] : curve.pts[n - 1][1];
    return (a + (b - a) * (x - i)) * (S.broken ? 3.25 / 4 : 1);
  },
  /** Pervanenin itki üretebildiği en yüksek ileri hız (m/s): hatve × devir, biraz fazlası */
  pitchSpeed(rpm) { return ((S.prop.pitchIn * 0.0254 * rpm) / 60) * this.PITCH_SPEED_FACTOR; },
  /** Hava direnci katsayısı: ivme = k × hız² (hız m/s, ivme m/s²). Alan, drone'un genişliğinin karesiyle orantılı alınır. */
  dragK(auw) {
    const d = drone(), span = (Scene3D.droneSpan || 150) / 1000, cda = d.cda != null ? d.cda : (d.cdaK || 0.8) * span * span;
    return (0.5 * Physics.rho * this.rhoK * cda) / (auw / 1000);
  },
  /**
   * Düz uçuşta ulaşılabilen en yüksek hız (mm/s). Tam gazda drone α kadar eğilir: itkinin dikey bileşeni
   * ağırlığı, yatay bileşeni hava direncini karşılar; itki ileri hızla azalır. Denge noktası ikiye bölmeyle bulunur.
   */
  topSpeed(T0, auw) {
    const key = Math.round(T0 / Math.max(1, auw) * 200) + "|" + Math.round(this.vScale * 50);
    const memo = this._top || (this._top = {});
    if (memo[key] != null) return memo[key];
    const curve = { top: null };
    const vp = Math.max(1, this.pitchSpeed(maxRpm() * Math.min(1.2, this.vScale))), kd = this.dragK(auw);
    const done = (x) => (memo[key] = curve.top = x);
    if (T0 <= auw * 1.02) return done(0);
    const speedAt = (a) => ((1 - auw / Math.cos(a) / T0) * vp) / Math.sin(a);                 // bu eğimde ulaşılan hız (m/s)
    const excess = (a) => { const sp = speedAt(a); return (0.25 * sp + kd * sp * sp) / 9.81 - Math.tan(a); };   // direnç − yatay itki
    let lo = 0.02, hi = Math.acos(auw / T0) - 1e-4;
    if (excess(lo) < 0) return done(speedAt(lo) * 1000);
    for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (excess(mid) > 0) lo = mid; else hi = mid; }
    return done(speedAt((lo + hi) / 2) * 1000);
  },

  /** Konumu ve tutumu 3D sahneye bildirir */
  push() { Scene3D.flyPose = { x: this.p.x, y: this.p.y, z: this.p.z, q: this.q, yaw: this.yaw, crashed: this.crashed }; },
  speedKmh() { return this.v.length() * 0.0036; },
  topSpeedKmh() { const c = this.curve(); return this.topSpeed(this.capNow || c.cap, drone().massG + 4 * c.mass) * 0.0036; }
};
// Geçici hesap nesneleri (her karede yeniden yaratılmasın)
Fly._a = new THREE.Vector3(); Fly._b = new THREE.Vector3(); Fly._c = new THREE.Vector3(); Fly._d = new THREE.Vector3();
Fly._q = new THREE.Quaternion(); Fly._e = new THREE.Euler();

/* Klavye: yalnızca uçuş bölümünde, laboratuvar sekmesinde ve yazı kutusu/liste odakta değilken */
function flyKey(e, down) {
  if (typeof S === "undefined" || S.rig !== "fly" || (S.page && S.page !== "lab")) return;
  const hold = ["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "KeyZ", "KeyX"], once = ["KeyR", "Space", "KeyH", "KeyV", "Digit1", "Digit2", "Digit3", "Digit4"];
  if (!hold.includes(e.code) && !once.includes(e.code)) return;
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  const t = e.target;
  if (t && (t.tagName === "SELECT" || t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && !["range", "checkbox", "button"].includes(t.type)))) return;
  e.preventDefault();
  if (hold.includes(e.code)) { if (down) Fly.keys.add(e.code); else Fly.keys.delete(e.code); return; }
  if (!down || e.repeat) return;
  if (e.code === "KeyR") newProp("Drone kalkış noktasına döndü");
  else if (e.code === "Space") Input.kbThr = 0;                       // gazı kes
  else if (e.code === "KeyH") Input.kbThr = Fly.hover || 0.3;         // askı gazı
  else if (e.code === "KeyV") document.querySelector("#viewBtn").click();
  else setFlyMode(["easy", "angle", "horizon", "acro"][Number(e.code.slice(5)) - 1]);
}
document.addEventListener("keydown", (e) => flyKey(e, true));
document.addEventListener("keyup", (e) => flyKey(e, false));
window.addEventListener("blur", () => Fly.keys.clear());
