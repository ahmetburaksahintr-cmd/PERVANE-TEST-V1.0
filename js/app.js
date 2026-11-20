/* =========================================================
   UYGULAMA – Kontroller, test döngüsü, karşılaştırma, gerçek veri
   ========================================================= */

const $ = (s) => document.querySelector(s);
const fmt = (n, d = 0) => Number(n).toLocaleString("tr-TR", { maximumFractionDigits: d, minimumFractionDigits: d });

const S = {
  matKey: "PLA", motorKey: "m2207",
  prop: { diameterIn: 5, pitchIn: 4.3, chordMm: 12, thickMm: 2.4, ctScale: 1 },
  tempC: 25, exag: 3, heat: true,
  throttle: 0, rpm: 0, plastic: 0, broken: false, bentLogged: false, warnLogged: false, yieldLogged: false,
  ramp: null, seq: null, history: [], measured: [], lastEval: null, t0: performance.now(),
  sound: false, results: {},
  colorKey: "mat", customHex: "#ff6b00", simT: 0, lastRecT: -1, muteReport: false, seqRecords: [], breakShot: null, logLines: []
};

const mat = () => MATERIALS[S.matKey];
const motor = () => MOTORS[S.motorKey];
const maxRpm = () => Physics.maxRpm(motor(), Physics.geometry(S.prop));

/* ---------------- Başlatma ---------------- */
function init() {
  // Malzeme düğmeleri
  $("#matList").innerHTML = Object.entries(MATERIALS).map(([k, m]) =>
    `<button class="mat" data-k="${k}" style="--c:#${m.color.toString(16).padStart(6, "0")}"><i></i><b>${m.name}</b><small>E=${m.E} GPa · σ=${m.sigmaU} MPa</small></button>`).join("");
  $("#matList").onclick = (e) => { const b = e.target.closest(".mat"); if (b) selectMaterial(b.dataset.k); };
  $("#motorSel").innerHTML = Object.entries(MOTORS).map(([k, m]) => `<option value="${k}">${m.name}</option>`).join("");
  $("#motorSel").value = S.motorKey;
  $("#motorSel").onchange = (e) => {
    S.motorKey = e.target.value;
    S.prop.diameterIn = motor().propIn;
    syncInputs(); newProp("Motor değişti");
  };

  const bindRange = (id, apply) => { $(id).oninput = (e) => { apply(Number(e.target.value)); syncInputs(); }; };
  bindRange("#dia", (v) => { S.prop.diameterIn = v; newProp(); });
  bindRange("#pitch", (v) => { S.prop.pitchIn = v; newProp(); });
  bindRange("#chord", (v) => { S.prop.chordMm = v; newProp(); });
  bindRange("#thick", (v) => { S.prop.thickMm = v; newProp(); });
  bindRange("#temp", (v) => { S.tempC = v; refreshCompare(); });
  bindRange("#exag", (v) => { S.exag = v; });
  bindRange("#thr", (v) => { S.throttle = v / 100; stopRamp(); });
  $("#heat").onchange = (e) => { S.heat = e.target.checked; };

  // Pervane renkleri
  $("#colorList").innerHTML = PROP_COLORS.map((c) => {
    const bg = c.gradient ? `linear-gradient(135deg, ${c.gradient.join(",")})`
      : c.duo ? `linear-gradient(135deg, ${c.duo[0]} 50%, ${c.duo[1]} 50%)`
      : c.mat ? "conic-gradient(#3b82f6, #22c55e, #f97316, #a855f7, #374151, #ec4899, #3b82f6)" : c.hex;
    return `<button class="swatch ${c.metal ? "metal" : ""} ${c.clear ? "clear" : ""} ${c.glow ? "glow" : ""}" data-k="${c.k}" title="${c.name}" style="--sw:${bg}"><i></i><span>${c.name}</span></button>`;
  }).join("");
  $("#colorList").onclick = (e) => { const b = e.target.closest(".swatch"); if (b) selectColor(b.dataset.k); };
  $("#customColor").oninput = (e) => { S.customHex = e.target.value; selectColor("custom"); };

  // Rapor
  $("#reportBtn").onclick = () => {
    if (!S.history.length) { toast("Önce bir test yap (gazı aç veya rampa testini başlat).", "warn"); return; }
    openReportModal(buildRecord(), "📄 Test raporu");
  };
  $("#rmClose").onclick = $("#rmNo").onclick = closeReportModal;
  $("#reportModal").addEventListener("mousedown", (e) => { if (e.target.id === "reportModal") closeReportModal(); });
  document.querySelectorAll("#reportModal .choice").forEach((b) => (b.onclick = () => exportReport(b.dataset.fmt)));
  $("#rmMute").onchange = (e) => { S.muteReport = e.target.checked; };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeReportModal(); });

  $("#rampBtn").onclick = () => startRamp();
  $("#stopBtn").onclick = () => { stopRamp(); S.seq = null; S.throttle = 0; syncInputs(); };
  $("#resetBtn").onclick = () => newProp("Yeni pervane takıldı");
  $("#seqBtn").onclick = startSequence;
  $("#csvOut").onclick = exportCsv;
  $("#soundBtn").onclick = toggleSound;
  $("#csvIn").onchange = importCsv;
  $("#serialBtn").onclick = connectSerial;
  $("#calBtn").onclick = calibrate;
  $("#clearMeas").onclick = () => { S.measured = []; S.prop.ctScale = 1; updateMeasInfo(); refreshCompare(); };

  $("#appVersion").textContent = "v" + APP_VERSION;
  Scene3D.init($("#view3d"));
  selectMaterial("PLA", true);
  syncInputs();
  requestAnimationFrame(loop);
}

