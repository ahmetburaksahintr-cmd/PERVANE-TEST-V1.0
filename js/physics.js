/* =========================================================
   FİZİK MODELİ – Pervane itkisi, gerilme ve bükülme
   ---------------------------------------------------------
   Basitleştirilmiş mühendislik modeli (eğitim amaçlı):

   İtki   : T = Ct · ρhava · n² · D⁴        (n: devir/saniye; ρhava ortamdan: Physics.rho)
   Güç    : P = Cp · ρhava · n³ · D⁵
   Kanat  : kökten ankastre (sabitlenmiş) dikdörtgen kesitli kiriş
   Merkezkaç gerilmesi : σc = ρ · ω² · (R² − r₀²) / 2
   Eğilme gerilmesi    : σb = 6 · M / (b · h²),  M = F · a
   Uç sehimi (bükülme) : δ = F · a² · (3L − a) / (6 · E · I)
   Isı etkisi          : malzeme HDT'ye yaklaştıkça E ve σ düşer
   Baskı etkisi        : katman yapışması (layer) dayanımı azaltır

   Gerçek pervaneler burkulma, titreşim (rezonans) ve yorulmaya da
   maruz kalır; bu model bunları içermez. Sonuçları gerçek testle
   karşılaştırarak kalibre etmek bilim fuarı projesinin özüdür.
   ========================================================= */

const AIR_RHO = 1.225; // kg/m³ (deniz seviyesi, 15 °C: standart atmosfer)

