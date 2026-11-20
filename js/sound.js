/* =========================================================
   SES – Fırçasız motor + pervane sesi (Web Audio)
   ---------------------------------------------------------
   Ses bir kayıt değildir: yayımlanmış ölçümlerde (NASA ve
   üniversite yankısız oda deneyleri; kaynaklar README'nin
   "Motor sesi" bölümünde) tarif edilen bileşenlerden üretilir
   ve hepsi GERÇEK devire bağlıdır. Frekanslar ölçeklenmez:
   20.000 devir/dk'da iki kanatlı pervanenin temel tonu
   gerçekteki gibi 667 Hz'dir.

   1) Kanat geçiş frekansı  KGF = kanat sayısı × devir / 60
      ve katları → pervanenin "vızıltısı". Pervane bir kolun
      ya da gövdenin hemen üstünde döndüğünde (test standı,
      drone kolları) üst katlar da güçlüdür: ölçümlerde ilk
      dört kat yaklaşık aynı düzeydedir.
   2) Mil frekansının katları → kanatlar tam özdeş olmadığı
      için var olan, KGF'den belirgin biçimde zayıf ara tonlar.
   3) Motorun elektromanyetik vınlaması → elektriksel frekans
      (kutup çifti × mil frekansı) ve katları. Bunlar her yerde
      değil, motor çanının rezonansına denk geldikleri yerde
      duyulur (22xx motorlarda 4,5–5,5 kHz ve ~1,2 kHz); devir
      değiştikçe tonlar rezonansın içinden geçer.
   4) Geniş bantlı hava gürültüsü → 600 Hz'in üstünde geniş
      bir tümsek; kanat ucu hızıyla çok hızlı artar ve kanat
      geçişiyle dalgalanır ("hırıltı").

   Dronlarda dört motor birbirinden %1–2 farklı devirde döner;
   tonların üst üste binmesi gerçekteki dalgalanmayı (vuru)
   verir. Ses düzeyi kanat ucu hızına göre artar: küçük pervane
   çok hızlı dönse de daha sessizdir.

   İki bilinçli sadeleştirme:
   · Ölçümlerde ses, devirin iki katına çıkmasıyla ~18 dB artar
     (uç hızının 6. kuvveti). Burada artış biraz kısıldı ki
     düşük devir hoparlörde duyulabilsin.
   · Çan rezonansı yalnızca 22xx/23xx motorlar için ölçülmüştür;
     diğer boyutlarda motor çapıyla ters orantılı kabul edildi.
   ========================================================= */

