/* =========================================================
   TEST RAPORU – Excel (.xlsx) ve Word (.docx) dışa aktarma
   Kütüphaneler internetsiz çalışır: vendor/xlsx.full.min.js (SheetJS),
   vendor/docx.umd.js (docx).
   ========================================================= */

const Report = {
  /** Dosya adı: pervane-testi_PLA_Kirmizi_2026-11-20_19-55 */
  fileBase(rec) {
    const tr = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", Ç: "C", Ğ: "G", İ: "I", Ö: "O", Ş: "S", Ü: "U" };
    const clean = (s) => String(s).replace(/[çğıöşüÇĞİÖŞÜ]/g, (c) => tr[c]).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const d = rec.date;
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
    return `pervane-testi_${clean(rec.material.name)}_${clean(rec.colorName)}_${stamp}`;
  },

  summaryRows(rec) {
    const r1 = (v, d = 1) => (v == null ? "–" : Math.round(v * 10 ** d) / 10 ** d);
    return [
      ["Test tarihi", rec.date.toLocaleString("tr-TR")],
      ["Malzeme", `${rec.material.name} (${rec.material.full})`],
      ["Pervane rengi", rec.colorName],
      ["Motor", rec.motor.name],
      ["Pervane çapı (inç)", rec.prop.diameterIn],
      ["Hatve (inç)", rec.prop.pitchIn],
      ["Kök veter genişliği (mm)", rec.prop.chordMm],
      ["Kök kalınlığı (mm)", rec.prop.thickMm],
      ["Pervane kütlesi (g)", r1(rec.mass, 2)],
      ["Sıcaklık (°C)", rec.tempC],
      ["Kalibrasyon katsayısı (Ct)", r1(rec.ctScale, 3)],
      ["Sonuç", rec.broken ? "KIRILDI" : rec.plastic > 0.05 ? "KALICI BÜKÜLME" : "Hasarsız"],
      ["Kırılma devri (dev/dk)", rec.broken ? Math.round(rec.breakRpm) : "–"],
      ["Kırılma anındaki itki (g)", rec.broken ? Math.round(rec.breakThrust) : "–"],
      ["Kırılma anındaki kök gerilmesi (MPa)", rec.broken ? r1(rec.breakStress) : "–"],
      ["Malzeme dayanımı – bu koşulda (MPa)", r1(rec.strength)],
      ["En yüksek itki (g)", Math.round(rec.maxThrust)],
      ["En yüksek itkideki devir (dev/dk)", Math.round(rec.maxThrustRpm)],
      ["En yüksek gerilme (dayanımın %'si)", r1(rec.maxStressPct)],
      ["En büyük uç bükülmesi (mm)", r1(rec.maxDefl, 2)],
      ["Kalıcı bükülme (mm)", r1(rec.plastic, 2)],
      ["Test süresi (s)", r1(rec.duration)],
      ["Kayıt sayısı", rec.history.length]
    ];
  },

  /* ---------------- EXCEL ---------------- */
  excel(rec) {
    if (typeof XLSX === "undefined") throw new Error("Excel kütüphanesi yüklenemedi (vendor/xlsx.full.min.js).");
    const wb = XLSX.utils.book_new();
    const r = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

    const sum = [["PERVANE TEST RAPORU – Pervane Test Laboratuvarı"], [], ["Alan", "Değer"], ...this.summaryRows(rec)];
    const ws1 = XLSX.utils.aoa_to_sheet(sum);
    ws1["!cols"] = [{ wch: 38 }, { wch: 46 }];
    ws1["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
    XLSX.utils.book_append_sheet(wb, ws1, "Özet");

    const head = ["Zaman (s)", "Devir (dev/dk)", "İtki (g)", "Kök gerilmesi (MPa)", "Gerilme (% dayanım)",
      "Uç bükülmesi (mm)", "Kalıcı bükülme (mm)", "Güç (W)", "Akım (A)", "Verim (g/W)", "Güvenlik katsayısı", "Durum"];
    const rows = rec.history.map((h) => [r(h.t, 2), Math.round(h.rpm), r(h.thrust, 1), r(h.stress, 2), r(h.stressPct, 1),
      r(h.defl, 3), r(h.plastic, 3), r(h.power, 1), r(h.current, 2), r(h.eff, 3), r(Math.min(h.sf, 99), 2), h.state]);
    const ws2 = XLSX.utils.aoa_to_sheet([head, ...rows]);
    ws2["!cols"] = head.map((h) => ({ wch: Math.max(12, h.length + 2) }));
    ws2["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: head.length - 1 } }) };
    ws2["!freeze"] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, ws2, "Ölçüm verisi");

    const cmpHead = ["Malzeme", "Kütle (g)", "Sınıra yaklaşma (dev/dk)", "Aşırı esneme (dev/dk)", "Kalıcı bükülme (dev/dk)", "Kırılma (dev/dk)", "Güvenli maks. itki (g)"];
    const cmp = rec.compare.map((c) => [c.name, r(c.mass, 2), c.warnRpm || "dayanır", c.bendRpm || "dayanır",
      c.brittle ? "kırılgan" : c.yieldRpm || "dayanır", c.breakRpm || "dayanır", Math.round(c.bestThrust)]);
    const ws3 = XLSX.utils.aoa_to_sheet([["Aynı pervane ve motorla model karşılaştırması"], [], cmpHead, ...cmp]);
    ws3["!cols"] = cmpHead.map((h) => ({ wch: Math.max(14, h.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws3, "Malzeme karşılaştırma");

    if (rec.sequence && rec.sequence.length) {
      const sh = ["Malzeme", "Renk", "Sonuç", "Kırılma devri", "En yüksek itki (g)", "En yüksek gerilme (%)", "En büyük bükülme (mm)"];
      const ws5 = XLSX.utils.aoa_to_sheet([sh, ...rec.sequence.map((s) => [s.material.name, s.colorName, s.broken ? "KIRILDI" : s.plastic > 0.05 ? "KALICI BÜKÜLME" : "Hasarsız",
        s.broken ? Math.round(s.breakRpm) : "–", Math.round(s.maxThrust), r(s.maxStressPct, 1), r(s.maxDefl, 2)])]);
      ws5["!cols"] = sh.map((h) => ({ wch: Math.max(14, h.length + 2) }));
      XLSX.utils.book_append_sheet(wb, ws5, "Sıralı test sonuçları");
    }

    const ws4 = XLSX.utils.aoa_to_sheet([["Olay günlüğü"], ...rec.log.map((l) => [l])]);
    ws4["!cols"] = [{ wch: 110 }];
    XLSX.utils.book_append_sheet(wb, ws4, "Olay günlüğü");

    XLSX.writeFile(wb, this.fileBase(rec) + ".xlsx", { compression: true });
  },

  /* ---------------- WORD ---------------- */
  async word(rec) {
    if (typeof docx === "undefined") throw new Error("Word kütüphanesi yüklenemedi (vendor/docx.umd.js).");
    const D = docx;
    const P = (text, o = {}) => new D.Paragraph({ spacing: { after: 120 }, ...o.p, children: [new D.TextRun({ text, ...o.r })] });
    const H = (text, level = D.HeadingLevel.HEADING_1) => new D.Paragraph({ text, heading: level, spacing: { before: 280, after: 120 } });
    const cell = (text, head) => new D.TableCell({
      children: [new D.Paragraph({ children: [new D.TextRun({ text: String(text), bold: !!head, size: 20 })] })],
      shading: head ? { type: D.ShadingType.CLEAR, color: "auto", fill: "E4E7FF" } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 }
    });
    const table = (rows, headFirst = true) => new D.Table({
      width: { size: 100, type: D.WidthType.PERCENTAGE },
      rows: rows.map((row, i) => new D.TableRow({ tableHeader: headFirst && i === 0, children: row.map((c) => cell(c, headFirst && i === 0)) }))
    });
    const image = (img, width = 600) => img && new D.Paragraph({
      alignment: D.AlignmentType.CENTER, spacing: { after: 160 },
      children: [new D.ImageRun({ type: "png", data: dataUrlToBytes(img.url), transformation: { width, height: Math.round((width * img.h) / img.w) } })]
    });
    const caption = (t) => P(t, { p: { alignment: D.AlignmentType.CENTER }, r: { italics: true, size: 18, color: "666666" } });

    const m = rec.material;
    const verdict = rec.broken
      ? `${m.name} malzemesinden basılan ${rec.colorName.toLowerCase()} pervane, ${fmtTR(rec.breakRpm)} dev/dk hızda ve ${fmtTR(rec.breakThrust)} g itki altında kanat kökünden kırıldı. Kırılma anında kök gerilmesi ${fmtTR(rec.breakStress, 1)} MPa idi ve bu koşuldaki malzeme dayanımına (${fmtTR(rec.strength, 1)} MPa) ulaştı.`
      : rec.plastic > 0.05
        ? `${m.name} pervane kırılmadı ancak akma sınırı aşıldığı için ${fmtTR(rec.plastic, 1)} mm kalıcı bükülme oluştu. En yüksek itki ${fmtTR(rec.maxThrust)} g oldu.`
        : `${m.name} pervane test boyunca hasar görmedi. En yüksek itki ${fmtTR(rec.maxThrust)} g, en yüksek gerilme dayanımın %${fmtTR(rec.maxStressPct)}'i oldu.`;

    const children = [
      new D.Paragraph({ heading: D.HeadingLevel.TITLE, children: [new D.TextRun({ text: "Pervane Test Raporu" })] }),
      P(`${m.name} · ${rec.colorName} · ${rec.motor.name}`, { r: { size: 26, color: "4F46E5", bold: true } }),
      P(`Tarih: ${rec.date.toLocaleString("tr-TR")} · Pervane Test Laboratuvarı v${typeof APP_VERSION !== "undefined" ? APP_VERSION : ""}`, { r: { color: "666666", size: 18 } }),
      H("1. Sonuç"),
      P(verdict),
      image(rec.snapshot, 560),
      rec.snapshot && caption(rec.broken ? "Şekil 1 – Kırılma anı (3D simülasyon). Kırmızı halka kırılma noktasını gösterir." : "Şekil 1 – Test sonundaki pervane (3D simülasyon)."),
      H("2. Test koşulları ve ölçülen değerler"),
      table([["Alan", "Değer"], ...this.summaryRows(rec).map(([a, b]) => [a, b])]),
      H("3. Grafikler"),
      image(rec.charts.thrust, 560), caption("Şekil 2 – İtki – devir (kesikli: model, kalın: bu test, beyaz nokta: gerçek ölçüm)"),
      image(rec.charts.stress, 560), caption("Şekil 3 – Kök gerilmesi – devir (kırmızı çizgi: kırılma dayanımı)"),
      image(rec.charts.defl, 560), caption("Şekil 4 – Kanat ucu bükülmesi – devir"),
      H("4. Malzeme karşılaştırması (aynı pervane ve motor, model)"),
      table([["Malzeme", "Kütle (g)", "Kalıcı bükülme (dev/dk)", "Kırılma (dev/dk)", "Güvenli maks. itki (g)"],
        ...rec.compare.map((c) => [c.name, fmtTR(c.mass, 2), c.brittle ? "kırılgan" : c.yieldRpm ? fmtTR(c.yieldRpm) : "dayanır", c.breakRpm ? fmtTR(c.breakRpm) : "dayanır", fmtTR(c.bestThrust)])])
    ];
    if (rec.sequence && rec.sequence.length) {
      children.push(H("5. Sıralı canlı test sonuçları"),
        table([["Malzeme", "Renk", "Sonuç", "Kırılma devri", "En yüksek itki (g)"],
          ...rec.sequence.map((s) => [s.material.name, s.colorName, s.broken ? "KIRILDI" : s.plastic > 0.05 ? "KALICI BÜKÜLME" : "Hasarsız", s.broken ? fmtTR(s.breakRpm) : "–", fmtTR(s.maxThrust)])]));
    }
    children.push(
      H("Olay günlüğü"),
      ...rec.log.slice(0, 40).map((l) => new D.Paragraph({ text: l, bullet: { level: 0 } })),
      H("Yöntem"),
      P("İtki T = Cₜ·ρ·n²·D⁴, güç P = Cₚ·ρ·n³·D⁵. Kanat kökten sabitlenmiş dikdörtgen kesitli kiriş olarak modellenmiştir; itki 0,7R noktasına etkir. Merkezkaç gerilmesi σc = ρₘ·ω²·(R² − r₀²)/2, eğilme gerilmesi σb = 6M/(b·h²), uç sehimi δ = F·a²·(3L − a)/(6EI). Baskı katmanlarının zayıflığı ve sıcaklıkla yumuşama hesaba katılmıştır."),
      P("Not: Değerler 3D simülasyondan elde edilmiştir. Gerçek pervane ölçümleriyle karşılaştırılıp kalibre edilmesi önerilir.", { r: { italics: true, color: "666666", size: 18 } })
    );

    const doc = new D.Document({
      creator: "Pervane Test Laboratuvarı",
      title: "Pervane Test Raporu",
      styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
      sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } }, children: children.filter(Boolean) }]
    });
    const blob = await D.Packer.toBlob(doc);
    downloadBlob(blob, this.fileBase(rec) + ".docx");
  }
};

/* ---------- Yardımcılar ---------- */
function dataUrlToBytes(url) {
  const bin = atob(url.split(",")[1]);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
function fmtTR(n, d = 0) { return Number(n).toLocaleString("tr-TR", { maximumFractionDigits: d, minimumFractionDigits: d }); }

/** Canvas'ı koyu arka planlı PNG'ye çevirir (Word'ün beyaz sayfasında okunabilsin) */
function canvasToImage(canvas, bg = "#141930") {
  const c = document.createElement("canvas");
  c.width = canvas.width; c.height = canvas.height;
  const ctx = c.getContext("2d");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(canvas, 0, 0);
  return { url: c.toDataURL("image/png"), w: c.width, h: c.height };
}
/** 3D görüntüyü (şeffaf arka plan) koyu zeminle birleştirir */
function imageUrlOnBg(url, w, h, bg = "#141930") {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#1b2140"); g.addColorStop(1, bg);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve({ url: c.toDataURL("image/png"), w, h });
    };
    img.src = url;
  });
}
