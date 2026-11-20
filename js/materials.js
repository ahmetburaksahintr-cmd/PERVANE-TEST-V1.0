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

/* Fırçasız motor kütüphanesi (tipik FPV / İHA motorları) */
const MOTORS = {
  m2207: { name: "2207 · 1950KV · 6S", kv: 1950, cells: 6, pmax: 1050, imax: 50, mass: 33, propIn: 5 },
  m2806: { name: "2806.5 · 1300KV · 6S", kv: 1300, cells: 6, pmax: 1150, imax: 52, mass: 50, propIn: 7 },
  m3115: { name: "3115 · 900KV · 6S", kv: 900, cells: 6, pmax: 1300, imax: 55, mass: 70, propIn: 9 },
  m1404: { name: "1404 · 3800KV · 4S", kv: 3800, cells: 4, pmax: 330, imax: 20, mass: 9, propIn: 3 }
};

/* FPV drone modelleri (bağlı / tether kırılma testi)
   motorKey: kullanılan motor · prop: şasenin aldığı pervane · massG: pervanesiz kalkış ağırlığı (batarya dahil)
   Yeni modeller bu listeye eklenir; arayüz ve 3D sahne otomatik uyum sağlar. */
const DRONES = {
  fpv5: {
    name: '5" Freestyle FPV · X şase',
    short: '5" Freestyle',
    motorKey: "m2207",
    prop: { diameterIn: 5, pitchIn: 4.3, chordMm: 12, thickMm: 2.4 },
    wheelbaseMm: 225,
    massG: 630,
    battery: "6S 1100 mAh LiPo",
    accent: 0xf97316,
    parts: "225 mm karbon X şase · 4 × 2207 1950KV · 4in1 45A ESC · F7 uçuş kartı · analog/HD FPV kamera · TPU parçalar",
    note: "Freestyle ve yarış için en yaygın sınıf. Drone yere bağlıdır (tether); gaz açılınca kalkar ve ipler gerilir. Pervanelerden biri kırılınca o köşeye yatar ve pede düşer."
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
