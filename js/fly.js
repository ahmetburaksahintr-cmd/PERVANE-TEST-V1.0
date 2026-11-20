/* =========================================================
   UÇUŞ BÖLÜMÜ – Seçili drone'u klavyeyle uçurma
   ---------------------------------------------------------
   W / S : ileri / geri        A / D : sola / sağa kayma
   E / Q : yüksel / alçal      Z / X : sola / sağa dönme

   Uçuş "yükseklik sabitlemeli" (kolay) moddadır: tuşu bırakınca drone
   olduğu yerde asılı kalır. Gereken itki, drone ağırlığı ve yapılan
   manevradan hesaplanır; bu itki seçili pervane ve malzemeyle
   sağlanamıyorsa drone kalkamaz, pervane dayanamıyorsa havada kırılır.
   Birimler: milimetre, saniye (sahneyle aynı).
   ========================================================= */

const Fly = {
  G: 9810,                    // yer çekimi (mm/s²)
  keys: new Set(),
  x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, roll: 0,
  crashed: false, time: 0, timing: false, done: false, passed: 0, noLift: false, hardLanded: false,

  /** Drone'u pede geri koyar, halkaları ve süreyi sıfırlar */
  reset() {
    this.x = this.y = this.z = this.vx = this.vy = this.vz = 0;
    this.yaw = this.pitch = this.roll = 0;
    this.crashed = this.timing = this.done = this.noLift = false;
    this.time = 0; this.passed = 0;
    for (const g of Scene3D.flyGates || []) { g.passed = false; g.mesh.material.color.copy(g.base); g.mesh.material.emissive.copy(g.baseE); }
    this.push();
  },

  axis(pos, neg) { return (this.keys.has(pos) ? 1 : 0) - (this.keys.has(neg) ? 1 : 0); },

  /** Her karede çağrılır; S.throttle'ı gereken itkiye göre ayarlar */
  step(dt) {
    const span = Scene3D.droneSpan || 150;
    // Pervane kırıldıysa: itki dengesi bozulur, drone takla atarak düşer
    if (S.broken) {
      S.throttle = 0;
      if (this.y > 0) {
        this.vy -= this.G * dt;
        this.vx *= Math.pow(0.5, dt); this.vz *= Math.pow(0.5, dt);
        this.x += this.vx * dt; this.z += this.vz * dt; this.y = Math.max(0, this.y + this.vy * dt);
        this.roll += 7 * dt; this.pitch += 4.5 * dt; this.yaw += 3 * dt;
      } else {
        this.vx = this.vy = this.vz = 0;
        this.roll += (0.22 - this.roll % (Math.PI * 2)) * Math.min(1, dt * 8);
        this.pitch += (0 - this.pitch % (Math.PI * 2)) * Math.min(1, dt * 8);
      }
      this.crashed = true;
      return this.push();
    }

    // Bu pervaneyle kırılmadan elde edilebilecek en yüksek toplam itki ve kalkış ağırlığı
    const curve = this.curve();
    const cap = curve.cap, auw = drone().massG + 4 * curve.mass;
    this.noLift = cap < auw * 1.02;

    const fwdIn = this.axis("KeyW", "KeyS"), rightIn = this.axis("KeyD", "KeyA"), upIn = this.axis("KeyE", "KeyQ"), turnIn = this.axis("KeyX", "KeyZ");
    const maxSpeed = 1800 + span * 9, climb = 1100 + span * 4;
    this.yaw -= turnIn * 2.3 * dt;                       // X: sağa (saat yönünde) döner
    const fx = Math.cos(this.yaw), fz = -Math.sin(this.yaw);     // burun yönü
    const rx = Math.sin(this.yaw), rz = Math.cos(this.yaw);      // sağ taraf

    // Yerde ve kalkış istenmiyorsa: motorlar rölantide
    if (this.y <= 0 && upIn <= 0) {
      this.vx = this.vy = this.vz = 0; this.y = 0;
      this.pitch += (0 - this.pitch) * Math.min(1, dt * 8); this.roll += (0 - this.roll) * Math.min(1, dt * 8);
      S.throttle = 0.1;
      return this.push();
    }

    // İstenen hız (tuşlara göre) ve ona doğru yumuşak ivmelenme
    const norm = Math.hypot(fwdIn, rightIn) || 1;
    const tvx = ((fx * fwdIn + rx * rightIn) / norm) * maxSpeed, tvz = ((fz * fwdIn + rz * rightIn) / norm) * maxSpeed, tvy = upIn * climb;
    const kh = Math.min(1, 2.4 * dt), kv = Math.min(1, 3.2 * dt);
    const dvx = (tvx - this.vx) * kh, dvz = (tvz - this.vz) * kh;
    let dvy = (tvy - this.vy) * kv;
    // Yük katsayısı: yatay ivme için eğilme + dikey ivme → gereken itki
    const ah = Math.hypot(dvx, dvz) / dt, av = dvy / dt;
    const load = Math.max(0.25, Math.sqrt(1 + (ah / this.G) ** 2) + av / this.G);
    const need = auw * load;
    if (cap >= need) S.throttle = Math.max(0.1, this.throttleFor(need, curve));
    else {                                               // itki yetmiyor: tam gaz, yine de alçalır
      S.throttle = 1;
      dvy -= this.G * (1 - cap / need) * dt;
    }
    this.vx += dvx; this.vz += dvz; this.vy += dvy;

    const py = this.y, pxPrev = this.x, pzPrev = this.z;
    this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
    if (this.y <= 0) {                                   // yere değdi
      if (this.vy < -2600 && !this.hardLanded) { this.hardLanded = true; log("🛬 Sert iniş! Daha yavaş alçal (Q tuşunu kısa kısa kullan).", "warn"); }
      this.y = 0; this.vy = Math.max(0, this.vy);
    } else if (this.y > 30) this.hardLanded = false;
    this.y = Math.min(this.y, 7000);                     // tavan
    const r = Math.hypot(this.x, this.z), lim = 8300;    // alan sınırı
    if (r > lim) { this.x *= lim / r; this.z *= lim / r; this.vx *= 0.3; this.vz *= 0.3; }

    // Görsel eğilme: gidilen yöne doğru yatar
    const vf = this.vx * fx + this.vz * fz, vr = this.vx * rx + this.vz * rz;
    const kt = Math.min(1, dt * 6);
    this.pitch += (-0.42 * (vf / maxSpeed) - this.pitch) * kt;
    this.roll += (0.42 * (vr / maxSpeed) - turnIn * 0.06 - this.roll) * kt;

    // Süre ve halkalar
    if (!this.timing && !this.done && py <= 0 && this.y > 0) { this.timing = true; this.time = 0; }
    if (this.timing) this.time += dt;
    const by = Scene3D.droneBaseY || 0;
    for (const g of Scene3D.flyGates || []) {
      if (g.passed) continue;
      const a = (pxPrev - g.c.x) * g.n.x + (pzPrev - g.c.z) * g.n.z, b = (this.x - g.c.x) * g.n.x + (this.z - g.c.z) * g.n.z;
      if (a * b > 0) continue;                           // halka düzlemini geçmedi
      if (Math.hypot(this.x - g.c.x, this.y + by - g.c.y, this.z - g.c.z) > g.r) continue;
      g.passed = true; this.passed++;
      g.mesh.material.color.set(0x22c55e); g.mesh.material.emissive.set(0x14532d);
      const total = Scene3D.flyGates.length;
      if (this.passed === total) {
        this.timing = false; this.done = true;
        log(`🏁 Tüm halkalar geçildi: ${fmt(this.time, 1)} saniye (${drone().short}, ${mat().name} pervane)`, "ok");
        toast(`🏁 Parkur tamam: ${fmt(this.time, 1)} sn`, "ok");
      } else toast(`✅ Halka ${this.passed}/${total}`, "ok");
    }
    this.push();
  },

  /**
   * İtki eğrisi: gaz (0–1) → 4 pervanenin toplam itkisi. Esnek pervanede itki devirle düz artmaz
   * (aşırı esneme itkiyi düşürür), bu yüzden eğri taranır. cap: pervane kırılmadan ulaşılan en yüksek itki.
   * Ayarlar değişmedikçe yeniden hesaplanmaz.
   */
  curve() {
    const geo = Physics.geometry(S.prop), deform = S.plastic / (geo.R * 1000);
    const key = [S.matKey, S.motorKey, S.tempC, deform.toFixed(3), JSON.stringify(S.prop)].join("|");
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
    return (this._curve = { pts, cap, mass });
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

  /** Konumu 3D sahneye bildirir */
  push() { Scene3D.flyPose = { x: this.x, y: this.y, z: this.z, yaw: this.yaw, pitch: this.pitch, roll: this.roll, crashed: this.crashed }; },
  speedKmh() { return Math.hypot(this.vx, this.vy, this.vz) * 0.0036; }
};

/* Klavye: yalnızca uçuş bölümünde ve yazı kutusu/liste odakta değilken */
function flyKey(e, down) {
  if (typeof S === "undefined" || S.rig !== "fly") return;
  if (!["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "KeyZ", "KeyX"].includes(e.code)) return;
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  const t = e.target;
  if (t && (t.tagName === "SELECT" || t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && !["range", "checkbox", "button"].includes(t.type)))) return;
  e.preventDefault();
  if (down) Fly.keys.add(e.code); else Fly.keys.delete(e.code);
}
document.addEventListener("keydown", (e) => flyKey(e, true));
document.addEventListener("keyup", (e) => flyKey(e, false));
window.addEventListener("blur", () => Fly.keys.clear());
