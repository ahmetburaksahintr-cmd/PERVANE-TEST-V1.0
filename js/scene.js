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
    this.scene.add(new THREE.HemisphereLight(0xdbe4ff, 0x20232e, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 1.0);
    key.position.set(160, 260, 140);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -200, right: 200, top: 200, bottom: -200 });
    this.scene.add(key);
    const rim = new THREE.PointLight(0x7c8cff, 0.8, 600);
    rim.position.set(-160, 120, -120);
    this.scene.add(rim);

    this.buildStand();
    this.buildMotor();
    this.buildAirflow();
    this.debris = [];
    this.flyingBlade = null;
    this.angle = 0;
    this.shake = 0;
    this.bindControls();
    window.addEventListener("resize", () => this.resize());
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
    el.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId); });
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
      this.orbit.dist = Math.min(900, Math.max(120, this.orbit.dist * (1 + Math.sign(e.deltaY) * 0.08)));
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

    const floor = new THREE.Mesh(new THREE.CircleGeometry(420, 64), new THREE.MeshStandardMaterial({ color: 0x151927, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const grid = new THREE.PolarGridHelper(400, 16, 8, 64, 0x2c3350, 0x232a40);
    grid.position.y = 0.2;
    this.scene.add(grid);

    // Taban plakası
    const base = new THREE.Mesh(new THREE.BoxGeometry(150, 8, 90), dark);
    base.position.set(0, 4, 0);
    base.castShadow = base.receiveShadow = true;
    this.scene.add(base);
    // Dikey alüminyum profil
    const post = new THREE.Mesh(new THREE.BoxGeometry(20, 70, 20), alu);
    post.position.set(-50, 43, 0);
    post.castShadow = true;
    this.scene.add(post);
    // Yük hücresi (load cell) – itkiyi ölçen sensör
    const cell = new THREE.Mesh(new THREE.BoxGeometry(80, 12.7, 12.7), alu);
    cell.position.set(-10, 84, 0);
    cell.castShadow = true;
    this.scene.add(cell);
    const label = new THREE.Mesh(new THREE.BoxGeometry(24, 13, 13.2), new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.5 }));
    label.position.set(-10, 84, 0);
    this.scene.add(label);
    const wire = new THREE.Mesh(new THREE.TorusGeometry(30, 1.6, 8, 40, Math.PI), new THREE.MeshStandardMaterial({ color: 0xef4444 }));
    wire.position.set(-62, 70, 18);
    wire.rotation.y = Math.PI / 2;
    this.scene.add(wire);
    // Motor bağlantı plakası
    const mount = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 4, 32), metal);
    mount.position.set(30, 92, 0);
    mount.castShadow = true;
    this.scene.add(mount);
    this.loadCell = cell;
  },

  /* ---------- Fırçasız motor ---------- */
  buildMotor() {
    const g = new THREE.Group();
    g.position.set(30, 94, 0);
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
    this.bell = new THREE.Group();
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(14.5, 14.5, 14, 48, 1, true), bellMat);
    bell.position.y = 13;
    this.bell.add(bell);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(14.5, 14.5, 2, 48), bellMat);
    cap.position.y = 20.5;
    this.bell.add(cap);
    for (let i = 0; i < 6; i++) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(6, 2.2, 3), black);
      const a = (i / 6) * Math.PI * 2;
      slot.position.set(Math.cos(a) * 8, 21.2, Math.sin(a) * 8);
      slot.rotation.y = -a;
      this.bell.add(slot);
    }
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(14.7, 14.7, 2.5, 48, 1, true), new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.3 }));
    stripe.position.y = 10;
    this.bell.add(stripe);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 16, 16), steel);
    shaft.position.y = 28;
    this.bell.add(shaft);
    g.add(this.bell);

    // Pervane pivotu (motor milinin üstü)
    this.propPivot = new THREE.Group();
    this.propPivot.position.y = 26;
    this.bell.add(this.propPivot);
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5.5, 7, 6), steel);
    nut.position.y = 8.5;
    this.bell.add(nut);

    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.motorGroup = g;
    this.scene.add(g);

    // Bulanıklık diski (hızlı dönüş efekti)
    this.blurDisc = new THREE.Mesh(
      new THREE.RingGeometry(8, 64, 64),
      new THREE.MeshBasicMaterial({ color: 0x9fb3ff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
    );
    this.blurDisc.rotation.x = -Math.PI / 2;
    this.blurDisc.position.y = 26;
    this.bell.add(this.blurDisc);
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

  /* ---------- Pervane geometrisi ---------- */
  buildProp(prop, mat) {
    if (this.propGroup) {
      this.propPivot.remove(this.propGroup);
      this.propGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    if (this.flyingBlade) { this.scene.remove(this.flyingBlade); this.flyingBlade = null; }
    this.debris.forEach((d) => this.scene.remove(d.mesh));
    this.debris = [];

    const R = (prop.diameterIn * 25.4) / 2;
    const r0 = 6;
    const L = R - r0;
    const NS = 28, NC = 14;
    this.blades = [];
    this.propGroup = new THREE.Group();
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.15, roughness: 0.45, side: THREE.DoubleSide });

    // Göbek
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(r0 + 1, r0 + 1, 7, 32), new THREE.MeshStandardMaterial({ color: mat.color, roughness: 0.4 }));
    hub.castShadow = true;
    this.hub = hub;
    this.propGroup.add(hub);

    for (let bi = 0; bi < 2; bi++) {
      const base = [];       // [s, chordOffset, thickOffset, twist] her köşe için
      const positions = [];
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
          positions.push(0, 0, 0);
        }
      }
      for (let i = 0; i < NS; i++) {
        for (let j = 0; j < NC; j++) {
          const a = i * NC + j, b = i * NC + ((j + 1) % NC), c = (i + 1) * NC + j, d = (i + 1) * NC + ((j + 1) % NC);
          indices.push(a, c, b, b, c, d);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(new Array(positions.length).fill(1), 3));
      geo.setIndex(indices);
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.castShadow = true;
      const holder = new THREE.Group();
      holder.rotation.y = bi * Math.PI;
      holder.add(mesh);
      this.propGroup.add(holder);
      this.blades.push({ mesh, holder, base, NS, NC, L, r0 });
    }
    this.propPivot.add(this.propGroup);
    this.R = R;
    this.matColor = new THREE.Color(mat.color);
    this.deform(0, 0, 0, false);
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
        if (heatmap) heatColor(local, color); else color.copy(this.matColor).lerp(new THREE.Color(0xffffff), 0.08 * (1 - tNorm));
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
      pos.needsUpdate = true;
      col.needsUpdate = true;
      bl.mesh.geometry.computeVertexNormals();
      bl.mesh.geometry.computeBoundingSphere();
    }
  },

  /** Kırılma: bir kanat kökten kopar ve fırlar */
  breakBlade(rpm) {
    const bl = this.blades && this.blades.find((b) => !b.detached);
    if (!bl) return;
    bl.detached = true;
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
    this.flyingBlade = { mesh, vel: tangential.multiplyScalar(-v).add(new THREE.Vector3(0, 40, 0)), spin: new THREE.Vector3(Math.random() * 18, 24, Math.random() * 12) };
    // Kırık parçacıkları
    const shardMat = new THREE.MeshStandardMaterial({ color: this.matColor, roughness: 0.5 });
    const origin = new THREE.Vector3();
    this.propPivot.getWorldPosition(origin);
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(new THREE.TetrahedronGeometry(0.8 + Math.random() * 1.8), shardMat);
      m.position.copy(origin).add(new THREE.Vector3((Math.random() - 0.5) * 16, Math.random() * 6, (Math.random() - 0.5) * 16));
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize();
      this.debris.push({ mesh: m, vel: dir.multiplyScalar(80 + Math.random() * 220), spin: Math.random() * 20, life: 3 + Math.random() * 2 });
      this.scene.add(m);
    }
    this.shake = 1;
    this.flash = 1;
  },

  /** Her karede çağrılır */
  frame(dt, rpm, thrustNorm) {
    // Görsel dönüş hızı: gerçek devir ekranda izlenemeyecek kadar yüksek → ölçeklendi
    const visOmega = Math.min(55, (rpm / 60) * 2 * Math.PI * 0.035);
    this.angle += visOmega * dt;
    this.bell.rotation.y = this.angle;
    const blur = Math.min(0.32, rpm / 90000);
    this.blurDisc.material.opacity = this.blades && this.blades.every((b) => !b.detached) ? blur : blur * 0.5;
    this.blurDisc.scale.setScalar(this.R / 64);

    // Dengesizlik titreşimi (kanat kopunca)
    this.shake *= Math.pow(0.4, dt);
    const unbalanced = this.blades && this.blades.some((b) => b.detached);
    const vib = (unbalanced ? Math.min(1, rpm / 8000) * 1.8 : 0) + this.shake * 2.5;
    this.motorGroup.position.x = 30 + (Math.random() - 0.5) * vib;
    this.motorGroup.position.z = (Math.random() - 0.5) * vib;
    // Yük hücresi itkiyle hafifçe esner (görsel)
    this.loadCell.scale.y = 1 - Math.min(0.12, thrustNorm * 0.08);

    // Hava akışı: pervanenin altından aşağı doğru
    const posAttr = this.air.geometry.attributes.position;
    const speed = Math.min(1.6, rpm / 25000);
    this.air.material.opacity = Math.min(0.75, speed * 0.6);
    const top = 94 + 26;
    for (let i = 0; i < this.airSeeds.length; i++) {
      const s = this.airSeeds[i];
      s.y += dt * speed * (0.6 + (i % 7) * 0.08);
      if (s.y > 1) { s.y -= 1; s.a = Math.random() * Math.PI * 2; s.r = 8 + Math.random() * (this.R || 60) * 0.9; }
      const contract = 1 - 0.35 * s.y;   // akış daralması (vena contracta)
      const a = s.a + this.angle * 0.15;
      posAttr.setXYZ(i, 30 + Math.cos(a) * s.r * contract, top - 4 - s.y * 120, Math.sin(a) * s.r * contract);
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
    } else this.renderer.setClearColor(0x000000, 0);

    this.renderer.render(this.scene, this.camera);
  }
};

/** Gerilme oranına göre renk: yeşil → sarı → turuncu → kırmızı */
function heatColor(x, out) {
  const stops = [[0, 0x22c55e], [0.5, 0xeab308], [0.8, 0xf97316], [1, 0xef4444]];
  x = Math.max(0, Math.min(1.05, x));
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0] || i === stops.length - 1) {
      const [x0, c0] = stops[i - 1], [x1, c1] = stops[i];
      const t = Math.min(1, (x - x0) / (x1 - x0));
      return out.set(c0).lerp(new THREE.Color(c1), t);
    }
  }
  return out;
}
