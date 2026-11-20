/* =========================================================
   3D SAHNE – Fırçasız motor, test standı ve esneyen pervane
   (three.js r149 · birimler milimetre)
   ========================================================= */

const Scene3D = {
  init(container) {
    this.container = container;
    const w = container.clientWidth, h = container.clientHeight;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, w / h, 1, 5000);
    this.orbit = { theta: 0.75, phi: 1.05, dist: 330, target: new THREE.Vector3(0, 60, 0) };
    this.updateCamera();

    // Işıklar
    this.scene.add(new THREE.HemisphereLight(0xeaf2ff, 0x2f4a3a, 0.95));
    const key = new THREE.DirectionalLight(0xffffff, 1.0);
    key.position.set(160, 260, 140);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -200, right: 200, top: 200, bottom: -200 });
    this.scene.add(key);
    this.scene.add(key.target);
    this.keyLight = key;
    const rim = new THREE.PointLight(0x7c8cff, 0.8, 600);
    rim.position.set(-160, 120, -120);
    this.scene.add(rim);

    this.buildGround();
    this.buildAirflow();
    this.debris = [];
    this.flyingBlade = null;
    this.angle = 0;
    this.shake = 0;
    this.units = [];
    this.setRig("stand");
    this.bindControls();
    window.addEventListener("resize", () => this.resize());
  },

  /* ---------- Test düzeneği: "stand" (tek motor) veya "drone" (4 motor) ---------- */
  setRig(mode, drone) {
    if (this.rig) {
      this.scene.remove(this.rig);
      this.rig.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    if (this.tether) { this.scene.remove(this.tether); this.tether = null; }
    this.mode = mode;
    this.units = [];
    this.loadCell = null;
    this.propGroups = [];
    this.blades = [];
    this.droneFail = null;
    this.lift = 0;
    this.oled = null;
    this.potKnob = null;
    this.rig = new THREE.Group();
    this.scene.add(this.rig);
    if (mode !== "stand") this.buildDrone(drone, mode === "fly");
    else this.buildStand();
    // Uçuş bölümü: masa yerine açık alan, gökyüzü, drone'u izleyen ışık ve kamera
    const fly = mode === "fly";
    for (const m of this.deskParts || []) m.visible = !fly;
    this.scene.fog = fly ? new THREE.Fog(0x9fd3f7, 9000, 27000) : null;
    this.camera.far = fly ? 40000 : 5000;
    this.camera.updateProjectionMatrix();
    const sc = this.keyLight.shadow.camera, sr = fly ? Math.max(280, this.droneSpan * 1.9) : 200;
    Object.assign(sc, { left: -sr, right: sr, top: sr, bottom: -sr, far: fly ? 9000 : 500 });
    sc.updateProjectionMatrix();
    this.keyLight.position.set(160, 260, 140);
    this.keyLight.target.position.set(0, 0, 0);
    this.flyPose = null;
    this.flyGates = [];
    if (fly) this.buildFlyWorld();
    // Kamera ön ayarları: "free" (serbest, çapraz) ve "side" (yandan, motor hizasından)
    const dd = mode !== "stand" ? Math.max(110, this.droneSpan * 2.7) : 0;
    this.views = mode !== "stand"
      ? { free: { theta: 0.62, phi: 0.98, dist: dd, target: [0, this.droneTargetY, 0] },
          side: { theta: 0, phi: 1.42, dist: dd * 0.9, target: [0, this.droneTargetY, 0] } }
      : { free: { theta: 0.75, phi: 1.05, dist: 410, target: [22, 46, 12] },
          side: { theta: 0, phi: 1.3, dist: 340, target: [25, 52, 20] } };
    if (fly) {                                          // "free" = takip kamerası, "side" = serbest (elle döndürülür)
      const cd = Math.min(1700, Math.max(430, this.droneSpan * 5.5));
      this.views = { free: { theta: -Math.PI / 2, phi: 1.2, dist: cd, target: [0, this.droneTargetY, 0] },
                     side: { theta: 0.6, phi: 1.1, dist: cd * 1.25, target: [0, this.droneTargetY, 0] } };
    }
    this.setView(this.viewName || "free", true);
  },

  /** Bakış açısını değiştirir; instant değilse kamera yumuşakça kayar */
  setView(name, instant) {
    this.viewName = this.views[name] ? name : "free";
    const v = this.views[this.viewName];
    if (instant || this.mode === "fly") {
      Object.assign(this.orbit, { theta: v.theta, phi: v.phi, dist: v.dist });
      if (instant) this.orbit.target.set(v.target[0], v.target[1], v.target[2]);
      this.viewAnim = null;
      this.updateCamera();
    } else {
      // En kısa yoldan dönsün diye açı farkı −π..π aralığına alınır
      const o = this.orbit;
      o.theta = v.theta + Math.atan2(Math.sin(o.theta - v.theta), Math.cos(o.theta - v.theta));
      this.viewAnim = v;
    }
  },

  /* ---------- Zemin: çalışma masası üzerinde yeşil kesim matı ---------- */
  buildGround() {
    // Masa (matın altında, koyu ahşap)
    const desk = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshStandardMaterial({ color: new THREE.Color(0x4a3524).convertSRGBToLinear(), roughness: 0.85 }));
    desk.rotation.x = -Math.PI / 2;
    desk.position.y = -1.2;
    desk.receiveShadow = true;
    this.scene.add(desk);
    // Kesim matı: 1 cm kareli, 5 cm'de bir kalın çizgi ve ölçü rakamları (1 birim = 1 mm)
    const W = 900, D = 640;
    const tex = cuttingMatTexture(W, D);
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const mat = new THREE.Mesh(new THREE.BoxGeometry(W, 1.2, D), [
      new THREE.MeshStandardMaterial({ color: 0x0f3d28 }), new THREE.MeshStandardMaterial({ color: 0x0f3d28 }),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.78, metalness: 0 }), new THREE.MeshStandardMaterial({ color: 0x0f3d28 }),
      new THREE.MeshStandardMaterial({ color: 0x0f3d28 }), new THREE.MeshStandardMaterial({ color: 0x0f3d28 })
    ]);
    mat.position.y = -0.6;
    mat.receiveShadow = true;
    this.scene.add(mat);
    this.deskParts = [desk, mat];                       // uçuş bölümünde gizlenir
  },

  /* ---------- Kamera (sürükle-döndür, tekerlek-yakınlaştır) ---------- */
  updateCamera() {
    const o = this.orbit;
    this.camera.position.set(
      o.target.x + o.dist * Math.sin(o.phi) * Math.sin(o.theta),
      o.target.y + o.dist * Math.cos(o.phi),
      o.target.z + o.dist * Math.sin(o.phi) * Math.cos(o.theta)
    );
    this.camera.lookAt(o.target);
  },
  bindControls() {
    const el = this.renderer.domElement;
    let drag = null;
    el.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId); this.viewAnim = null; });
    el.addEventListener("pointerup", () => (drag = null));
    el.addEventListener("pointermove", (e) => {
      if (!drag) return;
      this.orbit.theta -= (e.clientX - drag.x) * 0.008;
      this.orbit.phi = Math.min(2.6, Math.max(0.25, this.orbit.phi - (e.clientY - drag.y) * 0.006));
      drag = { x: e.clientX, y: e.clientY };
      this.updateCamera();
    });
    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.viewAnim = null;
      this.orbit.dist = Math.min(this.mode === "fly" ? 6000 : 900, Math.max(40, this.orbit.dist * (1 + Math.sign(e.deltaY) * 0.08)));
      this.updateCamera();
    }, { passive: false });
  },
  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  },

  /* ---------- Test standı ---------- */
  buildStand() {
    const metal = new THREE.MeshStandardMaterial({ color: 0x8b93a6, metalness: 0.8, roughness: 0.35 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1f2433, metalness: 0.3, roughness: 0.6 });
    const alu = new THREE.MeshStandardMaterial({ color: 0xc0c7d6, metalness: 0.9, roughness: 0.25 });
    // Bu fonksiyondaki tüm parçalar test düzeneği grubuna eklenir
    const scene = this.rig;

    // Taban plakası
    const base = new THREE.Mesh(new THREE.BoxGeometry(150, 8, 90), dark);
    base.position.set(0, 4, 0);
    base.castShadow = base.receiveShadow = true;
    scene.add(base);
    // Dikey alüminyum profil
    const post = new THREE.Mesh(new THREE.BoxGeometry(20, 70, 20), alu);
    post.position.set(-50, 43, 0);
    post.castShadow = true;
    scene.add(post);
    // Yük hücresi (load cell) – itkiyi ölçen sensör
    const cell = new THREE.Mesh(new THREE.BoxGeometry(80, 12.7, 12.7), alu);
    cell.position.set(-10, 84, 0);
    cell.castShadow = true;
    scene.add(cell);
    const label = new THREE.Mesh(new THREE.BoxGeometry(24, 13, 13.2), new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.5 }));
    label.position.set(-10, 84, 0);
    scene.add(label);
    // Motor bağlantı plakası
    const mount = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 4, 32), metal);
    mount.position.set(30, 92, 0);
    mount.castShadow = true;
    scene.add(mount);
    this.loadCell = cell;
    // Tek fırçasız motor, yük hücresinin ucundaki plakada
    const unit = this.createMotorUnit();
    unit.group.position.set(30, 94, 0);
    scene.add(unit.group);
    this.units.push(Object.assign(unit, { dir: 1, home: unit.group.position.clone() }));
    this.buildElectronics(scene);
  },

  /* ---------- Test standı elektroniği: ESC, faz kabloları, batarya, kontrol kartı ----------
     Fırçasız motorun ÜÇ faz kablosu vardır (fırçalı motorda iki kablo olur); ESC bu üç fazı sırayla besler.
     Güç: batarya → (kırmızı +, siyah −) → ESC.  Sinyal: kontrol kartı → (3'lü ince kablo) → ESC. */
  buildElectronics(scene) {
    const M = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.55, metalness: 0.1 }, o || {}));
    const gold = M(0xd4a72c, { metalness: 0.9, roughness: 0.25 });
    const black = M(0x0b0d12), silver = M(0xcbd5e1, { metalness: 0.9, roughness: 0.25 });
    const wire = (pts, r, color) => {
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, r, 8, false), M(color, { roughness: 0.6 }));
      m.castShadow = true;
      scene.add(m);
      return curve;
    };
    const box = (w, h, d, mat, x, y, z, parent) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; (parent || scene).add(m); return m; };

    // ESC (elektronik hız kontrolcüsü): taban plakasının üstünde, ısıyla daralan kılıf içinde
    box(46, 9, 24, M(0x1e293b), 23, 12.5, 30);
    box(26, 9.4, 24.4, M(0xf59e0b), 23, 12.5, 30);                       // etiket bandı
    const escText = flatLabel(["ESC 45A", "2-6S LiPo · BLHeli_32"], 25, 22, "#f59e0b", "#111827");
    escText.position.set(23, 17.35, 30);
    scene.add(escText);
    for (let i = 0; i < 5; i++) box(1.2, 3.2, 20, silver, 38.2 + i * 1.7, 18.4, 30);          // soğutucu kanatları
    box(9, 1.2, 21, silver, 41.6, 17.2, 30);
    for (let i = 0; i < 6; i++) box(3.4, 1.6, 2.6, black, 3 + (i % 3) * 2.2 * 1.6, 17.6, 24 + Math.floor(i / 3) * 12);   // MOSFET'ler
    for (let i = 0; i < 3; i++) box(3, 1.4, 3.6, gold, 1.4, 13, 24 + i * 6);                    // faz lehim pedleri
    for (const z of [27, 33]) box(3, 1.6, 4, gold, 44.6, 12.6, z);                              // güç lehim pedleri
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 14, 20), M(0x1d4ed8, { metalness: 0.4 }));   // giriş kondansatörü
    cap.rotation.x = Math.PI / 2;
    cap.position.set(41, 13, 45);
    scene.add(cap);
    // Üç faz kablosu: motor → altın fiş → ESC
    const phase = [0xfacc15, 0x2563eb, 0x111827];
    phase.forEach((c, i) => {
      const z = 24 + i * 6;
      const curve = wire([[24 + i * 6, 96, 13], [14 + i * 4, 78, 27], [-10, 44, z], [-9, 17, z], [0, 12.5, z]], 1.25, c);
      const p = curve.getPoint(0.55), t = curve.getTangent(0.55);
      const plug = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 9, 12), gold);
      plug.position.copy(p);
      plug.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), t);
      scene.add(plug);
    });
    // Batarya (6S LiPo) ve güç kabloları: kırmızı (+), siyah (−), XT60 fiş
    box(36, 28, 78, M(0x1f2937), 122, 14.5, 20);
    box(36.4, 28.4, 46, M(0xfacc15), 122, 14.5, 24);
    box(36.8, 29, 9, M(0xdc2626), 122, 14.5, -8);
    box(9, 8, 16, M(0xeab308), 99.5, 14, 20);                             // XT60
    const batTop = flatLabel(["LiPo 6S", "1300 mAh", "22,2 V · 120C", "28,9 Wh"], 30, 40, "#facc15", "#111827");
    batTop.rotation.z = -Math.PI / 2;
    batTop.position.set(122, 28.95, 24);
    scene.add(batTop);
    const warn = flatLabel(["⚠ YANICI", "Gözetimsiz şarj etme"], 34, 9, "#dc2626", "#ffffff");
    warn.rotation.z = -Math.PI / 2;
    warn.position.set(122, 29.3, -8);
    scene.add(warn);
    box(37.4, 3, 78.4, M(0x111827), 122, 2, 20);                          // alt koruma bandı
    // Denge (balans) fişi: 7 ince kablo ve beyaz JST-XH fiş
    for (let i = 0; i < 7; i++) wire([[106 + i * 0.4, 24, -17], [98, 14, -24 - i * 0.5], [92, 4, -30 - i], [88, 2.4, -33 - i * 1.6]], 0.45, i === 0 ? 0x111827 : i === 6 ? 0xdc2626 : [0xf8fafc, 0xfacc15, 0x2563eb, 0x22c55e, 0xf97316][i - 1]);
    box(6, 4, 14, M(0xf8fafc), 86, 2.6, -38);
    wire([[46, 12.5, 27], [66, 17, 31], [84, 13, 27], [95, 14, 23.5]], 1.9, 0xdc2626);
    wire([[46, 12.5, 33], [66, 15, 38], [86, 11, 30], [95, 14, 16.5]], 1.9, 0x111827);
    // Kontrol kartı (Arduino): matın üstünde, kameraya doğru eğik sehpada
    const board = new THREE.Group();
    board.position.set(-52, 20, 84);
    board.rotation.x = 0.6;
    scene.add(board);
    box(70, 1.6, 54, M(0x0e7490), 0, 0, 0, board);                        // devre kartı
    box(36, 3.2, 9, black, 0, 2.4, 15, board);                            // işlemci (ATmega328P)
    const silk = flatLabel(["ARDUINO UNO"], 30, 5, "#0e7490", "#e0f2fe");
    silk.position.set(2, 0.95, 22.4);
    board.add(silk);
    box(5, 3, 5, silver, -20, 2.3, 22, board);                            // sıfırlama düğmesi
    box(2.4, 1.6, 2.4, M(0xdc2626), -20, 4.4, 22, board);
    box(9, 3, 4, silver, -12, 2.3, 2, board);                             // kristal (16 MHz)
    box(7, 2.4, 7, black, -16, 2, -10, board);                            // USB-seri çipi
    for (const [x, z] of [[-22, 4], [-22, 9]]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 6, 16), silver); c.position.set(x, 3.8, z); board.add(c); }   // kondansatörler
    for (let i = 0; i < 6; i++) box(1, 5, 1, gold, 28 + (i % 3) * 2.5, 3.3, 18 + Math.floor(i / 3) * 2.5, board);   // ICSP pinleri
    box(2.4, 1.4, 1.6, new THREE.MeshBasicMaterial({ color: 0xf59e0b }), -6, 1.5, -20, board);   // TX
    box(2.4, 1.4, 1.6, new THREE.MeshBasicMaterial({ color: 0xf59e0b }), -2, 1.5, -20, board);   // RX
    // Küçük OLED ekran: devri ve gazı gösterir (her karede güncellenir)
    for (const [x, z] of [[-11, -19], [15, -19], [-11, -3], [15, -3]]) box(1.6, 6, 1.6, gold, x, 3.8, z, board);
    box(30, 1.4, 20, M(0x111827), 2, 7.4, -11, board);
    const oc = document.createElement("canvas");
    oc.width = 256; oc.height = 128;
    const otex = new THREE.CanvasTexture(oc);
    otex.encoding = THREE.sRGBEncoding;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(26, 13), new THREE.MeshBasicMaterial({ map: otex }));
    screen.rotation.x = -Math.PI / 2;
    screen.position.set(2, 8.2, -11.6);
    board.add(screen);
    this.oled = { ctx: oc.getContext("2d"), tex: otex, key: "" };
    this.drawOled(0, 0);
    box(13, 11, 16, silver, -30, 6, -14, board);                          // USB girişi
    box(9, 10, 12, black, -30, 5.5, 12, board);                           // güç girişi
    for (const z of [-24.5, 24.5]) box(48, 8, 2.6, black, 6, 4.5, z, board);   // pin sıraları
    box(3, 1.6, 2, new THREE.MeshBasicMaterial({ color: 0x22c55e }), 2, 1.6, -20, board);    // güç ışığı
    // Gaz potansiyometresi: düğmesi gaza (dolayısıyla devire) göre döner
    box(13, 3, 13, M(0x1d4ed8), 27, 2.3, -10, board);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 6, 9, 28), M(0x334155, { metalness: 0.5, roughness: 0.35 }));
    pot.position.set(27, 8, -10);
    board.add(pot);
    const knob = new THREE.Group();
    knob.position.set(27, 12.6, -10);
    const pointer = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 6), M(0xf8fafc));
    pointer.position.z = -2.6;
    knob.add(pointer);
    board.add(knob);
    this.potKnob = knob;
    for (let i = 0; i <= 6; i++) {                                          // kadran çizgileri (0–100 %)
      const a = (-135 + i * 45) * Math.PI / 180;
      const tick = box(0.8, 0.6, 2.2, M(0xe2e8f0), 27 + Math.sin(a) * 8.4, 1.1, -10 - Math.cos(a) * 8.4, board);
      tick.rotation.y = -a;
    }
    box(74, 20, 6, M(0x334155), -52, 9.5, 62);                            // sehpa
    // Sinyal kablosu (beyaz sinyal, kırmızı 5 V, siyah GND): ESC → kontrol kartı
    [0xf8fafc, 0xdc2626, 0x111827].forEach((c, i) => {
      const o = (i - 1) * 1.5;
      wire([[0, 11, 39 + o], [-14, 9.5, 46 + o], [-28, 16, 56 + o], [-34 + o, 30, 62], [-38 + o, 37, 63]], 0.65, c);
    });
    wire([[-82, 19, 88], [-100, 6, 96], [-130, 1.5, 108], [-180, 1.5, 150]], 1.6, 0x475569);   // USB kablosu → bilgisayar
  },

  /** Kontrol kartındaki OLED ekranı çizer (değer değişmedikçe yeniden çizmez) */
  drawOled(rpm, throttle) {
    const o = this.oled, r = Math.round(rpm / 10) * 10, t = Math.round(throttle * 100), key = r + "|" + t;
    if (!o || o.key === key) return;
    o.key = key;
    const c = o.ctx;
    c.fillStyle = "#020617"; c.fillRect(0, 0, 256, 128);
    c.fillStyle = "#67e8f9"; c.textBaseline = "alphabetic";
    c.font = "700 20px Consolas, monospace"; c.textAlign = "left"; c.fillText("DEVIR/DK", 10, 26);
    c.textAlign = "right"; c.fillText("GAZ %" + t, 246, 26);
    c.font = "700 62px Consolas, monospace"; c.textAlign = "center"; c.fillText(r.toLocaleString("tr-TR"), 128, 88);
    c.strokeStyle = "#67e8f9"; c.lineWidth = 2; c.strokeRect(10, 100, 236, 16);
    c.fillRect(13, 103, 230 * t / 100, 10);
    o.tex.needsUpdate = true;
  },

  /* ---------- Fırçasız motor (test standında 1, drone'da 4 adet kullanılır) ---------- */
  createMotorUnit(motor) {
    const g = new THREE.Group();
    const statorMat = new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.6, roughness: 0.35 }); // bakır sargı
    const bellMat = new THREE.MeshStandardMaterial({ color: 0x6366f1, metalness: 0.75, roughness: 0.25 });
    const black = new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.5, roughness: 0.4 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.95, roughness: 0.2 });

    const baseRing = new THREE.Mesh(new THREE.CylinderGeometry(15, 16, 6, 40), black);
    baseRing.position.y = 3;
    g.add(baseRing);
    const stator = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 7, 12), statorMat);
    stator.position.y = 9;
    g.add(stator);

    // Dönen çan (bell) + mıknatıs şeritleri
    const bellG = new THREE.Group();
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(14.5, 14.5, 14, 48, 1, true), bellMat);
    bell.position.y = 13;
    bellG.add(bell);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(14.5, 14.5, 2, 48), bellMat);
    cap.position.y = 20.5;
    bellG.add(cap);
    for (let i = 0; i < 6; i++) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(6, 2.2, 3), black);
      const a = (i / 6) * Math.PI * 2;
      slot.position.set(Math.cos(a) * 8, 21.2, Math.sin(a) * 8);
      slot.rotation.y = -a;
      bellG.add(slot);
    }
    // Çanın üzerindeki yazı bandı (model · KV), gerçek motorlardaki baskı gibi
    const labelMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, metalness: 0.2, roughness: 0.5, depthWrite: false });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(14.65, 14.65, 6.5, 64, 1, true), labelMat);
    band.position.y = 15.5;
    bellG.add(band);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(14.7, 14.7, 2.5, 48, 1, true), new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.3 }));
    stripe.position.y = 10;
    bellG.add(stripe);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 16, 16), steel);
    shaft.position.y = 28;
    bellG.add(shaft);
    g.add(bellG);

    // Pervane pivotu (motor milinin üstü)
    const pivot = new THREE.Group();
    pivot.position.y = 26;
    bellG.add(pivot);
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5.5, 7, 6), steel);
    nut.position.y = 8.5;
    bellG.add(nut);
    g.traverse((o) => { if (o.isMesh && o !== band) o.castShadow = true; });

    // Bulanıklık diski (hızlı dönüş efekti)
    const blur = new THREE.Mesh(
      new THREE.RingGeometry(8, 64, 64),
      new THREE.MeshBasicMaterial({ color: 0x9fb3ff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
    );
    blur.rotation.x = -Math.PI / 2;
    blur.position.y = 26;
    bellG.add(blur);
    const unit = { group: g, bell: bellG, pivot, blur, bellMat, labelMat, stripe, baseRing, s: 1 };
    this.styleMotor(unit, motor);
    return unit;
  },

  /** Motorun görünümü: stator çapına göre boyut, çan rengi ve üzerindeki yazı */
  styleMotor(u, motor) {
    const m = motor || {};
    u.s = Math.min(1.5, Math.max(0.45, (m.stator || 22) / 22));
    u.group.scale.setScalar(u.s);
    u.bellMat.color.set(m.bell != null ? m.bell : 0x6366f1);
    const text = m.label || (m.name || "").split(" · ").slice(0, 2).join("  ");
    let tex = motorLabelTexture(text, m.bell != null && isLight(m.bell) ? "#111827" : "#f8fafc");
    if (u.flip) {                                         // ters asılı motorda yazı 180° çevrilir
      tex = tex.clone();
      tex.center.set(0.5, 0.5);
      tex.rotation = Math.PI;
      tex.needsUpdate = true;
    }
    u.labelMat.map = tex;
    u.labelMat.needsUpdate = true;
  },
  /** Seçili motor değişince (test standı) motoru günceller */
  setMotorLook(motor) {
    if (this.mode !== "stand") return;
    for (const u of this.units) this.styleMotor(u, motor);
  },

  /* ---------- FPV drone – bağlı (tether) kırılma testi ----------
     Her model kendi gövde stilinde çizilir: freestyle · dji · whoop */
  buildDrone(drone, free) {
    const d = drone || {};
    const motor = (typeof MOTORS !== "undefined" && MOTORS[d.motorKey]) || {};
    const R = ((d.prop && d.prop.diameterIn) || 5) * 25.4 / 2;
    const s = Math.min(1.5, Math.max(0.45, (motor.stator || 22) / 22));
    // Motor konumları (ön = +x): M1 sağ ön, M2 sağ arka, M3 sol arka, M4 sol ön
    let pos;
    // layout: ön motorlar (x, z); arka motorlar farklıysa (xr, zr) – ör. öne açılan "deadcat" şaseler
    if (d.layout) {
      const L = d.layout, xr = L.xr != null ? L.xr : L.x, zr = L.zr != null ? L.zr : L.z;
      pos = [[L.x, L.z], [-xr, zr], [-xr, -zr], [L.x, -L.z]];
    }
    else {
      const r = (d.wheelbaseMm || 225) / 2;
      pos = [0, 1, 2, 3].map((i) => { const a = Math.PI / 4 + (i * Math.PI) / 2; return [Math.cos(a) * r, Math.sin(a) * r]; });
    }
    const rM = Math.max(...pos.map(([x, z]) => Math.hypot(x, z)));
    this.droneSpan = rM + R;
    this.droneRm = rM;

    // İniş/test pedi
    const padR = this.droneSpan * 1.08 + 8;
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(padR, padR, 2, 64), new THREE.MeshStandardMaterial({ color: 0x232838, roughness: 0.9 }));
    pad.position.y = 1;
    pad.receiveShadow = true;
    this.rig.add(pad);
    const ring = new THREE.Mesh(new THREE.RingGeometry(padR * 0.9, padR * 0.94, 64), new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 2.1;
    this.rig.add(ring);
    const hMark = makeFlatText("H", "#facc15", padR * 0.5);
    hMark.position.y = 2.2;
    this.rig.add(hMark);

    // Drone gövdesi (stil fonksiyonu motor yüksekliğini ve taban yüksekliğini döndürür)
    const body = new THREE.Group();
    this.droneGroup = body;
    this.rig.add(body);
    this.droneLeds = [];
    const ctx = { d, R, s, pos, rM, motor };
    const style = { dji: this.styleDji, avata: this.styleAvata, whoop: this.styleWhoop, cine: this.styleCine }[d.style] || this.styleFreestyle;
    const info = style.call(this, body, ctx);
    this.droneBaseY = info.baseY;
    this.droneTargetY = info.baseY + info.topY * 0.6;
    body.position.y = this.droneBaseY;

    // 4 motor. Yönler: çaprazlar aynı, komşular ters döner (quad X)
    const dirs = [1, -1, 1, -1];
    const labels = ["M1 sağ ön", "M2 sağ arka", "M3 sol arka", "M4 sol ön"];
    pos.forEach(([x, z], i) => {
      const unit = this.createMotorUnit(motor);
      unit.group.position.set(x, typeof info.motorY === "function" ? info.motorY(i, x, z) : info.motorY, z);
      body.add(unit.group);
      if (info.flip) {                                    // itici düzen: motor plakanın altına asılı, pervane altta
        unit.flip = true;
        unit.group.rotation.x = Math.PI;
        this.styleMotor(unit, motor);                     // çandaki yazı ters durmasın
      }
      this.units.push(Object.assign(unit, { dir: dirs[i], label: labels[i], home: unit.group.position.clone() }));
    });
    if (info.after) info.after();
    body.traverse((o) => { if (o.isMesh && !o.material.transparent) o.castShadow = true; });

    this.tetherMm = 0;
    if (free) return;                                   // uçuş bölümünde ip yok
    // Bağlama ipleri: drone kalkınca en fazla tetherMm kadar yükselebilir
    this.tetherMm = Math.max(18, Math.min(60, this.droneSpan * 0.34));
    this.tetherAttachY = info.attachY;
    const tGeo = new THREE.BufferGeometry();
    tGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(4 * 2 * 3), 3));
    this.tether = new THREE.LineSegments(tGeo, new THREE.LineBasicMaterial({ color: 0xfb923c }));
    this.rig.add(this.tether);
    this.tetherAnchors = this.units.map((u) => new THREE.Vector3(u.home.x, 2, u.home.z));
    const eyeR = Math.max(1.5, Math.min(3, R * 0.05));
    for (const p of this.tetherAnchors) {
      const eye = new THREE.Mesh(new THREE.TorusGeometry(eyeR, eyeR * 0.33, 8, 16), new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.9, roughness: 0.25 }));
      eye.position.copy(p);
      this.rig.add(eye);
    }
  },

  /** LED: çalışırken yanar, kırılınca kırmızı yanıp söner */
  addLed(body, w, h, dpt, x, y, z, color, rotY) {
    const led = new THREE.Mesh(new THREE.BoxGeometry(w, h, dpt), new THREE.MeshBasicMaterial({ color, transparent: true }));
    led.position.set(x, y, z);
    led.rotation.y = rotY || 0;
    body.add(led);
    this.droneLeds.push(led);
    return led;
  },

  /** Açık karbon şase (freestyle / uzun menzil). d.layout verilirse kollar o motor konumlarına gider;
   *  d.bodyScale orta gövdeyi (plakalar, batarya, kamera) büyütür, d.armMm kol kalınlığıdır. */
  styleFreestyle(body, { d, pos, rM }) {
    const carbon = new THREE.MeshStandardMaterial({ color: 0x1b1d24, metalness: 0.35, roughness: 0.5 });
    const carbonTop = new THREE.MeshStandardMaterial({ color: 0x262a35, metalness: 0.4, roughness: 0.45 });
    const tpu = new THREE.MeshStandardMaterial({ color: d.accent || 0xf97316, roughness: 0.7 });
    const anod = new THREE.MeshStandardMaterial({ color: 0x8b5cf6, metalness: 0.85, roughness: 0.3 });
    const black = new THREE.MeshStandardMaterial({ color: 0x0b0d12, metalness: 0.3, roughness: 0.6 });

    // Kollar (karbon): gövde merkezinden her motora, motorun 15 mm ötesine kadar
    const bs = d.bodyScale || 1, armT = d.armMm || 5;
    for (const [x, z] of pos) {
      const len = Math.hypot(x, z) + 15, a = Math.atan2(z, x);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(len, armT, 14), carbon);
      arm.position.set(Math.cos(a) * len / 2, 0, Math.sin(a) * len / 2);
      arm.rotation.y = -a;
      body.add(arm);
    }
    // Orta gövde ayrı bir grupta: büyük şaselerde ölçeklenir
    const core = new THREE.Group();
    core.scale.setScalar(bs);
    body.add(core);
    // Alt ve üst plaka, aralayıcılar (standoff)
    core.add(new THREE.Mesh(new THREE.BoxGeometry(110, 4, 46), carbon));
    const top = new THREE.Mesh(new THREE.BoxGeometry(90, 2.5, 36), carbonTop);
    top.position.y = 30;
    core.add(top);
    for (const [x, z] of [[40, 15], [40, -15], [-40, 15], [-40, -15]]) {
      const so = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 28, 12), anod);
      so.position.set(x, 15, z);
      core.add(so);
    }
    // Uçuş kontrol kartı + ESC yığını
    const esc = new THREE.Mesh(new THREE.BoxGeometry(32, 5, 32), new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.6 }));
    esc.position.y = 7;
    core.add(esc);
    const fc = new THREE.Mesh(new THREE.BoxGeometry(30, 4, 30), new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.6 }));
    fc.position.y = 16;
    core.add(fc);
    // 6S LiPo batarya + kayış
    const bat = new THREE.Mesh(new THREE.BoxGeometry(75, 28, 36), new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.55 }));
    bat.position.y = 45.5;
    core.add(bat);
    const batLabel = new THREE.Mesh(new THREE.BoxGeometry(50, 28.4, 36.4), new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5 }));
    batLabel.position.set(-6, 45.5, 0);
    core.add(batLabel);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(10, 29.5, 37.5), new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.7 }));
    strap.position.set(18, 45, 0);
    core.add(strap);
    const xt60 = new THREE.Mesh(new THREE.BoxGeometry(10, 8, 16), new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.5 }));
    xt60.position.set(-46, 36, 0);
    core.add(xt60);

    // FPV kamera (önde, +x), TPU kafes içinde, 25° yukarı bakar
    const cam = new THREE.Group();
    cam.position.set(54, 16, 0);
    cam.rotation.z = 0.44;
    for (const z of [-12.5, 12.5]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(24, 24, 3), tpu);
      side.position.z = z;
      cam.add(side);
    }
    cam.add(new THREE.Mesh(new THREE.BoxGeometry(19, 19, 19), black));
    addLens(cam, 7, 13, black);
    core.add(cam);

    // Video vericisi anteni (arkada, -x)
    const antMount = new THREE.Mesh(new THREE.BoxGeometry(14, 10, 20), tpu);
    antMount.position.set(-50, 31, 0);
    core.add(antMount);
    const ant = new THREE.Group();
    ant.position.set(-52, 35, 0);
    ant.rotation.z = 0.55;
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 42, 10), black);
    stick.position.y = 21;
    ant.add(stick);
    const lolly = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 4, 20), new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.4 }));
    lolly.position.y = 44;
    lolly.rotation.x = Math.PI / 2;
    ant.add(lolly);
    core.add(ant);

    // Yan paneller (ör. iFlight Nazgul Evoque): plakaların arasını kapatan yarı saydam kapaklar, kenarında LED şerit
    if (d.sidePanels != null) {
      const panelMat = new THREE.MeshStandardMaterial({ color: d.sidePanels, metalness: 0.2, roughness: 0.35, transparent: true, opacity: 0.82 });
      for (const zs of [-1, 1]) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(74, 25, 1.6), panelMat);
        panel.position.set(0, 15.5, zs * 19.4);
        core.add(panel);
        this.addLed(core, 70, 1.6, 1, 0, 27, zs * 20.4, d.accent != null ? d.accent : 0x38bdf8);
        this.addLed(core, 70, 1.6, 1, 0, 4, zs * 20.4, d.accent != null ? d.accent : 0x38bdf8);
      }
    }
    // GPS modülü (uzun menzil şaseleri): arkada, direğin üstünde
    if (d.gps) {
      const mast = new THREE.Mesh(new THREE.BoxGeometry(6, 26, 14), tpu);
      mast.position.set(-40, 44, 0);
      mast.rotation.z = 0.35;
      core.add(mast);
      const puck = new THREE.Mesh(new THREE.BoxGeometry(20, 6, 20), black);
      puck.position.set(-45, 59, 0);
      core.add(puck);
      const patch = new THREE.Mesh(new THREE.BoxGeometry(14, 1, 14), new THREE.MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.5 }));
      patch.position.set(-45, 62.2, 0);
      core.add(patch);
    }

    // Ayaklar ve LED'ler
    for (const [x, z] of pos) {
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(6, 7, 8, 16), tpu);
      foot.position.set(x, -6.5, z);
      body.add(foot);
      const a = Math.atan2(z, x), r = Math.hypot(x, z), k = (r - 30) / r;
      this.addLed(body, 10, 2, 5, x * k, -3.4, z * k, x > 0 ? 0xe0f2fe : 0xff2244, -a);
    }
    return { baseY: 12.5, motorY: armT / 2, topY: (d.gps ? 66 : 60) * bs, attachY: -armT / 2 };
  },

  /**
   * DJI FPV (2021) – DJI'ın destek sayfası ve ürün fotoğraflarına göre (yer = y 0, ön = +x):
   *  · Gövde öne doğru yükselir: arkada batarya yere yakın, önde kamera yukarıda
   *  · Üstte parlak, yarı saydam füme kubbe; önünde 6 yarıklı hava girişi
   *  · Burunda açık kafes içinde tek eksenli gimbal kamera; altında iki yanında ön görüş
   *    sensörü olan çene çubuğu ve "dji" yazılı alt sensör bölmesi
   *  · Ön kollar alttan, arka kollar üstten çıkar: arka motorlar ön motorlardan yüksektedir
   *  · İniş ayakları yalnızca ön motorların altında (önlerinde beyaz ışık şeridi); arka, bataryanın lastik ayaklarına oturur
   *  · Motorların alt yarısı gümüş bantlı; "A" motorların pervane yuvası kırmızı işaretli
   *  · Gövdenin iki yanında beyaz "FPV" yazısı ve vidalı gümüş plaka
   *  · Pervaneli ölçü 255 × 312 × 127 mm, köşegen 245 mm
   */
  styleDji(body, { d, pos }) {
    const C = (h) => new THREE.Color(h).convertSRGBToLinear();
    const M = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color: C(color), metalness: 0.2, roughness: 0.62 }, o || {}));
    const shell = M(0x3b3e43), dark = M(0x2a2c30), armMat = M(0x34373c, { roughness: 0.7 });
    const cover = M(d.cover || 0x15171a, { metalness: 0.55, roughness: 0.08, transparent: true, opacity: 0.9 });
    const black = M(0x0c0d10, { metalness: 0.3, roughness: 0.45 });
    const silver = M(0xd3d7dd, { metalness: 0.35, roughness: 0.32 });
    const red = new THREE.MeshBasicMaterial({ color: 0xff2d3d });
    const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); body.add(mesh); return mesh; };
    const box = (w, h, dp, mat, x, y, z) => add(new THREE.Mesh(new THREE.BoxGeometry(w, h, dp), mat), x, y, z);
    const cyl = (r, len, mat, x, y, z, axis) => {
      const m = add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 28), mat), x, y, z);
      if (axis === "x") m.rotation.z = Math.PI / 2; else if (axis === "z") m.rotation.x = Math.PI / 2;
      return m;
    };
    const W = 52;                                             // gövde genişliği (kenar yumuşatması hariç)

    // Ana gövde (yan profil): kuyruk altta, burun yukarıda
    body.add(prism([[-94, 6], [-99, 40], [-78, 68], [-40, 84], [0, 86], [30, 84], [44, 78], [46, 52], [36, 36], [10, 26], [-40, 10]], W, 5, shell));
    // Arkadan takılan akıllı batarya (gövdenin arka yarısı, bir ton koyu) ve arka yüzü
    body.add(prism([[-98, 9], [-103, 41], [-82, 69], [-50, 83], [-46, 58], [-62, 13]], W - 2, 4.5, dark));
    const rear = new THREE.Group();
    rear.position.set(-106, 26, 0);
    rear.rotation.z = -0.16;
    body.add(rear);
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 1.6, 24), silver);
    btn.rotation.z = Math.PI / 2;
    btn.position.set(0, 2, -10);
    rear.add(btn);
    for (let i = 0; i < 4; i++) this.addLed(rear, 1, 2.4, 3.2, -0.2, 2, 0 + i * 5, 0x22c55e);
    for (const z of [-14, 14]) cyl(5, 4, black, -80, 3.2, z);                       // bataryanın lastik ayakları
    // Parlak füme üst kubbe
    const dome = add(new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.56), cover), 0, 77, 0);
    dome.scale.set(47, 37, 32.6);
    dome.rotation.z = -0.22;
    // Hava girişi (6 yarık) – kubbenin önündeki çıkıntı
    const brow = box(13, 13, 32, shell, 44, 93, 0);
    brow.rotation.z = -0.38;
    for (let i = 0; i < 6; i++) {
      const slit = box(1.4, 8.5, 2.6, black, 50.6, 91.4, -10 + i * 4);
      slit.rotation.z = -0.38;
    }
    // Kamera kafesi: üst ve alt çubuk, iki dikme, dört vida
    box(15, 4, 38, dark, 51, 82, 0);
    box(17, 4, 42, dark, 51, 52, 0);
    for (const z of [-19, 19]) {
      box(4.5, 30, 4.5, dark, 56.5, 67, z);
      for (const y of [80, 54]) cyl(1.5, 1.2, silver, 59.4, y, z, "x");
    }
    // Tek eksenli gimbal kamera (1/2.3" CMOS, 150° FOV) ve yanındaki gimbal motoru
    const cam = new THREE.Group();
    cam.position.set(52, 67, -3);
    cam.rotation.z = -0.1;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(10.5, 11.5, 15, 32), black);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.x = 6;
    cam.add(barrel);
    const camBack = new THREE.Mesh(new THREE.BoxGeometry(12, 20, 22), dark);
    camBack.position.x = -6;
    cam.add(camBack);
    addLens(cam, 8.2, 12, black);
    body.add(cam);
    cyl(8.5, 10, M(0x55595f, { metalness: 0.5, roughness: 0.4 }), 52, 67, 15, "z");
    cyl(6, 0.8, M(0x8a8f96, { metalness: 0.6, roughness: 0.35 }), 52, 67, 20.2, "z");
    // Çene çubuğu ve iki yanındaki ön görüş sensörleri
    box(12, 9, 58, dark, 43, 42, 0);
    for (const z of [-27, 27]) {
      cyl(6.8, 10, black, 49, 42, z, "x");
      const glass = add(new THREE.Mesh(new THREE.CircleGeometry(4.6, 24), new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.9, roughness: 0.05 })), 54.2, 42, z);
      glass.rotation.y = Math.PI / 2;
    }
    // "dji" yazılı alt sensör bölmesi: alt görüş sensörleri, ToF ve yardımcı ışık
    box(24, 15, 26, dark, 37, 29, 0);
    const logo = label3d(["dji"], 13, 7, null, "#c9ced6");
    logo.rotation.y = Math.PI / 2;
    add(logo, 49.2, 29, 0);
    for (const x of [30, 42]) cyl(3.4, 1.2, black, x, 21.2, 0);
    box(6, 1.2, 10, black, 14, 23.6, 0);
    this.addLed(body, 9, 1, 12, -6, 19.4, 0, 0xffffff);
    // Yanlarda vidalı gümüş plaka ve beyaz "FPV" yazısı
    for (const zs of [-1, 1]) {
      const plate = prism([[-8, 60], [22, 76], [18, 50]], 1.4, 0.4, silver);
      plate.position.z = zs * (W / 2 + 5.6);
      body.add(plate);
      for (const [x, y] of [[-4, 61], [19, 73], [16, 53]]) cyl(1.3, 0.8, dark, x, y, zs * (W / 2 + 6.6), "z");
      const txt = label3d(["FPV"], 17, 7.5, null, "#f8fafc");
      if (zs < 0) txt.rotation.y = Math.PI;
      add(txt, -30, 72, zs * (W / 2 + 5.7));
    }

    // Kollar: ön kollar alttan (çene hizası), arka kollar üstten çıkar
    const frontY = 68, rearY = 94;                            // motor tabanı yükseklikleri
    for (const [x, z] of pos) {
      const front = x > 0, zs = Math.sign(z), my = front ? frontY : rearY;
      const from = front ? [30, 46, zs * 22] : [-32, 84, zs * 22];
      const arm = capsule(from, [x, my - 6, z], 7.5, armMat);
      arm.scale.z = 0.62;                                     // kanat profili gibi yassı
      body.add(arm);
      // Motor yuvası
      add(new THREE.Mesh(new THREE.CylinderGeometry(17, 16, 12, 32), armMat), x, my - 6, z);
      if (front) {
        // İniş ayağı: uca doğru incelir, önünde beyaz ışık şeridi
        add(new THREE.Mesh(new THREE.CylinderGeometry(11, 5.2, my - 16, 24), armMat), x, (my - 12 + 4) / 2, z);
        add(new THREE.Mesh(new THREE.SphereGeometry(5.6, 16, 10), black), x, 4.2, z);
        const strip = this.addLed(body, 1.5, 24, 4.6, x + 7.4, 22, z, 0xf8fafc);
        strip.rotation.z = -0.08;
      } else {
        const cap = add(new THREE.Mesh(new THREE.SphereGeometry(16, 28, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), armMat), x, my - 12, z);
        cap.scale.y = 0.7;
      }
      // Göstergeler: motorun arkasında yeşil, kolun arkasında kırmızı
      this.addLed(body, 2, 4, 7, x - 17.2, my - 6, z, 0x22c55e);
      this.addLed(body, 2, 3, 9, from[0] + (x - from[0]) * 0.55 - 7, from[1] + (my - 6 - from[1]) * 0.55, from[2] + (z - from[2]) * 0.55, 0xff2d3d);
    }
    return {
      baseY: 2, motorY: (i, x) => (x > 0 ? frontY : rearY), topY: 127, attachY: (u) => (u.home.x > 0 ? 8 : rearY - 22),
      after: () => {
        for (const u of this.units) {
          // Motorun alt yarısı gümüş bantlı, üstü koyu; çan üzerinde yazı yok
          const band = new THREE.Mesh(new THREE.CylinderGeometry(15.3, 15.6, 8.5, 40), silver);
          band.position.y = 7;
          u.group.add(band);
          u.stripe.visible = false;
          // Pervane yuvası: gri kapak; "A" motorlarda (saat yönü) kırmızı halka ve pervanede kırmızı işaret
          const hubCap = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 6.5, 1, 24), M(0x8a8f96, { metalness: 0.5 }));
          hubCap.position.y = 21.9;
          u.bell.add(hubCap);
          if (u.dir !== 1) continue;
          const ring = new THREE.Mesh(new THREE.TorusGeometry(9.2, 1.3, 8, 40), red);
          ring.rotation.x = Math.PI / 2;
          ring.position.y = 21.8;
          u.bell.add(ring);
          u.markA = true;
        }
      }
    };
  },

  /** BETAFPV whoop / cinewhoop: kanal korumalı (ducted) pervaneler, AIO kart, HD veya analog kamera */
  styleWhoop(body, { d, R, s, pos, rM }) {
    const frameMat = new THREE.MeshStandardMaterial({ color: d.frame != null ? d.frame : 0x1f2937, metalness: 0.1, roughness: 0.6, side: THREE.DoubleSide });
    const accent = new THREE.MeshStandardMaterial({ color: d.accent != null ? d.accent : 0xdc2626, metalness: 0.15, roughness: 0.5 });
    const black = new THREE.MeshStandardMaterial({ color: 0x0b0d12, metalness: 0.3, roughness: 0.5 });
    const k = R / 44;                                   // boyut ölçeği (Pavo35 = 1)
    const motorY = 2 * k + 1;
    const propY = motorY + 26 * s;
    const ductR = R + 2.5 * Math.max(0.6, k);
    const ductBot = 0, ductTop = propY + Math.max(4, R * 0.18);
    const ductH = ductTop - ductBot;
    const wall = Math.max(1, 1.6 * k);

    // Kanallar ve motor yuvaları
    for (const [x, z] of pos) {
      const duct = new THREE.Mesh(new THREE.CylinderGeometry(ductR, ductR, ductH, 64, 1, true), frameMat);
      duct.position.set(x, ductBot + ductH / 2, z);
      body.add(duct);
      for (const yy of [ductTop, ductBot]) {
        const lip = new THREE.Mesh(new THREE.TorusGeometry(ductR, wall, 8, 64), frameMat);
        lip.rotation.x = Math.PI / 2;
        lip.position.set(x, yy, z);
        body.add(lip);
      }
      const mount = new THREE.Mesh(new THREE.CylinderGeometry(17 * s, 17 * s, motorY, 32), frameMat);
      mount.position.set(x, motorY / 2, z);
      body.add(mount);
      // Motor yuvasından kanal duvarına 4 kol
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(ductR - 14 * s, motorY * 0.8, 3.2 * k + 1), frameMat);
        const rr = (ductR + 14 * s) / 2;
        spoke.position.set(x + Math.cos(a) * rr, motorY * 0.4, z + Math.sin(a) * rr);
        spoke.rotation.y = -a;
        body.add(spoke);
      }
      // Kanal dışında LED
      const a = Math.atan2(z, x);
      this.addLed(body, 6 * k + 2, 1.5 * k + 0.8, 1.2, x + Math.cos(a) * (ductR + wall), ductBot + 2 * k + 1, z + Math.sin(a) * (ductR + wall), x > 0 ? 0x60a5fa : 0xff2244, -a + Math.PI / 2);
    }
    // Kanalları birleştiren orta şase
    const cw = rM * 1.15, cd = rM * 0.75;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(cw, 2.4 * k + 0.8, cd), frameMat);
    plate.position.y = motorY * 0.4;
    body.add(plate);
    // AIO uçuş kartı
    const aio = new THREE.Mesh(new THREE.BoxGeometry(26 * k + 6, 2 * k + 0.6, 26 * k + 6), new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.6 }));
    aio.position.y = motorY + 1.5 * k;
    body.add(aio);

    // Batarya: büyük cinewhoop'ta üstte, tiny whoop'ta altta
    const big = R > 30;
    const hd = R > 25;                                  // HD hava üniteli cinewhoop mu, tiny whoop mu
    const bw = big ? [75, 34, 36] : hd ? [56, 17, 30] : [50, 7, 14];
    const batt = new THREE.Mesh(new THREE.BoxGeometry(bw[0], bw[1], bw[2]), new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.55 }));
    const battLabel = new THREE.Mesh(new THREE.BoxGeometry(bw[0] * 0.6, bw[1] + 0.4, bw[2] + 0.4), accent);
    let topY = ductTop, baseY = 2;
    if (hd) {
      const camH = 20 * k + 8;
      batt.position.set(-4 * k, ductTop * 0.5 + camH * 0.5 + bw[1] / 2, 0);
      // HD hava ünitesi (DJI O3): yükseltilmiş kutu
      const vtx = new THREE.Mesh(new THREE.BoxGeometry(32 * k + 10, camH, 30 * k + 8), black);
      vtx.position.set(0, ductTop * 0.5, 0);
      body.add(vtx);
      topY = batt.position.y + bw[1] / 2;
    } else {
      // Tiny whoop: batarya kanalların altında, kızakta
      batt.position.set(0, -bw[1] / 2 - 1, 0);
      baseY = 2 + bw[1] + 1;
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), accent);
      canopy.scale.set(17, 13, 12);
      canopy.position.y = motorY + 2;
      body.add(canopy);
      topY = motorY + 15;
    }
    battLabel.position.copy(batt.position);
    body.add(batt, battLabel);

    // Kamera (önde, +x), hafifçe yukarı bakar
    const cam = new THREE.Group();
    const cs = hd ? 1 : 0.5;
    cam.position.set(cw / 2 - 2 * cs, hd ? ductTop * 0.5 : motorY + 7, 0);
    cam.rotation.z = 0.3;
    cam.add(new THREE.Mesh(new THREE.BoxGeometry(16 * cs, 16 * cs, 18 * cs), black));
    addLens(cam, 6 * cs, 11 * cs, black);
    body.add(cam);

    return { baseY, motorY, topY, attachY: 0 };
  },

  /**
   * DJI Avata 2 (2024) – DJI'ın ölçüleri ve ürün fotoğraflarına göre (yer = y 0, ön = +x):
   *  · Mat koyu gri tek parça gövde; dört eğimli koruma halkası gövdenin yanlarına ve birbirine yapışık
   *  · Dar, uzun gövde halkaların üstünde durur; üstünde girintili panel ve "dji" logosu
   *  · Burunda açık yuvada tek eksenli gimbal kamera, iki yanında dikey turuncu şerit
   *  · Batarya arkadan takılır: yanlarında turuncu çizgili çıkarma düğmesi, arkasında güç düğmesi ve 4 seviye ışığı
   *  · Alt arkada "AVATA 2" yazısı (2 turuncu)
   *  · Motorlar altta, ince kolların ucundaki yuvalarda; pervaneler halkaların içinde, iki göbekte turuncu nokta
   *  · 185 × 212 × 64 mm
   */
  styleAvata(body, { d, R, s, pos }) {
    const C = (h) => new THREE.Color(h).convertSRGBToLinear();
    const M = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color: C(color), metalness: 0.12, roughness: 0.7 }, o || {}));
    const shell = M(d.frame != null ? d.frame : 0x4a4e55), panel = M(0x3d4046, { roughness: 0.55 });
    const black = M(0x101114, { metalness: 0.25, roughness: 0.5 }), orange = M(0xff7a1a, { roughness: 0.5 });
    const ringMat = M(d.frame != null ? d.frame : 0x4a4e55, { side: THREE.DoubleSide });
    const add = (mesh, x, y, z, parent) => { mesh.position.set(x, y, z); (parent || body).add(mesh); return mesh; };
    const box = (w, h, dp, mat, x, y, z) => add(new THREE.Mesh(new THREE.BoxGeometry(w, h, dp), mat), x, y, z);
    const fx = Math.abs(pos[0][0]), fz = Math.abs(pos[0][1]);
    const motorY = 13, ringLo = 22, ringHi = 37, rTop = R + 2.6, rBot = R + 6.5;

    // Koruma halkaları: aşağı doğru genişleyen bant, üst ve alt kenarı yuvarlak
    for (const [x, z] of pos) {
      add(new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, ringHi - ringLo, 72, 1, true), ringMat), x, (ringLo + ringHi) / 2, z);
      for (const [r, y] of [[rTop, ringHi], [rBot, ringLo]]) {
        const lip = add(new THREE.Mesh(new THREE.TorusGeometry(r, 2, 10, 72), shell), x, y, z);
        lip.rotation.x = Math.PI / 2;
      }
    }
    // Bel: gövdeden halkaların birleştiği yere inen "Y" köprüler
    const hw = 21;                                             // gövde yarı genişliği
    for (const zs of [-1, 1]) {
      const web = capsule([0, 47, zs * (hw - 2)], [0, 30, zs * (fz - 2)], 2.6, shell);
      web.scale.x = 3.2;                                        // geniş, ince bir köprü
      body.add(web);
    }

    // Gövde (yan profil): halkaların üstünde, üstü düz
    body.add(prism([[-69, 36], [-71, 59], [-64, 63.5], [56, 63.5], [66, 59], [66, 36], [-62, 33.5]], hw * 2 - 6, 3, shell));
    // Üstte girintili panel, iki küçük gözlü yuva ve durum ışığı
    box(64, 0.8, 26, panel, 14, 66.3, 0);
    for (const z of [-6.5, 6.5]) {
      const eye = add(new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.6, 16), black), -12, 66.9, z);
      eye.castShadow = false;
    }
    this.addLed(body, 2, 0.6, 5, -12, 66.9, 0, 0x22c55e);
    const logo = label3d(["dji"], 13, 7.5, null, "#b9bec6");
    logo.rotation.order = "YXZ";
    logo.rotation.set(-Math.PI / 2, -Math.PI / 2, 0);        // yere yatık, yazının üstü buruna bakar
    add(logo, -46, 66.7, 0);
    // Batarya: gövdenin arka üçte biri (ek yeri çizgisi), yan düğmeler, arka yüz
    box(0.8, 27, hw * 2 + 0.4, black, -22, 49, 0);
    for (const zs of [-1, 1]) {
      box(15, 9.5, 1.6, panel, -50, 50, zs * (hw + 0.4));
      for (let i = 0; i < 5; i++) box(1, 7, 1.9, black, -55 + i * 2.2, 50, zs * (hw + 0.5));   // tırtıllı yüzey
      box(1.6, 8, 2, orange, -43.6, 50, zs * (hw + 0.6));
    }
    const back = new THREE.Group();
    back.position.set(-74.4, 48, 0);
    body.add(back);
    const pw = add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 7, 9), panel), 0, 2, -8, back);
    pw.castShadow = false;
    for (let i = 0; i < 4; i++) this.addLed(back, 0.8, 1.6, 1.6, -0.2, 2, 1 + i * 3.2, 0x22c55e);

    // Burun: kamera yuvası, iki yanak ve dikey turuncu şeritler
    box(24, 6, hw * 2 - 2, shell, 74, 63.4, 0);
    for (const zs of [-1, 1]) {
      box(26, 24, 4, shell, 76, 47, zs * (hw - 3));
      box(2.2, 17, 4.6, orange, 89.4, 45.5, zs * (hw - 3));
    }
    box(14, 20, 24, black, 70, 46, 0);                          // gimbal gövdesi (nervürlü)
    for (let i = 0; i < 6; i++) box(1, 1, 22, panel, 64 + i * 2.2, 56.3, 0);
    const cam = new THREE.Group();
    cam.position.set(79, 45, 0);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(9.5, 10.5, 13, 32), black);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.x = 4;
    cam.add(barrel);
    addLens(cam, 7.4, 9.6, black);
    body.add(cam);

    // Alt gövde: soğutuculu karın, motor yuvaları, ince kollar ve ayak pedleri
    box(129, 13, 34, black, -9.5, 27, 0);
    for (let i = 0; i < 9; i++) box(1.4, 1, 26, panel, -30 + i * 6, 20.2, 0);
    for (const [x, z] of pos) {
      const zs = Math.sign(z), xs = Math.sign(x);
      add(new THREE.Mesh(new THREE.CylinderGeometry(11.5, 10.5, 11, 28), black), x, 7.5, z);
      add(new THREE.Mesh(new THREE.CylinderGeometry(5, 5.6, 2, 18), M(0x1b1c20)), x, 1, z);
      body.add(capsule([xs * 8, 23, zs * 15], [x, 9, z], 3, black));
      body.add(capsule([xs * 52, 23, zs * 15], [x, 9, z], 3, black));
    }
    // Arka alt: "AVATA 2" yazısı ve arka/alt görüş sensörleri
    const name = label3d([[["AVATA ", "#aab0b9"], ["2", "#ff7a1a"]]], 22, 5.5, null, "#aab0b9");
    name.rotation.y = -Math.PI / 2;
    add(name, -74.4, 27, 0);
    for (const z of [-9, 9]) {
      const rs = add(new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 1.4, 18), M(0x05060a, { metalness: 0.8, roughness: 0.1 })), -54, 20.4, z);
      rs.castShadow = false;
    }
    return {
      baseY: 2, motorY, topY: 67, attachY: 6,
      after: () => {
        for (const u of this.units) {
          u.stripe.visible = false;                              // çanda bant ya da yazı yok
          // Pervane göbeği: iki vida; "A" motorlarda turuncu nokta
          for (const x of [-3, 3]) {
            const screw = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1, 10), M(0xbfc4cb, { metalness: 0.5, roughness: 0.3 }));
            screw.position.set(x / u.s, 26 + 5.2 / u.s, 0);
            screw.scale.setScalar(1 / u.s);
            u.bell.add(screw);
          }
          if (u.dir === 1) { u.markA = true; u.markColor = 0xff7a1a; }
        }
      }
    };
  },

  /**
   * İtici (pusher) cinewhoop: karbon üst plaka, altına asılı motorlar, en altta alçak koruma halkaları.
   * Modele özgü ayrıntılar d.cine.kind ile seçilir (üretici fotoğraflarına göre):
   *  · "pavo35": BETAFPV Pavo35 – yarı saydam füme halkalar, kum saati biçimli karbon plaka, gri alüminyum
   *    ara parçalar, burunda O3 kamera ve GoPro bağlantısı, önde XT60, arkada kısa silindir anten ve
   *    beyaz alıcı anteni, halkaların çevresinde buz mavisi ışık şeridi
   *  · "pavo20": BETAFPV Pavo20 Pro – tamamı siyah; yan raylı karbon plaka, üstte O3 hava ünitesini tutan kafes
   *    ("dji" logosu, yanında "PAVO"), arkada "BETAFPV" yazılı anten yuvası ve uzun saplı anten, alta kayışla
   *    bağlanan batarya, kırmızı-siyah XT30 kablosu
   */
  styleCine(body, { d, R, s, pos, motor }) {
    const C = (h) => new THREE.Color(h).convertSRGBToLinear();
    const M = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color: C(color), metalness: 0.15, roughness: 0.6 }, o || {}));
    const cfg = d.cine || {}, kind = cfg.kind;
    const black = M(0x0d0e11, { metalness: 0.25, roughness: 0.5 }), alu = M(0x9aa0a8, { metalness: 0.45, roughness: 0.35 }), silver = M(0xd0d4da, { metalness: 0.4, roughness: 0.3 });
    const carbon = (wMm, dMm) => {                              // dokulu karbon plaka malzemesi
      const t = carbonTexture().clone();
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(Math.max(1, wMm / 12), Math.max(1, dMm / 12));
      t.needsUpdate = true;
      return new THREE.MeshStandardMaterial({ map: t, metalness: 0.35, roughness: 0.38 });
    };
    const add = (mesh, x, y, z, parent) => { mesh.position.set(x, y, z); (parent || body).add(mesh); return mesh; };
    const box = (w, h, dp, mat, x, y, z, parent) => add(new THREE.Mesh(new THREE.BoxGeometry(w, h, dp), mat), x, y, z, parent);
    const cyl = (r, len, mat, x, y, z, axis, parent) => {
      const m = add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 24), mat), x, y, z, parent);
      if (axis === "x") m.rotation.z = Math.PI / 2; else if (axis === "z") m.rotation.x = Math.PI / 2;
      return m;
    };
    // Plaka düzleminde iki nokta arasında karbon kol
    const strut = (a, b, w, y, t) => {
      const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
      const m = box(len, t, w, carbon(len, w), (a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2);
      m.rotation.y = -Math.atan2(dz, dx);
      return m;
    };
    const k = R / 45;                                           // boyut ölçeği (3,5" = 1)
    const propY = 7.5 * Math.max(0.7, k), plateT = cfg.plateMm || 3;
    const plateY = propY + 26 * s, top = plateY + plateT;        // plakanın altı ve üstü
    const fx = Math.abs(pos[0][0]), fz = Math.abs(pos[0][1]);

    // Koruma halkaları: alçak bant, alt kenarı dışa açılır
    const bandH = 13 * Math.max(0.7, k), rTop = R + 2.6 * Math.max(0.7, k), rBot = rTop + 3.6 * Math.max(0.7, k);
    const smoke = cfg.ring === "smoke";
    const ringMat = new THREE.MeshStandardMaterial({ color: C(smoke ? 0x4b5058 : 0x15161a), roughness: smoke ? 0.25 : 0.7, metalness: 0.1,
      transparent: smoke, opacity: smoke ? 0.62 : 1, side: THREE.DoubleSide, depthWrite: !smoke });
    for (const [x, z] of pos) {
      add(new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, bandH, 72, 1, true), ringMat), x, bandH / 2, z);
      for (const [r, y] of [[rTop, bandH], [rBot, 0.6]]) {
        const lip = add(new THREE.Mesh(new THREE.TorusGeometry(r, 1.5 * Math.max(0.7, k), 8, 72), ringMat), x, y, z);
        lip.rotation.x = Math.PI / 2;
      }
      if (cfg.led != null) {                                    // halkanın dış alt kenarında ışık şeridi (COB LED)
        const strip = add(new THREE.Mesh(new THREE.TorusGeometry(rBot + 1.6 * k, 0.9 * Math.max(0.8, k), 6, 72), new THREE.MeshBasicMaterial({ color: cfg.led, transparent: true })), x, 2.4 * k, z);
        strip.rotation.x = Math.PI / 2;
        this.droneLeds.push(strip);
      }
      // Motor yatağı (plakanın ucu)
      cyl(15.5 * s, plateT, carbon(30, 30), x, plateY + plateT / 2, z);
      cyl(4 * s, 0.8, M(cfg.padDot != null ? cfg.padDot : 0xc7ccd3, { metalness: 0.5 }), x, top + 0.3, z);   // motor mili ucu
      for (let i = 0; i < 4; i++) {
        const b = Math.PI / 4 + (i * Math.PI) / 2;
        cyl(1.5 * s, 1, silver, x + Math.cos(b) * 9 * s, top + 0.4, z + Math.sin(b) * 9 * s);
      }
    }

    if (kind === "pavo35") {
      // Kum saati biçimli karbon plaka: orta gövde, burun ve kuyruk, motorlara çapraz kollar
      const cw = 46;
      box(cw, plateT, cw, carbon(cw, cw), 0, plateY + plateT / 2, 0);
      box(26, plateT, 34, carbon(26, 34), fx + 12, plateY + plateT / 2, 0);
      box(22, plateT, 30, carbon(22, 30), -fx - 4, plateY + plateT / 2, 0);
      for (const [x, z] of pos) {
        const xs = Math.sign(x), zs = Math.sign(z);
        strut([xs * 18, zs * 18], [x, z], 13, plateY + plateT / 2, plateT);
        strut([xs * (fx + 6), zs * 10], [x, z], 11, plateY + plateT / 2, plateT);
      }
      // Ortadaki dört yuvarlak pencereden görünen uçuş kartı
      box(40, 1.2, 40, M(0x111827), 0, plateY - 4, 0);
      for (const [x, z] of [[-10, -10], [10, -10], [-10, 10], [10, 10]]) {
        cyl(7.4, 0.5, M(0x1b1f2a), x, top + 0.2, z);
        cyl(1.2, 0.7, M(0xf59e0b), x - 2, top + 0.3, z + 1);
        cyl(1, 0.7, M(0xef4444), x + 2.5, top + 0.3, z - 2);
      }
      // Gri alüminyum "Y" ara parçalar (iki yanda) ve plakanın altındaki gövde
      for (const zs of [-1, 1]) {
        box(12, plateY - bandH, 4, alu, 0, (plateY + bandH) / 2, zs * 25);
        box(26, 3, 4, alu, 0, plateY - 2, zs * 25);
      }
      box(44, 10, 36, black, 0, plateY - 11, 0);
      // Önde XT60 fiş (plakaya gömülü)
      box(15, 6, 8, M(0xeab308), fx - 22, top + 2.6, 0);
      for (const z of [-2.2, 2.2]) cyl(1.5, 6.4, M(0xd4a72c, { metalness: 0.7 }), fx - 22, top + 2.8, z, "x");
      // Batarya (6S 1100 mAh): iki siyah ped üstünde, kayışla bağlı
      for (const x of [-16, 16]) box(14, 2, 34, black, x, top + 1, 0);
      box(72, 30, 34, M(0x1f2328), -6, top + 17, 0);
      const bl = flatLabel(["LiPo 6S", "1100 mAh", "22,2 V"], 24, 26, "#f97316", "#111827");
      bl.position.set(-28, top + 32.1, 0);
      body.add(bl);
      box(16, 31, 35, M(0x111214), -6, top + 17.4, 0);
      // Burun: O3 kamera, lastik takozlu braket ve GoPro tipi iki dişli bağlantı
      const cam = new THREE.Group();
      cam.position.set(fx + 26, plateY - 2, 0);
      cam.rotation.z = 0.28;
      cam.add(new THREE.Mesh(new THREE.BoxGeometry(18, 21, 22), black));
      addLens(cam, 7.2, 10, black);
      body.add(cam);
      for (const zs of [-1, 1]) {
        box(16, 22, 3, black, fx + 22, plateY - 1, zs * 13.5);
        cyl(2.6, 4, M(0x2b2d31), fx + 18, plateY + 4, zs * 13.5, "z");
        const prong = box(4, 13, 3, black, fx + 14, top + 6.5, zs * 4.5);
        prong.castShadow = true;
      }
      cyl(4, 12, black, fx + 14, top + 13, 0, "z");
      // Arka: yukarı-geriye eğik kısa silindir anten, yatay beyaz alıcı anteni
      body.add(capsule([-fx - 8, top, 9], [-fx - 17, top + 13, 9], 1.8, black));
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.2, 18, 24), black);
      ant.position.set(-fx - 22, top + 20, 9);
      ant.rotation.z = 0.6;
      body.add(ant);
      box(14, 8, 26, black, -fx - 8, top + 3, 0);
      cyl(1.1, 62, M(0xf1f5f9), -fx - 12, top + 4, 0, "z");
    }
    if (kind === "pavo20") {
      const y = plateY + plateT / 2;
      // Karbon plaka: iki yan ray (ön ve arka motoru birleştirir), ortada kare gövde ve enine köprü
      for (const zs of [-1, 1]) strut([fx, zs * fz], [-fx, zs * fz], 8, y, plateT);
      box(30, plateT, 30, carbon(30, 30), 0, y, 0);
      box(16, plateT, fz * 2, carbon(16, fz * 2), 0, y, 0);
      // Halkaları birleştiren ince köprüler (ön, arka ve iki yan)
      for (const [x, z] of [[fx, 0], [-fx, 0], [0, fz], [0, -fz]]) box(x ? 8 : 5, bandH * 0.8, x ? 5 : 8, ringMat, x, bandH * 0.45, z);
      // Plakanın altında uçuş kartı (AIO)
      box(27, 1.2, 27, M(0x14181f), 0, plateY - 3.4, 0);
      for (const [x, z] of [[-8, -7], [7, -8], [8, 6], [-6, 8]]) box(4, 1.4, 3, M(0xd4a72c, { metalness: 0.6 }), x, plateY - 4.4, z);
      // Üst kafes: DJI O3 hava ünitesi (yanında eğik havalandırma yarıkları, üstünde "dji" logosu)
      const cy = top + 8.5, cageMat = M(0x17181c, { roughness: 0.55 });
      for (const [x, z] of [[13, 13], [13, -13], [-15, 13], [-15, -13]]) cyl(1.3, 5, alu, x, top + 2.5, z);
      box(36, 11, 30, cageMat, -3, cy, 0);
      for (const zs of [-1, 1]) for (let i = 0; i < 7; i++) {
        const slot = box(4.2, 0.8, 0.5, M(0x3a3d44), -14 + i * 3.2, cy - 0.5, zs * 15.2);
        slot.rotation.z = zs * -0.6;
      }
      box(15, 0.5, 14, M(0x222429), -2, cy + 5.7, 0);
      const djiLogo = label3d(["dji"], 9, 5, null, "#c9ced6");
      djiLogo.rotation.order = "YXZ";
      djiLogo.rotation.set(-Math.PI / 2, -Math.PI / 2, 0);
      add(djiLogo, -2, cy + 6.1, 0);
      for (const zs of [-1, 1]) {
        const pavo = label3d(["PAVO"], 9, 3.2, null, "#8b9099");
        if (zs < 0) pavo.rotation.y = Math.PI;
        add(pavo, 12, cy + 3, zs * 15.15);
      }
      // Burun: kafesin içinde, lastik takozlu O3 kamera
      for (const zs of [-1, 1]) {
        box(16, 13, 2, cageMat, 22, cy - 2.5, zs * 9.6);
        cyl(1.6, 2.6, M(0x2a2c31), 20, cy - 3.5, zs * 9.8, "z");
      }
      box(12, 2, 21, cageMat, 21, cy + 4.5, 0);
      const cam = new THREE.Group();
      cam.position.set(27, cy - 3.5, 0);
      cam.rotation.z = 0.3;
      cam.add(new THREE.Mesh(new THREE.BoxGeometry(12, 14, 16), black));
      addLens(cam, 5.4, 7, black);
      body.add(cam);
      // Arka: "BETAFPV" yazılı anten yuvası, yukarı-geriye eğik uzun sap ve kalın silindir anten
      const holder = box(9, 8, 15, cageMat, -24.5, cy - 0.5, 0);
      holder.rotation.z = 0.35;
      const brand = label3d(["BETAFPV"], 12, 2.8, null, "#9aa0a8");
      brand.rotation.order = "YXZ";
      brand.rotation.set(-Math.PI / 2 + 0.35, -Math.PI / 2, 0);
      add(brand, -25.8, cy + 3.8, 0);
      body.add(capsule([-26, cy + 2, 0], [-44, cy + 27, 0], 1.7, black));
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(8.2, 8.2, 15, 28), black);
      ant.position.set(-48.5, cy + 33.5, 0);
      ant.rotation.z = 0.62;
      body.add(ant);
      // Alta kayışla bağlanan batarya (3S 450 mAh) ve arkadan çıkan kırmızı-siyah XT30 kablosu
      box(50, 11, 17, M(0x1f2328), 0, 6.6, 0);
      const bl = label3d(["LiPo 3S 450 mAh"], 30, 5, "#f97316", "#111827");
      add(bl, -10, 6.6, 8.6);
      box(11, plateY - 0.8, 19.5, M(0x8b9099, { roughness: 0.85 }), 12, (plateY + 0.8) / 2, 0);
      for (const zs of [-1, 1]) {
        const st = label3d(["BETAFPV"], 9.5, 2.6, null, "#111827");
        st.rotation.set(0, zs < 0 ? Math.PI : 0, Math.PI / 2);
        add(st, 12, 7, zs * 9.9);
      }
      body.add(capsule([-25, 7, 1.4], [-47, 7.5, 1.4], 0.9, M(0xdc2626)));
      body.add(capsule([-25, 7, -1.4], [-47, 7.5, -1.4], 0.9, black));
      box(9, 5.5, 7.5, M(0x1a1b1f), -52, 7.6, 0);
    }
    return {
      baseY: 2.2, motorY: plateY, topY: top + (cfg.topMm || 34), attachY: bandH * 0.5, flip: true,
      after: () => {
        for (const u of this.units) {
          u.stripe.visible = false;
          if (motor.ring != null) {                             // çanın pervane tarafındaki ince renkli halka
            const ring = new THREE.Mesh(new THREE.CylinderGeometry(14.9, 14.9, 1.8, 40), M(motor.ring, { roughness: 0.4 }));
            ring.position.y = 19.4;
            u.bell.add(ring);
          }
        }
      }
    };
  },

  /* ---------- Hava akışı parçacıkları (itki) ---------- */
  buildAirflow() {
    const N = 500;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    this.airSeeds = [];
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 55;
      this.airSeeds.push({ a, r, y: Math.random() });
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.air = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x93c5fd, size: 2.2, transparent: true, opacity: 0, depthWrite: false }));
    this.scene.add(this.air);
  },

  /* ---------- Pervane geometrisi (her motora bir pervane) ---------- */
  buildProp(prop, mat, colorSpec) {
    for (const u of this.units) {
      if (u.propGroup) {
        u.pivot.remove(u.propGroup);
        u.propGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
        u.propGroup = null;
      }
    }
    if (this.flyingBlade) { this.scene.remove(this.flyingBlade.mesh); this.flyingBlade = null; }
    if (this.breakLabel) { this.scene.remove(this.breakLabel); this.breakLabel = null; }
    this.debris.forEach((d) => this.scene.remove(d.mesh));
    this.debris = [];
    this.droneFail = null;
    if (this.droneGroup) this.droneGroup.quaternion.identity();

    const R = (prop.diameterIn * 25.4) / 2;
    const r0 = Math.min(6, R * 0.2);                  // göbek yarıçapı (fizik modeliyle aynı)
    const B = prop.blades || 2;                        // kanat sayısı
    const L = R - r0;
    const NS = 28, NC = 14;
    this.blades = [];
    // Renk / yüzey özellikleri (filament görünümü)
    const spec = colorSpec || { mat: true };
    this.setColorSpec(spec, mat);
    const surf = { vertexColors: true, metalness: 0.12, roughness: 0.45, side: THREE.DoubleSide };
    if (spec.metal) Object.assign(surf, { metalness: 0.55, roughness: 0.28 }); // ipek/metalik parlaklık
    if (spec.clear) Object.assign(surf, { transparent: true, opacity: 0.55, roughness: 0.1, metalness: 0 });
    if (spec.glow) Object.assign(surf, { emissive: new THREE.Color(spec.hex), emissiveIntensity: 0.45 });
    this.material = new THREE.MeshStandardMaterial(surf);
    const hubColor = new THREE.Color();
    this.baseColor(0, 0, hubColor);
    const hubMat = new THREE.MeshStandardMaterial(Object.assign({}, surf, { vertexColors: false, color: hubColor }));

    // Kanat kesitleri (tüm pervaneler için ortak taban veri)
    const base = [];       // [s, chordOffset, thickOffset, twist] her köşe için
    const indices = [];
    for (let i = 0; i <= NS; i++) {
      const t = i / NS;
      const s = t * L;
      const r = r0 + s;
      const chord = prop.chordMm * (1 - 0.35 * t) * (t > 0.85 ? Math.sqrt(Math.max(0.05, 1 - ((t - 0.85) / 0.15) ** 2)) : 1);
      const thick = prop.thickMm * (1 - 0.6 * t);
      const pitchMm = prop.pitchIn * 25.4;
      const twist = Math.atan(pitchMm / (2 * Math.PI * Math.max(r, 8)));
      for (let j = 0; j < NC; j++) {
        // Kapalı kanat profili (basit simetrik-kambur profil)
        const u = (j / NC) * Math.PI * 2;
        const cx = (Math.cos(u) * 0.5) * chord;
        const camber = 0.06 * chord * (1 - (2 * cx / chord) ** 2);
        const cz = Math.sin(u) * 0.5 * thick + camber;
        base.push([s, cx, cz, twist]);
      }
    }
    for (let i = 0; i < NS; i++) {
      for (let j = 0; j < NC; j++) {
        const a = i * NC + j, b = i * NC + ((j + 1) % NC), c = (i + 1) * NC + j, d = (i + 1) * NC + ((j + 1) % NC);
        indices.push(a, c, b, b, c, d);
      }
    }

    for (const unit of this.units) {
      const group = new THREE.Group();
      // Ters dönen motorlarda ayna pervane (CCW): kanat burulması tersine çevrilir
      // Motor gövdesi ölçeklendiği için pervane gerçek boyutunda kalsın (1/s); ters dönende z aynası
      group.scale.set(1 / unit.s, 1 / unit.s, (unit.dir < 0 ? -1 : 1) / unit.s);
      if (unit.flip) group.rotation.x = Math.PI;          // ters asılı motorda pervane yine yukarı itki verecek yönde durur
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(r0 + 1, r0 + 1, Math.min(7, R * 0.28), 32), hubMat);
      hub.castShadow = true;
      group.add(hub);
      if (unit.markA) {
        const mark = new THREE.Mesh(new THREE.TorusGeometry(r0 * 0.75, 0.7, 6, 24), new THREE.MeshBasicMaterial({ color: unit.markColor || 0xff2d3d }));
        mark.rotation.x = Math.PI / 2;
        mark.position.y = Math.min(7, R * 0.28) / 2 + 0.2;
        group.add(mark);
      }
      unit.blades = [];
      for (let bi = 0; bi < B; bi++) {
        const n = (NS + 1) * NC * 3;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(n), 3));
        geo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(n).fill(1), 3));
        geo.setIndex(indices);
        const mesh = new THREE.Mesh(geo, this.material);
        mesh.castShadow = true;
        const holder = new THREE.Group();
        holder.rotation.y = (bi * 2 * Math.PI) / B;
        holder.add(mesh);
        // Kök uyarı halkası: kırılma sınırına yaklaşınca kırmızı yanıp söner
        const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.max(2.5, prop.chordMm * 0.45), Math.min(0.9, R * 0.03), 8, 28),
          new THREE.MeshBasicMaterial({ color: 0xff2d2d, transparent: true, opacity: 0, depthWrite: false }));
        ring.rotation.y = Math.PI / 2;
        ring.position.x = r0 + 3;
        holder.add(ring);
        group.add(holder);
        const bl = { mesh, holder, ring, base, NS, NC, L, r0, index: bi, unit };
        unit.blades.push(bl);
        this.blades.push(bl);
      }
      unit.pivot.add(group);
      unit.propGroup = group;
    }
    this.R = R;
    this.deform(0, 0, 0, false);
  },

  /** Seçilen filament rengini (düz, gökkuşağı, çift renk) hazırlar */
  setColorSpec(spec, mat) {
    this.colorSpec = spec;
    // Renkler ekranda doğru (soluk değil) görünsün diye sRGB → doğrusal dönüşüm
    const hex = (h) => new THREE.Color(h).convertSRGBToLinear();
    if (spec.gradient) this._grad = spec.gradient.map(hex);
    else if (spec.duo) this._duo = spec.duo.map(hex);
    else this._solid = hex(spec.mat ? mat.color : spec.hex);
  },
  /** Kanat (bi) ve kök→uç konumuna (t: 0–1) göre pervanenin kendi rengi */
  baseColor(bi, t, out) {
    const s = this.colorSpec || {};
    if (s.gradient) {
      const g = this._grad, x = Math.min(0.9999, Math.max(0, t)) * (g.length - 1), i = Math.floor(x);
      return out.copy(g[i]).lerp(g[i + 1], x - i);
    }
    if (s.duo) return out.copy(this._duo[bi % 2]);
    return out.copy(this._solid).lerp(new THREE.Color(0xffffff), 0.06 * (1 - t));
  },

  /** Rapor için 3D görüntünün anlık PNG'si */
  snapshot() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  },

  /**
   * Kanatları büker ve renklendirir.
   * tipDeflMm : uç sehimi (mm, abartma uygulanmış)
   * stressRatio: kök gerilmesi / dayanım
   * plastic   : kalıcı bükülme (mm)
   */
  deform(tipDeflMm, stressRatio, plastic, heatmap) {
    if (!this.blades) return;
    const color = new THREE.Color();
    for (const bl of this.blades) {
      if (bl.detached) continue;
      const pos = bl.mesh.geometry.attributes.position;
      const col = bl.mesh.geometry.attributes.color;
      const L = bl.L;
      const totalTip = tipDeflMm + plastic;
      // Ankastre kiriş eğrisi: w(s) = δ · s²(3L − s) / (2L³) → eğim açısı
      // Yay boyu korunarak (büyük esnemede doğru görünüm) konum hesaplanır
      const NS = bl.NS, NC = bl.NC;
      const xs = [0], zs = [0];
      let x = 0, z = 0;
      const ds = L / NS;
      for (let i = 1; i <= NS; i++) {
        const sMid = (i - 0.5) * ds;
        const slope = (totalTip * 3 * sMid * (2 * L - sMid)) / (2 * L ** 3); // dw/ds
        const ang = Math.atan(slope);
        x += Math.cos(ang) * ds;
        z += Math.sin(ang) * ds;
        xs.push(x); zs.push(z);
      }
      for (let i = 0; i <= NS; i++) {
        const sNode = i * ds;
        const slope = (totalTip * 3 * sNode * (2 * L - sNode)) / (2 * L ** 3);
        const ang = Math.atan(slope);
        const tNorm = i / NS;
        const local = Math.max(0, stressRatio * Math.pow(1 - tNorm, 1.15));
        // Pervanenin kendi rengi; gerilme arttıkça zorlanan bölge sarı → kırmızıya döner
        this.baseColor(bl.index, tNorm, color);
        if (heatmap) {
          const f = smoothstep(0.3, 0.92, local);
          if (f > 0) color.lerp(heatColor(local, this._heat || (this._heat = new THREE.Color())), f);
        }
        for (let j = 0; j < NC; j++) {
          const k = i * NC + j;
          const [, cx, cz, twist] = bl.base[k];
          // Burulma (hatve açısı) uygula
          const yy = cx * Math.cos(twist) - cz * Math.sin(twist);
          const zz = cx * Math.sin(twist) + cz * Math.cos(twist);
          // Bükülmüş eksene göre kesiti yerleştir
          const px = bl.r0 + xs[i] - zz * Math.sin(ang);
          const pz = zs[i] + zz * Math.cos(ang);
          pos.setXYZ(k, px, pz, yy);
          col.setXYZ(k, color.r, color.g, color.b);
        }
      }
      // Kök uyarı halkası: gerilme %75'i aşınca yanıp söner
      if (bl.ring) {
        const warn = Math.max(0, (stressRatio - 0.75) / 0.25);
        bl.ring.material.opacity = heatmap && warn > 0 ? Math.min(1, warn) * (0.45 + 0.45 * Math.sin(performance.now() / 70)) : 0;
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
      bl.mesh.geometry.computeVertexNormals();
      bl.mesh.geometry.computeBoundingSphere();
    }
  },

  /** Kırılma: bir kanat kökten kopar ve fırlar (drone'da rastgele bir motorun pervanesi) */
  breakBlade(rpm) {
    const intact = this.units.filter((u) => u.blades && u.blades.every((b) => !b.detached));
    const unit = this.mode !== "stand" && intact.length ? intact[Math.floor(Math.random() * intact.length)] : this.units[0];
    const bl = unit && unit.blades && unit.blades.find((b) => !b.detached);
    if (!bl) return;
    bl.detached = true;
    this.brokenLabel = unit.label || "";
    // Kırılma noktası işareti: kopan kanadın kökünde sabit kırmızı halka + etiket
    if (bl.ring) { bl.ring.material.opacity = 1; bl.ring.material.color.set(0xff1f3d); bl.ring.scale.setScalar(1.25); }
    const rootPos = new THREE.Vector3(bl.r0 + 3, 0, 0);
    bl.holder.localToWorld(rootPos);
    this.breakLabel = makeLabel(this.mode !== "stand" ? `💥 Kırılma noktası: ${unit.label || "motor"} · kanat kökü` : "💥 Kırılma noktası: kanat kökü", "#ff4d6d");
    this.breakLabel.position.copy(rootPos).add(new THREE.Vector3(0, 10 + 24 * Math.min(1, this.R / 63), 0));
    this.breakLabel.scale.multiplyScalar(Math.max(0.45, Math.min(1, this.R / 63)));
    this.scene.add(this.breakLabel);
    // Dünya konumunu koruyarak sahneye taşı
    const mesh = bl.mesh;
    mesh.updateMatrixWorld();
    const world = new THREE.Matrix4().copy(mesh.matrixWorld);
    bl.holder.remove(mesh);
    mesh.matrix.copy(world);
    mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    this.scene.add(mesh);
    const tangential = new THREE.Vector3(1, 0, 0).applyQuaternion(mesh.quaternion).cross(new THREE.Vector3(0, 1, 0)).normalize();
    const v = Math.min(900, (rpm / 60) * 2 * Math.PI * (this.R * 0.5) * 0.004); // görsel ölçekli
    this.flyingBlade = { mesh, vel: tangential.multiplyScalar(-v * unit.dir).add(new THREE.Vector3(0, 40, 0)), spin: new THREE.Vector3(Math.random() * 18, 24, Math.random() * 12) };
    // Kırık parçacıkları
    const shardColor = new THREE.Color();
    this.baseColor(bl.index, 0.5, shardColor);
    const shardMat = new THREE.MeshStandardMaterial({ color: shardColor, roughness: 0.5, metalness: this.material.metalness });
    const origin = new THREE.Vector3();
    unit.pivot.getWorldPosition(origin);
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(new THREE.TetrahedronGeometry((0.8 + Math.random() * 1.8) * Math.max(0.4, Math.min(1, this.R / 63))), shardMat);
      m.position.copy(origin).add(new THREE.Vector3((Math.random() - 0.5) * this.R * 0.25, Math.random() * 6, (Math.random() - 0.5) * this.R * 0.25));
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize();
      this.debris.push({ mesh: m, vel: dir.multiplyScalar(80 + Math.random() * 220), spin: Math.random() * 20, life: 3 + Math.random() * 2 });
      this.scene.add(m);
    }
    // Drone: itkisini kaybeden köşeye doğru yatar, kendi ekseninde savrulur ve pede düşer
    if (this.mode !== "stand") {
      const p = unit.home;
      this.droneFail = { t: 0, axis: new THREE.Vector3(p.z, 0, -p.x).normalize(), yaw: 0, spinDir: -unit.dir };
    }
    this.shake = 1;
    this.flash = 1;
  },

  /**
   * Her karede çağrılır.
   * extra (drone): { tw } → toplam itki / ağırlık oranı (kalkış ve ip gerginliği için)
   */
  frame(dt, rpm, thrustNorm, extra) {
    // Kontrol kartı: ekranda devir, potansiyometre gaza göre döner (0 → −135°, %100 → +135°)
    if (this.oled) this.drawOled(rpm, this.throttle || 0);
    if (this.potKnob) {
      const want = -((-135 + 270 * Math.min(1, Math.max(0, this.throttle || 0))) * Math.PI) / 180;
      this.potKnob.rotation.y += (want - this.potKnob.rotation.y) * Math.min(1, dt * 12);
    }
    // Bakış açısı geçişi
    if (this.viewAnim) {
      const v = this.viewAnim, o = this.orbit, k = Math.min(1, dt * 5);
      o.theta += (v.theta - o.theta) * k; o.phi += (v.phi - o.phi) * k; o.dist += (v.dist - o.dist) * k;
      o.target.lerp(new THREE.Vector3(v.target[0], v.target[1], v.target[2]), k);
      if (Math.abs(v.theta - o.theta) + Math.abs(v.phi - o.phi) < 0.002 && Math.abs(v.dist - o.dist) < 0.5) this.viewAnim = null;
      this.updateCamera();
    }
    // Görsel dönüş hızı: gerçek devir ekranda izlenemeyecek kadar yüksek → ölçeklendi
    const visOmega = Math.min(55, (rpm / 60) * 2 * Math.PI * 0.035);
    this.angle += visOmega * dt;
    const blurOp = Math.min(0.32, rpm / 90000);
    for (const u of this.units) {
      u.bell.rotation.y = this.angle * u.dir * (u.flip ? -1 : 1);
      const whole = u.blades && u.blades.every((b) => !b.detached);
      u.blur.material.opacity = whole ? blurOp : blurOp * 0.5;
      u.blur.scale.setScalar((this.R || 64) / 64 / u.s);
    }

    // Dengesizlik titreşimi (kanat kopunca)
    this.shake *= Math.pow(0.4, dt);
    const unbalanced = this.blades && this.blades.some((b) => b.detached);
    const vib = (unbalanced ? Math.min(1, rpm / 8000) * 1.8 : 0) + this.shake * 2.5;
    if (this.mode !== "stand") this.updateDrone(dt, rpm, extra || {}, vib);
    else {
      const u = this.units[0];
      u.group.position.x = u.home.x + (Math.random() - 0.5) * vib;
      u.group.position.z = u.home.z + (Math.random() - 0.5) * vib;
      // Yük hücresi itkiyle hafifçe esner (görsel)
      if (this.loadCell) this.loadCell.scale.y = 1 - Math.min(0.12, thrustNorm * 0.08);
    }

    // Hava akışı: her pervanenin altından aşağı doğru (parçacıklar motorlara paylaştırılır)
    const posAttr = this.air.geometry.attributes.position;
    const speed = Math.min(1.6, rpm / 25000);
    this.air.material.opacity = Math.min(0.75, speed * 0.6);
    const tops = this.units.map((u) => u.pivot.getWorldPosition(new THREE.Vector3()));
    const drone = this.mode !== "stand";
    for (let i = 0; i < this.airSeeds.length; i++) {
      const s = this.airSeeds[i];
      const top = tops[i % tops.length];
      s.y += dt * speed * (0.6 + (i % 7) * 0.08);
      if (s.y > 1) { s.y -= 1; s.a = Math.random() * Math.PI * 2; s.r = 8 + Math.random() * (this.R || 60) * 0.9; }
      const len = Math.max(30, Math.min(120, top.y - 3));
      // Akış daralması (vena contracta); drone'da yere çarpınca yanlara yayılır
      const contract = drone ? 1 - 0.25 * s.y + 1.6 * Math.pow(s.y, 4) : 1 - 0.35 * s.y;
      const a = s.a + this.angle * 0.15;
      posAttr.setXYZ(i, top.x + Math.cos(a) * s.r * contract, Math.max(2.5, top.y - 4 - s.y * len), top.z + Math.sin(a) * s.r * contract);
    }
    posAttr.needsUpdate = true;

    // Fırlayan kanat
    if (this.flyingBlade) {
      const f = this.flyingBlade;
      f.vel.y -= 380 * dt;
      f.vel.multiplyScalar(Math.pow(0.6, dt));
      f.mesh.position.addScaledVector(f.vel, dt);
      f.mesh.rotation.x += f.spin.x * dt; f.mesh.rotation.y += f.spin.y * dt; f.mesh.rotation.z += f.spin.z * dt;
      if (f.mesh.position.y < 3) { f.mesh.position.y = 3; f.vel.y *= -0.3; f.vel.x *= 0.6; f.vel.z *= 0.6; f.spin.multiplyScalar(0.6); }
    }
    for (const d of this.debris) {
      d.vel.y -= 380 * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      d.mesh.rotation.x += d.spin * dt;
      if (d.mesh.position.y < 1) { d.mesh.position.y = 1; d.vel.multiplyScalar(0.3); d.vel.y = Math.abs(d.vel.y) * 0.2; }
    }

    // Kırılma flaşı
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 2);
      this.renderer.setClearColor(0xff3b3b, this.flash * 0.35);
    } else this.renderer.setClearColor(this.mode === "fly" ? 0x9fd3f7 : 0x000000, this.mode === "fly" ? 1 : 0);

    this.renderer.render(this.scene, this.camera);
  },

  /* ---------- Uçuş bölümü: açık alan, halkalar, ağaçlar ---------- */
  buildFlyWorld() {
    const g = this.rig, span = this.droneSpan;
    const C = (h) => new THREE.Color(h).convertSRGBToLinear();
    const M = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color: C(color), roughness: 0.8 }, o || {}));
    const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.castShadow = true; g.add(mesh); return mesh; };
    // Çim alan
    const tex = grassTexture();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(30, 30);
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const ground = new THREE.Mesh(new THREE.CircleGeometry(14000, 96), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    g.add(ground);
    // Alan sınırı: kırmızı çizgi ve direkler
    const edge = new THREE.Mesh(new THREE.RingGeometry(8380, 8460, 128), new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide }));
    edge.rotation.x = -Math.PI / 2;
    edge.position.y = 1.5;
    g.add(edge);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      add(new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 520, 12), M(i % 2 ? 0xffffff : 0xef4444)), Math.cos(a) * 8420, 260, Math.sin(a) * 8420);
    }
    // Halkalar: daire üzerinde sıralı bir parkur; içinden geçilince yeşile döner
    const gr = Math.max(430, span * 2.6), R = 3300, N = 6;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + 0.55;
      const cx = Math.cos(a) * R, cz = Math.sin(a) * R, cy = gr + 260 + (i % 3) * 420;
      const ringMat = new THREE.MeshStandardMaterial({ color: C(0xf97316), emissive: C(0x7c2d12), roughness: 0.45 });
      const ring = add(new THREE.Mesh(new THREE.TorusGeometry(gr, gr * 0.065, 14, 56), ringMat), cx, cy, cz);
      ring.rotation.y = -a;                                   // halka düzlemi parkur yönüne dik
      for (const sgn of [-1, 1]) {
        const px = cx + Math.cos(a) * gr * sgn, pz = cz + Math.sin(a) * gr * sgn;
        add(new THREE.Mesh(new THREE.CylinderGeometry(gr * 0.035, gr * 0.045, cy, 12), M(0x475569, { metalness: 0.5, roughness: 0.4 })), px, cy / 2, pz);
      }
      const label = makeLabel(String(i + 1), "#f97316");
      label.scale.multiplyScalar(gr / 55);
      label.position.set(cx, cy + gr * 1.28, cz);
      g.add(label);
      this.flyGates.push({ mesh: ring, c: new THREE.Vector3(cx, cy, cz), n: new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)), r: gr * 0.94, passed: false, base: ringMat.color.clone(), baseE: ringMat.emissive.clone() });
    }
    // Ağaçlar (her açılışta aynı yerde olsun diye sabit sayı üreteci)
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const trunk = M(0x7c4a21), leaf1 = M(0x15803d), leaf2 = M(0x16a34a);
    for (let i = 0; i < 34; i++) {
      const a = rnd() * Math.PI * 2, r = 5200 + rnd() * 2900, k = 0.7 + rnd() * 0.9;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      add(new THREE.Mesh(new THREE.CylinderGeometry(45 * k, 60 * k, 520 * k, 10), trunk), x, 260 * k, z);
      add(new THREE.Mesh(new THREE.ConeGeometry(420 * k, 950 * k, 12), i % 2 ? leaf1 : leaf2), x, 520 * k + 420 * k, z);
      add(new THREE.Mesh(new THREE.ConeGeometry(300 * k, 760 * k, 12), i % 2 ? leaf2 : leaf1), x, 520 * k + 950 * k, z);
    }
    // Parkur konileri ve birkaç konteyner (ölçek için)
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      add(new THREE.Mesh(new THREE.ConeGeometry(70, 190, 14), M(0xf97316)), Math.cos(a) * 2100, 95, Math.sin(a) * 2100);
    }
    [[5200, -900, 0x2563eb], [-4700, 2600, 0xdc2626], [-1500, -5200, 0xf59e0b]].forEach(([x, z, c], i) => {
      const box = add(new THREE.Mesh(new THREE.BoxGeometry(1900, 800, 760), M(c, { metalness: 0.3, roughness: 0.55 })), x, 400, z);
      box.rotation.y = i * 0.9;
    });
  },

  /** Uçuş bölümü: gövde konumu/eğimi Fly.push() ile gelir; ışık ve kamera drone'u izler */
  updateFly(dt, vib) {
    const f = this.flyPose || { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 };
    const body = this.droneGroup, y = this.droneBaseY + f.y;
    body.position.set(f.x + (Math.random() - 0.5) * vib, y, f.z + (Math.random() - 0.5) * vib);
    body.rotation.set(f.roll, f.yaw, f.pitch, "YXZ");
    this._t = (this._t || 0) + dt;
    const blink = f.crashed ? (Math.sin(this._t * 18) > 0 ? 1 : 0.15) : 1;
    for (const led of this.droneLeds || []) led.material.opacity = blink;
    this.keyLight.position.set(f.x + 800, y + 1300, f.z + 700);
    this.keyLight.target.position.set(f.x, y, f.z);
    // Kamera: hedef drone; "takip" görünümünde kamera drone'un arkasına döner
    const o = this.orbit;
    o.target.lerp(new THREE.Vector3(f.x, y + 20, f.z), Math.min(1, dt * 9));
    if (this.viewName !== "side") {
      const want = f.yaw - Math.PI / 2;
      o.theta += Math.atan2(Math.sin(want - o.theta), Math.cos(want - o.theta)) * Math.min(1, dt * 3.5);
    }
    this.updateCamera();
  },

  /** Drone gövdesi: itki/ağırlık > 1 olunca kalkar, ip gerilir; pervane kırılınca yatıp düşer */
  updateDrone(dt, rpm, extra, vib) {
    const body = this.droneGroup;
    if (!body) return;
    if (this.mode === "fly") return this.updateFly(dt, vib);
    const tw = extra.tw || 0;
    const fail = this.droneFail;
    const target = fail ? 0 : smoothstep(0.9, 1.3, tw) * this.tetherMm;
    this.lift += (target - this.lift) * Math.min(1, dt * (fail ? 7 : 2.2));
    this._t = (this._t || 0) + dt;
    const q = body.quaternion;
    let rest = 0;
    if (fail) {
      fail.t += dt;
      const k = smoothstep(0, 0.35, fail.t);
      const tilt = 0.16 * k;
      // Tek motor itkisi kesilince ters tork → gövde kendi ekseninde savrulur, sonra durur
      fail.yaw += dt * fail.spinDir * 5 * Math.max(0, 1 - fail.t / 1.4) * Math.min(1, rpm / 6000 + 0.3);
      q.setFromAxisAngle(fail.axis, tilt);
      q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), fail.yaw));
      rest = Math.sin(tilt) * this.droneRm * 0.6;                       // yatınca gövde merkezi biraz yukarıda kalır
    } else {
      // Askıda hafif salınım (ip gergin)
      const h = this.lift / this.tetherMm;
      q.setFromEuler(new THREE.Euler(Math.sin(this._t * 2.3) * 0.015 * h, 0, Math.cos(this._t * 1.7) * 0.015 * h));
    }
    body.position.set((Math.random() - 0.5) * vib, this.droneBaseY + this.lift + rest + (Math.random() - 0.5) * vib * 0.5, (Math.random() - 0.5) * vib);
    // LED'ler: çalışırken yanar, kırılınca kırmızı yanıp söner
    const blink = fail ? (Math.sin(this._t * 18) > 0 ? 1 : 0.15) : 1;
    for (const led of this.droneLeds || []) led.material.opacity = blink;

    // Bağlama ipleri: pedden kolların ucuna
    body.updateMatrixWorld();
    const arr = this.tether.geometry.attributes.position;
    const v = new THREE.Vector3();
    this.units.forEach((u, i) => {
      const a = this.tetherAnchors[i];
      v.set(u.home.x, typeof this.tetherAttachY === "function" ? this.tetherAttachY(u) : this.tetherAttachY, u.home.z).applyMatrix4(body.matrix);
      arr.setXYZ(i * 2, a.x, a.y, a.z);
      arr.setXYZ(i * 2 + 1, v.x, v.y, v.z);
    });
    arr.needsUpdate = true;
  }
};

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Yan profili (x, y noktaları) z ekseninde uzatılmış, kenarları yumuşatılmış gövde parçası */
function prism(pts, depth, bevel, mat) {
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, steps: 1 });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

