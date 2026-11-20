/* =========================================================
   MALZEME VERİTABANI – 3D baskı filamentleri
   ---------------------------------------------------------
   Değerler, yaygın üreticilerin teknik föylerindeki TİPİK
   değerlerdir (enjeksiyon/baskı numunesi, XY yönü). Marka, renk,
   baskı ayarı ve neme göre ±%30 değişebilir. Kendi testlerinle
   ölçtüğün değerleri buraya yazarak modeli kalibre edebilirsin.

   rho      : yoğunluk (kg/m³)
   E        : elastisite modülü (GPa)  → ne kadar esnediğini belirler
   sigmaU   : çekme dayanımı (MPa)     → kırılma
   yieldR   : akma / kırılma oranı     → kalıcı bükülmenin başladığı gerilme
   elong    : kopma uzaması (%)
   hdt      : ısıl eğilme sıcaklığı (°C) → bu sıcaklığa yaklaştıkça yumuşar
   brittle  : true ise akmadan aniden kırılır
   layer    : katman yapışma katsayısı (baskı yönünden kaynaklı zayıflık)
   ========================================================= */

const MATERIALS = {
  PLA: {
    name: "PLA", full: "Polilaktik asit", color: 0x3b82f6,
    rho: 1240, E: 3.5, sigmaU: 55, yieldR: 0.95, elong: 6, hdt: 55, brittle: true, layer: 0.70,
    note: "Sert ve hassas basılır ama kırılgandır; motor ısısında (55 °C) yumuşar."
  },
  PETG: {
    name: "PETG", full: "Glikol modifiyeli PET", color: 0x22c55e,
    rho: 1270, E: 2.1, sigmaU: 50, yieldR: 0.85, elong: 20, hdt: 70, brittle: false, layer: 0.75,
    note: "PLA'dan daha tok ve esnek; kırılmadan önce bükülür."
  },
  ABS: {
    name: "ABS", full: "Akrilonitril bütadien stiren", color: 0xf97316,
    rho: 1040, E: 2.2, sigmaU: 42, yieldR: 0.85, elong: 10, hdt: 95, brittle: false, layer: 0.65,
    note: "Isıya dayanıklı ve hafif; katman yapışması zayıf olabilir (çekme/çatlama)."
  },
  ASA: {
    name: "ASA", full: "Akrilonitril stiren akrilat", color: 0xa855f7,
    rho: 1070, E: 2.0, sigmaU: 46, yieldR: 0.85, elong: 15, hdt: 95, brittle: false, layer: 0.70,
    note: "ABS'e benzer, UV'ye dayanıklı; dış mekân için ideal."
  },
  CF: {
    name: "Karbon (PA-CF)", full: "Karbon fiber takviyeli naylon", color: 0x374151,
    rho: 1150, E: 7.5, sigmaU: 90, yieldR: 0.92, elong: 4, hdt: 150, brittle: true, layer: 0.65,
    note: "En rijit ve en dayanıklısı; az esner ama sınırda aniden kırılır."
  },
  TPU: {
    name: "TPU 95A", full: "Termoplastik poliüretan", color: 0xec4899,
    rho: 1210, E: 0.026, sigmaU: 35, yieldR: 0.6, elong: 500, hdt: 60, brittle: false, layer: 0.85,
    note: "Lastik gibi esnek; kırılmaz ama çok erken bükülüp itkisini kaybeder."
  }
};

/* Fırçasız motor kütüphanesi (tipik FPV / İHA motorları)
   stator: stator çapı (mm) → 3D'de motor boyutu · label: motor çanının üzerindeki yazı
   bell: çan rengi · estimated: üretici açıklamadığı için tahmini değer */
