# 🌀 Pervane Test Laboratuvarı — Sürüm 1.2.0

> **Güncel sürüm: v1.2.0** · [Tüm sürümler](#-sürümler) · [Ayrıntılı sürüm geçmişi](CHANGELOG.md) · Sürüm etiketleri: GitHub'da **Tags** sekmesi

## 📦 Sürümler
<!-- SURUMLER:BASLA -->
| Sürüm | Tarih | Öne çıkanlar |
|---|---|---|
| **v1.2.0** | 2026-11-20 | Excel, Word ve rapor çıktıları: kırılınca indirme penceresi, Excel veri dosyası, grafikli Word raporu |
| v1.1.0 | 2026-11-20 | Pervane renkleri: 17 renk, kırılma noktasının renk ve halkayla işaretlenmesi, sürüm takibi |
| v1.0.0 | 2026-11-20 | İlk sürüm: 3D test laboratuvarı, 6 filament, 4 motor, grafikler, Arduino test düzeneği |
<!-- SURUMLER:BITIS -->

**TÜBİTAK 4006 araştırma projesi:** 3D baskıyla üretilen pervanelerde filament malzemesinin itki, gerilme ve bükülmeye etkisi.

Proje iki parçadan oluşur:
1. **Dijital laboratuvar** (bu web sayfası): Gerçek malzeme değerleriyle çalışan 3D simülasyon.
2. **Fiziksel test düzeneği** (`arduino/` klasörü): Yük hücresi ve devir sensörüyle gerçek ölçüm. Ölçümler web sayfasına aktarılıp modelle karşılaştırılır.

## Nasıl açılır?
`index.html` dosyasına çift tıkla. İnternet gerekmez; 3D kütüphanesi `vendor/` klasöründe.

**Not:** "USB'den canlı oku" özelliği yalnızca Chrome ve Edge'de çalışır.

## Neler yapabilirsin?
- **6 malzeme:** PLA, PETG, ABS, ASA, Karbon fiber naylon (PA-CF) ve TPU 95A.
- **4 fırçasız motor:** 1404 3800KV, 2207 1950KV, 2806.5 1300KV ve 3115 900KV.
- **Pervane geometrisi:** Çap, hatve, kök veter genişliği ve kök kalınlığı değiştirilebilir. Göbek sıcaklığı da ayarlanabilir; PLA'nın ısıyla yumuşamasını görebilirsin.
- **Otomatik rampa testi:** Gaz 11 saniyede %0'dan %100'e çıkar. Pervane sırayla şu aşamalardan geçer:
  - 🟢 Güvenli
  - ⚠️ Sınırda
  - ↪️ Aşırı esneme
  - 🟠 Kalıcı bükülme (akma)
  - 🔴 Kırılma eşiği (kırılgan malzemelerde)
  - 💥 Kırılma: kanat kökten kopar ve fırlar
- **17 pervane rengi:**
  - Düz renkler: siyah, beyaz, kırmızı, turuncu, sarı, yeşil, turkuaz, mavi, mor, pembe
  - Özel görünümler: metalik ipek altın ve gümüş, yarı saydam şeffaf, parlayan fosforlu
  - Çok renkli: kanat boyunca gökkuşağı, her kanadı farklı çift renk
  - Serbest seçim: istediğin özel renk
- **Gerilme renk haritası:**
  - Pervane dururken seçtiğin renkte görünür.
  - Devir arttıkça zorlanan bölge sarı → turuncu → kırmızıya döner; böylece kırılma noktası renkle belli olur.
  - Sınıra yaklaşınca (%75'in üstü) kanat kökünde kırmızı bir uyarı halkası yanıp söner.
  - Kırılınca kökte "Kırılma noktası" etiketi çıkar.
  - "Bükülme abartma" ayarı küçük esnemeleri görünür kılar.
- **Test raporu (Excel / Word):**
  - Pervane kırılınca bir pencere açılır ve verilerin indirilip indirilmeyeceğini sorar.
  - Aynı pencere her zaman **📄 Raporu indir** düğmesiyle de açılabilir.
  - **Excel (.xlsx):** Özet, saniyede 10 satırlık ölçüm verisi (devir, itki, gerilme, bükülme, güç, akım, verim, durum), malzeme karşılaştırması ve olay günlüğü sayfaları.
  - **Word (.docx):** Sonuç yorumu, kırılma anının 3D görüntüsü, 3 grafik, koşullar ve karşılaştırma tabloları, yöntem. Bilim fuarı dosyasına doğrudan eklenebilir.
- **Hepsini sırayla canlı test et:** 6 malzemeyi arka arkaya test eder ve karşılaştırma tablosunu doldurur. Sonuçları CSV olarak indirip raporunda kullanabilirsin.
- **Gerçek veri ve kalibrasyon:**
  - Arduino'dan gelen ölçümler itki grafiğinde **beyaz noktalar** olarak görünür.
  - "Modeli kalibre et" düğmesi, en küçük kareler yöntemiyle modeli ölçümüne uydurur.
  - Denemek için `ornek_olcum.csv` dosyasını yükleyebilirsin.

## Fiziksel düzenek (malzeme listesi)
| Parça | Not |
|---|---|
| Fırçasız motor + ESC (ör. 2207 1950KV + 45A ESC) | 6S LiPo veya ayarlı güç kaynağı |
| Yük hücresi 1–5 kg + HX711 modülü | İtkiyi ölçer |
| IR/optik devir sensörü (ör. TCRT5000) veya ESC telemetrisi | Devir |
| ACS758-50B akım sensörü (isteğe bağlı) | Verim (g/W) için |
| Arduino Uno/Nano, potansiyometre, güvenlik anahtarı | |
| 3D baskı test standı + **koruma kafesi** | Pervane kırılabilir! |

Kod ve bağlantı şeması: `arduino/pervane_itki_testi.ino`.

## Önerilen deney planı (bilim fuarı)
1. **Değişkenler:**
   - Bağımsız değişken: malzeme.
   - Sabitler: çap, hatve, kalınlık, %100 doluluk ve aynı baskı yönü.
   - Ölçülenler: itki, devir, akım, kırılma devri, kalıcı bükülme miktarı.
2. **Baskı:** Her malzemeden en az 3 pervane bas ve ağırlıklarını tart.
3. **Ölçüm:** Gazı 5 kademede artırarak itki ve devri ölç.
4. **Karşılaştırma:** Ölçümleri sayfaya yükle ve model eğrisiyle karşılaştır, sapmayı (%) raporla.
5. **Sınır testi:** Kırılma testini yalnızca koruma kafesi içinde ve en son yap.
6. **Sonuç:** "Hangi filament, hangi devire kadar güvenli?" sorusunu tablo ve grafikle cevapla.

## Modelin sınırları
- Model basitleştirilmiştir: kanat, kökten sabitlenmiş bir kiriş olarak ele alınır.
- Titreşim, yorulma, burkulma ve baskı kusurları modele dahil değildir.
- Malzeme değerleri tipik teknik föy değerleridir.
- Bu yüzden gerçek ölçümle kalibrasyon, projenin en değerli bilimsel kısmıdır.

## Sürüm takibi ve GitHub'a otomatik yükleme
Sürümler [SemVer](https://semver.org/lang/tr/) kuralıyla numaralanır:
- `1.0.x`: küçük düzeltmeler
- `1.x.0`: yeni özellikler
- `x.0.0`: büyük değişiklikler

Her sürümün ayrıntısı [CHANGELOG.md](CHANGELOG.md) dosyasında yazılıdır.

- **Otomatik yükleme:**
  - Windows Görev Zamanlayıcı'daki `PervaneTest-OtomatikSurum` görevi 15 dakikada bir projeyi kontrol eder.
  - Değişiklik varsa ve 10 dakikadır hiçbir dosyaya dokunulmadıysa sürümü artırır (`1.1.0 → 1.1.1`).
  - Ardından `CHANGELOG.md`'yi günceller ve yeni sürümü `vX.Y.Z` etiketiyle GitHub'a gönderir.
  - Ne yaptığı `tools/surum-gunlugu.log` dosyasına yazılır.
- **Hemen yüklemek için:** `surum-yayinla.bat` dosyasına çift tıkla.
  - Yeni bir özellik eklediysen komut satırında `surum-yayinla.bat minor` kullan.
  - Büyük bir değişiklik yaptıysan `surum-yayinla.bat major` kullan.
- **Otomatik yüklemeyi kapatmak için:**
  `powershell -ExecutionPolicy Bypass -File tools\otomatik-yuklemeyi-kur.ps1 -Kaldir`
- **Tekrar açmak için:** Aynı komutu `-Kaldir` olmadan çalıştır.

## Kullanılan açık kaynak kütüphaneler
Hepsi `vendor/` klasöründedir; sayfa internetsiz çalışır.

| Kütüphane | Sürüm | Görevi | Lisans |
|---|---|---|---|
| [three.js](https://threejs.org) | r149 | 3D sahne | MIT |
| [SheetJS](https://sheetjs.com) | 0.20.3 | Excel (.xlsx) üretimi | Apache 2.0 |
| [docx](https://docx.js.org) | 9.5.1 | Word (.docx) üretimi | MIT |