function syncInputs() {
  const p = S.prop;
  $("#dia").value = p.diameterIn; $("#vDia").textContent = `${p.diameterIn}" (${fmt(p.diameterIn * 25.4)} mm)`;
  $("#pitch").value = p.pitchIn; $("#vPitch").textContent = `${fmt(p.pitchIn, 1)}"`;
  $("#chord").value = p.chordMm; $("#vChord").textContent = `${fmt(p.chordMm, 1)} mm`;
  $("#thick").value = p.thickMm; $("#vThick").textContent = `${fmt(p.thickMm, 1)} mm`;
  $("#temp").value = S.tempC; $("#vTemp").textContent = `${S.tempC} °C`;
  $("#exag").value = S.exag; $("#vExag").textContent = S.exag === 1 ? "gerçek" : `×${S.exag}`;
  $("#thr").value = Math.round(S.throttle * 100); $("#vThr").textContent = `${Math.round(S.throttle * 100)}%`;
  const m = motor();
  $("#motorInfo").innerHTML = `<span>KV</span><b>${m.kv}</b><span>Gerilim</span><b>${m.cells}S · ${fmt(m.cells * 3.7, 1)} V</b>
    <span>Maks. güç</span><b>${m.pmax} W</b><span>Bu pervaneyle maks. devir</span><b>${fmt(maxRpm())}</b>`;
}

function selectMaterial(k, silent) {
  S.matKey = k;
  document.querySelectorAll(".mat").forEach((b) => b.classList.toggle("active", b.dataset.k === k));
  $("#matNote").textContent = mat().note;
  newProp(silent ? null : `${mat().name} pervane takıldı`);
}

/** Yeni pervane: hasar sıfırlanır, 3D model yeniden oluşturulur */
function newProp(logMsg) {
  // Elle yapılan değişiklikte süren test durur (sıralı testte rampa ayrıca başlatılır)
  if (!S.seq) { S.ramp = null; S.throttle = 0; }
  S.broken = false; S.plastic = 0; S.rpm = Math.min(S.rpm, 0); S.history = [];
  S.warnLogged = S.yieldLogged = S.bentLogged = false;
  Scene3D.buildProp(S.prop, mat(), colorSpec());
  S.simT = 0; S.lastRecT = -1; S.breakShot = null; S.breakInfo = null;
  updateLegend();
  if (logMsg) log(logMsg, "info");
  refreshCompare();
  syncInputs();
}

/* ---------------- Otomatik rampa testi ---------------- */
function startRamp(onDone) {
  if (S.broken) newProp(`${mat().name} için yeni pervane takıldı`);
  S.history = []; S.simT = 0; S.lastRecT = -1;
  S.ramp = { t: 0, onDone };
  S.throttle = 0;
  log(`Rampa testi başladı (${mat().name}, ${S.tempC} °C)`, "info");
}
function stopRamp() { S.ramp = null; }

function stepRamp(dt) {
  const r = S.ramp;
  if (!r) return;
  r.t += dt;
  if (S.broken) { // kırıldı → gazı kes, kısa bekle, bitir
    S.throttle = 0;
    if ((r.endT = r.endT || r.t) && r.t - r.endT > 2.2) finishRamp();
    return;
  }
  S.throttle = Math.min(1, r.t / 11);       // 11 saniyede %100
  if (S.throttle >= 1) {
    r.hold = (r.hold || 0) + dt;
    if (r.hold > 1.5) { S.throttle = 0; if (S.rpm < 300) finishRamp(); }
  }
}
function finishRamp() {
  const done = S.ramp && S.ramp.onDone;
  const peak = S.history.reduce((a, p) => (p.thrust > a.thrust ? p : a), { thrust: 0, rpm: 0 });
  log(`Test bitti: en yüksek ${fmt(peak.thrust)} g itki @ ${fmt(peak.rpm)} devir${S.broken ? " — pervane KIRILDI" : ""}`, S.broken ? "bad" : "ok");
  S.ramp = null;
  S.throttle = 0;
  if (S.seq) S.seqRecords.push(buildRecord({ withImages: false }));
  if (done) done();
}