const MOTORS = {
  m2207: { name: "2207 · 1950KV · 6S", kv: 1950, cells: 6, pmax: 1050, imax: 50, mass: 33, propIn: 5, stator: 22, label: "2207  1950KV" },
  m2806: { name: "2806.5 · 1300KV · 6S", kv: 1300, cells: 6, pmax: 1150, imax: 52, mass: 50, propIn: 7, stator: 28, label: "2806.5  1300KV" },
  m3115: { name: "3115 · 900KV · 6S", kv: 900, cells: 6, pmax: 1300, imax: 55, mass: 70, propIn: 9, stator: 31, label: "3115  900KV" },
  m1404: { name: "1404 · 3800KV · 4S", kv: 3800, cells: 4, pmax: 330, imax: 20, mass: 9, propIn: 3, stator: 14, label: "1404  3800KV" },
  // Hazır drone motorları
  dji2306: { name: "DJI FPV motoru · 2306 sınıfı · ~1900KV* · 6S", kv: 1900, cells: 6, pmax: 780, imax: 38, mass: 34, propIn: 5.3, stator: 23,
    label: " ", bell: 0x26282c, estimated: "DJI, DJI FPV motorunun stator ölçüsünü ve KV değerini açıklamamıştır; 2306 sınıfı ve ~1900KV, 6S 5\" sınıfına göre tahmindir." },
  djiAvata2: { name: "DJI Avata 2 motoru · ~1505 sınıfı · ~3600KV* · 14,76 V", kv: 3600, cells: 4, pmax: 150, imax: 12, mass: 14, propIn: 2.98, stator: 15,
    label: "DJI AVATA 2", bell: 0x3f444b, estimated: "DJI, Avata 2 motorunun stator ölçüsünü, KV değerini, gücünü ve akımını açıklamamıştır; ~1505 sınıfı, ~3600KV, 150 W ve 12 A, 3\" kanallı dronlar için tahmindir. Hücre sayısı da yayımlanmamıştır; 14,76 V standart gerilim 4 hücreye karşılık gelir." },
  // iFlight XING2 2207 1750KV: 12N14P, 30,5 g (kablolu), tepe 36,03 A, 898 W (üretici değerleri)
  xing2207: { name: "iFlight XING2 2207 · 1750KV · 6S", kv: 1750, cells: 6, pmax: 898, imax: 36, mass: 30.5, propIn: 5.1, stator: 22, label: "XING2  2207  1750KV", bell: 0x111827 },
  // iFlight XING2 2809 1250KV: 12N14P, 60,7 g (kablolu), tepe 50 A, 1145 W (üretici değerleri)
  xing2809: { name: "iFlight XING2 2809 · 1250KV · 6S", kv: 1250, cells: 6, pmax: 1145, imax: 50, mass: 60.7, propIn: 7.5, stator: 28, label: "XING2  2809  1250KV", bell: 0x111827 },
  bf2006: { name: "BETAFPV 2006 · 2400KV · 6S", kv: 2400, cells: 6, pmax: 330, imax: 26, mass: 22, propIn: 3.5, stator: 20, label: "BETAFPV  2006  2400KV", bell: 0x1f2937 },
  bf1104: { name: "BETAFPV LAVA 1104 · 7200KV · 3S", kv: 7200, cells: 3, pmax: 50, imax: 9, mass: 7, propIn: 2.2, stator: 11, label: "LAVA  1104  7200KV", bell: 0x7c3aed },
  bf1102: { name: "BETAFPV 1102 · 22000KV · 1S", kv: 22000, cells: 1, pmax: 14, imax: 5, mass: 3.3, propIn: 1.77, stator: 11, label: "1102  22000KV", bell: 0x2563eb },
  // GEPRC SPEEDX2 2105.5: 12N14P, 21,0 g, en yüksek sürekli güç 559 W, en yüksek akım 34,9 A (üretici değerleri)
  gep2105: { name: "GEPRC SPEEDX2 2105.5 · 2650KV · 6S", kv: 2650, cells: 6, pmax: 559, imax: 35, mass: 21, propIn: 3.5, stator: 21, label: "SPEEDX2  2105.5  2650KV", bell: 0x111827 },
  // Happymodel RS0802: 9N12P, stator 8 × 2 mm, 2,0 g, yalnız 1S (üretici değerleri)
  hm0802: { name: "Happymodel RS0802 · 20000KV · 1S", kv: 20000, cells: 1, pmax: 11, imax: 4, mass: 2, propIn: 1.57, stator: 8, label: "RS0802  KV20000", bell: 0x334155,
    estimated: "Happymodel, RS0802 motorunun en yüksek güç ve akım değerini yayımlamamıştır; 11 W ve 4 A, 1S 0802 sınıfı için tahmindir. Boyut ve KV üreticinin değerleridir." }
};

/* FPV drone modelleri (bağlı / tether kırılma testi)
   style   : 3D görünüm – "freestyle" (açık karbon X şase), "dji" (kapalı gövde), "whoop" (kanal korumalı)
   motorKey: kullanılan motor · prop: şasenin aldığı pervane (blades = kanat sayısı)
   massG   : pervanesiz kalkış ağırlığı (batarya dahil) · wheelbaseMm: çapraz motor-motor mesafesi
   Hatve ve kanat kesiti (chordMm, thickMm) pervanenin 3D baskı karşılığı için yaklaşık değerlerdir.
   Yeni modeller bu listeye eklenir; arayüz ve 3D sahne otomatik uyum sağlar. */
