/* =========================================================
   PARÇA KATALOĞU – Drone atölyesi (js/builder.js)
   ---------------------------------------------------------
   Gerçek ürünler: değerler üretici ya da büyük satıcı sayfalarından
   (src = okunan sayfa). est = sayfada bulunamayıp tahmin edilen alanlar.
   ========================================================= */

/* Dünyada yaygın FPV motorları (üretici ya da büyük satıcı sayfalarından; src = okunan sayfa)
   cells = en çok hücre, cellsMin = en az · pmax/imax = en yüksek güç/akım (üreticinin verdiği süreyle) · propIn = önerilen pervane
   est = sayfada bulunamayıp tahmin edilen alanlar (güç tahmini: akım × hücre × 3,7 V × 0,9) */
const MOTOR_DB = [
  ["betafpv0702", "BETAFPV", "0702 II", "0702", 25000, 1, 1, 1.5, 15.01, 3.86, 1.2, ["pervane"], "https://www.hobbyrc.co.uk/betafpv-0702-brushless-motors-2026"],
  ["happymodelEx0802", "Happymodel", "EX0802", "0802", 19000, 1, 1, 1.7, 15.13, 4.09, 1.6, [], "https://www.happymodel.cn/index.php/2020/05/29/happymodel-ex0802-new-series-brushless-motor-for-mobula6-mobula6-hd/"],
  ["betafpv0802", "BETAFPV", "0802 II", "0802", 22000, 1, 1, 1.88, 22.73, 5.9, 1.6, [], "https://www.hobbyrc.co.uk/betafpv-0802-ii-brushless-motors-2026-4pcs"],
  ["rcinpower0802", "RCinPower", "GTS V3 0802", "0802", 27000, 1, 1, 1.97, 19.3, 5.8, 1.2, ["güç", "pervane"], "https://www.hobbyrc.co.uk/rcinpower-gts-v3-0802-27000kv-motor"],
  ["tmotorF0803", "T-Motor", "F0803", "0803", 22000, 1, 1, 2.47, 18.2, 5.46, 1.6, ["güç", "pervane"], "https://www.fpv24.com/en/t-motor/t-motor-f0803-22000kv-fpv-copter-motor"],
  ["geprc1002", "GEPRC", "SPEEDX2 1002", "1002", 25000, 1, 1, 2.5, 58.8, 15.9, 1.6, [], "https://geprc.com/product/geprc-speedx2-1002-25000kv-18000kv-motor/"],
  ["rcinpower1002", "RCinPower", "GTS V3 1002", "1002", 22000, 1, 2, 2.5, 59.9, 9, 1.6, ["güç", "pervane"], "https://www.hobbyrc.co.uk/rcinpower-gts-v3-1002-22000kv-motor"],
  ["happymodelEx1103", "Happymodel", "EX1103", "1103", 11000, 1, 2, 3.8, 68.08, 9.2, 2.0, [], "https://www.happymodel.cn/index.php/2022/09/05/bassline-spare-part-ex1103-kv11000-brushless-motor/"],
  ["geprc1202", "GEPRC", "SPEEDX2 1202.5", "1202.5", 10000, 1, 2, 4.53, 84, 11.3, 2.0, ["pervane"], "https://geprc.com/product/geprc-speedx2-1202-5-motor/"],
  ["geprc1104", "GEPRC", "SPEEDX2 1104", "1104", 7500, 2, 3, 5.2, 155, 13.2, 2.0, [], "https://geprc.com/product/geprc-speedx2-1104-7500kv-motor/"],
  ["emax1303", "EMAX", "E3 1303", "1303", 5000, 2, 4, 6.6, 172, 10.7, 3.0, [], "https://www.emax-usa.com/motor-detail-dark.html?motor=e3-1303"],
  ["iflight1404", "iFlight", "XING2 1404", "1404", 3800, 3, 4, 9.1, 253.4, 15.84, 3.0, ["pervane"], "https://shop.iflight.com/motors-cat88/xing2-1404-toothpick-ultralight-build-unibell-pro1482"],
  ["emax1404", "EMAX", "E3 1404", "1404", 3700, 3, 4, 9.9, 228, 14.2, 3.5, [], "https://www.emax-usa.com/motor-detail-dark.html?motor=e3-1404"],
  ["happymodelEx1404", "Happymodel", "EX1404", "1404", 3500, 3, 4, 8.7, 140.6, 9.5, 4.0, [], "https://www.happymodel.cn/index.php/2021/01/07/happymodel-ex1404-kv2750-kv3500-kv4800-brushless-motor/"],
  ["geprc1505", "GEPRC", "SPEEDX2 1505", "1505", 4300, 4, 4, 12.7, 340.9, 21.56, 3.0, [], "https://geprc.com/product/geprc-speedx2-1505-4300kv-motor/"],
  ["tmotorP1604", "T-Motor", "Pacer P1604", "1604", 3800, 4, 4, 11.6, 227.8, 16.8, 3.5, [], "https://www.hobbyrc.co.uk/t-motor-p1604-3800kv-motor"],
  ["geprc1804", "GEPRC", "SPEEDX2 1804", "1804", 2450, 4, 6, 13.2, 452.2, 18.8, 3.5, ["pervane"], "https://geprc.com/product/geprc-speedx2-1804-2450kv-3450kv-motor/"],
  ["tmotorF2004", "T-Motor", "F2004", "2004", 1700, 4, 6, 16.4, 503, 21.2, 4.0, ["pervane"], "https://www.fpv24.com/en/t-motor/t-motor-f2004-1700kv-black-red-fpv-motor"],
  ["axisC206", "Axisflying", "C206", "2006", 2500, 6, 6, 22, 429.6, 21.5, 3.5, ["güç"], "https://www.axisflying.com/products/motor-c206-6s"],
  ["rcinpower2107", "RCinPower", "GTS V3 2107 Plus", "2107", 1980, 5, 6, 29, 777.2, 38.9, 5.0, ["güç"], "https://www.hobbyrc.co.uk/rcinpower-gts-v3-2107-plus-1980kv-motor"],
  ["sunnyskyR2205", "Sunnysky", "Edge Racing R2205", "2205", 2300, 2, 4, 30, 385, 26, 5.0, [], "https://www.racer.lt/item/sunnysky-edge-racing-r2205-2300kv-2-4s-brushless-motor-cw-ccw-for-fpv-racing-1582.html"],
  ["iflight2207", "iFlight", "XING2 2207", "2207", 1855, 6, 6, 31.6, 841.9, 35.08, 5.0, ["pervane"], "https://shop.iflight.com/xing2-2207-4s-6s-fpv-motor-unibell-pro1464"],
  ["tmotorV2207", "T-Motor", "Velox V2207 V2", "2207", 1750, 5, 6, 35.1, 804, 36.6, 5.0, ["pervane"], "https://www.fpv24.com/en/t-motor/t-motor-v2207-v2-1750kv-green-white-fpv-motor"],
  ["axisAe2207", "Axisflying", "AE2207 V2", "2207", 1960, 6, 6, 35.2, 902.48, 38.65, 5.0, ["pervane"], "https://fpv24.com/en/axisflying/axisflying-ae2207-v2-1960kv-fpv-motor"],
  ["geprc2207e", "GEPRC", "SPEEDX2 2207E", "2207", 1960, 6, 6, 34.5, 1104.7, 44.57, 5.0, [], "https://geprc.com/product/geprc-speedx2-2207e-motor/"],
  ["tmotorF60", "T-Motor", "F60 Pro V", "2207.5", 1750, 6, 6, 34.3, 1003, 40.5, 5.0, ["pervane"], "https://www.fpv24.com/en/t-motor/t-motor-f60-pro-v-fpv-motor-1750kv-silver-grey"],
  ["hobbywing2207", "Hobbywing", "XRotor 2207.5", "2207.5", 1780, 6, 6, 38, 988, 41, 5.1, [], "https://www.hobbywing.com/en/products/xrotor-22075"],
  ["iflight2306", "iFlight", "XING2 2306", "2306", 1755, 6, 6, 32.5, 869, 36.21, 5.0, ["pervane"], "https://shop.iflight.com/xing2-2306-4s-6s-fpv-motor-unibell-pro1465"],
  ["tmotorF40ProV", "T-Motor", "F40 Pro V", "2306.8", 1950, 6, 6, 34.5, 1354, 55.5, 5.0, ["pervane"], "https://www.fpv24.com/en/t-motor/t-motor-f40-pro-v-fpv-motor-1950kv-black"],
  ["brotherhobby2806", "BrotherHobby", "Avenger 2806.5", "2806.5", 1300, 4, 6, 41, 899, 45, 7.0, ["akım", "güç"], "https://www.rotorama.com/product/brotherhobby-avenger-2806-5-1300k"],
  ["tmotorF90", "T-Motor", "F90", "2806.5", 1300, 5, 6, 46.6, 1059, 45.1, 7.0, [], "https://www.fpv24.com/en/t-motor/t-motor-f90-1300kv-cinelifter-fpv-copter-motors"],
  ["geprc2806", "GEPRC", "SPEEDX2 2806.5", "2806.5", 1350, 4, 6, 48, 960, 40, 7.0, [], "https://geprc.com/product/geprc-speedx2-2806-5-1350kv-1760kv-motor/"],
  ["axisC287", "Axisflying", "C287", "2807.5", 1350, 4, 6, 47, 1131.9, 48.6, 7.0, [], "https://www.axisflying.com/products/fpv-brushless-motor-c287-28075-for-7inch-longrange"],
  ["emax2808", "EMAX", "ECO III 2808", "2808", 1300, 3, 6, 53.6, 1410, 56, 7.0, [], "https://www.hobbyrc.co.uk/emax-ecoiii-motors-various"],
  ["emax2812", "EMAX", "E3 2812", "2812", 920, 3, 6, 72, 1425, 57, 8.0, [], "https://www.emax-usa.com/motor-detail-dark.html?motor=e3-2812"],
  ["tmotorF100", "T-Motor", "F100", "2810", 1100, 5, 6, 57.5, 1231.8, 61.65, 8.0, ["güç"], "https://www.fpv24.com/en/t-motor/t-motor-f100-1100kv-fpv-copter-motor"],
  ["iflight3110", "iFlight", "XING2 3110", "3110", 1250, 4, 6, 77, 1976.4, 84.68, 8.0, [], "https://shop.iflight.com/XING2-3110-FPV-Cinelifter-Motor-Unibell-Pro1683"],
  ["hobbywing3115", "Hobbywing", "XRotor 3115", "3115", 900, 4, 6, 125, 1940, 81, 10.0, [], "https://www.hobbywing.com/en/products/xrotor3115"],
  ["emax3115", "EMAX", "E3 3115", "3115", 900, 4, 6, 110, 1925, 77, 10.0, [], "https://www.emax-usa.com/motor-detail-dark.html?motor=e3-3115"],
  ["geprc3214", "GEPRC", "SPEEDX2 3214", "3214", 860, 6, 6, 155, 1867.11, 77.8, 10.0, [], "https://geprc.com/product/geprc-speedx2-3214-860kv-motor/"],
  ["emax3214", "EMAX", "ECO II 3214", "3214", 900, 6, 8, 132, 2672, 87.9, 10.0, [], "https://www.emax-usa.com/motor-detail-dark.html?motor=eco-ii-3214"],
  ["iflight4214", "iFlight", "XING 4214", "4214", 660, 2, 6, 255.2, 2352, 98, 15.0, [], "https://shop.iflight.com/index.php?product_id=802&route=product%2Fproduct"]
];
for (const [k, brand, model, size, kv, cMin, cMax, mass, pmax, imax, propIn, est, src] of MOTOR_DB) {
  if (MOTORS[k]) continue;
  MOTORS[k] = {
    name: `${brand} ${model} · ${kv}KV · ${cMax}S`, kv, cells: cMax, cellsMin: cMin, pmax: Math.round(pmax), imax, mass, propIn,
    stator: Math.max(7, Number(String(size).slice(0, 2))), label: `${model.length > 16 ? size : model}  ${kv}KV`, src, catalog: true,
    estimated: est.length ? `${brand} ${model}: ${est.join(", ")} üreticinin sayfasında yok, tahmindir.` : undefined
  };
}