/* ---------------- Sıralı karşılaştırma testi ---------------- */
function startSequence() {
  const keys = Object.keys(MATERIALS);
  S.seq = { i: 0, keys };
  S.seqRecords = [];
  const next = () => {
    if (!S.seq) return;
    if (S.seq.i >= keys.length) {
      log("Tüm malzemeler test edildi ✔", "ok");
      S.seq = null;
      const rec = buildRecord();
      rec.sequence = S.seqRecords.slice();
      openReportModal(rec, "🏁 Tüm malzemeler test edildi");
      return;
    }
    selectMaterial(keys[S.seq.i]);
    S.seq.i++;
    setTimeout(() => startRamp(next), 700);
  };
  next();
}

/* ---------------- Ana döngü ---------------- */
let lastT = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  stepRamp(dt);

  // Motor ivmesi (pervanenin ataleti ve ESC tepkisi)
  const target = S.throttle * maxRpm();
  const k = target > S.rpm ? 3.2 : 1.6;
  S.rpm += (target - S.rpm) * Math.min(1, k * dt);
  if (S.broken && S.throttle === 0) S.rpm *= Math.pow(0.35, dt);

  const g = Physics.geometry(S.prop);
  const ev = Physics.evaluate({ mat: mat(), motor: motor(), prop: S.prop, rpm: S.rpm, tempC: S.tempC, deform: S.plastic / (g.R * 1000) });
  if (S.broken) { ev.thrustG *= 0.25; } // tek kanat → itki çöker
  S.lastEval = ev;
  checkEvents(ev);

  // 3D deformasyon
  const realDefl = ev.delta * 1000;                         // mm
  const L = g.L * 1000;
  const visDefl = Math.min(L * 1.1, realDefl * S.exag);
  const stressRatio = ev.sigma / ev.strength;
  Scene3D.deform(S.broken ? 0 : visDefl, stressRatio, S.plastic * S.exag, S.heat);
  Scene3D.frame(dt, S.rpm, ev.thrustG / 1500);

  // Ölçüm kaydı: simülasyon zamanıyla saniyede 10 satır (grafikler + Excel)
  S.simT += dt;
  if (S.rpm > 200 && S.simT - S.lastRecT >= 0.1) { S.lastRecT = S.simT; recordPoint(ev, realDefl); }
  updateHud(ev, realDefl);
  if (!loop.f || now - loop.f > 120) { loop.f = now; drawCharts(ev); }
  updateSound();
  requestAnimationFrame(loop);
}

/** Kalıcı bükülme ve kırılma olayları */
function checkEvents(ev) {
  if (S.broken) return;
  const R = ev.geo.R * 1000;
  if (!S.warnLogged && ev.state === "warn") { S.warnLogged = true; log(`⚠️ ${fmt(ev.rpm)} devir: gerilme sınıra yaklaşıyor (GK ${fmt(ev.sf, 2)})`, "warn"); }
  if (!S.bentLogged && ev.ratio >= 0.12) {
    S.bentLogged = true;
    log(`↪️ ${fmt(ev.rpm)} devir: aşırı esneme! Uç ${fmt(ev.delta * 1000, 1)} mm büküldü, itki %${fmt(ev.flexLoss * 100)} azaldı`, "warn");
  }
  if (ev.sigma >= ev.yieldS && !mat().brittle) {
    // Akma: kalıcı (plastik) bükülme birikir
    const over = ev.sigma / ev.yieldS - 1;
    S.plastic = Math.max(S.plastic, Math.min(R * 0.5, ev.delta * 1000 * (0.4 + over * 6)));
    if (!S.yieldLogged) { S.yieldLogged = true; log(`🟠 ${fmt(ev.rpm)} devir: AKMA — pervane kalıcı olarak büküldü`, "warn"); }
  }
  if (ev.sigma >= ev.strength) {
    S.broken = true;
    S.throttle = 0;
    S.breakInfo = { rpm: ev.rpm, thrust: ev.thrustG, stress: ev.sigma / 1e6, strength: ev.strength / 1e6 };
    recordPoint(ev, ev.delta * 1000, "KIRILDI");
    Scene3D.breakBlade(ev.rpm);
    // Kırılma anının görüntüsü (parçalar havadayken) ve indirme sorusu
    setTimeout(() => { S.breakShot = { url: Scene3D.snapshot(), w: Scene3D.renderer.domElement.width, h: Scene3D.renderer.domElement.height }; }, 350);
    if (!S.seq && !S.muteReport) setTimeout(() => { if (S.broken) openReportModal(buildRecord(), "💥 Pervane kırıldı!"); }, 1600);
    log(`💥 ${fmt(ev.rpm)} devir: KIRILMA — kök gerilmesi ${fmt(ev.sigma / 1e6, 1)} MPa ≥ dayanım ${fmt(ev.strength / 1e6, 1)} MPa`, "bad");
    syncInputs();
  }
  S.results[S.matKey] = S.results[S.matKey] || {};
}

