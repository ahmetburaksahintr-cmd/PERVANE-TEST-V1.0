/* =========================================================
   DRONE ATÖLYESİ – Kendi drone'unu gerçek parçalarla kur
   ---------------------------------------------------------
   Parçalar js/parts.js'teki katalogdan gelir (üretici ya da büyük satıcı
   sayfalarındaki değerler; her parçanın kaynağı ve tahmin edilen alanları
   yazılıdır). Pervane laboratuvarda tasarlayıp bastığın pervanedir
   (filament, kök genişliği ve kalınlığı laboratuvardan gelir).
   Seçimden DRONES.custom ve MOTORS.custom üretilir; drone listesi,
   bağlı test, uçuş, batarya ve 3D çizim bunları diğer modeller gibi kullanır.

   Motorun kullanabildiği güç batarya gerilimi ve ESC akımıyla sınırlanır:
       P_kullanılır = min(P_motor · V_batarya / V_motor, I_ESC · V · 0,85)
       I_kullanılır = min(I_motor, I_ESC)
   Askıda kalma (momentum teorisi): pervane başına P = T^1,5 / √(2ρA) / (FM · η_motor)
       FM (pervane verimi) 1,5" pervanede ~0,30 → 6,5" ve üstünde ~0,50; η_motor 08xx'te ~0,45 → 22xx ve üstünde ~0,75
       I_askı = (4 · P + P_aviyonik) / V,  uçuş süresi ≈ 0,8 · C_Ah / I_askı
   ========================================================= */

const MAT_NAMES = { carbon: "Karbon fiber", nylon: "Naylon (PA)", pp: "PP plastik", mixed: "Karbon + plastik", glassfiber: "Cam elyaf + naylon", tpu: "TPU" };
const CLASSES = [["all", "Tümü"], ["whoop", "Whoop (≤2\")"], ["micro", "Mikro (2–4\")"], ["five", "5\""], ["big", "7\" ve üstü"]];
const propClass = (inch) => (inch <= 2.05 ? "whoop" : inch <= 4.2 ? "micro" : inch <= 5.6 ? "five" : "big");

const PARTS = {
  frame: { title: "Şase", hint: "Karbon, naylon, PP ya da cam elyaf; çapraz motor arası ve sığan en büyük pervane", items: PARTS_DB.frames },
  motor: { title: "Motor", hint: "KV, hücre sayısı, en yüksek güç ve tek motor ağırlığı" },
  esc: { title: "ESC", hint: "Motor başına sürekli akım ve hücre aralığı; AIO = uçuş kartıyla tek kart", items: PARTS_DB.escs },
  battery: { title: "Batarya", hint: "Hücre (S), kapasite ve sürekli boşalma (C)", items: PARTS_DB.batteries },
  video: { title: "Görüntü sistemi", hint: "Kamera + görüntü verici (dijital ya da analog)", items: PARTS_DB.video },
  rx: { title: "Kumanda alıcısı", hint: "ExpressLRS ya da Crossfire", items: PARTS_DB.rx },
  gps: { title: "GPS", hint: "İsteğe bağlı: konum tutma ve eve dönüş için", items: PARTS_DB.gps }
};
// Motor listesi: kütüphanedeki bütün motorlar (hazır dronlara özel DJI motorları ve atölye motoru hariç), boyuta göre sıralı
PARTS.motor.keys = Object.keys(MOTORS).filter((k) => !MOTORS[k].custom && !/^dji/.test(k))
  .sort((a, b) => (MOTORS[a].propIn - MOTORS[b].propIn) || (MOTORS[a].stator - MOTORS[b].stator) || (MOTORS[b].kv - MOTORS[a].kv));

const BUILD_COLORS = [["#f97316", "Turuncu"], ["#ef4444", "Kırmızı"], ["#22c55e", "Yeşil"], ["#3b82f6", "Mavi"], ["#a855f7", "Mor"], ["#facc15", "Sarı"], ["#e5e7eb", "Beyaz"], ["#1f2937", "Siyah"]];

