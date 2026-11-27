/* =========================================================
   DRONE ATÖLYESİ – Kendi drone'unu parça parça kur
   ---------------------------------------------------------
   Şase, motor, ESC, batarya ve görüntü sistemi seçilir; pervane
   laboratuvarda tasarlanıp bastığın pervanedir (filament, kök
   genişliği ve kalınlığı laboratuvardan gelir).
   Seçimden DRONES.custom ve MOTORS.custom üretilir; drone listesi,
   bağlı test, uçuş, batarya ve 3D çizim bunları diğer modeller
   gibi kullanır.

   Motorun kullanabildiği güç batarya gerilimi ve ESC akımıyla sınırlanır:
       P_kullanılır = min(P_motor · V_batarya / V_motor, I_ESC · V · 0,85)
       I_kullanılır = min(I_motor, I_ESC)
   Askıda kalma: itki ∝ devir², güç ∝ devir³
       n_askı = n_maks · √(ağırlık / itki_maks)
       P_askı = P_maks · (n_askı / n_maks)³
       I_askı = (4 · P_askı / η + P_aviyonik) / V,  uçuş süresi ≈ 0,8 · C_Ah / I_askı
   Parça ağırlıkları o sınıftaki yaygın ürünlerin tipik değerleridir (yaklaşık).
   ========================================================= */

/* Dünyada en çok kullanılan FPV motorlarından eklenenler (diğerleri materials.js'te) */
Object.assign(MOTORS, {
  emax2207: { name: "EMAX ECO II 2207 · 1900KV · 6S", kv: 1900, cells: 6, pmax: 850, imax: 40, mass: 33, propIn: 5, stator: 22, label: "ECO II  2207  1900KV", bell: 0x2a2c31,
    estimated: "EMAX ECO II 2207 1900KV: ağırlık ve KV üreticinin değeridir; en yüksek güç ve akım üreticinin itki tablosundan yuvarlatılmış yaklaşık değerlerdir." },
  tmotorF60: { name: "T-Motor F60 Pro V · 2207.5 · 1950KV · 6S", kv: 1950, cells: 6, pmax: 1000, imax: 46, mass: 34, propIn: 5.1, stator: 22, label: "F60 PRO V  1950KV", bell: 0x1d1f24,
    estimated: "T-Motor F60 Pro V 1950KV: ağırlık ve KV üreticinin değeridir; en yüksek güç ve akım üreticinin itki tablosundan yuvarlatılmış yaklaşık değerlerdir." }
});