/* ---------------- Gösterge paneli ---------------- */
function updateHud(ev, realDefl) {
  $("#hRpm").textContent = fmt(S.rpm);
  $("#hThrust").textContent = fmt(ev.thrustG);
  const pctS = (ev.sigma / ev.strength) * 100;
  $("#hStress").innerHTML = `${fmt(ev.sigma / 1e6, 1)} MPa <em>(%${fmt(pctS)})</em>`;
  $("#hStress").style.color = pctS > 100 ? "var(--bad)" : pctS > 75 ? "var(--warn)" : "var(--good)";
  $("#hSf").textContent = S.rpm < 500 ? "–" : fmt(Math.min(ev.sf, 99), 2);
  // Gaz göstergesi (rampa testinde otomatik değişir)
  const thrPct = Math.round(S.throttle * 100);
  if (Number($("#thr").value) !== thrPct && document.activeElement !== $("#thr")) { $("#thr").value = thrPct; $("#vThr").textContent = `${thrPct}%`; }
  $("#hDefl").textContent = realDefl > 500 ? "çok büyük (yere sarkıyor)" : `${fmt(realDefl, realDefl < 10 ? 2 : 1)} mm${S.plastic > 0.05 ? ` + ${fmt(S.plastic, 1)} kalıcı` : ""}`;
  $("#hPower").textContent = `${fmt(ev.power)} W · ${fmt(ev.current, 1)} A`;
  $("#hEff").textContent = ev.power > 2 ? `${fmt(ev.efficiency, 2)} g/W` : "–";
  $("#hMass").textContent = `${fmt(ev.mass, 1)} g`;
  const st = $("#hState");
  let cls = "ok", txt = S.rpm < 100 ? "HAZIR" : "GÜVENLİ";
  if (S.broken) { cls = "bad"; txt = "💥 KIRILDI"; }
  else if (S.plastic > 0.05) { cls = "warn"; txt = "🟠 KALICI BÜKÜLME"; }
  else if (ev.state === "yield") { cls = "bad"; txt = "🔴 KIRILMA EŞİĞİNDE"; }
  else if (ev.ratio >= 0.12) { cls = "warn"; txt = "↪️ AŞIRI ESNEME"; }
  else if (ev.state === "warn") { cls = "warn"; txt = "⚠️ SINIRDA"; }
  st.className = "state " + cls;
  st.textContent = txt;
  // Başlık: malzeme + renk
  $("#hTitle").innerHTML = `<i style="background:${legendStart()}"></i>${mat().name} · ${colorName()}`;
  // Kırılma sınırına yakınlık çubuğu
  const lim = S.broken ? 100 : Math.min(100, pctS);
  $("#hLimit").style.width = lim + "%";
  $("#hLimitTxt").textContent = S.broken ? "KIRILDI" : "%" + fmt(lim);
  $("#hLimitTxt").style.color = lim >= 100 ? "var(--bad)" : lim > 75 ? "var(--warn)" : "var(--text)";
}

