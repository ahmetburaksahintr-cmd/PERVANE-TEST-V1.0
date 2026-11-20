/* =========================================================
   PERVANE İTKİ TEST DÜZENEĞİ – Arduino (Uno / Nano)
   ---------------------------------------------------------
   Ölçer:  devir (RPM), itki (gram), akım (A)
   Gönderir: USB seri port, 115200 baud, satır başına:
             devir,itki_gram,akim_amper      ör. 18250,412.6,9.84
   Web sayfasında "USB'den canlı oku" ile doğrudan grafiğe düşer.

   BAĞLANTILAR
   - HX711 yük hücresi modülü : DT → D3, SCK → D4  (kütüphane: "HX711" by Bogdan Necula)
   - ESC sinyal kablosu        : D9 (Servo kütüphanesi)
   - Gaz potansiyometresi      : A1 (ortası), uçları 5V ve GND
   - Güvenlik (arm) anahtarı   : D7 → GND (kapalıyken motor DÖNMEZ)
   - IR/optik devir sensörü    : D2 (kesme/interrupt) – her kanat geçişinde 1 darbe
   - Akım sensörü (ACS758-50B) : A0  (isteğe bağlı)

   ⚠️ GÜVENLİK
   - Pervaneyi en son tak; ilk denemeleri pervanesiz yap.
   - Test sırasında koruma kafesi/pleksi kullan, pervane düzleminde durma.
   - 3D baskı pervaneler KIRILABİLİR: gözlük tak, gazı yavaş artır.
   - LiPo pili gözetimsiz bırakma, şarjı yangına dayanıklı torbada yap.
   ========================================================= */

#include <Servo.h>
#include "HX711.h"

const uint8_t PIN_HX_DT = 3, PIN_HX_SCK = 4, PIN_ESC = 9, PIN_RPM = 2, PIN_ARM = 7;
const uint8_t PIN_THROTTLE = A1, PIN_CURRENT = A0;
const uint8_t BLADES = 2;            // devir sensörü pervane başına kaç darbe görür
float CAL_FACTOR = 420.0;            // HX711 kalibrasyon katsayısı (aşağıdaki "kalibrasyon" notuna bak)
const float ACS_MV_PER_A = 40.0;     // ACS758-50B: 40 mV/A, 0 A = 2.5 V

Servo esc;
HX711 scale;
volatile unsigned long pulses = 0;
unsigned long lastReport = 0, lastPulses = 0;

void onPulse() { pulses++; }

void setup() {
  Serial.begin(115200);
  pinMode(PIN_ARM, INPUT_PULLUP);
  pinMode(PIN_RPM, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PIN_RPM), onPulse, FALLING);

  esc.attach(PIN_ESC, 1000, 2000);
  esc.writeMicroseconds(1000);       // ESC'yi en düşük gazla başlat (arming)
  delay(3000);

  scale.begin(PIN_HX_DT, PIN_HX_SCK);
  scale.set_scale(CAL_FACTOR);
  scale.tare();                      // pervane dururken sıfırla
  Serial.println("# hazir: devir,itki_gram,akim_amper");
}

void loop() {
  // Gaz: güvenlik anahtarı açık değilse motor her zaman durur
  int pot = analogRead(PIN_THROTTLE);
  bool armed = digitalRead(PIN_ARM) == LOW;
  int us = armed ? map(pot, 0, 1023, 1000, 2000) : 1000;
  esc.writeMicroseconds(us);

  unsigned long now = millis();
  if (now - lastReport >= 100) {                 // saniyede 10 ölçüm
    noInterrupts(); unsigned long p = pulses; interrupts();
    float dt = (now - lastReport) / 1000.0;
    float rpm = ((p - lastPulses) / (float)BLADES) / dt * 60.0;
    lastPulses = p; lastReport = now;

    float thrust = scale.is_ready() ? scale.get_units(1) : 0;   // gram
    float volts = analogRead(PIN_CURRENT) * 5.0 / 1023.0;
    float amps = max(0.0, (volts - 2.5) * 1000.0 / ACS_MV_PER_A);

    Serial.print((long)rpm); Serial.print(',');
    Serial.print(thrust, 1); Serial.print(',');
    Serial.println(amps, 2);
  }
}

/* KALİBRASYON (yük hücresi)
   1) CAL_FACTOR = 1 yap, yükle, seri monitörde boş değeri gör.
   2) Bilinen bir ağırlık (ör. 200 g) as/koy, okunan değeri 200'e böl.
   3) Çıkan sayıyı CAL_FACTOR'a yaz. Kaldıraç kolu kullanıyorsan
      kol oranını da hesaba kat (itki = okunan × kol_boyu_sensor / kol_boyu_motor). */