const Sound = {
  ctx: null, on: false, voices: [], waveKey: "", live: false,
  SPEED_OF_SOUND: 343,       // m/s
  BELL_RES_HZ: 4800,         // 22 mm statorlu motorda çanın 2. titreşim kipi (ölçülen 4,4–5,1 kHz)

  /** Aç / kapat. İlk açılışta ses grafiği kurulur (tarayıcı, kullanıcı tıklaması ister). */
  toggle() {
    this.on = !this.on;
    if (this.on && !this.ctx) {
      this.build(new (window.AudioContext || window.webkitAudioContext)(), 4);
      this.live = true;
      this.beeps();
    }
    if (this.ctx && this.live) this.ctx[this.on ? "resume" : "suspend"]();
    return this.on;
  },

  /** Ses grafiğini verilen bağlamda kurar (testlerde OfflineAudioContext verilir) */
  build(ctx, nVoices) {
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();          // dört motor üst üste binince kırpılmasın
    comp.threshold.value = -16; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.15;
    this.master = ctx.createGain();
    this.master.gain.value = 0.6;
    comp.connect(this.master);
    this.master.connect(ctx.destination);
    this.bus = comp;
    // 2 saniyelik beyaz gürültü (döngüde çalınır)
    const nb = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate), d = nb.getChannelData(0);
    let seed = 22222;
    for (let i = 0; i < d.length; i++) { seed = (seed * 16807) % 2147483647; d[i] = (seed / 2147483647) * 2 - 1; }
    this.noiseBuf = nb;
    // Elektriksel frekansın katları: altı adımlı sürücüde 3'ün katları yoktur, temel bileşen diğerlerinden 10–20 dB güçlüdür
    const K = 14, real = new Float32Array(K + 1), imag = new Float32Array(K + 1);
    for (let k = 1; k <= K; k++) imag[k] = k === 1 ? 1 : k % 3 === 0 ? 0 : 0.22;
    this.lineWave = ctx.createPeriodicWave(real, imag);
    this.voices = [];
    for (let i = 0; i < nVoices; i++) this.voices.push(this.voice(i, nVoices));
    this.waveKey = "";
  },

  /** Bir motorun sesi: ton (KGF katları) + rezonanstan geçen vınlama + kanat geçişiyle dalgalanan gürültü + dengesizlik */
  voice(i, n) {
    const ctx = this.ctx, out = ctx.createGain();
    if (ctx.createStereoPanner && n > 1) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = [0.4, 0.2, -0.2, -0.4][i % 4];      // motorlar sağa sola hafifçe yayılır
      out.connect(pan); pan.connect(this.bus);
    } else out.connect(this.bus);
    const G = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const BP = (q) => { const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = q; return f; };
    // Pervane tonu
    const tone = ctx.createOscillator(), toneG = G(0);
    tone.connect(toneG); toneG.connect(out);
    // Motor vınlaması: elektriksel frekansın katları → çanın iki rezonansı
    const line = ctx.createOscillator(), res2 = BP(7), res1 = BP(5), res1G = G(0.35), whineG = G(0);
    line.setPeriodicWave(this.lineWave);
    line.connect(res2); res2.connect(whineG);
    line.connect(res1); res1.connect(res1G); res1G.connect(whineG);
    whineG.connect(out);
    // Hava gürültüsü
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuf; noise.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 600;
    const bp = BP(0.5), am = G(1), amOsc = ctx.createOscillator(), amDepth = G(0.5), noiseG = G(0);
    amOsc.type = "sine"; amOsc.connect(amDepth); amDepth.connect(am.gain);
    noise.connect(hp); hp.connect(bp); bp.connect(am); am.connect(noiseG); noiseG.connect(out);
    // Kırık pervane takırtısı
    const rattle = ctx.createOscillator(), rattleG = G(0);
    rattle.type = "sawtooth"; rattle.connect(rattleG); rattleG.connect(out);
    for (const o of [tone, line, amOsc, rattle]) o.start();
    noise.start(0, (i * 0.37) % 1.5);
    return { tone, toneG, line, res1, res2, whineG, bp, amOsc, noiseG, rattle, rattleG };
  },

  /**
   * Mil frekansında çalan dalga biçimi. Kanat sayısının katı olan harmonikler KGF ve katlarıdır;
   * diğer mil katları zayıftır. rich: pervane bir kolun üstünde (drone) → üst katlar daha güçlü.
   */
  wave(blades, rich) {
    const K = blades * 10, real = new Float32Array(K + 1), imag = new Float32Array(K + 1);
    const first = rich ? [1, 0.88, 0.76, 0.64] : [1, 0.62, 0.46, 0.36], tail = rich ? 0.32 : 0.2;
    for (let k = 1; k <= K; k++) {
      const h = k / blades;                                // KGF'nin kaçıncı katı (tam sayıysa)
      imag[k] = k % blades === 0 ? (h <= 4 ? first[h - 1] : tail * Math.pow(0.86, h - 5)) : 0.045 / Math.sqrt(k);
    }
    return this.ctx.createPeriodicWave(real, imag);
  },

  /**
   * Her karede çağrılır.
   * st: { rpm, blades, motors (1 ya da 4), radiusM (pervane yarıçapı, m), statorMm (motor stator çapı), broken }
   */
  update(st) {
    if (!this.ctx || (!this.on && this.live)) return;
    const ctx = this.ctx, t = ctx.currentTime, n = st.motors || 1, B = st.blades || 2;
    const key = B + "|" + (n > 1);
    if (key !== this.waveKey) { this.waveKey = key; const w = this.wave(B, n > 1); for (const v of this.voices) v.tone.setPeriodicWave(w); }
    const stator = st.statorMm || 22, polePairs = stator >= 18 ? 7 : 6;      // 22xx–24xx: 14 kutup; 08xx–16xx: 12 kutup
    const bell = Math.min(15000, this.BELL_RES_HZ * (22 / stator));           // küçük motorun çanı daha tiz çınlar
    const T = this.live ? performance.now() / 1000 : 0, share = n > 1 ? 0.75 : 1;   // dört motor birlikte tek motordan ~3,5 dB yüksek
    this.voices.forEach((v, i) => {
      // Dronlarda motorlar arasında %1–2'lik, yavaşça değişen devir farkı (ölçülen: ~70–100 devir/dk)
      const k = n > 1 ? 1 + 0.013 * Math.sin(T * 0.63 + i * 1.9) + 0.007 * Math.sin(T * 1.71 + i * 0.8) + 0.004 * (i - 1.5) : 1;
      const rpm = i < n ? Math.max(0, st.rpm) * k : 0, f = Math.max(0.01, rpm / 60);
      const tip = 2 * Math.PI * f * (st.radiusM || 0.0635);                  // kanat ucu hızı (m/s)
      const m = Math.min(1.25, tip / this.SPEED_OF_SOUND / 0.6);              // 0,6 Mach ≈ 5" pervanede tam gaz
      const fade = Math.min(1, rpm / 500);                                    // çok düşük devirde ses kısılır
      const set = (param, value, tc) => param.setTargetAtTime(value, t, tc || 0.04);
      set(v.tone.frequency, f, 0.03);
      set(v.amOsc.frequency, f * B, 0.03);
      set(v.toneG.gain, fade * 0.44 * Math.pow(m, 1.9) * share, 0.05);
      // Vınlama: elektriksel frekans = kutup çifti × mil frekansı; iki kanatlı pervane bu tonları 5–15 dB güçlendirir
      set(v.line.frequency, Math.min(20000, f * polePairs), 0.03);
      v.res2.frequency.value = bell;
      v.res1.frequency.value = bell / 4;
      set(v.whineG.gain, fade * 0.16 * Math.pow(Math.min(1, rpm / 22000), 0.9) * (B === 2 ? 1.8 : 1) * share, 0.05);
      // Hava gürültüsü: geniş tümsek; merkezi ve düzeyi kanat ucu hızıyla artar
      set(v.bp.frequency, 1500 + 3500 * Math.min(1, m), 0.06);
      set(v.noiseG.gain, fade * 0.7 * Math.pow(m, 2.6) * share, 0.06);
      // Kırık pervane: mil frekansında dengesizlik takırtısı (ilk motorda)
      set(v.rattle.frequency, f, 0.03);
      set(v.rattleG.gain, st.broken && i === 0 ? fade * 0.2 * Math.min(1, rpm / 8000) : 0, 0.05);
    });
  },

  /** ESC açılış sesi: motor sargıları hoparlör gibi titreşir; üç yükselen kısa "bip" */
  beeps() {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime + 0.05;
    [1047, 1319, 1568].forEach((hz, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), t = t0 + i * 0.16;
      o.type = "square"; o.frequency.value = hz;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.01);
      g.gain.setValueAtTime(0.05, t + 0.1);
      g.gain.linearRampToValueAtTime(0, t + 0.12);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + 0.14);
    });
  },

  /** Pervane kırılma sesi: kısa, keskin çıtırtı + tok bir vuruş */
  crack() {
    if (!this.ctx || !this.on) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = this.noiseBuf;
    bp.type = "bandpass"; bp.frequency.value = 2600; bp.Q.value = 0.7;
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    n.connect(bp); bp.connect(g); g.connect(this.master);
    n.start(t, 0.3, 0.2);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.18);
    og.gain.setValueAtTime(0.5, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(og); og.connect(this.master);
    o.start(t); o.stop(t + 0.25);
  }
};