const Builder = {
  KEY: "pervane.atolye",
  DEF: { frame: "geprcMark5", motor: "iflight2207", esc: "speedybeeF405V4Stack55a", battery: "", video: "analogRatelRush", rx: "happymodelEp2", gps: "none",
    dia: 5, blades: 3, pitch: 4.3, color: "#f97316", cls: "five", q: "", compat: true, name: "" },
  CATS: ["frame", "motor", "esc", "battery", "video", "rx", "gps"],
  FORMAT: "pervane-drone",
  cfg: null,

  load() {
    let c = null;
    try { c = JSON.parse(localStorage.getItem(this.KEY)); } catch (e) { /* özel pencere */ }
    if (!this.DEF.battery) this.DEF.battery = Object.keys(PARTS.battery.items).find((k) => { const b = PARTS.battery.items[k]; return b.cells === 6 && b.mah >= 1100 && b.mah <= 1300; }) || Object.keys(PARTS.battery.items)[0];
    this.cfg = Object.assign({}, this.DEF, c || {});
    for (const cat of ["frame", "motor", "esc", "battery", "video", "rx", "gps"]) if (!this.has(cat, this.cfg[cat])) this.cfg[cat] = this.DEF[cat];
    this.apply();
  },
  has(cat, k) { return cat === "motor" ? PARTS.motor.keys.includes(k) : !!PARTS[cat].items[k]; },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.cfg)); } catch (e) { /* özel pencere */ } },
  part(cat, k) { k = k || this.cfg[cat]; return cat === "motor" ? MOTORS[k] : PARTS[cat].items[k]; },
  /** Ayrı uçuş kartı (yalnız ESC uçuş kartı içermiyorsa) */
  fcPart() { return this.part("esc").aio ? null : PARTS_DB.fc; },

  /** Seçimden MOTORS.custom ve DRONES.custom (yerinde güncellenir: başka yerlerdeki başvurular geçerli kalır) */
  apply() {
    const c = this.cfg, f = this.part("frame"), m = this.part("motor"), e = this.part("esc"), b = this.part("battery");
    const v = this.part("video"), rx = this.part("rx"), g = this.part("gps"), fc = this.fcPart();
    c.dia = Math.max(1, Math.min(f.maxProp, c.dia));
    const V = b.cells * 3.7;
    const mc = MOTORS.custom || (MOTORS.custom = {});
    for (const k of Object.keys(mc)) delete mc[k];
    Object.assign(mc, m, {
      name: `${motorBase(m)} · ${b.cells}S (atölye)`, cells: b.cells, custom: true, estimated: undefined,
      pmax: Math.round(Math.min(m.pmax * Math.min(1.25, V / (m.cells * 3.7)), e.amps * V * 0.85)),
      imax: Math.min(m.imax, e.amps)
    });
    const dia = c.dia, prop = { diameterIn: dia, pitchIn: c.pitch, chordMm: +(2.4 * dia).toFixed(1), thickMm: +(0.48 * dia).toFixed(1), blades: c.blades };
    const av = [v, rx, g].concat(fc ? [fc] : []);
    const d = DRONES.custom || (DRONES.custom = {});
    for (const k of Object.keys(d)) delete d[k];
    Object.assign(d, {
      brand: "Atölye", name: c.name ? `${c.name} · ${f.brand} ${f.model}` : `Kendi drone'um · ${f.brand} ${f.model}`, short: c.name || "Kendi drone'um", style: "freestyle", custom: true,
      gps: !!g.mass, detail: { frame: f, esc: e, battery: b, video: v, rx, gps: g },
      motorKey: "custom", prop, propName: `${fmtB(dia, 1)}" · ${c.blades} kanat · laboratuvarda basılan`,
      wheelbaseMm: f.wb, massG: Math.round(f.mass + 4 * m.mass + e.mass + b.mass + av.reduce((s, p) => s + p.mass, 0)),
      battery: `${b.cells}S ${b.mah} mAh ${b.chem}`, accent: parseInt(c.color.slice(1), 16), armMm: f.arm || (f.wb < 120 ? 2 : f.wb < 200 ? 3.5 : 5),
      bodyScale: Math.max(0.4, Math.min(1.6, f.wb / 225)), frameMat: f.mat, ducts: !!f.ducts,
      avionicsW: av.reduce((s, p) => s + p.watts, 0),
      parts: `${f.brand} ${f.model} (${f.wb} mm, ${MAT_NAMES[f.mat] || f.mat}) · 4 × ${m.name} · ESC: ${e.brand} ${e.model} · Batarya: ${b.brand} ${b.model} · ${v.brand} ${v.model}${g.mass ? " · GPS: " + g.brand + " " + g.model : ""} · Pervane: ${fmtB(dia, 1)}" ${c.blades} kanat`,
      note: "Drone atölyesinde gerçek parçalarla kurduğun drone. Parça değerleri üretici ya da satıcı sayfalarındandır; tahmin edilenler atölyede yazılıdır."
    });
  },

  /** Hesap: ağırlık, itki, akım, uçuş süresi ve uyumluluk denetimleri */
  compute() {
    const c = this.cfg, f = this.part("frame"), m = this.part("motor"), e = this.part("esc"), b = this.part("battery");
    const v = this.part("video"), rx = this.part("rx"), g = this.part("gps"), fc = this.fcPart();
    const mc = MOTORS.custom, d = DRONES.custom, mt = typeof mat === "function" ? mat() : MATERIALS.PLA, tC = typeof S !== "undefined" ? S.tempC : 25;
    const sw = Physics.sweep({ mat: mt, motor: mc, prop: d.prop, tempC: tC, steps: 160 });
    const top = sw.top, ev = Physics.evaluate({ mat: mt, motor: mc, prop: d.prop, rpm: top, tempC: tC });
    const propMass = sw.mass, auw = d.massG + 4 * propMass, thrust = 4 * ev.thrustG, twr = thrust / auw, V = b.cells * 3.7;
    // Askıda güç: momentum teorisi P = T^1,5 / √(2ρA), pervane verimi (FM) ve motor verimi küçük boyutta düşer
    const Rp = (d.prop.diameterIn * 0.0254) / 2, Tn = ((auw / 1000) * 9.81) / 4;
    // FM ve verim, gerçek FPV dronlarının askıda çektiği akıma göre ayarlı (1S whoop ~4 A, 5" 650 g ~5 A, 7" ~8 A)
    const FM = Math.max(0.30, Math.min(0.50, 0.30 + 0.04 * (d.prop.diameterIn - 1.5)));
    const eta = 0.45 + 0.30 * Math.max(0, Math.min(1, ((m.stator || 22) - 8) / 14));
    const Pm = Math.pow(Tn, 1.5) / Math.sqrt(2 * Physics.rho * Math.PI * Rp * Rp) / FM / eta;
    const Ih = (4 * Pm + d.avionicsW) / V, Imax = (4 * ev.power / eta + d.avionicsW) / V;
    const minutes = twr >= 1 ? (0.8 * (b.mah / 1000) / Ih) * 60 : 0, bLimit = b.maxA || (b.mah / 1000) * b.c;
    const checks = [];
    const add = (k, t) => checks.push([k, t]);
    if (c.dia > f.maxProp + 1e-6) add("bad", `Pervane şaseye sığmıyor: en çok ${fmtB(f.maxProp, 2)}".`);
    if (b.cells > m.cells) add("bad", `Motor en çok ${m.cells}S için yapılmış; ${b.cells}S batarya motoru aşırı ısıtır ve yakabilir.`);
    else if (m.cellsMin && b.cells < m.cellsMin) add("warn", `Motor en az ${m.cellsMin}S ister; ${b.cells}S batarya ile güçsüz kalır.`);
    else if (!m.cellsMin && b.cells < m.cells - 2) add("warn", `Motor ${m.cells}S için; ${b.cells}S batarya ile güçsüz kalır.`);
    if (b.cells > e.cMax || b.cells < e.cMin) add("bad", `ESC ${e.cMin === e.cMax ? e.cMin + "S" : e.cMin + "–" + e.cMax + "S"} destekliyor; batarya ${b.cells}S.`);
    const perMotor = (4 * ev.power / eta) / V / 4;
    if (perMotor > (e.burst || e.amps) * 1.02) add("warn", `Tam gazda motor başına ~${fmtB(perMotor, 0)} A gerekir, ESC ${e.amps} A (kısa süre ${e.burst || e.amps} A) veriyor: güç ESC ile sınırlanır.`);
    else if (perMotor > e.amps) add("warn", `Tam gazda motor başına ~${fmtB(perMotor, 0)} A: ESC'nin sürekli ${e.amps} A sınırının üstü, ancak kısa süreli ${e.burst} A içinde.`);
    else add("ok", `ESC yeterli: tam gazda motor başına ~${fmtB(perMotor, 0)} A (ESC ${e.amps} A).`);
    if (Imax > bLimit) add("warn", `Batarya tam gazda zorlanır: ~${fmtB(Imax, 0)} A çekilir, batarya sürekli ~${fmtB(bLimit, 0)} A verir; voltaj çöker.`);
    if (c.dia > m.propIn * 1.35) add("warn", `${fmtB(c.dia, 1)}" pervane bu motor için büyük (motor ~${fmtB(m.propIn, 1)}" için): devir düşer, motor ısınır.`);
    else if (c.dia < m.propIn * 0.6) add("warn", `${fmtB(c.dia, 1)}" pervane bu motor için küçük (motor ~${fmtB(m.propIn, 1)}" için): verim düşer.`);
    if (c.rx === "onboard" && !e.rx && !e.vtx) add("bad", "Seçilen kartta alıcı yok: bir kumanda alıcısı seç.");
    if (c.video === "whoopAnalog" && !e.vtx) add("warn", "Bu kamera vericisini AIO kartta bekler; seçilen ESC'de görüntü verici yok.");
    if (f.mat === "pp" && b.mass > 25) add("warn", `${f.brand} ${f.model} yumuşak PP whoop şasesidir; ${fmtB(b.mass, 0)} g batarya bu şase için ağır.`);
    if (twr < 1) add("bad", `Kalkamaz: tam gaz itki ${fmtB(thrust, 0)} g, ağırlık ${fmtB(auw, 0)} g.`);
    else if (twr < 1.8) add("warn", `Ağır: itki/ağırlık ${fmtB(twr, 1)}. Kalkar ama zor tutunur; sert rüzgârda geri kalır.`);
    else add("ok", `İtki/ağırlık ${fmtB(twr, 1)}: ${twr >= 6 ? "çok çevik, yarış/freestyle sınıfı" : twr >= 3.5 ? "çevik" : "rahat uçar"}.`);
    if (sw.breakRpm && sw.breakRpm < top) add("bad", `Pervane tam gazda kırılır (${fmtB(sw.breakRpm, 0)} devir/dk'da). Daha dayanıklı filament ya da daha kalın kök seç.`);
    else if (sw.yieldRpm && sw.yieldRpm < top) add("warn", `Pervane tam gazda kalıcı bükülür (${fmtB(sw.yieldRpm, 0)} devir/dk'dan sonra).`);
    else add("ok", `${mt.name} pervane tam gazda sağlam kalıyor.`);
    if (twr >= 1 && minutes < 2.5) add("warn", `Uçuş süresi kısa: ~${fmtB(minutes, 1)} dk. Daha büyük batarya ya da daha hafif parçalar dene.`);
    if (auw < 250) add("ok", `Kalkış ağırlığı 250 g'ın altında: birçok ülkede en hafif drone sınıfı.`);
    const mass = [["Şase", f.mass], ["Motorlar (4)", 4 * m.mass], [e.aio ? "ESC + uçuş kartı" : "ESC", e.mass]];
    if (fc) mass.push(["Uçuş kartı", fc.mass]);
    mass.push(["Batarya", b.mass], ["Görüntü sistemi", v.mass]);
    if (rx.mass) mass.push(["Alıcı", rx.mass]);
    if (g.mass) mass.push(["GPS", g.mass]);
    mass.push([`Pervaneler (4, ${mt.name})`, 4 * propMass]);
    return { auw, thrust, twr, top, Ih, Imax, minutes, bLimit, propMass, checks, mt, mass };
  },

  /* ---------------- Sınıf, arama ve uyumluluk süzgeci ---------------- */
  classes(cat, p) {
    if (cat === "frame") return [propClass(p.maxProp)];
    if (cat === "motor") return [propClass(p.propIn)];
    if (cat === "esc") return p.cMax <= 2 ? ["whoop"] : p.amps <= 25 ? ["micro"] : p.amps <= 45 ? ["micro", "five"] : p.amps <= 60 ? ["five", "big"] : ["big"];
    if (cat === "battery") return p.cells <= 2 ? ["whoop", "micro"] : p.chem === "Li-ion" || p.mah >= 1800 ? ["big"] : p.mah <= 900 ? ["micro"] : p.cells <= 4 ? ["micro", "five"] : ["five", "big"];
    if (cat === "video") return p.mass <= 10 ? ["whoop", "micro"] : ["micro", "five", "big"];
    if (cat === "gps") return p.mass ? ["micro", "five", "big"] : ["whoop", "micro", "five", "big"];
    return ["whoop", "micro", "five", "big"];
  },
  /** Diğer seçili parçalarla açık bir çelişkisi yok mu? */
  fits(cat, p) {
    const c = this.cfg, f = this.part("frame"), m = this.part("motor"), e = this.part("esc"), b = this.part("battery");
    if (cat === "motor") return b.cells <= p.cells && b.cells >= (p.cellsMin || 1) && p.propIn <= f.maxProp * 1.4 && p.propIn >= f.maxProp * 0.5;
    if (cat === "esc") return b.cells >= p.cMin && b.cells <= p.cMax && (c.rx !== "onboard" || p.rx || p.vtx);
    if (cat === "battery") return p.cells >= e.cMin && p.cells <= e.cMax && p.cells <= m.cells && p.cells >= (m.cellsMin || 1);
    if (cat === "frame") return m.propIn <= p.maxProp * 1.4 && m.propIn >= p.maxProp * 0.5;
    if (cat === "rx") return p.mass > 0 || e.rx || e.vtx;
    return true;
  },
  shown(cat, k, p) {
    if (k === this.cfg[cat]) return true;
    const c = this.cfg;
    if (c.cls !== "all" && !this.classes(cat, p).includes(c.cls)) return false;
    if (c.compat && !this.fits(cat, p)) return false;
    if (c.q) {
      const t = (cat === "motor" ? p.name : `${p.brand} ${p.model} ${p.note || ""} ${p.matNote || ""}`).toLocaleLowerCase("tr");
      if (!c.q.toLocaleLowerCase("tr").split(/\s+/).every((w) => t.includes(w))) return false;
    }
    return true;
  },

  /* ---------------- Arayüz ---------------- */
  init() {
    this.load();
    const root = document.querySelector("#buildParts");
    if (!root) return;
    root.addEventListener("click", (ev) => {
      const p = ev.target.closest("[data-cat]");
      if (p) {
        this.cfg[p.dataset.cat] = p.dataset.k;
        if (p.dataset.cat === "frame") this.cfg.dia = Math.floor(PARTS.frame.items[p.dataset.k].maxProp * 10) / 10;   // şaseye uyan pervane
        this.changed(); return;
      }
      const cl = ev.target.closest("[data-cls]");
      if (cl) {
        const k = cl.dataset.cls;
        this.cfg.cls = k;
        // Başka sınıfa geçince o sınıfın gerçek parçalardan başlangıç yapısı kurulur (sonra istenen parça değiştirilir)
        if (k !== "all" && !this.classes("frame", this.part("frame")).includes(k)) { this.preset(k); this.changed(); }
        else { this.save(); this.render(); }
        return;
      }
      const bl = ev.target.closest("[data-blades]");
      if (bl) { this.cfg.blades = Number(bl.dataset.blades); this.changed(); return; }
      const co = ev.target.closest("[data-color]");
      if (co) { this.cfg.color = co.dataset.color; this.changed(); }
    });
    root.addEventListener("input", (ev) => {
      const t = ev.target;
      if (t.id === "bQ") { this.cfg.q = t.value.trim(); this.renderLists(); return; }
      if (t.id === "bDia") this.cfg.dia = Number(t.value);
      else if (t.id === "bPitch") this.cfg.pitch = Number(t.value);
      else return;
      this.apply(); this.renderSum(); this.renderPropVals();
    });
    root.addEventListener("change", (ev) => {
      if (ev.target.id === "bDia" || ev.target.id === "bPitch") this.changed();
      else if (ev.target.id === "bCompat") { this.cfg.compat = ev.target.checked; this.save(); this.renderLists(); }
    });
    const sum = document.querySelector("#buildSum");
    sum.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-use]");
      if (b) this.use(b.dataset.use);
      if (ev.target.closest("[data-export]")) this.exportFile();
      if (ev.target.closest("[data-import]")) this.pickFile();
    });
    sum.addEventListener("input", (ev) => { if (ev.target.id === "bName") { this.cfg.name = ev.target.value.trim().slice(0, 40); this.apply(); this.save(); } });
    sum.addEventListener("change", (ev) => { if (ev.target.id === "bName" && typeof refreshCustomDrone === "function") refreshCustomDrone(); });
    this.render();
  },

  /* ---------------- İçe / dışa aktarma (.drone.json) ----------------
     Biçim: { format: "pervane-drone", version: 1, name, parts: { frame, motor, esc, battery, video, rx, gps },
              prop: { diameterIn, pitchIn, blades }, color, app, created, details: { okunabilir parça adları ve hesaplar } }
     İçe aktarırken yalnız "parts", "prop" ve "color" kullanılır; tanınmayan parça varsa o bölümde mevcut seçim kalır ve söylenir. */
  toJSON() {
    const c = this.cfg, r = this.compute(), names = {};
    for (const cat of this.CATS) { const p = this.part(cat); names[cat] = cat === "motor" ? p.name : `${p.brand} ${p.model}`.trim(); }
    return {
      format: this.FORMAT, version: 1, app: typeof APP_VERSION !== "undefined" ? APP_VERSION : "", created: new Date().toISOString(),
      name: c.name || "Kendi drone'um",
      parts: Object.fromEntries(this.CATS.map((k) => [k, c[k]])),
      prop: { diameterIn: c.dia, pitchIn: c.pitch, blades: c.blades }, color: c.color,
      details: { parts: names, takeoffWeightG: Math.round(r.auw), thrustToWeight: +r.twr.toFixed(2), hoverMinutes: +r.minutes.toFixed(1), filament: r.mt.name }
    };
  },
  exportFile() {
    const data = this.toJSON(), safe = (data.name || "drone").replace(/[^\p{L}\p{N}\- _]/gu, "").trim().replace(/\s+/g, "-") || "drone";
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${safe}.drone.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    if (typeof toast === "function") toast(`Drone dışa aktarıldı: ${a.download}`, "ok");
  },
  pickFile(then) {
    let inp = document.querySelector("#droneFileIn");
    if (!inp) {
      inp = document.createElement("input");
      inp.type = "file"; inp.accept = ".json,.drone.json,application/json"; inp.id = "droneFileIn"; inp.hidden = true;
      document.body.appendChild(inp);
      inp.addEventListener("change", async () => {
        const f = inp.files && inp.files[0];
        inp.value = "";
        if (!f) return;
        try { this.importData(JSON.parse(await f.text()), inp._then); }
        catch (e) { if (typeof toast === "function") toast("Dosya okunamadı: geçerli bir drone dosyası (.drone.json) değil.", "bad"); }
      });
    }
    inp._then = then;
    inp.click();
  },
  /** Dosyadan gelen drone'u atölyeye uygular. then: "use" ise hemen düzenekte de seçilir */
  importData(j, then) {
    if (!j || j.format !== this.FORMAT || !j.parts) throw new Error("biçim");
    const missing = [];
    for (const cat of this.CATS) {
      const k = j.parts[cat];
      if (k == null) continue;
      if (this.has(cat, k)) this.cfg[cat] = k;
      else missing.push(`${PARTS[cat].title}: ${(j.details && j.details.parts && j.details.parts[cat]) || k}`);
    }
    if (j.prop) {
      if (isFinite(j.prop.diameterIn)) this.cfg.dia = Math.max(1, Math.min(12, Number(j.prop.diameterIn)));
      if (isFinite(j.prop.pitchIn)) this.cfg.pitch = Math.max(1, Math.min(7, Number(j.prop.pitchIn)));
      if ([2, 3, 4].includes(Number(j.prop.blades))) this.cfg.blades = Number(j.prop.blades);
    }
    if (/^#[0-9a-f]{6}$/i.test(j.color || "")) this.cfg.color = j.color.toLowerCase();
    this.cfg.name = String(j.name || "").slice(0, 40);
    this.cfg.cls = "all";
    this.changed();
    if (typeof toast === "function") toast(missing.length ? `"${this.cfg.name || "Drone"}" içe aktarıldı; bu sürümde bulunmayan parçalar için mevcut seçim kaldı: ${missing.join(", ")}` : `"${this.cfg.name || "Drone"}" içe aktarıldı`, missing.length ? "warn" : "ok");
    if (then === "use" && typeof S !== "undefined") {
      S.droneKey = "custom";
      document.querySelector("#droneSel").value = "custom";
      if (S.rig === "stand") setRig("drone"); else refreshCustomDrone();
    }
  },
  changed() {
    this.apply(); this.save(); this.render();
    if (typeof refreshCustomDrone === "function") refreshCustomDrone();   // listelerdeki adlar; seçiliyse düzenek de yenilenir
  },
  /** Sınıfın başlangıç yapısı (gerçek parçalar); batarya katalogdan hücre ve kapasiteye göre seçilir */
  preset(cls) {
    const bat = (cells, lo, hi, chem) => Object.keys(PARTS.battery.items).find((k) => { const b = PARTS.battery.items[k]; return b.cells === cells && b.mah >= lo && b.mah <= hi && (!chem || b.chem === chem); })
      || Object.keys(PARTS.battery.items).find((k) => PARTS.battery.items[k].cells === cells) || this.cfg.battery;
    const P = {
      whoop: { frame: "betafpvMeteor75Pro", motor: "betafpv0802", esc: "betafpvMatrix1s", battery: bat(1, 450, 600), video: "whoopAnalog", rx: "onboard", gps: "none", dia: 1.7, pitch: 1.3, blades: 3 },
      micro: { frame: "five33TinyTrainerV2", motor: "iflight1404", esc: "betafpvToothpickF405V4", battery: bat(4, 600, 900), video: "djiO4", rx: "happymodelEp2", gps: "none", dia: 3, pitch: 2.5, blades: 3 },
      five: { frame: this.DEF.frame, motor: this.DEF.motor, esc: this.DEF.esc, battery: this.DEF.battery, video: this.DEF.video, rx: this.DEF.rx, gps: "none", dia: 5, pitch: 4.3, blades: 3 },
      big: { frame: "iflightChimera7", motor: "xing2809", esc: "iflightBlitzE55", battery: bat(6, 4000, 5000, "Li-ion") || bat(6, 3000, 5000), video: "djiO4Pro", rx: "radiomasterRp3", gps: "matekM10q", dia: 7.5, pitch: 3.7, blades: 3 }
    }[cls];
    if (!P) return;
    for (const [k, v] of Object.entries(P)) if (typeof v !== "string" || this.has(k, v)) this.cfg[k] = v;
  },
  /** Bu drone'u bağlı testte ya da uçuşta kullan */
  use(rig) {
    if (typeof S === "undefined") return;
    S.droneKey = "custom";
    document.querySelector("#droneSel").value = "custom";
    showPage("lab");
    if (S.rig !== rig) setRig(rig); else refreshCustomDrone();
  },
  card(cat, k, title, sub, mass, on, p) {
    const est = p && ((p.est && p.est.length) || p.estimated);
    const tip = [p && p.src ? "Kaynak: " + p.src : "", p && p.est && p.est.length ? "Tahmin: " + p.est.join(", ") : "", p && p.note ? p.note : ""].filter(Boolean).join("\n");
    return `<button type="button" class="part${on ? " on" : ""}" data-cat="${cat}" data-k="${k}" aria-pressed="${on}"${tip ? ` title="${escB(tip)}"` : ""}><b>${escB(title)}</b><small>${escB(sub)}${est ? ' · <i class="est">yaklaşık</i>' : ""}</small><em>${mass ? fmtB(mass, mass < 10 ? 1 : 0) + " g" : "–"}</em></button>`;
  },
  list(cat) {
    const c = this.cfg, out = [];
    let hidden = 0;
    const each = (k, p, title, sub, mass) => { if (this.shown(cat, k, p)) out.push(this.card(cat, k, title, sub, mass, c[cat] === k, p)); else hidden++; };
    if (cat === "motor") for (const k of PARTS.motor.keys) { const m = MOTORS[k]; each(k, m, motorBase(m), `${m.cellsMin && m.cellsMin !== m.cells ? m.cellsMin + "–" : ""}${m.cells}S · en çok ${m.pmax} W · ${m.imax} A · ~${fmtB(m.propIn, 1)}" pervane`, m.mass); }
    else for (const [k, p] of Object.entries(PARTS[cat].items)) each(k, p, `${p.brand} ${p.model}`.trim(), this.sub(cat, p), p.mass);
    return `<div class="parts">${out.join("") || '<p class="bnone">Bu süzgeçte parça yok.</p>'}</div>${hidden ? `<p class="bhid">${hidden} parça süzgeç dışında</p>` : ""}`;
  },
  sub(cat, p) {
    if (cat === "frame") return `${MAT_NAMES[p.mat] || p.mat} · ${p.wb} mm · en çok ${fmtB(p.maxProp, p.maxProp % 1 ? 2 : 0)}" pervane${p.ducts ? " · korumalı" : ""}`;
    if (cat === "esc") return `${p.amps} A (kısa ${p.burst} A) · ${p.cMin === p.cMax ? p.cMin + "S" : p.cMin + "–" + p.cMax + "S"} · ${p.mount}${p.aio ? " · uçuş kartı dahil" : ""}`;
    if (cat === "battery") return `${p.cells}S ${p.mah} mAh ${p.chem} · ${p.maxA ? "sürekli " + p.maxA + " A" : p.c + "C ≈ " + fmtB(p.mah / 1000 * p.c, 0) + " A"}${p.conn ? " · " + p.conn : ""}`;
    if (cat === "video") return `${p.kind === "digital" ? "Dijital" : "Analog"} · ~${fmtB(p.watts, 1)} W · ${p.note || ""}`;
    return `${p.note || ""}${p.watts ? " · ~" + fmtB(p.watts, 2) + " W" : ""}`;
  },
  render() {
    const c = this.cfg, root = document.querySelector("#buildParts");
    if (!root) return;
    const f = this.part("frame");
    root.innerHTML =
      `<div class="bfilter">
        <div class="seg bcls" role="group" aria-label="Drone sınıfı">${CLASSES.map(([k, n]) => `<button type="button" data-cls="${k}" class="${c.cls === k ? "active" : ""}">${n}</button>`).join("")}</div>
        <label class="bsearch"><svg class="ic" aria-hidden="true"><use href="#i-search"/></svg><input id="bQ" type="search" placeholder="Marka ya da model ara (ör. T-Motor, 2207, O3)" value="${escB(c.q)}" autocomplete="off" spellcheck="false"></label>
        <label class="check bcompat"><input type="checkbox" id="bCompat"${c.compat ? " checked" : ""}> Yalnız uyumlu parçalar</label>
      </div>
      <div id="bLists"></div>
      <section class="bsec"><div class="bsec-h"><b>Pervane</b><span>Filament, kök genişliği ve kalınlığı laboratuvardan; en büyük boyutu şase belirler</span></div>
        <div class="bprop">
          <label>Çap <b id="bDiaV"></b><input type="range" id="bDia" min="1" max="${f.maxProp}" step="0.05" value="${c.dia}"></label>
          <label>Hatve <b id="bPitchV"></b><input type="range" id="bPitch" min="1" max="7" step="0.1" value="${c.pitch}"></label>
          <div class="bline"><span>Kanat sayısı</span><div class="seg">${[2, 3, 4].map((n) => `<button type="button" data-blades="${n}" class="${c.blades === n ? "active" : ""}">${n}</button>`).join("")}</div></div>
          <div class="bline"><span>Renk (TPU parçalar, plastik şasede gövde)</span><div class="bcolors">${BUILD_COLORS.map(([h, n]) => `<button type="button" class="bcol${c.color === h ? " on" : ""}" data-color="${h}" title="${n}" aria-label="${n}" style="--c:${h}"></button>`).join("")}</div></div>
        </div></section>`;
    root.querySelectorAll("input[type=range]").forEach((r) => { if (typeof paintRange === "function") paintRange(r); });
    this.renderLists();
    this.renderPropVals();
    this.renderSum();
  },
  renderLists() {
    const el = document.querySelector("#bLists");
    if (!el) return;
    el.innerHTML = ["frame", "motor", "esc", "battery", "video", "rx", "gps"].map((cat) =>
      `<section class="bsec"><div class="bsec-h"><b>${PARTS[cat].title}</b><span>${PARTS[cat].hint}</span></div>${this.list(cat)}</section>`).join("");
  },
  renderPropVals() {
    const c = this.cfg, a = document.querySelector("#bDiaV"), b = document.querySelector("#bPitchV");
    if (a) a.textContent = `${fmtB(c.dia, 2)}" (${fmtB(c.dia * 25.4, 0)} mm)`;
    if (b) b.textContent = `${fmtB(c.pitch, 1)}"`;
  },
  renderSum() {
    const el = document.querySelector("#buildSum");
    if (!el) return;
    const r = this.compute(), worst = r.checks.some(([k]) => k === "bad") ? "bad" : r.checks.some(([k]) => k === "warn") ? "warn" : "ok";
    const stat = (l, v, k = "") => `<div class="bstat ${k}"><small>${l}</small><b>${v}</b></div>`;
    const chosen = [["frame", "Şase"], ["motor", "Motor"], ["esc", "ESC"], ["battery", "Batarya"], ["video", "Görüntü"], ["rx", "Alıcı"], ["gps", "GPS"]]
      .map(([cat, n]) => { const p = this.part(cat); return p && (cat !== "gps" || p.mass) && (cat !== "rx" || p.mass) ? [n, cat === "motor" ? motorBase(p) : `${p.brand} ${p.model}`, p.src] : null; }).filter(Boolean);
    if (this.fcPart()) chosen.push(["Uçuş kartı", `${PARTS_DB.fc.brand} ${PARTS_DB.fc.model}`, PARTS_DB.fc.src]);
    el.innerHTML = `
      <div class="bsum-h"><input id="bName" class="bname" type="text" maxlength="40" placeholder="Kendi drone'um" value="${escB(this.cfg.name)}" aria-label="Drone'un adı" spellcheck="false"><span class="chip ${worst === "ok" ? "good" : worst}">${worst === "ok" ? "Uçmaya hazır" : worst === "warn" ? "Uyarılar var" : r.twr < 1 ? "Kalkamaz" : "Sorunlu"}</span></div>
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
      <details class="more bsrc"><summary><span class="more-t">Seçilen parçalar ve kaynakları</span></summary>
        <ul>${chosen.map(([n, t, s]) => `<li><span>${escB(n)}</span>${s ? `<a href="${escB(s)}" target="_blank" rel="noopener">${escB(t)}</a>` : escB(t)}</li>`).join("")}</ul></details>
      <div class="bactions">
        <button type="button" class="btn primary" data-use="fly"><svg class="ic" aria-hidden="true"><use href="#i-fly"/></svg>Bu drone'la uç</button>
        <button type="button" class="btn" data-use="drone"><svg class="ic" aria-hidden="true"><use href="#i-drone"/></svg>Bağlı testte dene</button>
      </div>
      <div class="bactions bfile">
        <button type="button" class="btn small" data-export><svg class="ic" aria-hidden="true"><use href="#i-download"/></svg>Dışa aktar (.drone.json)</button>
        <button type="button" class="btn small" data-import><svg class="ic" aria-hidden="true"><use href="#i-upload"/></svg>İçe aktar</button>
      </div>
      <p class="note">Hesap seçili filamentle (${escB(r.mt.name)}) ve laboratuvardaki pervane kesitiyle yapılır. Parça değerleri üretici ya da satıcı sayfalarındandır; "yaklaşık" yazanlarda bazı değerler tahmindir (kartın üstünde durunca kaynak görünür).</p>`;
  }
};
/** Motor adı, gerilim kısmı olmadan: "iFlight XING2 2207 · 1750KV · 6S" → "iFlight XING2 2207 · 1750KV" */
function motorBase(m) { return m.name.split(" · ").filter((s) => !/^\d+S$/.test(s) && !/^[\d,.]+ V$/.test(s)).join(" · "); }
function fmtB(n, d = 0) { return Number(n).toLocaleString("tr-TR", { maximumFractionDigits: d, minimumFractionDigits: d }); }
function escB(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); }

// Kayıtlı tasarım sayfa açılırken uygulanır: drone ve motor listeleri "Kendi drone'um"u hemen içerir
Builder.load();
