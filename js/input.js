/* =========================================================
   KUMANDA – Klavye, oyun kumandası (gamepad) ve RC kumandalar
   ---------------------------------------------------------
   Tarayıcının Gamepad API'si USB'den takılan oyun çubuklarını
   (HID) görür: Xbox / PlayStation kumandaları ve USB simülatör
   kumandaları (FlySky FS-SM600 gibi).

   Dört işlev eşlenir (hepsi −1..+1; yaysız gaz ayrıca 0..1):
     roll  (yatış)     : + = sağa
     pitch (yunuslama) : + = ileri (burun aşağı)
     yaw   (yön)       : + = sağa dön
     thr   (gaz)       : + = yukarı

   · "Standart" gamepad (Xbox/PS) → Mode 2: sol çubuk gaz + yön,
     sağ çubuk yunuslama + yatış. Gaz çubuğu kendiliğinden ortaya
     döndüğü için "ortalanmış" sayılır (orta = askı gazı).
   · RC simülatör kumandaları kanalları eksenlere sırayla verir;
     gaz kolu yaysızdır (alt = %0, üst = %100).

   FlySky FS-SM600 hakkında (üretici belgesi ve kullanıcı
   bildirimlerinden; bu kumandayla bizzat denenmemiştir):
   · Önündeki 4 konumlu anahtar (Reflex XTR / G3–G4.5 / APD /
     PhoenixRC) USB kimliğini ve eksenleri değiştirir; anahtar
     kumanda takılmadan önce ayarlanmalıdır. XTR konumunda bazı
     çubuklar eksik gelebilir; PhoenixRC konumunu Windows'ta
     tarayıcı büyük olasılıkla oyun çubuğu olarak görmez.
   · Hangi çubuğun hangi eksene düştüğü belgelenmemiştir. Benzer
     bir cihazda "G4.5+" kipinde X yatış, Y yunuslama, Rx gaz,
     Ry yön olarak bildirilmiştir; ön ayar budur. Kesin eşleme
     için "Otomatik eşle" sihirbazı her çubuğu sırayla oynattırır.
   · Tarayıcı, bir eksen en az bir kez ortadan geçene kadar onu 0
     gösterir. Gaz kolu en altta beklerken "orta" gibi okunur; bu
     yüzden motorlar ancak gaz gerçekten en alta inince çalışır.
   ========================================================= */