const PARTS_DB = {
  // Şaseler: wb = çapraz motor arası (mm), maxProp = en büyük pervane (inç), mass = yalnız şase (g), arm = kol kalınlığı (mm)
  // mat: carbon | nylon | pp | mixed | glassfiber · ducts: pervane koruma halkası · est: üreticinin yazmadığı, tahmin edilen alanlar
  frames: {
    betafpvMeteor65Pro: { brand: "BETAFPV", model: "Meteor65 Pro", wb: 66, maxProp: 1.38, mass: 3.2, mat: "pp", matNote: "Tek parça PP whoop şase, halkalar gövdeyle bir", type: "whoop", ducts: true, src: "https://www.hobbyrc.co.uk/betafpv-meteor-65-pro-brushless-frame" },
    happymodelMobula6: { brand: "Happymodel", model: "Mobula6 2024 (65 mm)", wb: 65, maxProp: 1.22, mass: 2.8, mat: "pp", matNote: "Yumuşak, dayanıklı whoop plastiği", type: "whoop", ducts: true, src: "https://www.happymodel.cn/index.php/2024/02/24/frame-for-mobula6-2024-mobula6-eco-2024/", est: ["malzeme"] },
    newbeeCockroach65: { brand: "NewBeeDrone", model: "Cockroach LiteAF 65 mm", wb: 65, maxProp: 1.22, mass: 2.4, mat: "pp", matNote: "Polipropilen (PP)", type: "whoop", ducts: true, src: "https://myfpvstore.com/whoop-drones/ready-to-fly/newbeedrone-cockroach-2-4-gram-65mm-liteaf-frame", est: ["en büyük pervane"] },
    happymodelMobula7V4: { brand: "Happymodel", model: "75 mm V4 (Mobula7)", wb: 75, maxProp: 1.57, mass: 5.4, mat: "pp", matNote: "Yarı saydam yumuşak whoop plastiği", type: "whoop", ducts: true, src: "https://www.happymodel.cn/index.php/2022/01/18/75mm-v4-whoop-frame-for-moblite7-and-mobula7/", est: ["malzeme"] },
    betafpvMeteor75Pro: { brand: "BETAFPV", model: "Meteor75 Pro", wb: 80.8, maxProp: 1.77, mass: 7.73, mat: "pp", matNote: "PP whoop şase", type: "whoop", ducts: true, src: "https://www.hobbyrc.co.uk/betafpv-meteor-75-pro-frame" },
    happymodelMobula8: { brand: "Happymodel", model: "Mobula8 85 mm", wb: 85, maxProp: 2.0, mass: 11.5, mat: "pp", matNote: "Dayanıklı yarı saydam siyah plastik", type: "whoop", ducts: true, src: "https://www.happymodel.cn/index.php/2023/04/28/mobula8-frame-85mm-brushless-whoop-frame/", est: ["malzeme"] },
    betafpvPavo20Pro: { brand: "BETAFPV", model: "Pavo20 Pro", wb: 93.7, maxProp: 2.0, mass: 33.3, mat: "nylon", matNote: "PA12 naylon kalın halkalar, 2 mm üst plaka", type: "cinewhoop", ducts: true, src: "https://www.hobbyrc.co.uk/betafpv-pavo20-pro-brushless-whoop-frame-2-versions", est: ["en büyük pervane"] },
    iflightDefender25: { brand: "iFlight", model: "Defender 25", wb: 112, maxProp: 2.5, mass: 90, mat: "nylon", matNote: "Enjeksiyon kalıplı plastik gövde, gövdeyle bir pervane korumaları", type: "cinewhoop", arm: 2.5, ducts: true, src: "https://shop.iflight.com/Defender-25-Frame-Kit-Pro1926", est: ["malzeme"] },
    geprcCineLog25V2: { brand: "GEPRC", model: "CineLog25 V2", wb: 114, maxProp: 2.5, mass: 70.9, mat: "mixed", matNote: "Karbon plakalar (2,5 mm kol) + plastik koruma halkası + 7075 alüminyum kolonlar", type: "cinewhoop", arm: 2.5, ducts: true, src: "https://geprc.com/product/cl25-v2-frame/" },
    geprcCineLog35V2: { brand: "GEPRC", model: "CineLog35 V2", wb: 142, maxProp: 3.5, mass: 133.7, mat: "mixed", matNote: "Karbon plakalar (3,5 mm kol plakası) + enjeksiyon kalıplı koruma halkası", type: "cinewhoop", arm: 3.5, ducts: true, src: "https://geprc.com/product/gep-cl35-v2-frame/" },
    betafpvPavo35: { brand: "BETAFPV", model: "Pavo35", wb: 148, maxProp: 3.5, mass: 113.9, mat: "mixed", matNote: "3 mm karbon üst + 1,5 mm karbon alt plaka + polikarbonat (PC) halkalar + 7075 alüminyum", type: "cinewhoop", ducts: true, src: "https://www.myfpvstore.com/quadcopter-frames/betafpv-pavo35-brushless-whoop-frame/" },
    iflightAosCine35V5: { brand: "iFlight", model: "AOS Cine35 V5", wb: 153, maxProp: 3.5, mass: 145, mat: "carbon", matNote: "Tamamen karbon, karbon pervane korumaları", type: "cinewhoop", ducts: true, src: "https://shop.iflight.com/drone-frame-cat346/AOS-Cine35-V5-Frame-Kit-Pro2297" },
    geprcPhantom: { brand: "GEPRC", model: "Phantom (GEP-PT) kürdan", wb: 125, maxProp: 2.5, mass: 13.7, mat: "carbon", matNote: "2 mm tek parça karbon alt plaka, 1,5 mm üst plaka", type: "toothpick", arm: 2.0, src: "https://geprc.com/product/gep-pt-frame/", est: ["malzeme", "kol kalınlığı"] },
    five33TinyTrainerV2: { brand: "Five33", model: "TinyTrainer V2 3\"", wb: 135, maxProp: 3, mass: 41, mat: "carbon", matNote: "Karbon plaka ve 3 mm sökülebilir kollar + plastik kanopi", type: "toothpick", arm: 3, src: "https://www.myfpvstore.com/quadcopter-frames/3-quadcopter-frames/five33-tinytrainer-v2-3-frame-kit-no-tpu/" },
    iflightAos35V5: { brand: "iFlight", model: "AOS 3.5 V5.1", wb: 162, maxProp: 3.5, mass: 81, mat: "carbon", matNote: "4 mm karbon kollar, 7075 alüminyum kamera kafesi", type: "freestyle", arm: 4, src: "https://shop.iflight.com/AOS-3.5-V5-FPV-Frame-Kit-Pro2126", est: ["malzeme"] },
    flywooExplorerLR4: { brand: "Flywoo", model: "Explorer LR 4", wb: 186, maxProp: 4, mass: 54, mat: "carbon", matNote: "Karbon fiber + TPU; 250 g altı mikro uzun menzil", type: "longrange", arm: 3, src: "https://www.myfpvstore.com/quadcopter-frames/4-quadcopter-frames/flywoo-explorer-lr-4-o4-pro-frame-kit/", est: ["kol kalınlığı"] },
    iflightMachR5: { brand: "iFlight", model: "Mach R5 Sport (yarış)", wb: 210, maxProp: 5.1, mass: 107, mat: "carbon", matNote: "Karbon plakalar, 5,5 mm kollar, plastik kanopi", type: "race", arm: 5.5, src: "https://shop.iflight.com/Mach-R5-Sport-Race-Frame-Kit-Pro2179", est: ["en büyük pervane"] },
    diatoneRomaF5: { brand: "Diatone", model: "Roma F5", wb: 218, maxProp: 5, mass: 120, mat: "carbon", matNote: "T300 3K karbon, 2,5 mm plakalar, 7075 alüminyum", type: "freestyle", arm: 5, src: "https://www.myfpvstore.com/quadcopter-frames/diatone-roma-f5-5inch-freestyle-frame-kit/", est: ["kol kalınlığı"] },
    lumenierQavS2: { brand: "Lumenier", model: "QAV-S 2 JohnnyFPV SE", wb: 220, maxProp: 5, mass: 133, mat: "carbon", matNote: "6 mm 3K karbon kollar, alüminyum parçalar", type: "freestyle", arm: 6, src: "https://www.lumenier.com/products/lumenier-qav-s-2-johnnyfpv-se-5-frame-kit", est: ["en büyük pervane"] },
    iflightEvoqueF5V2: { brand: "iFlight", model: "Nazgul Evoque F5 V2 (DeadCat)", wb: 223, maxProp: 5, mass: 242, mat: "carbon", matNote: "6 mm karbon kollar, 3 mm plakalar, TPU kol korumaları", type: "freestyle", arm: 6, src: "https://shop.iflight.com/Evoque-F5-V2-Frame-Kit-Pro1887", est: ["en büyük pervane"] },
    impulseApex5: { brand: "ImpulseRC", model: "Apex 5\"", wb: 225, maxProp: 5.2, mass: 115, mat: "carbon", matNote: "5,5 mm karbon kollar, alüminyum konik pullar", type: "freestyle", arm: 5.5, src: "https://www.myfpvstore.com/quadcopter-frames/mr-steele-apex-frame-kit/" },
    geprcMark5: { brand: "GEPRC", model: "Mark5", wb: 225, maxProp: 5, mass: 130, mat: "carbon", matNote: "5 mm karbon kol plakası, 2,5 mm plakalar, alüminyum yan plakalar", type: "freestyle", arm: 5, src: "https://geprc.com/product/geprc-gep-mk5-frame/" },
    five33Switchback: { brand: "Five33", model: "Switchback Pro (yarış)", wb: 225, maxProp: 5.1, mass: 62, mat: "carbon", matNote: "5 mm karbon kollar, çok hafif yarış şasesi", type: "race", arm: 5, src: "https://www.myfpvstore.com/quadcopter-frames/five33-switchback-pro-frame-kit-longback/" },
    tbsSourceOne5: { brand: "TBS", model: "Source One V5 5\" (açık kaynak)", wb: 226, maxProp: 5, mass: 123.5, mat: "carbon", matNote: "6 mm karbon kollar; plaka çizimleri ve TPU parçaları açık kaynak, kendin kesip basabilirsin", type: "freestyle", arm: 6, src: "https://www.hobbyrc.co.uk/tbs-source-one-5-frame", est: ["en büyük pervane"] },
    armattanMarmotte: { brand: "Armattan", model: "Marmotte 5\"", wb: 230, maxProp: 5.5, mass: 115, mat: "carbon", matNote: "4 mm tek parça karbon gövde, titanyum kafes", type: "freestyle", arm: 4, src: "https://www.myfpvstore.com/quadcopter-frames/pre-order-armattan-marmotte-5in-frame/" },
    geprcMark4_7: { brand: "GEPRC", model: "Mark4 7\"", wb: 295, maxProp: 7, mass: 121, mat: "carbon", matNote: "3K karbon, 5 mm kollar, H düzen", type: "longrange", arm: 5, src: "https://www.hobbyrc.co.uk/geprc-mark4-7-frame-2" },
    geprcCrocodile7: { brand: "GEPRC", model: "Crocodile7 (GEP-LC7)", wb: 315, maxProp: 7, mass: 153, mat: "carbon", matNote: "Tamamen 3K karbon, 5 mm kollar, TPU korumalar", type: "longrange", arm: 5, src: "https://geprc.com/product/gep-lc7/" },
    tbsSourceOne7: { brand: "TBS", model: "Source One V5 7\" DC (açık kaynak)", wb: 320, maxProp: 7, mass: 143.5, mat: "carbon", matNote: "6 mm karbon kollar, DeadCat; açık kaynak", type: "longrange", arm: 6, src: "https://www.fpv24.com/en/team-blacksheep/tbs-source-one-v5-7-inch-dc", est: ["en büyük pervane"] },
    iflightChimera7: { brand: "iFlight", model: "Chimera7 Pro V2", wb: 327, maxProp: 7.5, mass: 355, mat: "carbon", matNote: "6 mm karbon kollar, silikon yan paneller, TPU parçalar", type: "longrange", arm: 6, src: "https://shop.iflight.com/Chimera7-O4-Frame-Kit-Pro2286" },
    geprcMoz7: { brand: "GEPRC", model: "MOZ7 V2", wb: 336, maxProp: 8, mass: 270, mat: "carbon", matNote: "6 mm karbon kollar, alüminyum kamera tutucular", type: "longrange", arm: 6, src: "https://geprc.com/product/gep-moz7-v2-frame/", est: ["malzeme"] },
    geprcMark4_8: { brand: "GEPRC", model: "Mark4 8\"", wb: 338, maxProp: 8, mass: 162.4, mat: "carbon", matNote: "3K karbon, 6 mm kollar", type: "longrange", arm: 6, src: "https://www.hobbyrc.co.uk/geprc-mark4-frame-5678-inch" },
    iflightXL10: { brand: "iFlight", model: "Nazgul XL10 V6", wb: 420, maxProp: 10, mass: 343, mat: "carbon", matNote: "3K karbon, 7 mm kollar, TPU set", type: "longrange", arm: 7, src: "https://shop.iflight.com/xl10-v6-10-inch-fpv-frame-Pro1967" },
    geprcMark4_10: { brand: "GEPRC", model: "Mark4 10\"", wb: 428, maxProp: 10, mass: 270, mat: "carbon", matNote: "Karbon fiber, 7 mm kollar", type: "longrange", arm: 7, src: "https://www.hobbyrc.co.uk/geprc-mark4-10-long-range-drone-frame" },
    djiF450: { brand: "DJI", model: "Flame Wheel F450", wb: 450, maxProp: 10, mass: 282, mat: "nylon", matNote: "Cam elyaf katkılı naylon kollar (PA66+%30 cam elyaf), PCB orta plakalar", type: "heavy", arm: 10, src: "https://www-v1.dji.com/flame-wheel-arf/spec.html" },
    s500: { brand: "Genel (S500)", model: "S500 480 mm", wb: 480, maxProp: 10, mass: 405, mat: "glassfiber", matNote: "Cam elyaf plakalar + naylon kollar, PCB'li", type: "heavy", arm: 10, src: "http://www.optimusdigital.ro/ro/drone/3617-cadru-drona-s500-din-fibra-de-sticla-480mm-pcb-integrat.html" }
  },
  // ESC: amps = motor başına sürekli akım, burst = kısa süreli, cMin–cMax = desteklenen hücre, aio = uçuş kartı aynı kartta / yığında
  escs: {
    betafpvMatrix1s: { brand: "BETAFPV", model: "Matrix 1S 5'i 1 arada (AIO)", amps: 5, burst: 8, cMin: 1, cMax: 1, mass: 3.92, aio: true, vtx: true, mount: "26×26", note: "Uçuş kartı + ESC + ELRS alıcı + 400 mW analog verici tek kartta", src: "https://betafpv.com/products/matrix-1s-brushless-flight-controller" },
    happymodelCrazyF405Hd: { brand: "Happymodel", model: "CrazyF405HD ELRS 1–2S AIO 12A", amps: 12, burst: 15, cMin: 1, cMax: 2, mass: 4.8, aio: true, rx: true, mount: "25,5×25,5", note: "Dijital HD whooplar için; ELRS alıcı kartta", src: "https://speedyfpv.com/products/crazyf405-elrs-hd-new" },
    happymodelX12: { brand: "Happymodel", model: "X12 AIO 1–2S 12A", amps: 12, burst: 15, cMin: 1, cMax: 2, mass: 5.1, aio: true, vtx: true, mount: "25,5×25,5", note: "F4 kart + 12A ESC + OpenVTX + alıcı", src: "https://www.racedayquads.com/products/happymodel-x12-2s-aio-whoop-flight-controller-f4-fc-12a-4in1-esc-25-400mw-vtx-choose-version", est: ["kısa süreli akım"] },
    flywooGokuF405HdV2: { brand: "Flywoo", model: "GOKU F405 HD 1–2S 12A AIO V2", amps: 12, burst: 25, cMin: 1, cMax: 2, mass: 4.9, aio: true, rx: true, mount: "25,5×25,5", note: "ELRS alıcı kartta, O3/O4 için 9 V BEC", src: "https://pyrodrone.com/products/flywoo-goku-f405-hd-v2-aio-1-2s-12a-icm42688-elrs-2-4g-flight-controller-o3-plug-play-25x25mm" },
    betafpvToothpickF405V4: { brand: "BETAFPV", model: "Toothpick F405 2–4S 20A AIO V4", amps: 20, burst: 22, cMin: 2, cMax: 4, mass: 5.76, aio: true, mount: "26×26", note: "BLHeli_32, kürdan ve 3\" yapılar", src: "https://betafpv.com/products/toothpick-f405-2-4s-aio-brushless-flight-controller-20a-blheli_32-v4" },
    betafpvToothpickF4: { brand: "BETAFPV", model: "Toothpick F4 2–4S 20A AIO V3", amps: 20, burst: 25, cMin: 2, cMax: 4, mass: 6.63, aio: true, mount: "26,5×26,5", note: "3–4\" kürdan dronlar için", src: "https://betafpv.com/products/toothpick-f4-20a-aio-brushless-flight-controller" },
    betafpvF405_20aV5: { brand: "BETAFPV", model: "F405 4S 20A AIO V5", amps: 20, burst: 25, cMin: 2, cMax: 4, mass: 8.35, aio: true, mount: "25,5×25,5", note: "Bluejay ESC, 5 V 3 A BEC; küçük sinema dronları", src: "https://betafpv.com/products/f405-4s-20a-toothpick-brushless-flight-controller-v5-blheli_s-icm42688" },
    speedybeeF405Aio40a: { brand: "SpeedyBee", model: "F405 AIO 40A 3–6S", amps: 40, burst: 45, cMin: 3, cMax: 6, mass: 13.6, aio: true, mount: "25,5×25,5", note: "Alüminyum soğutuculu kasa dahil; Bluetooth ayar", src: "https://pyrodrone.com/products/speedybee-f405-40a-bluejay-3-6s-aio-flight-controller-esc-25-5x25-5mm" },
    hdzeroGamma45a: { brand: "HDZero", model: "Gamma 45A AIO 3–6S", amps: 45, burst: 60, cMin: 3, cMax: 6, mass: 8.4, aio: true, mount: "25,5×25,5", note: "AM32 ESC, dijital verici için 8 V BEC; 2,5–4\"", src: "https://www.hd-zero.com/product-page/hdzero-gamma-45a-hd-ready-aio" },
    speedybeeMiniStack35a: { brand: "SpeedyBee", model: "F405 Mini + BLS 35A yığın (20×20)", amps: 35, burst: 45, cMin: 3, cMax: 6, mass: 16.8, aio: true, mount: "20×20", note: "Yığın toplamı: ESC 7,2 g + uçuş kartı 9,6 g", src: "https://www.speedybee.com/speedybee-f405-mini-bls-35a-20x20-stack/" },
    tmotorMiniF45a: { brand: "T-Motor", model: "Mini F45A 4'ü 1 arada 3–6S", amps: 45, burst: 55, cMin: 3, cMax: 6, mass: 9.2, mount: "20×20", note: "Hafif 5\" ya da 3–4\" yapılar", src: "https://pyrodrone.com/products/t-motor-mini-f45a-6s-blheli32-4-in-1-esc" },
    aikonAk32pin35a: { brand: "Aikon", model: "AK32PIN 35A 4'ü 1 arada 2–6S", amps: 35, burst: 45, cMin: 2, cMax: 6, mass: 10, mount: "20×20", note: "Ağırlık 100 mm kablolarla", src: "https://pyrodrone.com/products/aikon-ak32pin-4-in-1-35a-6s-20x20-version-2" },
    holybroTekko32_50a: { brand: "Holybro", model: "Tekko32 F4 50A 4'ü 1 arada 4–6S", amps: 50, burst: 60, cMin: 4, cMax: 6, mass: 13.8, mount: "30,5×30,5", note: "AM32, 1000 µF kondansatör dahil", src: "https://holybro.com/products/tekko32-f4-4in1-50a-esc" },
    speedybeeF405V4Stack55a: { brand: "SpeedyBee", model: "F405 V4 + BLS 55A yığın (30×30)", amps: 55, burst: 70, cMin: 3, cMax: 6, mass: 34.0, aio: true, mount: "30,5×30,5", note: "Yığın toplamı: ESC 23,5 g + uçuş kartı 10,5 g; 5\" freestyle'da çok yaygın", src: "https://www.speedybee.com/speedybee-f405-v4-bls-55a-30x30-fc-esc-stack/" },
    iflightBlitzE55: { brand: "iFlight", model: "BLITZ E55 4'ü 1 arada 2–6S", amps: 55, burst: 65, cMin: 2, cMax: 6, mass: 15.3, mount: "30,5×30,5", note: "BLHeli32, akım sensörlü", src: "https://shop.iflight.com/BLITZ-E55-4-IN-1-2-6S-ESC-Pro1694" },
    tmotorF55aProII: { brand: "T-Motor", model: "F55A Pro II 4'ü 1 arada 3–6S", amps: 55, burst: 75, cMin: 3, cMax: 6, mass: 17.5, mount: "30,5×30,5", note: "Soğutuculu, AM32", src: "https://www.fpv24.com/en/t-motor/t-motor-f55a-pro-ii-6s-am32-esc" },
    tmotorF55aProIII: { brand: "T-Motor", model: "F55A Pro III 4'ü 1 arada 3–8S", amps: 55, burst: 65, cMin: 3, cMax: 8, mass: 17.8, mount: "30,5×30,5", note: "8S'e kadar", src: "https://pyrodrone.com/products/t-motor-f55a-proiii-3s-8s-blheli32-4in1-esc-30x30mm" },
    aikonAk32V3_55a: { brand: "Aikon", model: "AK32 V3 55A 4'ü 1 arada 2–6S", amps: 55, burst: 65, cMin: 2, cMax: 6, mass: 15, mount: "30,5×30,5", note: "Satıcılar kısa süreli akımı 65–70 A arası veriyor", src: "https://pyrodrone.com/products/aikon-ak32-55a-4in1-6s-esc" },
    diatoneMambaF55: { brand: "Diatone", model: "Mamba F55_128K 4'ü 1 arada 3–6S", amps: 55, burst: 65, cMin: 3, cMax: 6, mass: 15, mount: "30,5×30,5", note: "BLHeli_32, 128K PWM", src: "https://www.racedayquads.com/products/diatone-mamba-f55-128k-32bit-55a-3-6s-30x30-4in1-esc", est: ["ağırlık"] },
    geprcTakerF722_60a: { brand: "GEPRC", model: "TAKER F722 BLS 60A V2 yığın", amps: 60, burst: 65, cMin: 3, cMax: 6, mass: 23.0, aio: true, mount: "30,5×30,5", note: "Yığın toplamı: ESC 14,9 g + uçuş kartı 8,1 g; DJI ünitesine doğrudan takılır", src: "https://www.defiancerc.com/products/geprc-taker-f722-blheli_s-60a-stack-v2-30x30" },
    hobbywingXrotor60a: { brand: "Hobbywing", model: "XRotor Micro 60A 4'ü 1 arada 3–6S", amps: 60, burst: 80, cMin: 3, cMax: 6, mass: 15, mount: "30,5×30,5", note: "12AWG kablo ve XT60 ile gelir", src: "https://www.hobbywing.com/en/products/xrotor-micro-60a-4in1-blheli-32-dshot1200117.html" },
    holybroTekko32Metal65a: { brand: "Holybro", model: "Tekko32 F4 Metal 65A 4'ü 1 arada 4–6S", amps: 65, burst: 75, cMin: 4, cMax: 6, mass: 15.8, mount: "30,5×30,5", note: "Metal kasalı MOSFET'ler", src: "https://holybro.com/products/tekko32-f4-metal-4in1-65a-esc-65a" },
    hdzeroHalo70a: { brand: "HDZero", model: "Halo 70A 4'ü 1 arada 3–8S", amps: 70, burst: 100, cMin: 3, cMax: 8, mass: 13.4, mount: "20×20", note: "20×20'de alışılmadık yüksek akım", src: "https://www.hd-zero.com/product-page/hdzero-halo-4in1-70a-esc" },
    iflightBlitzE80: { brand: "iFlight", model: "BLITZ E80 Pro 4'ü 1 arada 2–8S", amps: 80, burst: 100, cMin: 2, cMax: 8, mass: 65, mount: "35×35", note: "Büyük X sınıfı ve ağır yük dronları; alüminyum kapaklı", src: "https://shop.iflight.com/BLITZ-E80-4-IN1-Pro-ESC-G2-Pro1770" }
  },
  // Uçuş kartı ESC'den ayrıysa eklenen kart (4'ü 1 arada ESC seçildiğinde)
  fc: { brand: "SpeedyBee", model: "F405 V4 uçuş kartı (30×30)", mass: 10.5, watts: 0.5, src: "https://www.speedybee.com/speedybee-f405-v4-bls-55a-30x30-fc-esc-stack/", est: ["güç"] },
  // Görüntü sistemi: kamera + verici (W: tipik ya da en yüksek çekiş; üretici çoğu zaman yayımlamıyor)
  video: {
    whoopAnalog: { brand: "Caddx + kartın vericisi", model: "Caddx Ant kamera (verici AIO kartta)", mass: 2, watts: 1.8, kind: "analog", note: "Verici Matrix 1S / X12 gibi AIO kartlardadır", src: "https://team-blacksheep.com/products/product:4383", est: ["güç"] },
    walksnailMini1s: { brand: "Walksnail", model: "Avatar HD Mini 1S Lite", mass: 8.6, watts: 3.5, kind: "digital", note: "1S whooplar için dijital HD, 8 GB kayıt", src: "https://caddxfpv.com/products/walksnail-avatar-hd-mini-1s-lite-kit", est: ["ağırlık", "güç"] },
    hdzeroWhoopLite: { brand: "HDZero", model: "Whoop Lite + Nano V3 kamera", mass: 7.1, watts: 6.0, kind: "digital", note: "1–3S, düşük gecikmeli dijital", src: "https://www.hd-zero.com/product-page/hdzero-whoop-lite-v2-vtx", est: ["güç"] },
    djiO4: { brand: "DJI", model: "O4 Air Unit (Lite)", mass: 8.2, watts: 6, kind: "digital", note: "Kameralı 8,2 g, 4K60; küçük dronlar için", src: "https://www.dji.com/global/o4-air-unit/specs", est: ["güç (en yüksek değer)"] },
    analogRatelUnify: { brand: "Caddx + TBS", model: "Ratel 2 kamera + Unify Pro32 HV verici", mass: 14.6, watts: 7.6, kind: "analog", note: "Klasik analog; 1000 mW'a kadar", src: "https://team-blacksheep.com/media/files/tbs-unify-pro32-manual.pdf", est: ["güç"] },
    analogRatelRush: { brand: "Caddx + RushFPV", model: "Ratel 2 kamera + Tank Plus verici", mass: 12.6, watts: 5.6, kind: "analog", note: "Metal kasalı verici, 800 mW'a kadar", src: "https://www.racedayquads.com/products/rushfpv-tank-plus-25-800mw-5-8ghz-37ch-vtx-mmcx", est: ["güç"] },
    hdzeroRaceV3: { brand: "HDZero", model: "Race V3 + Micro V3 kamera", mass: 13.0, watts: 6.5, kind: "digital", note: "Yarış için düşük gecikme", src: "https://www.hd-zero.com/product-page/hdzero-race-v3-vtx", est: ["güç"] },
    walksnailPro: { brand: "Walksnail", model: "Avatar HD Pro Kit", mass: 27.1, watts: 6, kind: "digital", note: "1080p, 8 GB kayıt", src: "https://caddxfpv.com/products/walksnail-avatar-hd-pro-kit", est: ["güç"] },
    hdzeroFreestyleV2: { brand: "HDZero", model: "Freestyle V2 + Micro V3 kamera", mass: 29.8, watts: 9.5, kind: "digital", note: "Verici 6–15 W", src: "https://www.hd-zero.com/product-page/freestyle-v2-vtx", est: ["güç"] },
    djiO4Pro: { brand: "DJI", model: "O4 Air Unit Pro", mass: 32, watts: 10.5, kind: "digital", note: "1/1,3\" sensör, 4K120", src: "https://www.dji.com/global/o4-air-unit/specs", est: ["güç (en yüksek değer)"] },
    djiO3: { brand: "DJI", model: "O3 Air Unit", mass: 36.4, watts: 7, kind: "digital", note: "Kameralı 36,4 g, 4K kayıt", src: "https://www.cliftoncameras.co.uk/uploads/specifications/DJI%20O3%20Air%20Unit.pdf", est: ["güç"] },
    walksnailMoonlight: { brand: "Walksnail", model: "Moonlight Kit (4K)", mass: 38.5, watts: 16.8, kind: "digital", note: "4K60 kayıt, görüntü sabitleme", src: "https://caddxfpv.com/products/walksnail-moonlight-kit", est: ["güç"] }
  },
  // Kumanda alıcısı
  rx: {
    onboard: { brand: "AIO kartta", model: "Kartın kendi alıcısı", mass: 0, watts: 0, note: "Alıcısı kartında olan AIO seçildiğinde", src: "" },
    happymodelEp2: { brand: "Happymodel", model: "ExpressLRS EP2 (seramik anten)", mass: 0.44, watts: 0.4, note: "2,4 GHz, çok küçük", src: "https://www.happymodel.cn/index.php/2021/04/10/happymodel-2-4g-expresslrs-elrs-nano-series-receiver-module-pp-rx-ep1-rx-ep2-rx/", est: ["güç"] },
    happymodelEp1: { brand: "Happymodel", model: "ExpressLRS EP1 (dipol anten)", mass: 0.42, watts: 0.4, note: "2,4 GHz", src: "https://www.happymodel.cn/index.php/2021/04/10/happymodel-2-4g-expresslrs-elrs-nano-series-receiver-module-pp-rx-ep1-rx-ep2-rx/", est: ["güç"] },
    radiomasterRp3: { brand: "RadioMaster", model: "RP3 V2 ExpressLRS (çift anten)", mass: 4.6, watts: 0.5, note: "Anten çeşitlemeli, uzun menzile uygun", src: "https://www.radiomasterrc.com/products/rp3-expresslrs-2-4ghz-nano-receiver", est: ["güç"] },
    tbsCrossfireNano: { brand: "TBS", model: "Crossfire Nano RX", mass: 0.5, watts: 0.3, note: "868/915 MHz uzun menzil", src: "https://team-blacksheep.com/products/prod:crossfire_nano_rx", est: ["güç"] }
  },
  // GPS (isteğe bağlı)
  gps: {
    none: { brand: "", model: "GPS yok", mass: 0, watts: 0, src: "" },
    beitianBn220: { brand: "Beitian", model: "BN-220", mass: 5.3, watts: 0.25, note: "Yalnız GPS, pusulasız", src: "https://www.unmannedtechshop.co.uk/products/beitian-bn-220-gps-module", est: ["güç"] },
    matekM10q: { brand: "Matek", model: "M10Q-5883 (GPS + pusula)", mass: 8, watts: 0.07, note: "u-blox M10", src: "http://www.mateksys.com/?portfolio=m10q-5883", est: ["güç"] },
    beitianBn880: { brand: "Beitian", model: "BN-880 (GPS + pusula)", mass: 10, watts: 0.25, note: "Büyük dronlar için", src: "https://www.unmannedtechshop.co.uk/products/beitian-bn-880-gps-compass-module", est: ["güç"] }
  },
  // Bataryalar: aşağıdaki BATTERY_DB listesinden doldurulur
  batteries: {}
};

