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

  // Eski adlarla erişim (gösterge ve testler)
  get x() { return this.p.x; }, set x(n) { this.p.x = n; },
  get y() { return this.p.y; }, set y(n) { this.p.y = n; },
  get z() { return this.p.z; }, set z(n) { this.p.z = n; },
  get vx() { return this.v.x; }, set vx(n) { this.v.x = n; },
  get vy() { return this.v.y; }, set vy(n) { this.v.y = n; },
  get vz() { return this.v.z; }, set vz(n) { this.v.z = n; },

  /** Drone'u pede geri koyar, halkaları ve süreyi sıfırlar */
  reset() {
    this.p.set(0, 0, 0); this.v.set(0, 0, 0); this.w.set(0, 0, 0); this.q.identity();
    this.yaw = this.pitch = this.roll = this.thr = 0;
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
    if (was === "easy" && this.p.y > 0 && !S.broken && !this.crashed) {
      // Havadayken yardımlı moddan çıkılıyor: motorlar çalışıyor sayılır, klavye gazı askı gazından başlar
      this.armed = true;
      Input.kbThr = this.hover || 0.3;
    }
    if (m === "easy") { this.pitch = this.roll = 0; this.w.set(0, 0, 0); }
  },

  /** Her karede çağrılır; S.throttle'ı ayarlar, konumu ve tutumu ilerletir */
  step(dt) {
    const inp = (this.inp = Input.read(dt, this.mode));
    const curve = this.curve(), auw = drone().massG + 4 * curve.mass;
    this.auw = auw;
    this.hover = curve.cap >= auw ? this.throttleFor(auw, curve) : 1;
    this.noLift = curve.cap < auw * 1.02;
    const px = this.p.x, py = this.p.y, pz = this.p.z;
    if (S.broken || this.crashed) this.stepFall(dt);
    else if (this.mode === "easy") this.stepEasy(dt, inp, curve, auw);
    else this.stepRate(dt, inp, curve, auw);
    // Alan sınırı ve tavan
    const p = this.p, v = this.v, r = Math.hypot(p.x, p.z);
    if (r > this.FIELD) {
      const nx = p.x / r, nz = p.z / r, vn = v.x * nx + v.z * nz;
      p.x = nx * this.FIELD; p.z = nz * this.FIELD;
      if (vn > 0) { v.x -= 1.6 * vn * nx; v.z -= 1.6 * vn * nz; }
      if (!this.boundsWarned) { this.boundsWarned = true; log(`↩️ Alan sınırına ulaşıldı (${fmt(this.FIELD / 1000)} m); drone geri çevrildi.`, "warn"); }
    }
    if (p.y > this.CEILING) { p.y = this.CEILING; if (v.y > 0) v.y = 0; }
    this.course(px, py, pz, dt);
    this.push();
  },

  /* ---------------- Kolay mod: yükseklik ve konum yardımlı ---------------- */
  stepEasy(dt, inp, curve, auw) {
    const p = this.p, v = this.v, cap = curve.cap;
    const maxSpeed = Math.max(2500, this.topSpeed(curve, auw) * this.EASY_SPEED), climb = Math.max(1500, Math.min(6000, maxSpeed * 0.4));
    this.thr = S.throttle;
    this.yaw -= inp.yaw * 2.3 * dt;                      // + = sağa (saat yönünde) döner
    const fx = Math.cos(this.yaw), fz = -Math.sin(this.yaw);     // burun yönü
    const rx = Math.sin(this.yaw), rz = Math.cos(this.yaw);      // sağ taraf
    const level = () => this.q.setFromEuler(Fly._e.set(this.roll, this.yaw, this.pitch, "YXZ"));
    // Yerde ve kalkış istenmiyorsa: motorlar rölantide
    if (p.y <= 0 && inp.climb <= 0.05) {
      v.set(0, 0, 0); p.y = 0;
      this.pitch += (0 - this.pitch) * Math.min(1, dt * 8); this.roll += (0 - this.roll) * Math.min(1, dt * 8);
      S.throttle = 0.1;
      this.air = false;
      return level();
    }
    // İstenen hız ve ona doğru yumuşak ivmelenme; yatay ivme itkinin izin verdiği kadar
    const norm = Math.max(1, Math.hypot(inp.pitch, inp.roll));
    const tvx = ((fx * inp.pitch + rx * inp.roll) / norm) * maxSpeed, tvz = ((fz * inp.pitch + rz * inp.roll) / norm) * maxSpeed, tvy = inp.climb * climb;
    let dvx = (tvx - v.x) * Math.min(1, 1.8 * dt), dvz = (tvz - v.z) * Math.min(1, 1.8 * dt), dvy = (tvy - v.y) * Math.min(1, 3.2 * dt);
    const aMax = this.G * 0.6 * Math.sqrt(Math.max(0.04, Math.min(9, (cap / auw) ** 2 - 1))), dvh = Math.hypot(dvx, dvz);
    if (dvh > aMax * dt) { dvx *= (aMax * dt) / dvh; dvz *= (aMax * dt) / dvh; }
    // Yük katsayısı: yatay ivme + hava direnci için eğilme, dikey ivme → gereken itki
    const sp = Math.hypot(v.x, v.z), ah = Math.hypot(dvx, dvz) / dt + sp * (0.25 + (this.dragK(auw) * sp) / 1000), av = dvy / dt;
    const need = auw * Math.max(0.25, Math.sqrt(1 + (ah / this.G) ** 2) + av / this.G);
    if (cap >= need) S.throttle = Math.max(0.1, this.throttleFor(need, curve));
    else { S.throttle = 1; dvy -= this.G * (1 - cap / need) * dt; }      // itki yetmiyor: tam gaz, yine de alçalır
    v.x += dvx; v.z += dvz; v.y += dvy;
    const py = p.y;
    p.addScaledVector(v, dt);
    if (p.y <= 0) {                                      // yere değdi
      if (v.y < -2600 && !this.hardLanded) { this.hardLanded = true; log("🛬 Sert iniş! Daha yavaş alçal.", "warn"); }
      p.y = 0; v.y = Math.max(0, v.y);
    } else if (p.y > 30) { this.hardLanded = false; this.air = true; }
    // Görsel eğilme: gidilen yöne doğru yatar
    const vf = v.x * fx + v.z * fz, vr = v.x * rx + v.z * rz, kt = Math.min(1, dt * 6);
    this.pitch += (-0.5 * (vf / maxSpeed) - this.pitch) * kt;
    this.roll += (0.5 * (vr / maxSpeed) - inp.yaw * 0.06 - this.roll) * kt;
    if (py <= 0 && p.y > 0) this.armed = true;
    level();
  },

  /* ---------------- Angle / Horizon / Acro: gerçek uçuş dinamiği ---------------- */
  stepRate(dt, inp, curve, auw) {
    // Gaz: yaysız kolda 0..1; yaylı çubukta orta = askı gazı (yerde ve çubuk ortada/aşağıdaysa rölanti)
    let thr = inp.centered ? (inp.thrRaw >= 0 ? this.hover + inp.thrRaw * (1 - this.hover) : this.hover * (1 + inp.thrRaw)) : inp.thr;
    if (inp.centered && this.p.y <= 0 && inp.thrRaw <= 0.05) thr = 0;
    thr = Math.max(0, Math.min(1, thr));
    this.thr = thr;
    if (!this.armed) {
      // Motorlar ancak gaz en alttayken çalışır (gerçek kumandalardaki güvenlik kuralı)
      this.needLow = thr > 0.05;
      if (this.needLow) { S.throttle = 0; return; }
      this.armed = true;
    }
    S.throttle = Math.max(this.IDLE, thr);
    const T = this.thrustAt(S.rpm / Math.max(1, maxRpm()), curve);      // gerçek devirdeki toplam itki (g)
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
    // Kuvvetler: itki (ileri hızda azalır), yer çekimi, hava direnci
    up.set(0, 1, 0).applyQuaternion(q);
    const vAx = v.dot(up) / 1000, vp = Math.max(1, this.pitchSpeed(S.rpm));            // m/s
    const acc = ((T * Math.max(0, Math.min(1, 1 - Math.max(0, vAx) / vp))) / auw) * this.G;
    const drag = 0.25 + (this.dragK(auw) * v.length()) / 1000;                          // 1/sn
    v.x += (up.x * acc - v.x * drag) * h;
    v.y += (up.y * acc - this.G - v.y * drag) * h;
    v.z += (up.z * acc - v.z * drag) * h;
    p.addScaledVector(v, h);
    if (p.y > 0) { if (p.y > 30) { this.air = true; this.hardLanded = false; } return false; }
    // Yer teması
    const tilt = Math.acos(Math.max(-1, Math.min(1, up.y))), vy = v.y, hs = Math.hypot(v.x, v.z);
    if (this.air && (vy < -4500 || hs > 9000 || (tilt > 1.1 && (hs > 1500 || vy < -1500)))) { this.crash(vy, hs); return true; }
    if (this.air && vy < -2600 && !this.hardLanded) { this.hardLanded = true; log("🛬 Sert iniş! Gazı daha yavaş kıs.", "warn"); }
    p.y = 0;
    if (v.y < 0) v.y = 0;
    const f = Math.pow(0.02, h);                          // yerde sürtünme
    v.x *= f; v.z *= f;
    if (acc * up.y < this.G) { w.set(0, 0, 0); q.slerp(Q.setFromAxisAngle(Dv.set(0, 1, 0), this.yaw), Math.min(1, h * 12)); }   // yerde düz durur
    this.air = false;
    return false;
  },

  /** Yere sert ya da yan çarpma */
  crash(vy, hs) {
    this.crashed = true; this.armed = false; this.timing = false;
    this.p.y = 0; this.v.set(0, 0, 0); this.w.set(0, 0, 0);
    S.throttle = 0;
    log(`💥 Çakıldı: yere ${fmt(Math.hypot(vy, hs) * 0.0036)} km/sa hızla çarptı. R tuşu ya da “Yeni pervane tak” ile yeniden başla.`, "bad");
    toast("💥 Çakıldı. Yeniden başlamak için R tuşuna bas.", "bad");
    if (typeof Sound !== "undefined") Sound.crack();
  },

  /** Pervane kırıldı ya da çakıldı: itki yok, drone takla atarak düşer ve yerde kalır */
  stepFall(dt) {
    const p = this.p, v = this.v, Q = Fly._q, Dv = Fly._d;
    S.throttle = 0;
    this.armed = false;
    if (p.y > 0) {
      v.y -= this.G * dt;
      v.x *= Math.pow(0.5, dt); v.z *= Math.pow(0.5, dt);
      p.addScaledVector(v, dt);
      this.q.multiply(Q.setFromAxisAngle(Dv.set(0.83, 0.36, 0.43), 8 * dt)).normalize();
      if (p.y <= 0) { p.y = 0; v.set(0, 0, 0); }
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
    if (!this.timing && !this.done && !this.crashed && py <= 0 && p.y > 0) { this.timing = true; this.time = 0; }
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
        log(`🏁 Tüm halkalar geçildi: ${fmt(this.time, 1)} saniye (${drone().short}, ${mat().name} pervane, ${this.MODES[this.mode]} modu)`, "ok");
        toast(`🏁 Parkur tamam: ${fmt(this.time, 1)} sn`, "ok");
      } else toast(`✅ Halka ${this.passed}/${total}`, "ok");
    }
  },

  /**
   * İtki eğrisi: gaz (0–1) → 4 pervanenin toplam itkisi. Esnek pervanede itki devirle düz artmaz
   * (aşırı esneme itkiyi düşürür), bu yüzden eğri taranır. cap: pervane kırılmadan ulaşılan en yüksek itki.
   * Ayarlar değişmedikçe yeniden hesaplanmaz.
   */
  curve() {
    const geo = Physics.geometry(S.prop), deform = S.plastic / (geo.R * 1000);
    const key = [S.droneKey, S.matKey, S.motorKey, S.tempC, deform.toFixed(3), JSON.stringify(S.prop)].join("|");
    if (this._key === key) return this._curve;
    const top = maxRpm(), pts = [];
    let cap = 0, mass = 0;
    for (let i = 1; i <= 160; i++) {
      const ev = Physics.evaluate({ mat: mat(), motor: motor(), prop: S.prop, rpm: (top * i) / 160, tempC: S.tempC, deform });
      const total = ev.thrustG * 4;
      if (ev.sigma < ev.strength) cap = Math.max(cap, total);
      pts.push([i / 160, total]);
      mass = ev.mass;
    }
    this._key = key;
    return (this._curve = { pts, cap, mass, top: null });
  },
  /** Gereken toplam itkiyi veren en düşük gaz (iki nokta arasında doğrusal ara değer) */
  throttleFor(need, curve) {
    let pt = 0, pv = 0;
    for (const [t, v] of curve.pts) {
      if (v >= need) return pt + ((t - pt) * (need - pv)) / Math.max(1e-6, v - pv);
      pt = t; pv = v;
    }
    return 1;
  },
  /** Verilen devir oranındaki (0–1) toplam itki; kırık pervanede bir motor %25 verir */
  thrustAt(frac, curve) {
    const x = Math.max(0, Math.min(1, frac)) * 160, i = Math.floor(x), a = i > 0 ? curve.pts[i - 1][1] : 0, b = i < 160 ? curve.pts[i][1] : curve.pts[159][1];
    return (a + (b - a) * (x - i)) * (S.broken ? 3.25 / 4 : 1);
  },
  /** Pervanenin itki üretebildiği en yüksek ileri hız (m/s): hatve × devir, biraz fazlası */
  pitchSpeed(rpm) { return ((S.prop.pitchIn * 0.0254 * rpm) / 60) * this.PITCH_SPEED_FACTOR; },
  /** Hava direnci katsayısı: ivme = k × hız² (hız m/s, ivme m/s²). Alan, drone'un genişliğinin karesiyle orantılı alınır. */
  dragK(auw) {
    const d = drone(), span = (Scene3D.droneSpan || 150) / 1000, cda = d.cda != null ? d.cda : (d.cdaK || 0.8) * span * span;
    return (0.5 * 1.225 * cda) / (auw / 1000);
  },
  /**
   * Düz uçuşta ulaşılabilen en yüksek hız (mm/s). Tam gazda drone α kadar eğilir: itkinin dikey bileşeni
   * ağırlığı, yatay bileşeni hava direncini karşılar; itki ileri hızla azalır. Denge noktası ikiye bölmeyle bulunur.
   */
  topSpeed(curve, auw) {
    if (curve.top != null) return curve.top;
    const T0 = curve.cap, vp = Math.max(1, this.pitchSpeed(maxRpm())), kd = this.dragK(auw);
    if (T0 <= auw * 1.02) return (curve.top = 0);
    const speedAt = (a) => ((1 - auw / Math.cos(a) / T0) * vp) / Math.sin(a);                 // bu eğimde ulaşılan hız (m/s)
    const excess = (a) => { const sp = speedAt(a); return (0.25 * sp + kd * sp * sp) / 9.81 - Math.tan(a); };   // direnç − yatay itki
    let lo = 0.02, hi = Math.acos(auw / T0) - 1e-4;
    if (excess(lo) < 0) return (curve.top = speedAt(lo) * 1000);
    for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (excess(mid) > 0) lo = mid; else hi = mid; }
    return (curve.top = speedAt((lo + hi) / 2) * 1000);
  },

  /** Konumu ve tutumu 3D sahneye bildirir */
  push() { Scene3D.flyPose = { x: this.p.x, y: this.p.y, z: this.p.z, q: this.q, yaw: this.yaw, crashed: this.crashed }; },
  speedKmh() { return this.v.length() * 0.0036; },
  topSpeedKmh() { const c = this.curve(); return this.topSpeed(c, drone().massG + 4 * c.mass) * 0.0036; }
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
  if (e.code === "KeyR") newProp("🔄 Drone pede döndü");
  else if (e.code === "Space") Input.kbThr = 0;                       // gazı kes
  else if (e.code === "KeyH") Input.kbThr = Fly.hover || 0.3;         // askı gazı
  else if (e.code === "KeyV") document.querySelector("#viewBtn").click();
  else setFlyMode(["easy", "angle", "horizon", "acro"][Number(e.code.slice(5)) - 1]);
}
document.addEventListener("keydown", (e) => flyKey(e, true));
document.addEventListener("keyup", (e) => flyKey(e, false));
window.addEventListener("blur", () => Fly.keys.clear());