/** Yeşil kesim matı dokusu: cm kareleri, 5 cm çizgileri, kenar cetveli, açı çizgileri */
function cuttingMatTexture(wMm, dMm) {
  const k = 2048 / wMm;                                  // piksel / mm
  const c = document.createElement("canvas");
  c.width = 2048; c.height = Math.round(dMm * k);
  const ctx = c.getContext("2d"), w = c.width, h = c.height;
  const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.1, w / 2, h / 2, w * 0.62);
  g.addColorStop(0, "#27a567"); g.addColorStop(1, "#16784a");
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const m = 30 * k;                                      // kenar boşluğu (30 mm)
  const line = (x0, y0, x1, y1) => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
  // Izgara: merkezden dışa, 10 mm'de bir ince, 50 mm'de bir kalın
  const cx = w / 2, cy = h / 2, nx = Math.floor((wMm / 2 - 30) / 10), ny = Math.floor((dMm / 2 - 30) / 10);
  for (let i = -nx; i <= nx; i++) {
    const big = i % 5 === 0;
    ctx.strokeStyle = big ? "rgba(235,255,240,.62)" : "rgba(235,255,240,.2)"; ctx.lineWidth = big ? 2.2 : 1;
    line(cx + i * 10 * k, cy - ny * 10 * k, cx + i * 10 * k, cy + ny * 10 * k);
  }
  for (let j = -ny; j <= ny; j++) {
    const big = j % 5 === 0;
    ctx.strokeStyle = big ? "rgba(235,255,240,.62)" : "rgba(235,255,240,.2)"; ctx.lineWidth = big ? 2.2 : 1;
    line(cx - nx * 10 * k, cy + j * 10 * k, cx + nx * 10 * k, cy + j * 10 * k);
  }
  // Açı çizgileri (30°, 45°, 60°) ve merkez daireleri
  ctx.strokeStyle = "rgba(255,236,150,.55)"; ctx.lineWidth = 1.6;
  const x0 = cx - nx * 10 * k, y1 = cy + ny * 10 * k, len = ny * 20 * k;
  for (const deg of [30, 45, 60]) { const a = (deg * Math.PI) / 180; line(x0, y1, x0 + Math.cos(a) * len * 1.2, y1 - Math.sin(a) * len * 1.2); }
  for (const r of [50, 100, 150, 200]) { ctx.beginPath(); ctx.arc(cx, cy, r * k, 0, Math.PI * 2); ctx.stroke(); }
  // Çerçeve ve cetvel rakamları (cm)
  ctx.strokeStyle = "rgba(245,255,248,.85)"; ctx.lineWidth = 3;
  ctx.strokeRect(cx - nx * 10 * k, cy - ny * 10 * k, nx * 20 * k, ny * 20 * k);
  ctx.fillStyle = "rgba(245,255,248,.9)"; ctx.font = `600 ${Math.round(9 * k)}px Segoe UI, system-ui, sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (let i = -nx; i <= nx; i += 5) { ctx.fillText(String((i + nx) ), cx + i * 10 * k, cy + ny * 10 * k + m * 0.45); ctx.fillText(String(i + nx), cx + i * 10 * k, cy - ny * 10 * k - m * 0.45); }
  for (let j = -ny; j <= ny; j += 5) { ctx.fillText(String(ny - j), cx - nx * 10 * k - m * 0.5, cy + j * 10 * k); ctx.fillText(String(ny - j), cx + nx * 10 * k + m * 0.5, cy + j * 10 * k); }
  ctx.font = `700 ${Math.round(8 * k)}px Segoe UI, system-ui, sans-serif`; ctx.textAlign = "left";
  ctx.fillStyle = "rgba(245,255,248,.7)";
  ctx.fillText("PERVANE TEST LABORATUVARI  ·  KESİM MATI  ·  1 kare = 1 cm", cx - nx * 10 * k, h - m * 0.28 + 4);
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

/** Yatay yüzeye yatık etiket (satır satır yazı, renkli zemin) */
function flatLabel(lines, wMm, dMm, bg, fg) {
  const k = 16, c = document.createElement("canvas");
  c.width = Math.round(wMm * k); c.height = Math.round(dMm * k);
  const ctx = c.getContext("2d");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = fg; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const rowH = c.height / lines.length;
  lines.forEach((t, i) => {
    let size = Math.min(rowH * (i === 0 ? 0.78 : 0.6), 200);
    ctx.font = `800 ${size}px Segoe UI, system-ui, sans-serif`;
    while (ctx.measureText(t).width > c.width * 0.92 && size > 8) { size -= 2; ctx.font = `800 ${size}px Segoe UI, system-ui, sans-serif`; }
    ctx.fillText(t, c.width / 2, rowH * (i + 0.5));
  });
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(wMm, dMm), new THREE.MeshBasicMaterial({ map: tex }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

/** Çim dokusu (uçuş alanı): yeşil zemin, benekler ve soluk kareler */
function grassTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#3f9b4b"; ctx.fillRect(0, 0, 256, 256);
  let s = 11;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = ["#368a42", "#4bab57", "#2f7d3a", "#58b863"][i % 4];
    ctx.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 3, 1 + rnd() * 3);
  }
  ctx.strokeStyle = "rgba(255,255,255,.16)"; ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

/** Dik yüzeye yapıştırılan yazı (+z'ye bakar). bg null ise zemin saydamdır; yazı dışında bir şey görünmez. */
function label3d(lines, wMm, hMm, bg, fg, weight) {
  const k = 20, c = document.createElement("canvas");
  c.width = Math.round(wMm * k); c.height = Math.round(hMm * k);
  const ctx = c.getContext("2d");
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height); }
  ctx.fillStyle = fg; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const rowH = c.height / lines.length;
  lines.forEach((t, i) => {
    // Satır düz yazı ya da [yazı, renk] parçaları olabilir ("AVATA 2"deki turuncu 2 gibi)
    const parts = Array.isArray(t) ? t : [[t, fg]], whole = parts.map((q) => q[0]).join("");
    let size = rowH * 0.86;
    const font = () => `${weight || 800} ${size}px "Segoe UI", system-ui, sans-serif`;
    ctx.font = font();
    while (ctx.measureText(whole).width > c.width * 0.94 && size > 8) { size -= 2; ctx.font = font(); }
    let x = (c.width - ctx.measureText(whole).width) / 2;
    ctx.textAlign = "left";
    for (const [txt, color] of parts) { ctx.fillStyle = color; ctx.fillText(txt, x, rowH * (i + 0.52)); x += ctx.measureText(txt).width; }
  });
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 8;
  return new THREE.Mesh(new THREE.PlaneGeometry(wMm, hMm), new THREE.MeshBasicMaterial({ map: tex, transparent: !bg, depthWrite: !!bg }));
}

/** İki nokta arasında yuvarlak uçlu çubuk (kol, boru, anten sapı) */
function capsule(a, b, r, mat) {
  const A = new THREE.Vector3(a[0], a[1], a[2]), B = new THREE.Vector3(b[0], b[1], b[2]), dir = B.clone().sub(A);
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, dir.length(), 6, 16), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

/** Karbon fiber dokusu (çapraz örgü), tekrar eden küçük desen */
let _carbonTex = null;
function carbonTexture() {
  if (_carbonTex) return _carbonTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#14161a"; ctx.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const on = ((x + y) >> 1) % 2 === 0;                       // 2×2 çapraz (twill) örgü
    const g = ctx.createLinearGradient(x * 8, y * 8, x * 8 + 8, y * 8 + 8);
    g.addColorStop(0, on ? "#3a3e46" : "#1b1d22"); g.addColorStop(1, on ? "#23262c" : "#2c2f36");
    ctx.fillStyle = g; ctx.fillRect(x * 8, y * 8, 8, 8);
  }
  _carbonTex = new THREE.CanvasTexture(c);
  _carbonTex.encoding = THREE.sRGBEncoding;
  return _carbonTex;
}

/** Kamera merceği (+x yönüne bakan) */
function addLens(group, r, x, mat) {
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.07, r * 1.3, 24), mat);
  lens.rotation.z = -Math.PI / 2;
  lens.position.x = x;
  group.add(lens);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(r * 0.72, 24), new THREE.MeshStandardMaterial({ color: 0x1e40af, metalness: 0.9, roughness: 0.05, emissive: 0x0b1a4a }));
  glass.rotation.y = Math.PI / 2;
  glass.position.x = x + r * 0.66;
  group.add(glass);
}

/** Açık renk mi? (yazı rengini seçmek için) */
function isLight(hex) {
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

/** Motor çanının çevresine sarılan yazı dokusu ("2207  1950KV" gibi), iki kez tekrarlanır */
const _motorLabelCache = {};
function motorLabelTexture(text, color) {
  const key = text + "|" + color;
  if (_motorLabelCache[key]) return _motorLabelCache[key];
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 96;
  const ctx = c.getContext("2d");
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let size = 60;
  ctx.font = `800 ${size}px Segoe UI, system-ui, sans-serif`;
  while (ctx.measureText(text).width > 470 && size > 24) { size -= 2; ctx.font = `800 ${size}px Segoe UI, system-ui, sans-serif`; }
  ctx.fillText(text, 256, 50);
  ctx.fillText(text, 768, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 4;
  return (_motorLabelCache[key] = tex);
}

/** Zemine yatık yazı (iniş pedindeki "H" gibi) */
function makeFlatText(text, color, sizeMm) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = color;
  ctx.font = "bold 220px Segoe UI, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 128, 140);
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(sizeMm, sizeMm), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

/** 3D sahnede her zaman kameraya bakan yazı etiketi */
function makeLabel(text, color) {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  ctx.font = "bold 44px Segoe UI, system-ui, sans-serif";
  const w = Math.ceil(ctx.measureText(text).width) + 48;
  c.width = w; c.height = 84;
  ctx.font = "bold 44px Segoe UI, system-ui, sans-serif";
  ctx.fillStyle = "rgba(10,13,24,.85)";
  ctx.strokeStyle = color; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(3, 3, w - 6, 78, 22) : ctx.rect(3, 3, w - 6, 78); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#fff"; ctx.textBaseline = "middle";
  ctx.fillText(text, 24, 44);
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(w / 6, 84 / 6, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/** Gerilme oranına göre renk: yeşil → sarı → turuncu → kırmızı */
function heatColor(x, out) {
  const stops = [[0, 0x22c55e], [0.5, 0xeab308], [0.8, 0xf97316], [1, 0xef4444]];
  x = Math.max(0, Math.min(1.05, x));
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0] || i === stops.length - 1) {
      const [x0, c0] = stops[i - 1], [x1, c1] = stops[i];
      const t = Math.min(1, (x - x0) / (x1 - x0));
      return out.set(c0).lerp(new THREE.Color(c1), t).convertSRGBToLinear();
    }
  }
  return out;
}
