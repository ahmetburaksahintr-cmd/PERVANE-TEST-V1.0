# Sürüm geçmişi

## 2.3.0 — 2026-11-24
Arayüz yenilendi: üstte araç çubuğu, kenardan kenara sahne, alttan açılan paneller, tam ekran
- Sol panel kaldırıldı; laboratuvarın bütün ayarları üstteki araç çubuğunda: solda düzenek seçimi (Test standı, FPV drone, Uçuş), yanında Drone, Uçuş alanı, Uçuş, Filament, Renk, Motor, Pervane, Ortam, Görünüm. Her biri küçük bir açılır pencere; düğmede bölümün o anki değeri yazar
- 3D sahne artık ekranın tamamını kullanıyor (kenardan kenara)
- Grafikler ve karşılaştırma, Ölçümler ve kayıtlar, Nasıl hesaplanıyor? en alttaki şeritte; tıklayınca panel alttan açılır, laboratuvar arkada çalışmaya devam eder. Esc, kapat düğmesi, sekmeye yeniden basma ya da aşağı sürükleme ile kapanır
- Tam ekran: sağ üstteki düğme ya da F tuşu; yalnız sahne kalır
- Ayarların altındaki açıklamalar ince bir kenar çizgisiyle tek satır; tıklayınca açılır. Drone donanım ayrıntıları "Donanım ve özellikler" satırında, isteyen açar
- Tasarım: tümü büyük harfli etiketler ve numaralı başlıklar kaldırıldı, etiketler cümle düzeninde; eş aralıklı yazı yalnızca sayılarda; daha az çerçeve, 4 px aralık düzeni
- Dar ekranda araç çubuğu kenarda solar ve fare tekerleğiyle kaydırılır; telefonda sayfa kayar
- README: yeni ekran düzeni anlatıldı

## 2.2.0 — 2026-11-24
Gerçek dünya: ayrıntılı 3D şehir, yol haritalı zemin, daha hızlı yükleme
- Siyah zemin sorunu giderildi; yer artık yollar, kaldırımlar, şerit çizgileri, yaya geçitleri, parklar ve sularla çiziliyor (OpenFreeMap verisinden, js/groundmap.js)
- Yeni Zemin seçimi: Harita, Uydu + yollar, Uydu
- Binalar baştan yapıldı: kırma kiremit çatılar, düz çatılarda korkuluk, güneş kolektörü ve su deposu; pencereler, balkonlar, apartman kapıları, zemin kat dükkânları ve tabelaları
- Sokaklara ağaçlar dikildi (parklar, sokak ağaçları, palmiyeler)
- "3D şehir + gerçek arazi" kaynağı artık Cesium OSM binaları yerine bu ayrıntılı şehri kullanıyor; binalar ve ağaçlar yokuştaki gerçek yerine oturtuluyor, çarpışma da araziye göre
- Hız: Uçuş seçilince 3D kütüphane önceden yükleniyor; arazi, harita verisi ve kamera uçuşu aynı anda; şehir parça parça kuruluyor; bina gölgelendiricisi kamera uçarken önceden derleniyor (ilk açılıştaki donmalar azaldı); paralel istek sınırı yükseltildi
- README: harita kaynakları ve Zemin seçimi güncellendi

## 2.1.1 — 2026-11-23
Düzeltme: index.html çift tıklanarak açıldığında zemin siyah görünüyor, Google 3D çizilmiyordu
- Sebep: Chrome, file:// ile açılan sayfada Cesium'un blob adresli modül worker'larını reddediyor; arazi ağı, uydu görüntüsü ve Google 3D karoları worker'da hazırlandığı için hiç çizilmiyordu (yalnızca siyah yıldız alanı)
- Çözüm: yalnızca file:// sayfada, Cesium'un "import" blob'ları aynı içerikli data: adresli worker'a çevriliyor; başka hiçbir şeye dokunulmuyor
- Gerçek ekran kartıyla, bayraksız Chrome'da denendi: açık veri kaynağında uydu zemini, Google 3D'de fotogerçekçi şehir (Kızılay) yeniden görünüyor

