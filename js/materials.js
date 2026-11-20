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
    label: "DJI FPV  2306", bell: 0x9ca3af, estimated: "DJI, DJI FPV motorunun stator ölçüsünü ve KV değerini açıklamamıştır; 2306 sınıfı ve ~1900KV, 6S 5\" sınıfına göre tahmindir." },
  bf2006: { name: "BETAFPV 2006 · 2400KV · 6S", kv: 2400, cells: 6, pmax: 330, imax: 26, mass: 22, propIn: 3.5, stator: 20, label: "BETAFPV  2006  2400KV", bell: 0x1f2937 },
  bf1104: { name: "BETAFPV LAVA 1104 · 7200KV · 3S", kv: 7200, cells: 3, pmax: 50, imax: 9, mass: 7, propIn: 2.2, stator: 11, label: "LAVA  1104  7200KV", bell: 0x7c3aed },
  bf1102: { name: "BETAFPV 1102 · 22000KV · 1S", kv: 22000, cells: 1, pmax: 14, imax: 5, mass: 3.3, propIn: 1.77, stator: 11, label: "1102  22000KV", bell: 0x2563eb }
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
    parts: "Kapalı gövde · 245 mm köşegen · 4 × DJI FPV motoru · 5328S üç kanatlı pervane · tek eksenli gimbal kamera (4K/60) · iniş ayaklarında anten",
    note: "Resmî değerler: kalkış ağırlığı ~795 g (batarya ve pervaneler dahil), köşegen 245 mm, en yüksek hız 140 km/sa, uçuş süresi ~20 dk. Motor KV değeri DJI tarafından açıklanmadığı için tahminidir (*)."
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
