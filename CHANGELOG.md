# Sürüm geçmişi

## 1.8.0 — 2026-11-20
Ekran tasarımı baştan elden geçirildi
- Tek bir tasarım sistemi: ortak renk, köşe yarıçapı, gölge ve hareket değerleri
- Üst çubuk: pervane logosu, iki satırlı başlık, sade rozetler
- Yan panel: numaralı adım başlıkları, dolu kısmı vurgulu yeni kaydırıcılar, özel açılır liste
- Düğmeler: tutarlı yükseklik, belirgin birincil düğme, üzerine gelme ve klavye odak halkası
- Gösterge: cam efekti, büyük sayılar, küçük harfli etiketler; sahnede kenar gölgesi
- Karşılaştırma tablosu: çerçeveli, satır vurgusu ve seçili malzeme işareti
- Telefon ve tablet yerleşimi: gösterge sahnenin altına iner, yan panel sütunlara ayrılır, düğmeler tam genişliğe yayılır
- Alt bilgi, ince kaydırma çubukları ve "hareketi azalt" ayarına saygı

## 1.7.0 — 2026-11-20
Sonuçlar bölümü açılır-kapanır kartlara dönüştü
- "Canlı grafikler", "Malzeme karşılaştırması" ve "Yöntem" artık tıklanınca açılan kartlar
- Grafik kartının başlığında anlık devir ve itki; karşılaştırma kartında en iyi malzeme ve seçili pervane/motor özeti
- Alt bölüm üç başlık altında toplandı: Sonuçlar, Veriler, Model; her grupta "Tümünü aç / Tümünü kapat"
- Grafikler kart kapalıyken de çizilmeye devam eder, böylece Excel/Word raporlarındaki görseller etkilenmez
- Grafik kartları sadeleştirildi; karşılaştırma düğmeleri kartın araç çubuğuna taşındı

## 1.6.0 — 2026-11-20
Veriler bölümü açılır-kapanır kartlara dönüştü
- "Fiziksel test verisi" ve "Test günlüğü" artık tıklanınca açılan ayrı kartlar; yumuşak açılma-kapanma animasyonu
- Kart başlığında canlı özet: ölçüm sayısı ve kalibrasyon durumu, günlükte kayıt sayısı ve son olay (kart kapalıyken de görünür)
- Günlüğe süzgeç (Tümü / Uyarılar / Kırılmalar), "Günlüğü temizle" ve boş durum mesajı eklendi
- "Tümünü aç / Tümünü kapat" düğmeleri; kartların açık-kapalı durumu tarayıcıda hatırlanır
- Klavye ve ekran okuyucu desteği: aria-expanded, kapalı kartın içi sekme sırasına girmez

## 1.5.0 — 2026-11-20
DJI FPV tasarımı DJI'ın resmî bilgilerine göre yenilendi
- Gövde: mat koyu gri PA66 + %30 karbon fiber kabuk, parlak şeffaf siyah üst kapak ve öne bakan soğutma yarıkları
- Kollar PA6 + %40 cam elyaf; motorların altında uca doğru incelen uzun iniş ayakları (toplam yükseklik ≈ 127 mm)
- 10 gösterge ışığı: ön ayakların önünde 2 kırmızı şerit, motorların arkasında 4, kolların arkasında 4
- "A" motorların pervane yuvasında kırmızı yay, "A" pervanelerde kırmızı işaret
- Burnun altında tek eksenli gimbal kamera; ön görüş sensörü (stereo), alt görüş sensörleri, alt ToF ve 300 lm alt ışık
- Arkadan takılan akıllı batarya ve kapasite LED'leri; koyu motor çanlarında "DJI FPV 2306" yazısı

## 1.4.1 — 2026-11-20
Sürüm geçmişine madde madde açıklama
- Sürüm betiği artık mesajdaki maddeleri CHANGELOG.md'ye yazıyor (önceden sadece dosya listesi yazıyordu)
- 1.4.0 girdisi özellik maddeleriyle tamamlandı