/* ---------------- Grafikler ---------------- */
function drawCharts(ev) {
  const sweep = Physics.sweep({ mat: mat(), motor: motor(), prop: S.prop, tempC: S.tempC, steps: 120 });
  const xMax = sweep.top * 1.02;
  const c = `#${mat().color.toString(16).padStart(6, "0")}`;
  const model = sweep.pts;
  const vl = [];
  if (sweep.yieldRpm && !mat().brittle) vl.push({ x: sweep.yieldRpm, color: "#f59e0b", label: "akma" });
  if (sweep.breakRpm) vl.push({ x: sweep.breakRpm, color: "#ef4444", label: "kırılma" });

  Chart.line($("#cThrust"), {
    xMax, yMax: Math.max(200, ...model.map((p) => p.thrustG), ...S.measured.map((m) => m.thrust)) * 1.1,
    xLabel: "devir/dk", yLabel: "itki (g)", vLines: vl,
    series: [
      { points: model.map((p) => [p.rpm, p.thrustG]), color: c, width: 1.5, dash: [4, 4], label: "model" },
      { points: S.history.map((p) => [p.rpm, p.thrust]), color: c, width: 3, label: "bu test" },
      { points: S.measured.map((m) => [m.rpm, m.thrust]), color: "#ffffff", dots: true, label: "gerçek ölçüm" }
    ],
    cursor: S.rpm > 100 ? { x: S.rpm, y: ev.thrustG, color: c } : null
  });
  const strengthMPa = ev.strength / 1e6, yieldMPa = ev.yieldS / 1e6;
  Chart.line($("#cStress"), {
    xMax, yMax: strengthMPa * 1.25, xLabel: "devir/dk", yLabel: "MPa", yFmt: (v) => v.toFixed(0),
    hLines: [{ y: strengthMPa, color: "#ef4444", label: `kırılma ${fmt(strengthMPa, 1)} MPa` }].concat(mat().brittle ? [] : [{ y: yieldMPa, color: "#f59e0b", label: `akma ${fmt(yieldMPa, 1)}` }]),
    series: [
      { points: model.map((p) => [p.rpm, p.sigma / 1e6]), color: c, width: 1.5, dash: [4, 4] },
      { points: S.history.map((p) => [p.rpm, p.stress]), color: c, width: 3 }
    ],
    cursor: S.rpm > 100 ? { x: S.rpm, y: ev.sigma / 1e6, color: c } : null
  });
  const R = ev.geo.R * 1000;
  const dMax = Math.min(R * 0.5, Math.max(2, ...model.map((p) => p.delta * 1000)));
  Chart.line($("#cDefl"), {
    xMax, yMax: dMax * 1.1, xLabel: "devir/dk", yLabel: "mm", yFmt: (v) => v.toFixed(1),
    hLines: [{ y: R * 0.12, color: "#f59e0b", label: "aşırı esneme sınırı" }].filter((l) => l.y <= dMax * 1.1),
    series: [
      { points: model.map((p) => [p.rpm, Math.min(dMax * 1.1, p.delta * 1000)]), color: c, width: 1.5, dash: [4, 4] },
      { points: S.history.map((p) => [p.rpm, Math.min(dMax * 1.1, p.defl)]), color: c, width: 3 }
    ],
    cursor: S.rpm > 100 ? { x: S.rpm, y: Math.min(dMax * 1.1, ev.delta * 1000), color: c } : null
  });
}

/* ---------------- Karşılaştırma tablosu ---------------- */
function refreshCompare() {
  const rows = Object.entries(MATERIALS).map(([k, m]) => ({ k, m, s: Physics.sweep({ mat: m, motor: motor(), prop: S.prop, tempC: S.tempC }) }));
  const r = (v) => (v ? fmt(v) : "<span class='good'>dayanır</span>");
  $("#cmpTable").innerHTML = `<thead><tr><th>Malzeme</th><th>Kütle</th><th>⚠️ Sınıra yaklaşma</th><th>↪️ Aşırı esneme</th><th>🟠 Kalıcı bükülme</th><th>💥 Kırılma</th><th>Güvenli maks. itki</th></tr></thead>
    <tbody>${rows.map(({ k, m, s }) => `<tr class="${k === S.matKey ? "sel" : ""}">
      <td><i class="dot" style="background:#${m.color.toString(16).padStart(6, "0")}"></i><b>${m.name}</b></td>
      <td>${fmt(s.mass, 1)} g</td>
      <td>${r(s.warnRpm)}</td><td>${r(s.bendRpm)}</td>
      <td>${m.brittle ? "<span class='muted'>kırılgan</span>" : r(s.yieldRpm)}</td>
      <td>${s.breakRpm ? `<b class="bad">${fmt(s.breakRpm)}</b>` : "<span class='good'>dayanır</span>"}</td>
      <td><b>${fmt(s.bestThrust)} g</b></td></tr>`).join("")}</tbody>`;
  const best = rows.slice().sort((a, b) => b.s.bestThrust - a.s.bestThrust);
  Chart.bars($("#cBars"), best.map(({ m, s }) => ({ label: m.name, value: s.bestThrust, color: `#${m.color.toString(16).padStart(6, "0")}`, note: `${fmt(s.mass, 1)} g pervane` })), { unit: "g" });
  const top = best[0], worst = best[best.length - 1];
  $("#verdict").innerHTML = `🏆 Bu koşullarda (${S.prop.diameterIn}" pervane, ${motor().name}, ${S.tempC} °C) en yüksek <b>güvenli</b> itkiyi <b>${top.m.name}</b> veriyor (${fmt(top.s.bestThrust)} g).
    En zayıf sonuç <b>${worst.m.name}</b> (${fmt(worst.s.bestThrust)} g). Sıcaklığı veya kanat kalınlığını değiştirip sıralamanın nasıl değiştiğini gözlemle.`;
  S.compareRows = rows;
}