const DRONES = {
  fpv5: {
    brand: "Genel yapım", name: '5" Freestyle FPV · X şase', short: '5" Freestyle', style: "freestyle",
    motorKey: "m2207",
    prop: { diameterIn: 5, pitchIn: 4.3, chordMm: 12, thickMm: 2.4, blades: 2 }, propName: '5043 iki kanat',
    wheelbaseMm: 225, massG: 630, battery: "6S 1100 mAh LiPo", accent: 0xf97316,
    parts: "225 mm karbon X şase · 4 × 2207 1950KV · 4in1 45A ESC · F7 uçuş kartı · analog/HD FPV kamera · TPU parçalar",
    note: "Freestyle ve yarış için en yaygın sınıf."
  },
  djiFpv: {
    brand: "DJI", name: "DJI FPV (2021)", short: "DJI FPV", style: "dji",
    motorKey: "dji2306", layout: { x: 70, z: 100 },
    prop: { diameterIn: 5.3, pitchIn: 2.8, chordMm: 13, thickMm: 2.6, blades: 3 }, propName: "DJI 5328S · 3 kanat · hızlı takma",
    wheelbaseMm: 245, massG: 771, battery: "DJI FPV akıllı batarya · 6S 2000 mAh · 22,2 V · 295 g", accent: 0x6b7280,
    parts: "PA66 + %30 karbon fiber gövde · PA6 + %40 cam elyaf kollar · şeffaf siyah üst kapak · 245 mm köşegen · 4 × DJI FPV motoru · 5328S üç kanatlı pervane (A/B, kırmızı işaretli) · tek eksenli gimbal, 1/2.3\" CMOS, 150° FOV · ön/alt görüş sensörü, alt ToF, 300 lm alt ışık · 10 gösterge ışığı",
    note: "Resmî değerler: kalkış ağırlığı ~795 g (batarya ve pervaneler dahil), köşegen 245 mm, en yüksek hız 140 km/sa, uçuş süresi ~20 dk. Motor KV değeri DJI tarafından açıklanmadığı için tahminidir (*)."
  },
  avata2: {
    brand: "DJI", name: "DJI Avata 2 (2024)", short: "DJI Avata 2", style: "whoop", body: "avata",
    motorKey: "djiAvata2", layout: { x: 50, z: 64 }, heightMm: 64,
    prop: { diameterIn: 2.98, pitchIn: 3.2, chordMm: 10, thickMm: 1.6, blades: 3 }, propName: "DJI Avata 2 pervanesi 3032S · 75,66 mm · 3 kanat",
    wheelbaseMm: 162, massG: 370, battery: "DJI Avata 2 akıllı batarya · 2150 mAh · 14,76 V Li-ion · 145 g", frame: 0x4a4e55,
    parts: "Pervane korumalarıyla tek parça gövde · 185 × 212 × 64 mm · 4 × DJI Avata 2 motoru · 3032S üç kanatlı pervane (75,66 mm) · tek eksenli gimbal, 1/1,3\" sensör, 155° FOV · O4 görüntü aktarımı · alt ve arka görüş sensörleri, alt ToF",
    note: "Resmî değerler: kalkış ağırlığı ~377 g, ölçüler 185 × 212 × 64 mm, en yüksek hız 27 m/sn (manuel mod), uçuş süresi ~23 dk. DJI motor değerlerini, pervane hatvesini ve motorlar arası mesafeyi yayımlamamıştır: motor (*), hatve (3032S adından 3,2\") ve 162 mm köşegen (dış ölçülerden) tahminidir. Kanat sayısı ve gövde rengi incelemelere dayanır."
  },
  pavo35: {
    brand: "BETAFPV", name: "BETAFPV Pavo35 · 3,5\" cinewhoop", short: "Pavo35", style: "whoop",
    motorKey: "bf2006",
    prop: { diameterIn: 3.5, pitchIn: 2.4, chordMm: 11, thickMm: 2.0, blades: 3 }, propName: "Gemfan D90S · 3 kanat (kanallı)",
    wheelbaseMm: 148, massG: 450, battery: "6S 1100 mAh LiPo (XT60)", accent: 0xef4444, frame: 0x1f2937,
    parts: "148 mm kanal korumalı şase · 4 × 2006 2400KV · F7 6S AIO · DJI O3 hava ünitesi · Gemfan D90S üç kanatlı pervane",
    note: "Kanallı (ducted) sinema dronu. Resmî ağırlık O3 ile ~275 g (bataryasız); 6S 1100 mAh ile ~450 g."
  },
  pavo20pro: {
    brand: "BETAFPV", name: "BETAFPV Pavo20 Pro · 2,2\" cinewhoop", short: "Pavo20 Pro", style: "whoop",
    motorKey: "bf1104",
    prop: { diameterIn: 2.2, pitchIn: 1.8, chordMm: 7, thickMm: 0.9, blades: 3 }, propName: "Gemfan 2,2\" · 3 kanat (kanallı)",
    wheelbaseMm: 94, massG: 104, battery: "3S 450 mAh LiPo", accent: 0x7c3aed, frame: 0x18181b,
    parts: "93,7 mm kanal korumalı şase · 4 × LAVA 1104 7200KV · F4 2-3S 20A AIO · DJI O3 hava ünitesi · 2,2\" üç kanatlı pervane",
    note: "Küçük HD sinema dronu. Resmî ağırlık O3 PNP sürümü 66,3 g (bataryasız)."
  },
  meteor75pro: {
    brand: "BETAFPV", name: "BETAFPV Meteor75 Pro · 1S tiny whoop", short: "Meteor75 Pro", style: "whoop",
    motorKey: "bf1102",
    prop: { diameterIn: 1.77, pitchIn: 1.3, chordMm: 5.5, thickMm: 0.6, blades: 3 }, propName: "Gemfan 45 mm · 3 kanat",
    wheelbaseMm: 75, massG: 45, battery: "1S 550 mAh LiPo (BT2.0)", accent: 0xdc2626, frame: 0xe5e7eb,
    parts: "75 mm whoop şase · 4 × 1102 22000KV · F4 1S AIO · C03 analog kamera · Gemfan 45 mm üç kanatlı pervane",
    note: "İç mekân için küçük, hafif whoop. Resmî ağırlık ~31 g (bataryasız). Küçük pervaneler çok yüksek devirde döner ama kanatları kısa olduğundan gerilme düşüktür."
  },
  cinelog35v2: {
    brand: "GEPRC", name: "GEPRC CineLog35 V2 HD O3 · 3,5\" cinewhoop", short: "CineLog35 V2", style: "whoop",
    motorKey: "gep2105",
    prop: { diameterIn: 3.5, pitchIn: 3, chordMm: 11, thickMm: 2.0, blades: 3 }, propName: "HQProp DT90MMX3 · 3 kanat (kanallı)",
    wheelbaseMm: 142, massG: 485, battery: "6S 1300 mAh LiPo (XT60) · GEPRC Storm, 207 g", accent: 0xf59e0b, frame: 0x111827,
    parts: "142 mm kanal korumalı şase (karbon plakalar, 7075 alüminyum kolonlar) · 4 × SPEEDX2 2105.5 2650KV · GEP-F722-45A AIO V2 · DJI O3 hava ünitesi · HQProp DT90MMX3 üç kanatlı pervane (90 mm)",
    note: "3,5\" sinema dronu. Üreticinin verdiği ağırlık 285,8 g (TBS Nano RX sürümü, bataryasız); önerdiği 6S 1300 mAh batarya (207 g) ile ~493 g. Motor 2023'te 2150KV'den 2650KV'ye yükseltildi."
  },
  mobula7: {
    brand: "Happymodel", name: "Happymodel Mobula7 1S · 75 mm tiny whoop", short: "Mobula7 1S", style: "whoop",
    motorKey: "hm0802",
    prop: { diameterIn: 1.57, pitchIn: 1, chordMm: 6.5, thickMm: 0.6, blades: 2 }, propName: "Gemfan 1610-2 · 40 mm · 2 kanat",
    wheelbaseMm: 75, massG: 36, battery: "1S 450 mAh LiHV (PH2.0)", accent: 0x0ea5e9, frame: 0x18181b,
    parts: "75 mm whoop şase (Mobula7 V4) · 4 × RS0802 KV20000 · X12 AIO kart (12A ESC, ELRS 2,4 GHz alıcı, OpenVTX) · Caddx Ant analog kamera · Gemfan 1610-2 iki kanatlı pervane",
    note: "İki kanatlı pervane kullanan 1S tiny whoop. Resmî ağırlık 24 g (bataryasız), ölçüler 99 × 99 × 40 mm; 1S 450 mAh batarya ile ~37 g. Şase ve kanopi rengi üreticinin yayımladığı bir değer değildir."
  },
  evoqueF5: {
    brand: "iFlight", name: "iFlight Nazgul Evoque F5X V2 · 6S HD (DJI O3)", short: "Nazgul Evoque F5", style: "freestyle",
    motorKey: "xing2207", layout: { x: 70, z: 88 }, armMm: 6, sidePanels: 0x334155,
    prop: { diameterIn: 5.1, pitchIn: 3.5, chordMm: 13, thickMm: 2.4, blades: 3 }, propName: "iFlight Nazgul F5 · 5,1\" · 3 kanat",
    wheelbaseMm: 225, massG: 670, battery: "6S 1550 mAh LiPo (XT60) · iFlight Fullsend, 253 g", accent: 0x38bdf8,
    parts: "225 mm \"squashed X\" şase, 6 mm kollar, ışıklı yan paneller · 4 × XING2 2207 1750KV · BLITZ Mini F722 + BLITZ Mini E55 4'ü 1 arada ESC · DJI O3 hava ünitesi · Nazgul F5 üç kanatlı pervane",
    note: "5\" freestyle dronu. Ağırlık 433 g (bataryasız), ölçüler 172 × 145 × 36 mm, en yüksek hız 190 km/sa. iFlight O3 sürümünün sayfasını kaldırdığı için ağırlık satıcı listelerinden alındı; motor, pervane, şase ve batarya değerleri iFlight'ın kendi sayfalarındandır. Motorların şase üzerindeki tam konumu yayımlanmadığından çizimdeki yerleşim yaklaşıktır."
  },
  chimera7: {
    brand: "iFlight", name: "iFlight Chimera7 Pro V2 · 7,5\" uzun menzil (DJI O3)", short: "Chimera7 Pro V2", style: "freestyle",
    motorKey: "xing2809", layout: { x: 100, z: 135, xr: 118, zr: 105 }, armMm: 6, bodyScale: 1.3, gps: true,
    prop: { diameterIn: 7.5, pitchIn: 3.7, chordMm: 16, thickMm: 3, blades: 3 }, propName: "HQProp 7.5X3.7X3 · 3 kanat",
    wheelbaseMm: 327, massG: 1125, battery: "6S 3300 mAh LiPo (XT60) · iFlight Fullsend, 442 g", accent: 0xfacc15,
    parts: "327 mm \"deadcat\" karbon şase, 6 mm kollar · 4 × XING2 2809 1250KV · BLITZ F722 + BLITZ E55 4'ü 1 arada ESC · DJI O3 hava ünitesi · GPS · HQProp 7.5X3.7X3 üç kanatlı pervane",
    note: "7,5\" uzun menzil dronu. Ağırlık 725 g (bataryasız), 6S 3300 mAh ile ~1165 g; ölçüler 270 × 199 × 34 mm, en yüksek hız 140 km/sa. iFlight O3 sürümünün sayfasını kaldırdığı için bu değerler satıcı listeleri ve iFlight'ın aynı gövdeli O4 sayfasıyla karşılaştırılarak alındı. Motorların şase üzerindeki tam konumu yayımlanmadığından çizimdeki yerleşim yaklaşıktır."
  }
};