## 1.4.0 — 2026-11-20
Gerçek drone modelleri: DJI FPV ve BETAFPV Pavo35, Pavo20 Pro, Meteor75 Pro
- DJI FPV (2021): kapalı gövde, arkadan takılan 6S 2000 mAh batarya, gimbal kamera, iniş ayakları, 5328S üç kanatlı pervane, ~795 g
- BETAFPV Pavo35 (2006 2400KV, 6S), Pavo20 Pro (LAVA 1104 7200KV, 3S), Meteor75 Pro (1102 22000KV, 1S): kanal korumalı whoop gövdeleri
- Motor çanlarında gerçekteki gibi model ve KV yazısı; motor boyutu stator çapına göre ölçeklenir
- Kanat sayısı (2–5) fizik modeline ve 3D pervaneye eklendi; test standında seçilebilir
- Drone listesi markaya göre gruplu; kamera, ped ve ipler drone boyutuna göre ayarlanır
- Göstergede kırılma öngörüsü: bu ayarda kaç devirde kırılacağı veya neden kırılmayacağı
- DJI motor KV değeri üretici açıklamadığı için tahmini olarak işaretlendi

## 1.3.1 — 2026-11-20
Sürüm geçmişi düzeltmesi: CHANGELOG'a 1.3.0 girdisi eklendi
- `CHANGELOG.md` güncellendi
- `tools/surum-yayinla.ps1` güncellendi

## 1.3.0 — 2026-11-20
FPV drone test düzeneği: 5" freestyle drone üzerinde 4 pervaneyle kırılma testi
- Sol menüye "Test düzeneği" seçimi: Test standı veya FPV drone
- 5" Freestyle FPV modeli: 225 mm karbon X şase, 4 × 2207 1950KV, 6S batarya, FPV kamera, anten, LED'ler
- 2 CW + 2 CCW pervane; drone iplerle pede bağlı, itki ağırlığı geçince kalkar
- Göstergede toplam itki (4 pervane), itki/ağırlık oranı ve toplam akım
- Kırılmada hangi motorun pervanesinin koptuğu gösterilir; drone o köşeye yatıp pede düşer
- Excel/Word raporlarına drone bilgileri eklendi

## 1.2.0 — 2026-11-20
Excel, Word ve rapor çıktıları
- Pervane kırılınca "indirmek ister misiniz?" penceresi: Excel (.xlsx), Word (.docx) veya ikisi
- 📄 Raporu indir düğmesi; "Hepsini sırayla test et" bitince toplu rapor
- Excel: Özet, Ölçüm verisi (saniyede 10 satır), Malzeme karşılaştırma, Sıralı test sonuçları, Olay günlüğü
- Word: sonuç yorumu, kırılma anının 3D görüntüsü, 3 grafik, tablolar, yöntem
- vendor: SheetJS 0.20.3, docx 9.5.1

## 1.1.0 — 2026-11-20
Pervane renkleri
- 17 pervane rengi: düz renkler, ipek altın/gümüş, şeffaf, fosforlu, gökkuşağı, çift renk ve özel renk
- Pervane sıfırda kendi renginde; zorlandıkça kırılma bölgesi sarı → turuncu → kırmızıya döner
- Kökte yanıp sönen uyarı halkası; kırılınca "Kırılma noktası" etiketi; kırık parçalar pervane renginde
- Gösterge: malzeme/renk başlığı ve kırılma sınırına yakınlık çubuğu
- Kırılgan malzemelerde "kırılma eşiğinde" durumu
- Sürüm takibi: başlıkta sürüm rozeti, otomatik sürüm yükleme araçları (tools/), README'de sürümler tablosu

## 1.0.0 — 2026-11-20
İlk sürüm.
- 3D test standı, fırçasız motor ve esneyen pervane (three.js)
- 6 filament: PLA, PETG, ABS, ASA, Karbon (PA-CF), TPU 95A
- 4 fırçasız motor ön ayarı
- Gerilme renk haritası; aşırı esneme, kalıcı bükülme ve kırılma animasyonları
- Otomatik rampa testi ve tüm malzemelerin sıralı karşılaştırması (CSV dışa aktarma)
- İtki, gerilme ve bükülme grafikleri
- Gerçek ölçüm verisi: CSV yükleme, USB (Web Serial) ile canlı okuma, model kalibrasyonu
- Arduino test düzeneği kodu (HX711, devir ve akım sensörü)