function exportCsv() {
  const rows = S.compareRows || [];
  const head = "malzeme,kutle_g,uyari_rpm,asiri_esneme_rpm,akma_rpm,kirilma_rpm,guvenli_maks_itki_g,cap_inc,hatve_inc,veter_mm,kalinlik_mm,sicaklik_C,motor";
  const lines = rows.map(({ m, s }) => [m.name, s.mass.toFixed(2), s.warnRpm | 0, s.bendRpm | 0, s.yieldRpm | 0, s.breakRpm | 0, Math.round(s.bestThrust),
    S.prop.diameterIn, S.prop.pitchIn, S.prop.chordMm, S.prop.thickMm, S.tempC, motor().name].join(","));
  const blob = new Blob(["﻿" + [head, ...lines].join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `pervane-karsilastirma-${S.tempC}C.csv`;
  a.click();
}

/* ---------------- Gerçek ölçüm verisi ---------------- */
function parseLine(line) {
  const p = line.trim().split(/[;,\t ]+/).map(Number);
  if (p.length >= 2 && p.every((x) => !isNaN(x)) && p[0] > 0) return { rpm: p[0], thrust: p[1], current: p[2] };
  return null;
}
function importCsv(e) {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    const pts = reader.result.split(/\r?\n/).map(parseLine).filter(Boolean);
    S.measured = S.measured.concat(pts);
    log(`📄 ${pts.length} ölçüm noktası yüklendi (${f.name})`, "info");
    updateMeasInfo();
  };
  reader.readAsText(f);
  e.target.value = "";
}
async function connectSerial() {
  if (!("serial" in navigator)) { log("Bu tarayıcı USB seri bağlantıyı desteklemiyor. Chrome veya Edge kullan.", "bad"); return; }
  try {
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    log("🔌 Arduino bağlandı, veri okunuyor…", "ok");
    const reader = port.readable.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const pt = parseLine(buf.slice(0, i)); buf = buf.slice(i + 1);
        if (pt) { S.measured.push(pt); if (S.measured.length > 2000) S.measured.shift(); updateMeasInfo(); }
      }
    }
  } catch (err) { log("USB bağlantısı kurulamadı: " + err.message, "bad"); }
}
function updateMeasInfo() {
  const n = S.measured.length;
  if (!n) { $("#measInfo").textContent = "Henüz ölçüm yok."; return; }
  const errs = S.measured.map((m) => {
    const ev = Physics.evaluate({ mat: mat(), motor: motor(), prop: S.prop, rpm: m.rpm, tempC: S.tempC });
    return (m.thrust - ev.thrustG) / Math.max(1, ev.thrustG);
  });
  const avg = errs.reduce((a, b) => a + b, 0) / n;
  $("#measInfo").innerHTML = `<b>${n}</b> ölçüm · en yüksek devir ${fmt(Math.max(...S.measured.map((m) => m.rpm)))} ·
    model sapması <b class="${Math.abs(avg) < 0.1 ? "good" : "warn"}">${avg >= 0 ? "+" : ""}${fmt(avg * 100, 1)}%</b>
    ${S.prop.ctScale !== 1 ? ` · kalibrasyon katsayısı <b>×${fmt(S.prop.ctScale, 3)}</b>` : ""}`;
}
function calibrate() {
  if (S.measured.length < 3) { log("Kalibrasyon için en az 3 ölçüm noktası gerekli.", "warn"); return; }
  // En küçük kareler: ölçülen ≈ k · model  →  k = Σ(m·s) / Σ(s²)
  const prev = S.prop.ctScale;
  S.prop.ctScale = 1;
  let num = 0, den = 0;
  for (const m of S.measured) {
    const s = Physics.evaluate({ mat: mat(), motor: motor(), prop: S.prop, rpm: m.rpm, tempC: S.tempC }).thrustG;
    num += m.thrust * s; den += s * s;
  }
  S.prop.ctScale = den ? num / den : prev;
  log(`🎯 Model gerçek ölçüme göre kalibre edildi: itki katsayısı ×${fmt(S.prop.ctScale, 3)}`, "ok");
  updateMeasInfo(); refreshCompare(); syncInputs();
}

