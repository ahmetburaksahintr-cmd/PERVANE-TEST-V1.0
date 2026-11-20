# 🌀 Pervane Test Laboratuvarı

**Sürüm 1.0.0**

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
  - 💥 Kırılma: kanat kökten kopar ve fırlar
- **Gerilme renk haritası:** Kanatların gerilmesi yeşilden kırmızıya renklenir. "Bükülme abartma" ayarı küçük esnemeleri görünür kılar.
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