## 2.1.0 — 2026-11-23
Uçuş fiziği: gerçek hava yoğunluğu, gerçek rüzgâr ve hamleler, batarya, yer etkisi, pervane girdabı
- Hava yoğunluğu nemli hava denkleminden hesaplanır; itki ve güç ona göre değişir (900 m'de aynı devirde ~%10 az itki). Gerçek dünyada konumun o anki sıcaklık, basınç ve nemi Open-Meteo'dan (anahtarsız) gelir; tırmandıkça yoğunluk standart atmosfere göre azalır
- Ortam bölümüne Hava sıcaklığı ve Rakım ayarları eklendi (test standı, grafikler, karşılaştırma ve parkur uçuşu bunları kullanır); hesaplanan ρ ve etkisi yazılır
- Rüzgâr seçimi: Yok, Hafif 3, Orta 7, Sert 12 m/s, Gerçek (konumun o anki rüzgârı); yükseklikle logaritmik profil, Dryden türü hamleler; hava direnci havaya göre hızdan
- Kolay mod konumunu tutmak için rüzgâra karşı eğilir; itki yetmezse sürüklenir. Diğer modlarda pilot düzeltmezse drone rüzgârla gider. Radarda rüzgâr oku
- Batarya: her drone kendi hücre sayısı ve kapasitesiyle; voltaj şarja ve yüke göre düşer (V = n·OCV − I·R), motor devri voltajla orantılı; göstergede yüzde, voltaj, akım, mAh ve süre; %20 uyarısı, bitince ESC keser; R yeni batarya takar
- Yer etkisi: dört rotorlu model (Sanchez-Cuevas 2017), yere yakın askıda daha az gaz gerekir
- Pervane girdabı (VRS): kendi aşağı akışına hızlı dikey inişte itki kaybı ve sarsıntı, göstergede uyarı
- Nasıl hesaplanıyor? sayfasına 9 uçuş fiziği formülü; README'ye Uçuş fiziği bölümü
- Göstergenin uçuş bölümü 4 sütun: yükseklik, hız, gaz, batarya; altta batarya ayrıntısı, rüzgâr ve ρ

## 2.0.0 — 2026-11-23
Sürüm 2.0: Gerçek dünya varsayılan olarak fotogerçekçi 3D (Google), anahtar girmeye gerek yok
- Projenin Cesium ion anahtarı js/config.js içine gömüldü: Google fotogerçekçi 3D şehirler ve Cesium arazisi hiçbir şey girmeden açılır; isteyen kendi anahtarını girebilir (önceliklidir), silince proje anahtarına dönülür
- Varsayılan harita kaynağı: Fotogerçekçi 3D (Google); kaynak listesi en iyiden başlayarak sıralandı
- Kaynak açılamazsa (kota, ağ, anahtar) kendiliğinden bir sonrakine geçilir: Google 3D → Cesium 3D → Açık veri; karolar yüklenemezse uyarı çıkar
- Drone, çevresindeki ayrıntılı 3D karolar gelene kadar bekler ("3D şehir yükleniyor · N karo"); yüklenmemiş kaba karolardan gelen yanlış yükseklikler elenir
- 3D karolu kaynaklarda takip kamerası daha yukarıdan ve geriden bakar (fotogrametri yakından erimiş görünür)
- Ekran kartı zorlanırsa 3D haritanın çizim çözünürlüğü kendiliğinden düşer, rahatlayınca geri çıkar
- Cesium OSM Binaları: yer altı yapıları (metro, otopark) artık yer üstünde kutu olarak çizilmiyor
- Google 3D, Cesium 3D, Google adres araması gerçek anahtarla test edildi (Galata, Kızılay)
- Dar ekranda sol paneldeki uzun düğmenin paneli taşırması düzeltildi
- README: harita kaynakları, gömülü anahtar ve kota notu güncellendi

## 1.31.0 — 2026-11-23
Arayüz baştan tasarlandı: ölçüm cihazı estetiği, emoji yerine çizgi ikonlar
- Mor-mavi renk geçişleri, buzlu cam ve parlama efektleri kaldırıldı; nötr grafit yüzeyler, ince çizgiler ve tek vurgu rengi (havacılık turuncusu)
- Yazı tipleri: metinlerde IBM Plex Sans, ölçüm değerlerinde IBM Plex Mono (eş aralıklı, sayılar titremez); vendor/fonts klasöründe, internet gerekmez
- Tüm emojiler kaldırıldı: sekmeler, düğmeler ve kartlar aynı çizgi kalınlığında SVG ikonlar kullanır; günlük, bildirim ve durum yazıları sade metin
- Başlık tek satır: marka, sayfa sekmeleri (turuncu alt çizgi), TÜBİTAK rozeti, sürüm ve ses düğmesi; sahneye daha fazla yer kalır
- Ayar bölümleri 01-07 diye numaralı; parçalı seçimler, malzeme kartları, renk seçimi ve kaydırıcılar yeniden çizildi
- Gösterge ölçüm paneli gibi: büyük değerler eş aralıklı yazıyla, kırılma sınırı çubuğunda %75 ve %100 çentikleri, durum etiketi; başlıktaki düğmeyle daraltılır, seçim hatırlanır
- Uçuşta gösterge önce yükseklik, hız ve gazı gösterir; pervane ayrıntıları gizlenir
- Grafik, tablo, günlük, rapor, kumanda ve anahtar pencereleri aynı sisteme uyarlandı; grafik yazıları da yeni yazı tipinde
- 3D sahnedeki mor arka ışık nötr yapıldı (metal parçalar renk almasın)
- README: Arayüz bölümü, yazı tipi lisansı; gerçek dünya sınırlarındaki bina tanımı düzeltildi

## 1.30.0 — 2026-11-23
Uçuş bölümünde gerçek dünya: kendi sokağında, gerçek binaların arasında uç (CesiumJS)
- Uçuş düzeneğine "Uçuş alanı" seçimi: Parkur ya da Gerçek dünya
- Sokak, adres ya da yer arama (OpenStreetMap Nominatim); "Konumum", "Haritada seç" ve son 5 yer kısayolları
- Drone, aranan sokağın ortasına sokak boyunca bakacak şekilde konur; başlangıçta mavi sokak tabelası (ör. BARAN SK.)
- Sokak boyunca 3-6 m yükseklikte en çok 6 halka; ekranın altında o an üstünde olunan sokağın adı, sağ altta radar
- Anahtarsız kaynak: Esri uydu görüntüsü + OpenFreeMap karolarındaki OpenStreetMap bina tabanlarından kurulan 3D binalar (pencereler, zemin kat dükkanları, kiremit/beton çatılar)
- Ücretsiz Cesium ion anahtarıyla iki kaynak daha: 3D binalar + arazi (Cesium OSM Binaları) ve Google Fotogerçekçi 3D; anahtar penceresi adım adım anlatır ve anahtarı dener
- Zemin artık binanın çatısı ya da arazidir: çatıya inilir, binaya hızlı çarpan drone çakılır, yavaş değen geri seker; 120 m yasal sınır uyarısı
- Takip kamerası binaların içine girmez, gerekirse çatının üstüne yükselir; drone'un gölgesi sokağa ve çatılara düşer
- Kırılma raporundaki 3D görüntüye harita da girer
- 3D harita kütüphanesi yalnızca bu bölüm açılınca internetten yüklenir; uygulamanın geri kalanı internetsiz çalışmaya devam eder

## 1.29.1 — 2026-11-21
Otomatik sürüm.
- `css/style.css` güncellendi
- `index.html` güncellendi
- `js/app.js` güncellendi
- `js/fly.js` güncellendi
- `js/scene.js` güncellendi
- `js/input.js` eklendi

## 1.29.0 — 2026-11-21
Bağlı drone testine ekranlı tartı ve asılabilir ağırlıklar
- FPV drone düzeneğinde drone artık paslanmaz tablalı bir platform tartının üstünde duruyor
- Tartının ekranında dört pervanenin toplam kaldırma kuvveti gram olarak canlı görünüyor; altında durum satırı (yerde / kalktı)
- Yeni "Ağırlık ekle" düğmesi: 50 g, 100 g, 200 g, 500 g, 1 kg, 2 kg ve 5 kg; en fazla 6 adet, listeden tek tek çıkarılabilir
- Ağırlıkların üzerinde kütleleri yazıyor (pirinç, krom ve dökme demir görünümlü)
- Ağırlık seçilince drone şeffaf bir sehpaya çıkıyor; ağırlıklar altında tablada duruyor ve iple drone'a asılı
- İtki drone ağırlığını geçince drone kalkıp ipi geriyor; "drone + yük"ü geçince yük de tabladan kalkıyor; pervane kırılırsa ikisi de düşüyor
- Göstergede yük durumu ve taşıma payı (itki - drone ağırlığı); yük kalkınca günlüğe yazılıyor
- Excel raporuna asılı yük, yükün kalkıp kalkmadığı ve en yüksek taşıma payı eklendi
- Kullanılmayan eski kanallı whoop çizimi koddan kaldırıldı

## 1.28.0 — 2026-11-21
Gerçekçi motor sesi: yayımlanmış ölçümlere göre, gerçek devire bağlı
- Ses artık gerçek frekanslarda: kanat geçiş frekansı (kanat sayısı x devir / 60) ve katları; 20.000 devirde iki kanatlı pervanenin temel tonu 667 Hz
- Mil frekansının zayıf ara tonları ve motorun elektromanyetik vınlaması (elektriksel frekansın katları, motor çanının rezonansından geçerken duyulur)
- Geniş bantlı hava gürültüsü kanat ucu hızıyla artar ve kanat geçişiyle dalgalanır; küçük pervane aynı devirde daha sessizdir
- Dronlarda dört motor yüzde 1-2 farklı devirde döner ve gerçekteki dalgalanma (vuru) duyulur
- Pervane kırılınca çıtırtı ve dengesizlik takırtısı; ses açılırken ESC'nin üç bip sesi
- Kanat sayısı, pervane çapı ve motor boyutu sesi değiştirir (üç kanatta ton yükselir, küçük motorun vınlaması daha tizdir)
- Depoya konabilecek lisansla tek motor kaydı bulunamadı; ses NASA ve üniversite ölçümlerine göre üretiliyor, kaynaklar README'de
- Eski ses (gerçek devirle ilgisi olmayan düşük perdeli iki osilatör) kaldırıldı

## 1.27.0 — 2026-11-21
Test standı gerçek bir itki standı gibi baştan tasarlandı
- Taban: köşeleri yuvarlatılmış koyu eloksallı alüminyum plaka, dört lastik ayak, köşe cıvataları, montaj kanalları, isim plakası ve uyarı etiketi
- Direk: T kanallı 20x20 sigma profil; tabana üç köşebent ve allen cıvatalarla bağlı
- Köşe: direğin tepesinde adaptör plakası; yük hücresi buna iki cıvatayla bağlanıyor
- Yük hücresi: çubuk tip, ortasında gözlük deliği, üstünde ve altında beyaz gerinim ölçer dolgusu, yanında "5 kg" etiketi
- Motor plakası: anahtar deliği biçimli alüminyum; alttan iki cıvata, üstte somunlar
- HX711 kartı direğin ön yüzünde; yük hücresinden dört tel geliyor, kontrol kartına dört tel gidiyor
- Optik devir sensörü esnek kolun ucunda, pervanenin altında; ışığı pervane dönerken yanıp sönüyor
- İtki arttıkça yük hücresinin serbest ucu ve motor hafifçe yukarı esniyor
- Metal parçalar (alüminyum, cıvatalar, motor çanı ve mili) ortam yansımasıyla daha gerçekçi parlıyor

## 1.26.0 — 2026-11-21
iFlight Chimera7 Pro V2 resmî görsellerine göre baştan çizildi
- "Deadcat" kollar: ön kollar neredeyse yana, arka kollar geriye açılıyor; yerleşim üreticinin üstten görünüşünden ölçüldü
- Uzun, dar, kapalı gövde: kırmızı ışıklı köşeli oyuklu siyah yan paneller, sıra sıra yarıklı karbon üst plaka
- Her motorun altında kırmızı TPU koruyucu (aynı zamanda ayak)
- Burunda köşeli kamera kafesi, GoPro tipi bağlantı ve yatay T anten
- Arkada altıgen başlı iki uzun anten (V biçiminde), kırmızı braketli dik kamçı anten, XT60 ve kuyrukta GPS modülü
- Üstte kaymaz ped üzerinde, iki "iFlight" kayışıyla bağlı Fullsend 6S 3300 mAh batarya
- Böylece listedeki dokuz gerçek modelin hepsi üretici görsellerine göre yeniden çizilmiş oldu

## 1.25.0 — 2026-11-21
iFlight Nazgul Evoque F5X V2 resmî görsellerine göre baştan çizildi
- Uzun, dar, kapalı gövde: alt plaka, yeşil ışıklı köşeli oyuklu siyah yan paneller ve oyuklu karbon üst plaka
- Dokulu 6 mm karbon kollar; her motorun altında parlak yeşil TPU koruyucu (aynı zamanda ayak)
- Burunda köşeli siyah TPU kamera kafesi içinde DJI O3 kamera, üstünde GoPro tipi iki dişli bağlantı
- Arkada V biçiminde iki kısa silindir anten, aralarında XT60 fiş ve yatay T anten
- Üstte kaymaz ped üzerinde, iki "iFlight" kayışıyla bağlı Fullsend 6S 1550 mAh batarya
- Motor yerleşimi üreticinin üstten görünüş çiziminden ölçüldü (motorlar arası 144 × 172 mm, köşegen 225 mm)

## 1.24.0 — 2026-11-21
Happymodel Mobula7 1S gerçek fotoğraflarına göre baştan çizildi
- Tek parça yarı saydam füme şase: ince açık halkalar, halka başına 4 kol, halkaların altında küçük ayaklar
- Delikli siyah yumurta kanopi; içinden uçuş kartı görünür, önde küçük kamera
- Kanopinin arkasında neredeyse dik duran siyah kılıflı VTX anteni
- Motorlar füme gri, çanda "RS0802 KV20000" yazısı
- Batarya şasenin altındaki yuvada; yanından kırmızı-siyah güç kablosu çıkar
- Kaynak: Happymodel'in ürün sayfasındaki fotoğraflar

## 1.23.0 — 2026-11-21
GEPRC CineLog35 V2 gerçek görsellerine göre baştan çizildi (itici düzen)
- Düzen düzeltildi: motorlar karbon plakanın altına asılı, pervaneler koruma kasnaklarının arasında
- Çift kasnaklı siyah koruma: yarıklı alt bant, üstte ince kasnak, aralarında dikmeler; üst kasnaktan motor yatağına üçer kol
- Belde kırmızı lastik parça, dış köşelerde sivri ayaklar
- Uzun dikdörtgen 3,5 mm karbon plaka ve dört kısa kol; arka kollarda beyaz "GEPRC" ve "CineLog35 V2" (V2 turuncu) yazıları
- Burunda dört gümüş ara parçalı küçük kamera plakası ve altında O3 kamera
- Üstte gümüş çizgili iki ray arasında batarya; arkada XT60, eğik silindir anten ve yatay T anten
- Motor çanında gerçekteki yazılar: "GEPRC", "SPEEDX2", "2105.5" (asılı motorda fotoğraftaki gibi baş aşağı)

## 1.22.0 — 2026-11-21
BETAFPV Meteor75 Pro gerçek görsellerine göre baştan çizildi
- Tek parça gök mavisi şase: ince açık halkalar, halka başına 5 kol, halkaların altında küçük ayaklar
- Beyaz kanopi: kubbe burun, önde yukarı bakan yuvarlak kamera, üstte yarıklar, arkada yükselen kuyruk ve anten çatalı
- Motorlar gümüş çanlı ve mavi tabanlı; çanda "1102 22000KV" yazısı (önceden düz maviydi)
- Batarya şasenin altındaki yuvada, iki bantla tutulur; yeşil-sarı LAVA etiketi ve beyaz BT2.0 fiş
- Kanopinin altında AIO uçuş kartı, kollar boyunca siyah motor kabloları
- Motorlar arası mesafe üreticinin değerine düzeltildi: 80,8 mm (Pavo20 Pro için de 93,7 mm)

## 1.21.0 — 2026-11-21
BETAFPV Pavo20 Pro gerçek görsellerine göre baştan çizildi (itici düzen)
- Düzen düzeltildi: motorlar karbon plakanın altına asılı, pervaneler en altta mat siyah halkaların içinde
- Yan raylı 2,4 mm karbon plaka: ön ve arka motor yataklarını birleştiren iki ray ve ortada kare gövde
- Üstte DJI O3 hava ünitesini tutan kafes: yanında eğik havalandırma yarıkları ve "PAVO" yazısı, üstünde "dji" logosu
- Burunda kafesin içinde O3 kamera; arkada "BETAFPV" yazılı anten yuvası, uzun eğik sap ve kalın silindir anten
- Motor çanı siyah, beyaz "LAVA 1104 7200KV" yazılı ve kırmızı halkalı (önceden mor ve yazısı farklıydı)
- Batarya alta kayışla bağlı; arkadan kırmızı-siyah XT30 kablosu çıkıyor
- Halkaların alt dış kenarında buz mavisi ışık şeridi

## 1.20.0 — 2026-11-21
BETAFPV Pavo35 gerçek görsellerine göre baştan çizildi (itici düzen)
- Düzen düzeltildi: motorlar karbon üst plakanın altına asılı, pervaneler en altta halkaların içinde (önceden motorlar üstteydi)
- Kum saati biçimli, dokulu 3 mm karbon plaka; ortasında dört yuvarlak pencereden görünen uçuş kartı
- Yarı saydam füme, alt kenarı dışa açılan alçak koruma halkaları; çevrelerinde buz mavisi ışık şeridi
- Motor çanında gerçekteki yazı: "LAVA 2006 2400KV", gri çan ve turuncu halka
- Burunda O3 kamera ve GoPro tipi bağlantı, önde XT60 fiş, iki yanda gri alüminyum ara parçalar
- Arkada yukarı-geriye eğik kısa silindir anten ve yatay beyaz alıcı anteni
- 3D sahne: ters asılı (itici) motor desteği ve karbon fiber dokusu eklendi

## 1.19.0 — 2026-11-21
DJI Avata 2 gerçek fotoğraflarına göre baştan çizildi
- Koruma artık uzun kanal duvarı değil: gövdenin yanlarına ve birbirine yapışık, aşağı doğru genişleyen dört halka
- Dar ve uzun gövde halkaların üstünde; üstünde girintili panel, durum ışığı ve "dji" logosu
- Burunda açık yuvada gimbal kamera, iki yanında dikey turuncu şerit
- Batarya arkada: yanlarında tırtıllı, turuncu çizgili çıkarma düğmeleri; arka yüzde güç düğmesi ve 4 seviye ışığı
- Alt arkada "AVATA 2" yazısı (2 turuncu), altta soğutuculu karın ve görüş sensörleri
- Motorlar altta ince kolların ucundaki yuvalarda; pervane göbeklerinde iki vida, iki göbekte turuncu nokta
- Motor yerleşimi üstten çekilmiş fotoğraftan ölçüldü (köşegen yaklaşık 154 mm, tahmini olarak işaretli)

## 1.18.0 — 2026-11-21
DJI FPV gerçek fotoğraflarına göre baştan çizildi
- Gövde öne doğru yükseliyor: arkada batarya yere yakın, önde kamera yukarıda; üstte parlak füme kubbe ve 6 yarıklı hava girişi
- Arka motorlar ön motorlardan yüksekte; ön kollar alttan, arka kollar üstten çıkıyor
- İniş ayakları yalnızca ön motorların altında, önlerinde beyaz ışık şeridi; arka taraf bataryanın lastik ayaklarına oturuyor
- Burunda açık kafes içinde gimbal kamera ve yanında gimbal motoru; altında iki ön görüş sensörlü çene çubuğu ve "dji" yazılı sensör bölmesi
- Motorların alt yarısı gümüş bantlı; çandaki uydurma yazı kaldırıldı (gerçek motorda yazı yok), "A" motorlarda kırmızı halka
- Gövdenin iki yanında beyaz "FPV" yazısı ve vidalı gümüş plaka; bataryanın arkasında düğme ve 4 seviye ışığı
- Kaynak: DJI destek sayfasındaki resmî görsel ve inceleme fotoğrafları

## 1.17.0 — 2026-11-21
Arayüz: başlığın altında mini sekmeler, kırmızı TÜBİTAK rozeti
- Alttaki üç bölüm (Grafikler ve karşılaştırma, Ölçümler ve kayıtlar, Nasıl hesaplanıyor?) başlığın altındaki ince şeride mini sekmeler olarak taşındı
- Dördüncü sekme Laboratuvar: 3D sahne ve ayarlar; sayfa artık aşağı kaydırmadan ekrana sığıyor
- Başka bir sekmedeyken test arka planda sürer; grafikler ve rapor görselleri etkilenmez
- Sekmelerde canlı işaretler: test sürerken yeşil nokta, kırılmada işaret, günlükteki kayıt sayısı
- Son açık sekme hatırlanır
- "TÜBİTAK 4006 · Araştırma projesi" rozeti kırmızı yapıldı

## 1.16.0 — 2026-11-21
Uçuş bölümü: drone'u klavyeyle uçur
- Test düzeneğine üçüncü sekme eklendi: Uçuş. Seçili drone açık bir alanda klavyeyle uçuruluyor
- Tuşlar: W ileri, S geri, A sola, D sağa, E yüksel, Q alçal, Z sola dön, X sağa dön; tuşu bırakınca drone havada asılı kalır
- Açık alan: çim zemin, ağaçlar, sınır direkleri ve içinden geçilecek 6 halka; hepsi geçilince süre yazılır
- Takip kamerası drone'un arkasından izler; Bakış düğmesiyle serbest bakışa geçilir
- Gereken itki, drone ağırlığı ve manevradan hesaplanır: pervane bu itkiyi veremiyorsa drone kalkamaz, dayanamıyorsa havada kırılır ve drone düşer
- Göstergede yükseklik, hız, geçilen halka sayısı ve süre
- "Yeni pervane tak" drone'u pede geri koyar

## 1.15.0 — 2026-11-21
Test standı: devir ekranı, dönen potansiyometre ve ayrıntılı elektronik
- Kontrol kartına küçük bir ekran eklendi: devir ve gaz yüzdesi canlı görünüyor
- Karttaki gaz potansiyometresi gaza göre dönüyor; çevresinde kadran çizgileri var
- Kontrol kartı ayrıntıları: işlemci, sıfırlama düğmesi, kristal, kondansatörler, ICSP pinleri, TX/RX ışıkları, kart yazısı
- ESC ayrıntıları: "45A 2-6S" etiketi, soğutucu kanatları, MOSFET'ler ve lehim pedleri
- Batarya ayrıntıları: kapasite/gerilim etiketi, uyarı bandı, denge (balans) fişi ve kabloları
- Direğin yanındaki boşta duran kırmızı kablo kaldırıldı

## 1.14.0 — 2026-11-20
Geniş ekran yerleşimi: sayfa tüm genişliği kullanıyor
- Sayfanın sağında ve solunda kalan boşluklar kaldırıldı; yerleşim artık ekran genişliğine göre esniyor
- Yan panel ekrana göre 320-480 piksel arasında genişliyor
- 3D sahne ekran yüksekliğini dolduruyor
- Çok geniş ekranlarda (1900 piksel ve üstü) yazılar ve göstergeler orantılı büyüyor
- Test standının varsayılan kamerası geri alındı; ESC, kontrol kartı ve batarya kadrajda kalıyor

## 1.13.0 — 2026-11-20
Test standı: ESC, gerçekçi kablolar, kontrol kartı ve bakış açısı düğmesi
- Fırçasız motorun üç faz kablosu (altın fişli) motordan ESC'ye iniyor
- ESC taban plakasında: etiketli gövde ve giriş kondansatörü
- 6S batarya, XT60 fiş ve kalın kırmızı/siyah güç kabloları
- Kontrol kartı (Arduino) eğik sehpada: işlemci, USB, pin sıraları, gaz potansiyometresi; ESC'ye üçlü sinyal kablosu, bilgisayara USB kablosu
- Yeni "Bakış" düğmesi: serbest bakış ile yandan (motor hizasından) bakış arasında yumuşak geçiş; drone düzeneğinde de çalışır
- Sürükleyince ya da yakınlaştırınca geçiş durur, kontrol sende kalır

## 1.12.0 — 2026-11-20
Çalışma alanı: yeşil kesim matı ve daha canlı sahne
- Düz koyu zemin yerine ahşap masa üstünde yeşil kesim matı
- Mat 1 cm kareli; 5 cm'de bir kalın çizgi, kenarlarda cm cetveli, açı çizgileri ve merkez daireleri var (sahne ölçüsüyle birebir)
- Ortam ışığı güçlendirildi; sahne daha canlı görünüyor

## 1.11.0 — 2026-11-20
Yeni drone modelleri: DJI Avata 2, iFlight Nazgul Evoque F5X V2 ve Chimera7 Pro V2
- DJI Avata 2 (2024): pervane korumalarıyla tek parça gövde, arkadan takılan batarya, gimbal kamera; 3032S üç kanatlı pervane, 2150 mAh 14,76 V batarya, ~377 g
- iFlight Nazgul Evoque F5X V2 (DJI O3): 225 mm şase, ışıklı yan paneller, XING2 2207 1750KV, Nazgul F5 5,1" üç kanatlı pervane
- iFlight Chimera7 Pro V2 (DJI O3): 327 mm deadcat şase, GPS, XING2 2809 1250KV, HQProp 7.5X3.7X3 pervane; listedeki en büyük model
- DJI'ın yayımlamadığı Avata 2 değerleri (motor, pervane hatvesi, motorlar arası mesafe) tahmini olarak işaretlendi
- iFlight O3 sayfalarını kaldırdığı için bu iki modelin ağırlıkları satıcı listelerinden alındı; motor, pervane ve şase değerleri iFlight'ın kendi sayfalarından
- Drone listesine iFlight marka grubu eklendi; README tablosu güncellendi

## 1.10.0 — 2026-11-20
Yeni drone modelleri: GEPRC CineLog35 V2 ve Happymodel Mobula7 1S
- GEPRC CineLog35 V2 HD O3: 3,5" kanallı sinema dronu, SPEEDX2 2105.5 2650KV (6S), HQProp DT90MMX3 üç kanatlı pervane, 142 mm, 285,8 g (bataryasız)
- Happymodel Mobula7 1S: 75 mm tiny whoop, RS0802 20000KV (1S), Gemfan 1610-2 iki kanatlı 40 mm pervane, 24 g (bataryasız)
- Değerler üreticilerin kendi sayfalarından alındı; Happymodel'in yayımlamadığı motor gücü ve akımı tahmini olarak işaretlendi
- Drone listesine GEPRC ve Happymodel marka grupları eklendi
- 3D sahne hazırlığı: açık şasede farklı motor yerleşimi, gövde ölçeği, yan panel ve GPS direği; tek parça kanallı gövde (sonraki modeller için)

## 1.9.0 — 2026-11-20
Kanat sayısı sayfadan Arduino'ya gönderiliyor
- Sayfa USB'den bağlanınca seçili kanat sayısını Arduino'ya gönderir; Arduino devri buna göre hesaplar (önceden kodda 2 kanada sabitti)
- Kanat sayısı değişince yenisi kendiliğinden gönderilir; Arduino'nun onayı günlükte ve bağlantı satırında görünür
- Arduino kodu "K3" gibi komutları okur (1-8 kanat); seri monitörden elle de yazılabilir, yalnızca "K" geçerli değeri sorar
- Sensör motor çanındaki tek işareti sayıyorsa kodda değer kilitlenebilir (PULSES_LOCKED)
- Karttaki kod eskiyse ve komutu onaylamıyorsa sayfa uyarır
- "USB'den canlı oku" düğmesi bağlıyken "USB bağlantısını kes" olur; kablo çekilirse bağlantı düzgünce kapanır ve yeniden bağlanılabilir
- README'ye "Kanat sayısı ve devir" bölümü eklendi

## 1.8.2 — 2026-11-20
Arduino itki ölçümü düzeltmesi: sahte 0 g satırları gönderilmiyor
- Yük hücresinde o an yeni örnek yoksa artık 0 g değil, son geçerli itki değeri gönderilir (sahte 0'lar grafiği ve kalibrasyonu bozuyordu)
- Yük hücresi yarım saniyeden uzun yanıt vermezse ölçüm satırı gönderilmez ve günlüğe uyarı yazılır; geri gelince ölçüm kendiliğinden sürer
- Yük hücresi takılı değilken kart açılışta takılıp kalmıyor: 2 saniye bekler, uyarı yazar ve devam eder
- README'ye "Ölçüm satırları" bölümü eklendi

## 1.8.1 — 2026-11-20
Arduino güvenlik kilidi: gaz açıkken motor devreye girmez
- Motor yalnızca şu sırayla çalışır: güvenlik anahtarı kapalı, gaz sıfırda, sonra anahtar açık
- Gaz açıkken anahtar çevrilirse motor kilitli kalır; gaz sıfıra indirilince devreye girer
- Kart anahtar açıkken yeniden başlarsa (USB takılınca) motor dönmez; anahtarın bir kez kapatılması gerekir
- Anahtar kapanınca motor anında durur; açık sayılması için 50 ms kararlı kalması gerekir (temas sıçramasına karşı)
- Arduino'nun durum ve güvenlik mesajları sayfadaki test günlüğünde "Arduino:" başlığıyla görünür, uyarılar bildirim olarak da çıkar
- README'ye "Motoru çalıştırma sırası" bölümü eklendi

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