/* ---------------- Günlük ---------------- */
function log(msg, type = "info") {
  const t = ((performance.now() - S.t0) / 1000).toFixed(1);
  const li = document.createElement("li");
  li.className = type;
  li.innerHTML = `<span>${t} s</span>${msg}`;
  S.logLines.push(`${t} s – ${msg.replace(/<[^>]+>/g, "")}`);
  if (S.logLines.length > 200) S.logLines.shift();
  const ol = $("#log");
  ol.prepend(li);
  while (ol.children.length > 60) ol.lastChild.remove();
}

/* ---------------- Motor sesi (Web Audio) ---------------- */
let audio = null;
function toggleSound() {
  S.sound = !S.sound;
  $("#soundBtn").textContent = S.sound ? "🔊" : "🔇";
  if (S.sound && !audio) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator(); osc.type = "sawtooth";
    const osc2 = ctx.createOscillator(); osc2.type = "square";
    const filter = ctx.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 1800;
    const gain = ctx.createGain(); gain.gain.value = 0;
    osc.connect(filter); osc2.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc2.start();
    audio = { ctx, osc, osc2, gain };
  }
  if (audio) audio.ctx[S.sound ? "resume" : "suspend"]();
}
function updateSound() {
  if (!audio || !S.sound) return;
  const f = 60 + (S.rpm / 60) * 2.4;            // motor vınlaması (ölçekli)
  audio.osc.frequency.setTargetAtTime(f, audio.ctx.currentTime, 0.05);
  audio.osc2.frequency.setTargetAtTime(f * 1.5, audio.ctx.currentTime, 0.05);
  audio.gain.gain.setTargetAtTime(Math.min(0.08, S.rpm / 400000), audio.ctx.currentTime, 0.1);
}


/* ---------------- Pervane rengi ---------------- */
function colorSpec() {
  if (S.colorKey === "custom") return { k: "custom", name: "Özel renk", hex: S.customHex };
  return PROP_COLORS.find((c) => c.k === S.colorKey) || PROP_COLORS[0];
}
function colorName() {
  const c = colorSpec();
  return c.mat ? mat().name + " rengi" : c.name;
}
function legendStart() {
  const c = colorSpec();
  if (c.gradient) return "linear-gradient(90deg," + c.gradient.join(",") + ")";
  if (c.duo) return "linear-gradient(90deg," + c.duo[0] + " 50%," + c.duo[1] + " 50%)";
  return c.mat ? "#" + mat().color.toString(16).padStart(6, "0") : c.hex;
}
function updateLegend() {
  const c = colorSpec();
  const start = c.gradient ? c.gradient[2] : c.duo ? c.duo[0] : c.mat ? "#" + mat().color.toString(16).padStart(6, "0") : c.hex;
  $("#legendBar").style.background = "linear-gradient(90deg, " + start + " 0%, " + start + " 30%, #eab308 62%, #f97316 80%, #ef4444 100%)";
  document.querySelectorAll(".swatch").forEach((b) => b.classList.toggle("active", b.dataset.k === S.colorKey));
  $("#customColor").closest("label").classList.toggle("active", S.colorKey === "custom");
}
function selectColor(k) {
  S.colorKey = k;
  newProp(colorName() + " " + mat().name + " pervane takıldı");
}

/* ---------------- Ölçüm kaydı ---------------- */
function stateLabel(ev) {
  if (S.broken) return "KIRILDI";
  if (S.plastic > 0.05) return "KALICI BÜKÜLME";
  if (ev.state === "yield") return "KIRILMA EŞİĞİNDE";
  if (ev.ratio >= 0.12) return "AŞIRI ESNEME";
  if (ev.state === "warn") return "SINIRDA";
  return "GÜVENLİ";
}
function recordPoint(ev, realDefl, forceState) {
  S.history.push({
    t: S.simT, rpm: S.rpm, thrust: ev.thrustG, stress: ev.sigma / 1e6, stressPct: (ev.sigma / ev.strength) * 100,
    defl: realDefl, plastic: S.plastic, power: ev.power, current: ev.current, eff: ev.efficiency, sf: ev.sf,
    state: forceState || stateLabel(ev)
  });
  if (S.history.length > 4000) S.history.shift();
}