const PARTS = {
  frame: {
    title: "Şase", hint: "Motorlar arası çapraz mesafe ve sığan en büyük pervane",
    items: {
      f25: { name: "2,5\" mikro X şase", wb: 115, maxProp: 2.6, mass: 32, arm: 3, info: "115 mm · 2,5\" pervane" },
      f35: { name: "3,5\" X şase", wb: 150, maxProp: 3.6, mass: 58, arm: 4, info: "150 mm · 3,5\" pervane" },
      f5l: { name: "5\" hafif yarış şasesi", wb: 210, maxProp: 5.1, mass: 82, arm: 4, info: "210 mm · 5\" pervane · ince kollar" },
      f5: { name: "5\" freestyle X şase", wb: 225, maxProp: 5.1, mass: 120, arm: 5, info: "225 mm · 5\" pervane · 5 mm kollar" },
      f7: { name: "7\" uzun menzil şasesi", wb: 315, maxProp: 7.5, mass: 185, arm: 6, info: "315 mm · 7\" pervane" },
      f10: { name: "10\" büyük X şase", wb: 420, maxProp: 10, mass: 320, arm: 8, info: "420 mm · 10\" pervane" }
    }
  },
  motor: {
    title: "Motor", hint: "KV, hücre sayısı ve tek motor ağırlığı",
    keys: ["hm0802", "bf1102", "bf1104", "m1404", "bf2006", "gep2105", "m2207", "xing2207", "emax2207", "tmotorF60", "m2806", "xing2809", "m3115"]
  },
  esc: {
    title: "ESC", hint: "Motor başına sürekli akım ve desteklediği hücre sayısı",
    items: {
      e5: { name: "5 A · 1S tek kart (AIO)", amps: 5, cMin: 1, cMax: 1, mass: 3, info: "uçuş kartı + ESC tek kartta" },
      e12: { name: "12 A · 1–2S tek kart (AIO)", amps: 12, cMin: 1, cMax: 2, mass: 4, info: "uçuş kartı + ESC tek kartta" },
      e20: { name: "20 A 4'ü 1 arada · 2–4S", amps: 20, cMin: 2, cMax: 4, mass: 7, info: "küçük dronlar" },
      e35: { name: "35 A 4'ü 1 arada · 3–6S", amps: 35, cMin: 3, cMax: 6, mass: 10, info: "3\"–5\" hafif yapılar" },
      e45: { name: "45 A 4'ü 1 arada · 3–6S", amps: 45, cMin: 3, cMax: 6, mass: 12, info: "5\" freestyle için yaygın" },
      e55: { name: "55 A 4'ü 1 arada · 3–6S", amps: 55, cMin: 3, cMax: 6, mass: 16, info: "5\"–7\" güçlü yapılar" },
      e65: { name: "65 A 4'ü 1 arada · 4–8S", amps: 65, cMin: 4, cMax: 8, mass: 22, info: "7\"–10\" büyük dronlar" }
    }
  },
  battery: {
    title: "Batarya", hint: "Hücre sayısı (S), kapasite ve sürekli boşalma oranı (C)",
    items: {
      b1s450: { name: "1S 450 mAh LiHV", cells: 1, mah: 450, c: 80, mass: 12, chem: "LiPo" },
      b1s550: { name: "1S 550 mAh LiHV", cells: 1, mah: 550, c: 75, mass: 15, chem: "LiPo" },
      b3s450: { name: "3S 450 mAh LiPo", cells: 3, mah: 450, c: 75, mass: 40, chem: "LiPo" },
      b3s850: { name: "3S 850 mAh LiPo", cells: 3, mah: 850, c: 95, mass: 75, chem: "LiPo" },
      b4s650: { name: "4S 650 mAh LiPo", cells: 4, mah: 650, c: 95, mass: 80, chem: "LiPo" },
      b4s1300: { name: "4S 1300 mAh LiPo", cells: 4, mah: 1300, c: 120, mass: 155, chem: "LiPo" },
      b6s1100: { name: "6S 1100 mAh LiPo", cells: 6, mah: 1100, c: 120, mass: 180, chem: "LiPo" },
      b6s1300: { name: "6S 1300 mAh LiPo", cells: 6, mah: 1300, c: 120, mass: 210, chem: "LiPo" },
      b6s1550: { name: "6S 1550 mAh LiPo", cells: 6, mah: 1550, c: 120, mass: 253, chem: "LiPo" },
      b6s2200: { name: "6S 2200 mAh LiPo", cells: 6, mah: 2200, c: 100, mass: 330, chem: "LiPo" },
      b6s3300: { name: "6S 3300 mAh LiPo", cells: 6, mah: 3300, c: 95, mass: 442, chem: "LiPo" },
      b6s4000: { name: "6S 4000 mAh Li-ion (21700)", cells: 6, mah: 4000, c: 10, mass: 420, chem: "Li-ion" }
    }
  },
  avionics: {
    title: "Görüntü ve kontrol", hint: "Uçuş kartı, kamera, görüntü verici ve alıcı",
    items: {
      avWhoop: { name: "Mikro analog kamera + alıcı", mass: 6, watts: 2, info: "tek kartlı ESC ile; whoop ve mikro yapılar" },
      avAnalog: { name: "Analog: F7 kart + kamera + VTX + ELRS", mass: 28, watts: 6, info: "hafif ve ucuz, düşük gecikme" },
      avWalk: { name: "Walksnail Avatar HD + F7 kart", mass: 45, watts: 9, info: "dijital HD görüntü" },
      avO3: { name: "DJI O3 + F7 kart", mass: 52, watts: 10, info: "dijital HD, 4K kayıt" },
      avO3gps: { name: "DJI O3 + F7 kart + GPS", mass: 64, watts: 11, info: "uzun menzil, eve dönüş" }
    }
  }
};
const BUILD_COLORS = [["#f97316", "Turuncu"], ["#ef4444", "Kırmızı"], ["#22c55e", "Yeşil"], ["#3b82f6", "Mavi"], ["#a855f7", "Mor"], ["#facc15", "Sarı"], ["#e5e7eb", "Beyaz"], ["#1f2937", "Siyah"]];