const Physics = {
  /** Ortamın hava yoğunluğu (kg/m³): Ortam ayarından ya da gerçek dünyada konumun havasından (js/flightenv.js) */
  rho: AIR_RHO,
  /** Pervane geometrisi (inç cinsinden çap ve hatve) */
  geometry(p) {
    const D = p.diameterIn * 0.0254;           // m
    const R = D / 2;
    const r0 = Math.min(0.006, R * 0.2);        // göbek yarıçapı (m) – küçük pervanede daha küçük
    const B = p.blades || 2;                    // kanat sayısı
    const L = R - r0;                           // kanat boyu
    const b = p.chordMm / 1000;                 // kök veter genişliği
    const h = p.thickMm / 1000;                 // kök kalınlığı
    const I = (b * h ** 3) / 12;                // atalet momenti
    const pitchRatio = p.pitchIn / p.diameterIn;
    // itki katsayısı (tipik 0.09–0.13); ctScale gerçek ölçümle kalibrasyondan gelir
    // Kanat sayısı arttıkça aynı devirde itki ve çekilen güç artar (3 kanat ≈ %20 itki, %27 güç)
    const Ct = (0.06 + 0.11 * pitchRatio) * Math.pow(B / 2, 0.45) * (p.ctScale || 1);
    const Cp = (0.025 + 0.07 * pitchRatio * pitchRatio + 0.02 * pitchRatio) * Math.pow(B / 2, 0.6);
    // Kütle: B kanat (sivrilen veter ve kalınlık → ~%55 dolu) + göbek
    const vol = B * L * b * h * 0.55 + Math.PI * r0 * r0 * Math.min(0.008, R * 0.3);
    return { D, R, r0, L, b, h, I, Ct, Cp, vol, B };
  },

  /** Sıcaklığa göre malzeme zayıflama katsayısı */
  tempFactor(mat, tempC) {
    const ref = 25;
    if (tempC <= ref) return 1;
    const x = (tempC - ref) / (mat.hdt - ref);  // HDT'de x = 1
    return Math.max(0.08, 1 - 0.75 * Math.pow(Math.min(x, 1.4), 2));
  },

  /** Motorun bu pervaneyle ulaşabileceği en yüksek devir */
  maxRpm(motor, geo) {
    const V = motor.cells * 3.7;
    const noLoad = motor.kv * V * 0.92;
    // P = Cp ρ n³ D⁵ = Pmax · η  →  n
    const nPow = Math.cbrt((motor.pmax * 0.82) / (geo.Cp * this.rho * geo.D ** 5));
    return Math.min(noLoad, nPow * 60);
  },

  /**
   * Belirli bir devirde tüm büyüklükleri hesaplar.
   * deform: daha önceki kalıcı bükülme (0–1) → itkiyi azaltır
   */
  evaluate({ mat, motor, prop, rpm, tempC, deform = 0 }) {
    const g = this.geometry(prop);
    const n = rpm / 60;
    const w = 2 * Math.PI * n;
    const tf = this.tempFactor(mat, tempC);
    const E = mat.E * 1e9 * tf;
    const strength = mat.sigmaU * 1e6 * mat.layer * tf;   // Pa
    const yieldS = strength * mat.yieldR;

    // Aerodinamik
    let T = g.Ct * this.rho * n * n * g.D ** 4;           // N (tüm kanatlar toplam)
    const P = g.Cp * this.rho * n ** 3 * g.D ** 5;         // W

    // Kanat başına yük, 0.7R noktasında tekil kuvvet varsayımı
    const F = T / g.B;
    const a = Math.max(0.001, 0.7 * g.R - g.r0);
    const delta = (F * a * a * (3 * g.L - a)) / (6 * E * g.I); // m
    const ratio = delta / g.R;                              // uç sehimi / yarıçap

    // Esneme hatve açısını azaltır → itki kaybı (TPU'da belirgin)
    const flexLoss = Math.min(0.85, 2.2 * ratio + 0.9 * deform);
    T = T * (1 - flexLoss);

    // Gerilmeler (kökte)
    const sigmaC = mat.rho * w * w * (g.R ** 2 - g.r0 ** 2) / 2;
    const M = F * a;
    const sigmaB = (6 * M) / (g.b * g.h * g.h);
    const sigma = sigmaC + sigmaB;

    const V = motor.cells * 3.7;
    const current = Math.min(motor.imax * 1.4, P / (V * 0.85));
    const thrustG = (T / 9.81) * 1000;
    const mass = mat.rho * g.vol * 1000;                    // g

    let state = "ok";
    if (sigma >= strength) state = "broken";
    else if (sigma >= yieldS) state = "yield";
    else if (ratio >= 0.12) state = "bent";
    else if (sigma >= yieldS * 0.75 || ratio >= 0.06) state = "warn";

    return {
      rpm, thrustG, thrustN: T, power: P, current, efficiency: P > 1 ? thrustG / P : 0,
      sigma, sigmaC, sigmaB, strength, yieldS, sf: strength / sigma,
      delta, ratio, flexLoss, tf, mass, state, geo: g
    };
  },

  /** Devir taraması: kritik noktaları bulur (karşılaştırma tablosu için) */
  sweep({ mat, motor, prop, tempC, steps = 400 }) {
    const g = this.geometry(prop);
    const top = this.maxRpm(motor, g);
    const pts = [];
    let warnRpm = null, bendRpm = null, yieldRpm = null, breakRpm = null, bestThrust = 0, bestRpm = 0;
    for (let i = 1; i <= steps; i++) {
      const rpm = (top * i) / steps;
      const r = this.evaluate({ mat, motor, prop, rpm, tempC });
      pts.push(r);
      if (!warnRpm && r.state === "warn") warnRpm = rpm;
      if (!bendRpm && (r.state === "bent" || r.ratio >= 0.12)) bendRpm = rpm;
      if (!yieldRpm && r.sigma >= r.yieldS) yieldRpm = rpm;
      if (!breakRpm && r.sigma >= r.strength) breakRpm = rpm;
      const usable = !bendRpm && !yieldRpm && !breakRpm;
      if (usable && r.thrustG > bestThrust) { bestThrust = r.thrustG; bestRpm = rpm; }
    }
    return { pts, top, warnRpm, bendRpm, yieldRpm, breakRpm, bestThrust, bestRpm, mass: pts[0].mass };
  }
};