/* Pervane renkleri (filament renkleri)
   hex: düz renk · metal: ipek/metalik parlaklık · clear: yarı saydam
   glow: karanlıkta parlayan · gradient: kanat boyunca renk geçişi
   duo: her kanat ayrı renk · mat: seçili malzemenin kendi rengi */
const PROP_COLORS = [
  { k: "mat", name: "Malzeme rengi", mat: true },
  { k: "black", name: "Siyah", hex: "#1f2430" },
  { k: "white", name: "Beyaz", hex: "#eef2f7" },
  { k: "red", name: "Kırmızı", hex: "#e11d48" },
  { k: "orange", name: "Turuncu", hex: "#f97316" },
  { k: "yellow", name: "Sarı", hex: "#facc15" },
  { k: "green", name: "Yeşil", hex: "#22c55e" },
  { k: "teal", name: "Turkuaz", hex: "#14b8a6" },
  { k: "blue", name: "Mavi", hex: "#2563eb" },
  { k: "purple", name: "Mor", hex: "#7c3aed" },
  { k: "pink", name: "Pembe", hex: "#ec4899" },
  { k: "gold", name: "İpek altın", hex: "#d4a72c", metal: true },
  { k: "silver", name: "İpek gümüş", hex: "#c3c9d4", metal: true },
  { k: "clear", name: "Şeffaf", hex: "#cfe9ff", clear: true },
  { k: "glow", name: "Fosforlu", hex: "#a3e635", glow: true },
  { k: "rainbow", name: "Gökkuşağı", gradient: ["#ef4444", "#f59e0b", "#facc15", "#22c55e", "#3b82f6", "#a855f7"] },
  { k: "duo", name: "Çift renk", duo: ["#f97316", "#2563eb"] }
];