/* Bataryalar: [anahtar, marka, model, hücre, mAh, kimya, C (sürekli), ağırlık g, bağlantı, kaynak, sürekli A (Li-ion'da üreticinin verdiği)] */
const BATTERY_DB = [
  ["betafpvBt2_300", "BETAFPV", "BT2.0 300 mAh", 1, 300, "LiHV", 30, 8.28, "BT2.0", "https://betafpv.com/products/bt2-0-300mah-1s-30c-battery-8pcs"],
  ["happymodel1s300", "Happymodel", "300 mAh (Mobula7)", 1, 300, "LiHV", 30, 6.5, "PH2.0", "https://www.happymodel.cn/index.php/2018/09/22/happymodel-3-8v-300mah-30c-1-2s-lipo-battery-ph2-0-plug-for-mobula7/"],
  ["betafpvBt2_450", "BETAFPV", "BT2.0 450 mAh", 1, 450, "LiHV", 30, 12.7, "BT2.0", "https://www.racedayquads.com/products/betafpv-3-8v-1s-450mah-30c-lihv-whoop-micro-battery-4-pack-bt2-0"],
  ["gnb1s450Ph", "GNB", "450 mAh HV", 1, 450, "LiHV", 80, 13, "PH2.0", "https://rotorvillage.ca/gnb-450mah-1s-hv-80c-lipo-ph2-0-4-35v/"],
  ["gnb1s450A30", "GNB", "450 mAh HV", 1, 450, "LiHV", 80, 12, "A30", "https://www.rotorama.com/product/gnb-450mah-1s-80c-hv-a30"],
  ["tattu1s450Bt2", "Tattu", "450 mAh HV", 1, 450, "LiHV", 75, 12, "BT2.0", "https://rotorvillage.ca/tattu-450mah-1s-75c-lipo-bt2-0/"],
  ["tattuRline1s450", "Tattu", "R-Line 450 mAh HV", 1, 450, "LiHV", 95, 12, "BT2.0", "https://www.rotorama.com/product/tattu-r-line-450mah-1s-95c"],
  ["gnb1s530Ph", "GNB", "530 mAh HV", 1, 530, "LiHV", 90, 12, "PH2.0", "https://rotorvillage.ca/gnb-530mah-1s-90c-hv-lipo-ph2/"],
  ["betafpvBt2_550", "BETAFPV", "BT2.0 550 mAh", 1, 550, "LiHV", 40, 13.99, "BT2.0", "https://betafpv.com/products/bt2-0-550mah-1s-battery-4pcs"],
  ["dogcom1s550", "DOGCOM", "550 mAh", 1, 550, "LiPo", 150, 14, "BT2.0", "https://www.rotorama.com/product/dogcom-550mah-1s-150c"],
  ["happymodel1s650", "Happymodel", "650 mAh (Moblite7)", 1, 650, "LiHV", 30, 16, "PH2.0", "https://www.happymodel.cn/index.php/2020/12/28/1s-650mah-30c-lipo-lihv-3-8v-battery-for-moblite7/"],
  ["gnb1s660Ph", "GNB", "660 mAh HV", 1, 660, "LiHV", 90, 15, "PH2.0", "https://rotorvillage.ca/copy-of-gnb-660mah-1s-90c-lipo-ph2-0/"],
  ["cnhlMinistar2s450", "CNHL", "MiniStar 450 mAh", 2, 450, "LiPo", 70, 35, "XT30", "https://chinahobbyline.com/products/cnhl-ministar-series-450mah-7-4v-2s-70c-lipo-battery-with-xt30-plug"],
  ["geprcStorm2s530", "GEPRC", "Storm 530 mAh HV", 2, 530, "LiHV", 90, 26, "XT30", "https://geprc.com/product/geprc-storm-2s-530mah-90c-lihv-battery/"],
  ["gnb2s650", "GNB", "650 mAh", 2, 650, "LiPo", 80, 44, "XT30", "https://www.racedayquads.com/products/gaoneng-gnb-7-4v-2s-650mah-80c-lipo-micro-battery-square-type-xt30"],
  ["tattuRline2s750", "Tattu", "R-Line 750 mAh", 2, 750, "LiPo", 95, 41, "XT30", "https://www.rotorama.com/product/tattu-r-line-750mah-2s-95c"],
  ["cnhlMinistar3s650", "CNHL", "MiniStar 650 mAh", 3, 650, "LiPo", 70, 70, "XT30", "https://www.rotorama.com/product/cnhl-ministar-650mah-3s-70c"],
  ["geprcStorm3s720", "GEPRC", "Storm 720 mAh HV", 3, 720, "LiHV", 100, 50.5, "XT30", "https://geprc.com/product/geprc-storm-3s-720mah-100c-lihv-battery/"],
  ["tattuRlineV5_3s850", "Tattu", "R-Line V5 850 mAh", 3, 850, "LiPo", 150, 76, "XT30", "https://www.rotorama.com/product/tattu-r-line-850mah-3s-150c-v5-xt30"],
  ["tattu3s2300", "Tattu", "2300 mAh", 3, 2300, "LiPo", 75, 166, "XT60", "https://www.rotorama.com/product/tattu-2300mah-3s-75c"],
  ["cnhlMinistar4s650", "CNHL", "MiniStar 650 mAh", 4, 650, "LiPo", 70, 87, "XT30", "https://www.rotorama.com/product/cnhl-ministar-650mah-4s-70c-2"],
  ["cnhlMinistar4s850", "CNHL", "MiniStar 850 mAh", 4, 850, "LiPo", 70, 110, "XT30", "https://www.rotorama.com/product/cnhl-ministar-850mah-4s-70c-xt60-xt30"],
  ["tattuRlineV5_4s850", "Tattu", "R-Line V5 850 mAh", 4, 850, "LiPo", 150, 100, "XT30", "https://rotorvillage.ca/tattu-r-line-v5-0-850mah-4s-150c-xt30/"],
  ["cnhlBlack4s1100", "CNHL", "Black Series 1100 mAh", 4, 1100, "LiPo", 130, 140, "XT60", "https://www.rotorama.com/product/cnhl-black-series-1100mah-4s-130c"],
  ["gnb4s1100", "GNB", "1100 mAh", 4, 1100, "LiPo", 140, 141, "XT60", "https://www.rotorama.com/product/gnb-1100mah-4s-140c"],
  ["geprcStorm4s1300", "GEPRC", "Storm 1300 mAh", 4, 1300, "LiPo", 120, 148, "XT60", "https://geprc.com/product/geprc-storm-4s-1300mah-120c-lipo-battery/"],
  ["tattuRlineV5_4s1300", "Tattu", "R-Line V5 1300 mAh", 4, 1300, "LiPo", 150, 156, "XT60", "https://rotorvillage.ca/tattu-r-line-v5-0-1300mah-4s-150c-xt60/"],
  ["geprcStorm4s1550", "GEPRC", "Storm 1550 mAh", 4, 1550, "LiPo", 120, 178, "XT60", "https://geprc.com/product/geprc-storm-4s-1550mah-120c-lipo-battery/"],
  ["dogcomUcell4s1550", "DOGCOM", "UCELL 1550 mAh", 4, 1550, "LiPo", 150, 181, "XT60", "https://www.rotorama.com/product/dogcom-ucell-1550mah-4s-150c"],
  ["gnb4s2200", "GNB", "2200 mAh", 4, 2200, "LiPo", 120, 242, "XT60", "https://www.rotorama.com/product/gnb-2200mah-4s-120c"],
  ["tattu4s2300", "Tattu", "2300 mAh", 4, 2300, "LiPo", 75, 270, "XT60", "https://www.rotorama.com/product/tattu-2300mah-4s-75c"],
  ["geprcStorm2_6s850", "GEPRC", "Storm2.0 850 mAh", 6, 850, "LiPo", 150, 144, "XT30", "https://geprc.com/product/geprc-storm2-0-6s-700-2200mah-150c-lipo-battery/"],
  ["tattuRlineV5_6s850", "Tattu", "R-Line V5 850 mAh", 6, 850, "LiPo", 150, 145, "XT30", "https://rotorvillage.ca/tattu-r-line-v5-0-850mah-6s-150c-xt30/"],
  ["iflightFullsend6s1050", "iFlight", "Fullsend 1050 mAh", 6, 1050, "LiPo", 150, 187, "XT60", "https://shop.iflight.com/Fullsend-6S-1050mAh-150C-Battery-Pro2138"],
  ["gnb6s1100", "GNB", "1100 mAh", 6, 1100, "LiPo", 120, 190, "XT60", "https://rotorvillage.ca/gnb-1100mah-6s-120c-lipo-xt60/"],
  ["cnhlBlack6s1100", "CNHL", "Black Series 1100 mAh", 6, 1100, "LiPo", 130, 197, "XT60", "https://www.rotorama.com/product/cnhl-1100mah-6s-130c"],
  ["geprcStorm6s1300", "GEPRC", "Storm 1300 mAh", 6, 1300, "LiPo", 120, 207, "XT60", "https://geprc.com/product/geprc-storm-6s-1300mah-120c-lipo-battery/"],
  ["cnhlBlack6s1300", "CNHL", "Black Series 1300 mAh", 6, 1300, "LiPo", 130, 223, "XT60", "https://www.rotorama.com/product/cnhl-black-series-1300mah-6s-130c"],
  ["tattuRlineV5_6s1400", "Tattu", "R-Line V5 1400 mAh", 6, 1400, "LiPo", 150, 223, "XT60", "https://www.fpv24.com/en/tattu/tattu-r-line-v50-lipo-battery-150c-xt60-1400mah-6s"],
  ["iflightFullsend6s1550", "iFlight", "Fullsend 1550 mAh", 6, 1550, "LiPo", 150, 253, "XT60", "https://shop.iflight.com/iFlight-Fullsend-6S-1550mAh-150C-Battery-Pro2411"],
  ["tattuRlineV5_6s1550", "Tattu", "R-Line V5 1550 mAh", 6, 1550, "LiPo", 150, 254, "XT60", "https://rotorvillage.ca/tattu-r-line-v5-0-1550mah-6s-150c-xt60/"],
  ["gnb6s1550", "GNB", "1550 mAh", 6, 1550, "LiPo", 140, 273, "XT60", "https://www.rotorama.com/product/gnb-1550mah-6s-140c"],
  ["geprcStorm6s1800", "GEPRC", "Storm 1800 mAh", 6, 1800, "LiPo", 120, 284, "XT60", "https://geprc.com/product/geprc-storm-6s-1800mah-120c-lipo-battery/"],
  ["tattuRlineV5_6s1800", "Tattu", "R-Line V5 1800 mAh", 6, 1800, "LiPo", 150, 288, "XT60", "https://www.rotorama.com/product/tattu-r-line-1800mah-6s-150c"],
  ["iflightFullsend6s1850", "iFlight", "Fullsend 1850 mAh", 6, 1850, "LiPo", 150, 302, "XT60", "https://shop.iflight.com/iFlight-Fullsend-6S-1850mAh-150C-Battery-Pro2412"],
  ["cnhlMinistar6s1800", "CNHL", "MiniStar 1800 mAh", 6, 1800, "LiPo", 120, 315, "XT60", "https://www.rotorama.com/product/cnhl-cnhl-ministar-1800mah-6s-120c"],
  ["iflightFullsend6s2200", "iFlight", "Fullsend 2200 mAh", 6, 2200, "LiPo", 95, 330, "XT60", "https://shop.iflight.com/Fullsend-6S-2200mAh-95C-Battery-Pro1980"],
  ["tattuRlineV5_6s2200", "Tattu", "R-Line V5 2200 mAh", 6, 2200, "LiPo", 150, 346, "XT60", "https://www.rotorama.com/product/tattu-r-line-2200mah-6s-150c-v5-2"],
  ["aulineV45_6s3000", "Auline", "V45 3000 mAh (18650)", 6, 3000, "Li-ion", 15, 313, "XT60", "https://rotorvillage.ca/auline-v45-3000mah-6s1p-22-2v-45a-battery-xt60/", 45],
  ["iflightLiion6s4000", "iFlight", "Fullsend 4000 mAh (21700)", 6, 4000, "Li-ion", 17.5, 430, "XT60", "https://shop.iflight.com/Fullsend-6S-4000mAh-Li-Ion-Battery-EVE-Pro2242"],
  ["geprcLiion6s4000", "GEPRC", "Storm 4000 mAh (21700-40T)", 6, 4000, "Li-ion", 15, 446.3, "XT60", "https://geprc.com/product/geprc-storm-irt21700-40t-6s1p-4000mah-li-ion-battery/"],
  ["aulineS70_6s4500", "Auline", "S70 4500 mAh (21700)", 6, 4500, "Li-ion", 0, 428, "XT60", "https://www.racedayquads.com/products/auline-21700-s70-4500mah-6s-22-2v-70a-li-ion-battery-xt60", 70],
  ["flywooExplorer6s4500", "Flywoo", "Explorer 4500 mAh (21700)", 6, 4500, "Li-ion", 0, 433.7, "XT60", "https://www.flywoo.net/products/flywoo-explorer-molicell-p45b-21700-6s1p-4500mah-lionpack-battery", 60],
  ["iflightLiion6s5000", "iFlight", "Fullsend 5000 mAh (21700)", 6, 5000, "Li-ion", 25, 436, "XT60", "https://shop.iflight.com/Fullsend-6S-5000mAh-Li-Ion-Battery-Pro2362"],
  ["aulineS70Ultra6s5000", "Auline", "S70 Ultra 5000 mAh", 6, 5000, "Li-ion", 14, 429, "XT60", "https://rotorvillage.ca/auline-s70-ultra-5000mah-6s1p-22-2v-70a-battery-xt60/", 70],
  ["moreVolts6s5000", "More Volts", "5000 mAh (21700 50XG)", 6, 5000, "Li-ion", 0, 463, "XT60", "https://rotorvillage.ca/more-volts-6s1p-5000mah-90a-li-ion-battery/", 50],
  ["iflightLiion6s2p6000", "iFlight", "Fullsend 6S2P 6000 mAh (18650)", 6, 6000, "Li-ion", 0, 608, "XT60", "https://shop.iflight.com/Fullsend-6S2P-6000mAh-Li-Ion-Battery-Pro2003", 35],
  ["aulineV45_6s2p6000", "Auline", "V45 6S2P 6000 mAh", 6, 6000, "Li-ion", 15, 632, "XT60", "https://rotorvillage.ca/auline-v45-6000mah-6s2p-22-2v-90a-battery-xt60/", 90],
  ["iflightLiion6s2p8000", "iFlight", "Fullsend 6S2P 8000 mAh (21700)", 6, 8000, "Li-ion", 17.5, 840, "XT60", "https://shop.iflight.com/Fullsend-6S-8000mAh-Li-Ion-Battery-Pro1914"],
  ["geprcLiion6s2p8000", "GEPRC", "Storm 6S2P 8000 mAh (21700-40T)", 6, 8000, "Li-ion", 15, 886.5, "XT60", "https://geprc.com/product/geprc-storm-irt21700-40t-6s2p-8000mah-li-ion-battery/"],
  ["dogcomLiion6s2p10000", "DOGCOM", "6S2P 10000 mAh (21700)", 6, 10000, "Li-ion", 10, 913, "XT60", "https://www.rotorama.com/product/dogcom-liion-10000mah-6s2p-25c-21700"]
];
for (const [k, brand, model, cells, mah, chem, c, mass, conn, src, maxA] of BATTERY_DB) {
  PARTS_DB.batteries[k] = { brand, model: `${cells}S ${model}`, cells, mah, chem, c: c || +((maxA || 0) / (mah / 1000)).toFixed(1), maxA, mass, conn, src,
    note: `${chem}${c ? " · " + c + "C" : ""}${maxA ? " · en çok " + maxA + " A sürekli" : ""}` };
}
