# Sürüm geçmişi

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
