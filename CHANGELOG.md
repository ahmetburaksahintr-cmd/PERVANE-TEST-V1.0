# Sürüm geçmişi

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