const Input = {
  KEY: "pervane.kumanda",
  store: null,               // { [cihaz kimliği]: ayar }
  kb: { roll: 0, pitch: 0, yaw: 0 }, kbThr: 0,
  selIndex: null,            // kullanıcının seçtiği kumanda (yoksa ilk bulunan)
  wiz: null, last: null,
  FUNCS: ["roll", "pitch", "thr", "yaw"],
  NAMES: { roll: "Yatış (roll)", pitch: "Yunuslama (pitch)", thr: "Gaz (throttle)", yaw: "Yön (yaw)" },

  load() {
    if (this.store) return this.store;
    try { this.store = JSON.parse(localStorage.getItem(this.KEY)) || {}; } catch (e) { this.store = {}; }
    return this.store;
  },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.store || {})); } catch (e) { /* özel pencere: hatırlanmaz */ } },

  /** Bağlı kumandalar (tarayıcı, kumandada bir tuşa basılana ya da bir çubuk yarıdan fazla itilene kadar göstermez) */
  pads() {
    if (!navigator.getGamepads) return [];
    return Array.from(navigator.getGamepads()).filter((g) => g && g.connected !== false && g.axes && g.axes.length >= 2);
  },
  pad() {
    const list = this.pads();
    return list.find((g) => g.index === this.selIndex) || list[0] || null;
  },
  /** Kısa cihaz adı: "RC Simulator - G4.5+… Controller (Vendor: 1781 Product: 0e56)" → parantez öncesi */
  describe(pad) { return (pad.id || "Kumanda").replace(/\s*\((STANDARD GAMEPAD\s*)?Vendor:.*$/i, "").replace(/\s*\(.*$/, "").trim() || "Kumanda"; },
  kind(pad) { return pad.mapping === "standard" ? "gamepad" : "rc"; },
  /** FlySky / PengFei / FeiYing simülatör kumandaları ve benzerleri (ad ya da USB kimliğinden) */
  isSimRadio(pad) { return /fly\s*sky|fs-?\s*sm|sm600|sm100|pengfei|feiying|kmodel|rc simulator|simulator.*controller|phoenixrc|xtr\+g2|1781.*0e56|0b9b.*4012/i.test(pad.id || ""); },

  /** Cihaz türüne göre varsayılan eşleme (which: "gamepad" | "rc" | "rc-g45") */
  preset(pad, which) {
    const type = which || (this.kind(pad) === "gamepad" ? "gamepad" : /G4\.5|G5|pengfei/i.test(pad.id || "") && pad.axes.length >= 5 ? "rc-g45" : "rc");
    if (type === "gamepad") return { preset: "gamepad", centered: true, dead: 0.1, map: { roll: { a: 2, inv: false }, pitch: { a: 3, inv: true }, thr: { a: 1, inv: true }, yaw: { a: 0, inv: false } } };
    // "G4.5+" kipi (benzer cihazda bildirilen): X yatış, Y yunuslama, Rx gaz, Ry yön
    if (type === "rc-g45") return { preset: "rc-g45", centered: false, dead: 0.04, map: { roll: { a: 0, inv: false }, pitch: { a: 1, inv: false }, thr: { a: 3, inv: false }, yaw: { a: 4, inv: false } } };
    // Genel RC sırası AETR: X yatış, Y yunuslama, Z gaz, Rx yön
    return { preset: "rc", centered: false, dead: 0.04, map: { roll: { a: 0, inv: false }, pitch: { a: 1, inv: false }, thr: { a: 2, inv: false }, yaw: { a: 3, inv: false } } };
  },
  cfg(pad) { return this.load()[pad.id] || this.preset(pad); },
  hasCfg(pad) { return !!this.load()[pad.id]; },
  setCfg(pad, cfg) { this.load()[pad.id] = cfg; this.save(); },
  resetCfg(pad) { delete this.load()[pad.id]; this.save(); },

  /** Bir işlevin −1..+1'e çevrilmiş değeri (kalibrasyon, ölü bölge ve yön uygulanmış) */
  axis(pad, c, name) {
    const m = c.map[name];
    if (!m || m.a == null || m.a >= pad.axes.length) return 0;
    let v = pad.axes[m.a];
    const cal = c.cal && c.cal[m.a], lo = cal ? cal.min : -1, hi = cal ? cal.max : 1;
    if (name === "thr" && !c.centered) v = hi > lo ? ((v - lo) / (hi - lo)) * 2 - 1 : 0;      // yaysız gaz: uçtan uca
    else {
      const ctr = cal ? cal.center : 0;
      v = v >= ctr ? (v - ctr) / Math.max(0.05, hi - ctr) : (v - ctr) / Math.max(0.05, ctr - lo);
      const dz = c.dead || 0;
      v = Math.abs(v) < dz ? 0 : (Math.sign(v) * (Math.abs(v) - dz)) / (1 - dz);
    }
    if (m.inv) v = -v;
    return Math.max(-1, Math.min(1, v));
  },

  /**
   * Her karede çağrılır. Dönen değer:
   *  roll, pitch, yaw : −1..+1
   *  thr              : 0..1 (yaysız gaz ya da klavye); ortalanmış gazda null
   *  thrRaw, centered : ortalanmış gaz çubuğunun −1..+1 değeri
   *  climb            : −1..+1 (kolay modda tırmanma isteği)
   */
  read(dt, mode) {
    const K = typeof Fly !== "undefined" ? Fly.keys : new Set(), ax = (a, b) => (K.has(a) ? 1 : 0) - (K.has(b) ? 1 : 0);
    const clamp = (v, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));
    // Klavye: tuşlar sanal çubuğu yumuşakça iter; hız (rate) modlarında tam çubuk çok sert olacağı için sınırlıdır
    const lim = mode === "acro" || mode === "horizon" ? 0.55 : 1;
    const tgt = { roll: ax("KeyD", "KeyA") * lim, pitch: ax("KeyW", "KeyS") * lim, yaw: ax("KeyX", "KeyZ") * lim };
    for (const n of ["roll", "pitch", "yaw"]) {
      const d = tgt[n] - this.kb[n];
      this.kb[n] += Math.sign(d) * Math.min(Math.abs(d), (tgt[n] === 0 ? 9 : 6) * dt);
    }
    const ud = ax("KeyE", "KeyQ");
    this.kbThr = clamp(this.kbThr + ud * 0.55 * dt, 0, 1);
    const out = { roll: this.kb.roll, pitch: this.kb.pitch, yaw: this.kb.yaw, thr: this.kbThr, thrRaw: 0, centered: false, climb: ud, src: "klavye", name: "Klavye" };
    const pad = this.pad();
    if (pad) {
      const c = this.cfg(pad), t = this.axis(pad, c, "thr");
      out.roll = clamp(out.roll + this.axis(pad, c, "roll"));
      out.pitch = clamp(out.pitch + this.axis(pad, c, "pitch"));
      out.yaw = clamp(out.yaw + this.axis(pad, c, "yaw"));
      if (c.centered) { out.centered = true; out.thrRaw = clamp(t + ud); out.thr = null; out.climb = out.thrRaw; }
      else {
        out.thr = (t + 1) / 2;
        out.climb = Math.abs(out.thr - 0.5) < 0.08 ? ud : clamp((out.thr - 0.5) * 2.2 + ud);   // kolay modda: orta = yükseklik sabit
      }
      out.src = this.kind(pad);
      out.name = this.describe(pad);
    }
    this.last = out;
    return out;
  },

  /* ---------------- Otomatik eşleme sihirbazı ----------------
     1) Tüm çubuklar sonuna kadar çevrilir (her eksenin en küçük / en büyük değeri ölçülür;
        tarayıcı da ancak ortadan geçen ekseni gerçek değeriyle göstermeye başlar).
     2) Çubuklar bırakılır, gaz en alta indirilir ve "Devam"a basılır (orta noktalar ölçülür;
        gaz ortada duruyorsa çubuk yaylıdır → "ortalanmış" gaz).
     3) Sırayla: gaz yukarı, yön sağa, yatış sağa, yunuslama ileri. En çok hareket eden boş eksen
        o işleve atanır; hareketin yönü tersse "ters" işaretlenir. */
  STEPS: [
    { k: "range", text: "Tüm çubukları ve gaz kolunu birkaç kez sonuna kadar çevir. Sonra çubukları bırak, GAZ kolunu en ALTA indir ve “Devam”a bas." },
    { k: "thr", text: "GAZ kolunu en ÜSTE it ve orada tut." },
    { k: "yaw", text: "YÖN (yaw) çubuğunu tam SAĞA it ve tut." },
    { k: "roll", text: "YATIŞ (roll) çubuğunu tam SAĞA it ve tut." },
    { k: "pitch", text: "YUNUSLAMA (pitch) çubuğunu tam İLERİ (yukarı) it ve tut." }
  ],
  startWizard() {
    const pad = this.pad();
    if (!pad) return false;
    this.wiz = { step: 0, id: pad.id, min: Array.from(pad.axes), max: Array.from(pad.axes), center: null, base: null, hold: 0, map: {}, used: [] };
    return true;
  },
  cancelWizard() { this.wiz = null; },
  /** "Devam": ölçüm adımını bitirir, orta noktaları kaydeder */
  wizardNext() {
    const w = this.wiz, pad = this.pad();
    if (!w || !pad || this.STEPS[w.step].k !== "range") return;
    w.center = Array.from(pad.axes);
    w.step++; w.base = null; w.hold = 0;
  },
  /** Her karede: aralıkları günceller, istenen hareketi algılar. Bittiğinde true döner. */
  wizardTick(dt) {
    const w = this.wiz, pad = this.pad();
    if (!w || !pad) return false;
    pad.axes.forEach((v, i) => { w.min[i] = Math.min(w.min[i], v); w.max[i] = Math.max(w.max[i], v); });
    const st = this.STEPS[w.step];
    if (!st || st.k === "range") return false;
    if (!w.base) w.base = Array.from(pad.axes);
    let best = -1, bestD = 0;
    pad.axes.forEach((v, i) => {
      if (w.used.includes(i)) return;
      const d = (v - w.base[i]) / Math.max(0.2, w.max[i] - w.min[i]);       // aralığa oranla hareket
      if (Math.abs(d) > Math.abs(bestD)) { bestD = d; best = i; }
    });
    w.cand = best; w.candD = bestD;
    if (best >= 0 && Math.abs(bestD) > 0.38) w.hold += dt; else w.hold = 0;
    if (w.hold < 0.3) return false;
    w.map[st.k] = { a: best, inv: bestD < 0 };
    w.used.push(best);
    w.step++; w.base = null; w.hold = 0;
    if (w.step < this.STEPS.length) return false;
    // Bitti: gaz ekseni bırakıldığında ortadaysa yaylıdır
    const ta = w.map.thr.a, frac = (w.center[ta] - w.min[ta]) / Math.max(0.2, w.max[ta] - w.min[ta]), centered = frac > 0.3 && frac < 0.7;
    this.setCfg(pad, {
      preset: "özel", centered, dead: centered ? 0.08 : 0.04, map: w.map,
      cal: w.min.map((mn, i) => ({ min: mn, max: w.max[i], center: w.center[i] }))
    });
    this.wiz = null;
    return true;
  }
};