const Builder = {
  KEY: "pervane.atolye",
  DEF: { frame: "f5", motor: "m2207", esc: "e45", battery: "b6s1100", avionics: "avAnalog", dia: 5, blades: 2, pitch: 4.3, color: "#f97316" },
  cfg: null,

  load() {
    let c = null;
    try { c = JSON.parse(localStorage.getItem(this.KEY)); } catch (e) { /* özel pencere */ }
    this.cfg = Object.assign({}, this.DEF, c || {});
    const ok = (cat, k) => (cat === "motor" ? PARTS.motor.keys.includes(k) : !!PARTS[cat].items[k]);
    for (const cat of ["frame", "motor", "esc", "battery", "avionics"]) if (!ok(cat, this.cfg[cat])) this.cfg[cat] = this.DEF[cat];
    this.apply();
  },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.cfg)); } catch (e) { /* özel pencere */ } },
  part(cat) { return cat === "motor" ? MOTORS[this.cfg.motor] : PARTS[cat].items[this.cfg[cat]]; },

  /** Seçimden MOTORS.custom ve DRONES.custom (yerinde güncellenir: başka yerlerdeki başvurular geçerli kalır) */
  apply() {
    const c = this.cfg, f = this.part("frame"), m = this.part("motor"), e = this.part("esc"), b = this.part("battery"), av = this.part("avionics");
    c.dia = Math.max(1.5, Math.min(f.maxProp, c.dia));
    const V = b.cells * 3.7, short = motorBase(m);
    const mc = MOTORS.custom || (MOTORS.custom = {});
    for (const k of Object.keys(mc)) delete mc[k];
    Object.assign(mc, m, {
      name: `${short} · ${b.cells}S (atölye)`, cells: b.cells, custom: true, estimated: undefined,
      pmax: Math.round(Math.min(m.pmax * Math.min(1.25, V / (m.cells * 3.7)), e.amps * V * 0.85)),
      imax: Math.min(m.imax, e.amps)
    });
    const dia = c.dia, prop = { diameterIn: dia, pitchIn: c.pitch, chordMm: +(2.4 * dia).toFixed(1), thickMm: +(0.48 * dia).toFixed(1), blades: c.blades };
    const d = DRONES.custom || (DRONES.custom = {});
    for (const k of Object.keys(d)) delete d[k];
    Object.assign(d, {
      brand: "Atölye", name: `Kendi drone'um · ${f.name}`, short: "Kendi drone'um", style: "freestyle", custom: true,
      motorKey: "custom", prop, propName: `${fmtB(dia, 1)}" · ${c.blades} kanat · laboratuvarda basılan`,
      wheelbaseMm: f.wb, massG: f.mass + 4 * m.mass + e.mass + b.mass + av.mass,
      battery: `${b.cells}S ${b.mah} mAh ${b.chem}`, accent: parseInt(c.color.slice(1), 16), armMm: f.arm, bodyScale: Math.max(0.55, Math.min(1.5, f.wb / 225)),
      avionicsW: av.watts,
      parts: `${f.name} (${f.wb} mm) · 4 × ${m.name} · ESC: ${e.name} · Batarya: ${b.name} · ${av.name} · Pervane: ${fmtB(dia, 1)}" ${c.blades} kanat`,
      note: "Drone atölyesinde kurduğun drone. Şase, ESC, batarya ve görüntü sistemi ağırlıkları o sınıftaki yaygın ürünlerin tipik değerleridir (yaklaşık)."
    });
  },

  /** Hesap: ağırlık, itki, akım, uçuş süresi ve uyumluluk denetimleri */
  compute() {
    const c = this.cfg, f = this.part("frame"), m = this.part("motor"), e = this.part("esc"), b = this.part("battery"), av = this.part("avionics");
    const mc = MOTORS.custom, d = DRONES.custom, mt = typeof mat === "function" ? mat() : MATERIALS.PLA, tC = typeof S !== "undefined" ? S.tempC : 25;
    const sw = Physics.sweep({ mat: mt, motor: mc, prop: d.prop, tempC: tC, steps: 160 });
    const top = sw.top, ev = Physics.evaluate({ mat: mt, motor: mc, prop: d.prop, rpm: top, tempC: tC });
    const propMass = sw.mass, auw = d.massG + 4 * propMass, thrust = 4 * ev.thrustG, twr = thrust / auw, V = b.cells * 3.7;
    const rH = top * Math.sqrt(Math.min(1, auw / Math.max(1, thrust)));
    const Ph = ev.power * Math.pow(rH / top, 3), eta = typeof Battery !== "undefined" ? Battery.ETA : 0.75;
    const Ih = (4 * Ph / eta + av.watts) / V, Imax = (4 * ev.power / eta + av.watts) / V;
    const minutes = twr >= 1 ? (0.8 * (b.mah / 1000) / Ih) * 60 : 0, bLimit = (b.mah / 1000) * b.c;
    const checks = [];
    const add = (k, t) => checks.push([k, t]);
    if (c.dia > f.maxProp + 1e-6) add("bad", `Pervane şaseye sığmıyor: en çok ${fmtB(f.maxProp, 1)}".`);
    if (b.cells > m.cells) add("bad", `Motor en çok ${m.cells}S için yapılmış; ${b.cells}S batarya motoru aşırı ısıtır ve yakabilir.`);
    else if (b.cells < m.cells - 2) add("warn", `Motor ${m.cells}S için; ${b.cells}S batarya ile güçsüz kalır.`);
    if (b.cells > e.cMax || b.cells < e.cMin) add("bad", `ESC ${e.cMin === e.cMax ? e.cMin + "S" : e.cMin + "–" + e.cMax + "S"} destekliyor; batarya ${b.cells}S.`);
    const perMotor = (4 * ev.power / eta) / V / 4;
    if (perMotor > e.amps * 1.05) add("warn", `Tam gazda motor başına ~${fmtB(perMotor, 0)} A gerekir, ESC ${e.amps} A veriyor: güç ESC ile sınırlanır.`);
    else add("ok", `ESC yeterli: tam gazda motor başına ~${fmtB(perMotor, 0)} A (ESC ${e.amps} A).`);
    if (Imax > bLimit) add("warn", `Batarya tam gazda zorlanır: ~${fmtB(Imax, 0)} A çekilir, ${b.mah} mAh × ${b.c}C = ${fmtB(bLimit, 0)} A sürekli verir; voltaj çöker.`);
    if (c.dia > m.propIn * 1.35) add("warn", `${fmtB(c.dia, 1)}" pervane bu motor için büyük (motor ~${fmtB(m.propIn, 1)}" için): devir düşer, motor ısınır.`);
    else if (c.dia < m.propIn * 0.6) add("warn", `${fmtB(c.dia, 1)}" pervane bu motor için küçük (motor ~${fmtB(m.propIn, 1)}" için): verim düşer.`);
    if (twr < 1) add("bad", `Kalkamaz: tam gaz itki ${fmtB(thrust, 0)} g, ağırlık ${fmtB(auw, 0)} g.`);
    else if (twr < 1.8) add("warn", `Ağır: itki/ağırlık ${fmtB(twr, 1)}. Kalkar ama zor tutunur; sert rüzgârda geri kalır.`);
    else add("ok", `İtki/ağırlık ${fmtB(twr, 1)}: ${twr >= 6 ? "çok çevik, yarış/freestyle sınıfı" : twr >= 3.5 ? "çevik" : "rahat uçar"}.`);
    if (sw.breakRpm && sw.breakRpm < top) add("bad", `Pervane tam gazda kırılır (${fmtB(sw.breakRpm, 0)} devir/dk'da). Daha dayanıklı filament ya da daha kalın kök seç.`);
    else if (sw.yieldRpm && sw.yieldRpm < top) add("warn", `Pervane tam gazda kalıcı bükülür (${fmtB(sw.yieldRpm, 0)} devir/dk'dan sonra).`);
    else add("ok", `${mt.name} pervane tam gazda sağlam kalıyor.`);
    if (twr >= 1 && minutes < 2.5) add("warn", `Uçuş süresi kısa: ~${fmtB(minutes, 1)} dk. Daha büyük batarya ya da daha hafif parçalar dene.`);
    return { auw, thrust, twr, top, Ih, Imax, minutes, bLimit, propMass, checks, mt,
      mass: [["Şase", f.mass], ["Motorlar (4)", 4 * m.mass], ["ESC", e.mass], ["Batarya", b.mass], ["Görüntü ve kontrol", av.mass], [`Pervaneler (4, ${mt.name})`, 4 * propMass]] };
  },

  /* ---------------- Arayüz ---------------- */
  init() {
    this.load();
    const root = document.querySelector("#buildParts");
    if (!root) return;
    root.addEventListener("click", (ev) => {
      const p = ev.target.closest("[data-cat]");
      if (p) { this.cfg[p.dataset.cat] = p.dataset.k; if (p.dataset.cat === "frame") this.cfg.dia = Math.floor(PARTS.frame.items[p.dataset.k].maxProp * 2) / 2; /* şaseye uyan pervane */ this.changed(); return; }
      const bl = ev.target.closest("[data-blades]");
      if (bl) { this.cfg.blades = Number(bl.dataset.blades); this.changed(); return; }
      const co = ev.target.closest("[data-color]");
      if (co) { this.cfg.color = co.dataset.color; this.changed(); }
    });
    root.addEventListener("input", (ev) => {
      const t = ev.target;
      if (t.id === "bDia") this.cfg.dia = Number(t.value);
      else if (t.id === "bPitch") this.cfg.pitch = Number(t.value);
      else return;
      this.apply(); this.renderSum(); this.renderPropVals();
    });
    root.addEventListener("change", (ev) => { if (ev.target.id === "bDia" || ev.target.id === "bPitch") this.changed(); });
    document.querySelector("#buildSum").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-use]");
      if (b) this.use(b.dataset.use);
    });
    this.render();
  },
  changed() {
    this.apply(); this.save(); this.render();
    if (typeof refreshCustomDrone === "function") refreshCustomDrone();   // listelerdeki adlar; seçiliyse düzenek de yenilenir
  },
  /** Bu drone'u bağlı testte ya da uçuşta kullan */
  use(rig) {
    if (typeof S === "undefined") return;
    S.droneKey = "custom";
    document.querySelector("#droneSel").value = "custom";
    showPage("lab");
    if (S.rig !== rig) setRig(rig); else refreshCustomDrone();
  },
  card(cat, k, p, sub, mass, on) {
    return `<button type="button" class="part${on ? " on" : ""}" data-cat="${cat}" data-k="${k}" aria-pressed="${on}"><b>${escB(p)}</b><small>${escB(sub)}</small><em>${fmtB(mass, mass < 10 ? 1 : 0)} g</em></button>`;
  },
  render() {
    const c = this.cfg, root = document.querySelector("#buildParts");
    if (!root) return;
    const sec = (cat, body) => `<section class="bsec"><div class="bsec-h"><b>${PARTS[cat].title}</b><span>${PARTS[cat].hint}</span></div><div class="parts">${body}</div></section>`;
    const items = (cat, sub) => Object.entries(PARTS[cat].items).map(([k, p]) => this.card(cat, k, p.name, sub(p), p.mass, c[cat] === k)).join("");
    const f = this.part("frame");
    root.innerHTML =
      sec("frame", items("frame", (p) => p.info)) +
      sec("motor", PARTS.motor.keys.map((k) => { const m = MOTORS[k]; return this.card("motor", k, motorBase(m),`${m.cells}S · en çok ${m.pmax} W · ~${fmtB(m.propIn, 1)}" pervane${m.estimated ? " · yaklaşık" : ""}`, m.mass, c.motor === k); }).join("")) +
      sec("esc", items("esc", (p) => `${p.info}`)) +
      sec("battery", items("battery", (p) => `${p.c}C · sürekli ~${fmtB(p.mah / 1000 * p.c, 0)} A`)) +
      sec("avionics", items("avionics", (p) => `${p.info} · ~${p.watts} W`)) +
      `<section class="bsec"><div class="bsec-h"><b>Pervane</b><span>Filament, kök genişliği ve kalınlığı laboratuvardan; boyutu şase belirler</span></div>
        <div class="bprop">
          <label>Çap <b id="bDiaV"></b><input type="range" id="bDia" min="1.5" max="${f.maxProp}" step="0.1" value="${c.dia}"></label>
          <label>Hatve <b id="bPitchV"></b><input type="range" id="bPitch" min="1" max="7" step="0.1" value="${c.pitch}"></label>
          <div class="bline"><span>Kanat sayısı</span><div class="seg">${[2, 3, 4].map((n) => `<button type="button" data-blades="${n}" class="${c.blades === n ? "active" : ""}">${n}</button>`).join("")}</div></div>
          <div class="bline"><span>Şase rengi (TPU parçalar)</span><div class="bcolors">${BUILD_COLORS.map(([h, n]) => `<button type="button" class="bcol${c.color === h ? " on" : ""}" data-color="${h}" title="${n}" aria-label="${n}" style="--c:${h}"></button>`).join("")}</div></div>
        </div></section>`;
    root.querySelectorAll("input[type=range]").forEach((r) => { if (typeof paintRange === "function") paintRange(r); });
    this.renderPropVals();
    this.renderSum();
  },
  renderPropVals() {
    const c = this.cfg, a = document.querySelector("#bDiaV"), b = document.querySelector("#bPitchV");
    if (a) a.textContent = `${fmtB(c.dia, 1)}" (${fmtB(c.dia * 25.4, 0)} mm)`;
    if (b) b.textContent = `${fmtB(c.pitch, 1)}"`;
  },
  renderSum() {
    const el = document.querySelector("#buildSum");
    if (!el) return;
    const r = this.compute(), worst = r.checks.some(([k]) => k === "bad") ? "bad" : r.checks.some(([k]) => k === "warn") ? "warn" : "ok";
    const stat = (l, v, k = "") => `<div class="bstat ${k}"><small>${l}</small><b>${v}</b></div>`;
    el.innerHTML = `
      <div class="bsum-h"><b>Kendi drone'um</b><span class="chip ${worst === "ok" ? "good" : worst}">${worst === "ok" ? "Uçmaya hazır" : worst === "warn" ? "Uyarılar var" : r.twr < 1 ? "Kalkamaz" : "Sorunlu"}</span></div>
      <div class="bstats">
        ${stat("Kalkış ağırlığı", `${fmtB(r.auw, 0)} g`)}
        ${stat("İtki / ağırlık", fmtB(r.twr, 1), r.twr < 1 ? "bad" : r.twr < 1.8 ? "warn" : "")}
        ${stat("Tam gaz itki", `${fmtB(r.thrust, 0)} g`)}
        ${stat("Askıda uçuş süresi", r.minutes ? `~${fmtB(r.minutes, 1)} dk` : "–")}
        ${stat("Askıda akım", r.twr >= 1 ? `${fmtB(r.Ih, 1)} A` : "–")}
        ${stat("Tam gazda akım", `${fmtB(r.Imax, 0)} A`, r.Imax > r.bLimit ? "warn" : "")}
      </div>
      <ul class="bchecks">${r.checks.map(([k, t]) => `<li class="${k}">${escB(t)}</li>`).join("")}</ul>
      <details class="more bmass"><summary><span class="more-t">Ağırlık dağılımı</span><span class="more-v">${fmtB(r.auw, 0)} g</span></summary>
        <div class="kv small">${r.mass.map(([n, g]) => `<span>${escB(n)}</span><b>${fmtB(g, g < 10 ? 1 : 0)} g</b>`).join("")}</div></details>
      <div class="bactions">
        <button type="button" class="btn primary" data-use="fly"><svg class="ic" aria-hidden="true"><use href="#i-fly"/></svg>Bu drone'la uç</button>
        <button type="button" class="btn" data-use="drone"><svg class="ic" aria-hidden="true"><use href="#i-drone"/></svg>Bağlı testte dene</button>
      </div>
      <p class="note">Hesap seçili filamentle (${escB(r.mt.name)}) ve laboratuvardaki pervane kesitiyle yapılır. Parça ağırlıkları yaklaşıktır.</p>`;
  }
};
/** Motor adı, gerilim kısmı olmadan: "iFlight XING2 2207 · 1750KV · 6S" → "iFlight XING2 2207 · 1750KV" */
function motorBase(m) { return m.name.split(" · ").filter((s) => !/^\d+S$/.test(s) && !/^[\d,.]+ V$/.test(s)).join(" · "); }
function fmtB(n, d = 0) { return Number(n).toLocaleString("tr-TR", { maximumFractionDigits: d, minimumFractionDigits: d }); }
function escB(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); }

// Kayıtlı tasarım sayfa açılırken uygulanır: drone ve motor listeleri "Kendi drone'um"u hemen içerir
Builder.load();