/* ---------------- Rapor ---------------- */
function buildRecord(opts = {}) {
  const h = S.history;
  const peak = h.reduce((a, p) => (p.thrust > a.thrust ? p : a), { thrust: 0, rpm: 0 });
  const ev = S.lastEval;
  const rec = {
    date: new Date(), material: mat(), colorName: colorName(), motor: motor(), prop: { ...S.prop }, tempC: S.tempC,
    ctScale: S.prop.ctScale || 1, mass: ev ? ev.mass : 0, strength: ev ? ev.strength / 1e6 : 0,
    broken: S.broken, breakRpm: S.breakInfo && S.breakInfo.rpm, breakThrust: S.breakInfo && S.breakInfo.thrust,
    breakStress: S.breakInfo && S.breakInfo.stress,
    maxThrust: peak.thrust, maxThrustRpm: peak.rpm,
    maxStressPct: h.reduce((a, p) => Math.max(a, p.stressPct), 0),
    maxDefl: h.reduce((a, p) => Math.max(a, p.defl), 0), plastic: S.plastic,
    duration: h.length ? h[h.length - 1].t : 0, history: h.slice(),
    log: S.logLines.slice().reverse(),
    compare: (S.compareRows || []).map(({ m, s }) => ({ name: m.name, brittle: m.brittle, mass: s.mass, warnRpm: Math.round(s.warnRpm || 0) || null,
      bendRpm: Math.round(s.bendRpm || 0) || null, yieldRpm: Math.round(s.yieldRpm || 0) || null, breakRpm: Math.round(s.breakRpm || 0) || null, bestThrust: s.bestThrust }))
  };
  if (opts.withImages !== false) {
    rec.snapshot = S.breakShot;
    rec.charts = { thrust: canvasToImage($("#cThrust")), stress: canvasToImage($("#cStress")), defl: canvasToImage($("#cDefl")) };
  }
  return rec;
}

let currentRecord = null;
async function openReportModal(rec, title) {
  currentRecord = rec;
  if (!rec.snapshot) { const c = Scene3D.renderer.domElement; rec.snapshot = { url: Scene3D.snapshot(), w: c.width, h: c.height }; }
  rec.snapshot = await imageUrlOnBg(rec.snapshot.url, rec.snapshot.w, rec.snapshot.h);
  $("#rmTitle").textContent = title;
  $("#rmShot").src = rec.snapshot.url;
  const st = (k, v, cls = "") => "<div><small>" + k + "</small><b class=\"" + cls + "\">" + v + "</b></div>";
  $("#rmStats").innerHTML = [
    st("Pervane", rec.material.name + " · " + rec.colorName),
    rec.broken ? st("Kırılma devri", fmt(rec.breakRpm) + " dev/dk", "bad") : st("Sonuç", rec.plastic > 0.05 ? "Kalıcı bükülme" : "Hasarsız", rec.plastic > 0.05 ? "warn" : "good"),
    rec.broken ? st("Kırılma anındaki itki", fmt(rec.breakThrust) + " g") : st("En yüksek gerilme", "%" + fmt(rec.maxStressPct)),
    rec.broken ? st("Kök gerilmesi", fmt(rec.breakStress, 1) + " / " + fmt(rec.strength, 1) + " MPa", "bad") : st("En büyük bükülme", fmt(rec.maxDefl, 2) + " mm"),
    st("En yüksek itki", fmt(rec.maxThrust) + " g @ " + fmt(rec.maxThrustRpm)),
    st("Kayıt", fmt(rec.history.length) + " satır · " + fmt(rec.duration, 1) + " s"),
    rec.sequence ? st("Sıralı test", rec.sequence.length + " malzeme") : ""
  ].join("");
  $("#rmMute").checked = S.muteReport;
  $("#reportModal").hidden = false;
  setTimeout(() => $("#reportModal .choice.rec").focus(), 50);
}
function closeReportModal() { $("#reportModal").hidden = true; }
async function exportReport(fmtKey) {
  const rec = currentRecord;
  if (!rec) return;
  try {
    if (fmtKey === "xlsx" || fmtKey === "both") { Report.excel(rec); toast("📊 Excel dosyası indirildi", "ok"); }
    if (fmtKey === "docx" || fmtKey === "both") { toast("📝 Word raporu hazırlanıyor…"); await Report.word(rec); toast("📝 Word raporu indirildi", "ok"); }
    log("Rapor indirildi (" + (fmtKey === "both" ? "Excel + Word" : fmtKey === "xlsx" ? "Excel" : "Word") + ")", "ok");
    closeReportModal();
  } catch (err) {
    console.error(err);
    toast("Dosya oluşturulamadı: " + err.message, "bad");
  }
}

/* ---------------- Bildirim ---------------- */
function toast(msg, type = "info") {
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.textContent = msg;
  $("#toasts").appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 300); }, 3200);
}

document.addEventListener("DOMContentLoaded", init);
