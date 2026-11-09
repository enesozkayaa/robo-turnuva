// =============================================================
// Robo Turnuva - ortak 3D çekirdek (Three.js)
// Bütün mini oyunlar bunu kullanır: uzay arka planı, kamera, robot modeli,
// lazer ışını, patlama, isim etiketi ve her karede çalışan güncellemeler.
// Mini oyun kendi nesnelerini bir THREE.Group içine koyar, bitince kaldırır.
// =============================================================

const Cekirdek = (() => {
  let renderer, sahne, kamera;
  const saat = new THREE.Clock();
  const guncellemeler = new Set();   // her karede (dt, zaman) ile çağrılır; false dönerse silinir
  const isin = new THREE.Raycaster();
  let sarsinti = 0;
  const bakis = { yaricap: 10, merkez: new THREE.Vector3(0, 0, 0.6), egim: 0.95 };

  function baslat(kap) {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    kap.appendChild(renderer.domElement);

    sahne = new THREE.Scene();
    sahne.background = new THREE.Color(0x04030c);
    kamera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);

    sahne.add(new THREE.HemisphereLight(0x8fa8ff, 0x1a0f2e, 0.75));
    const gunes = new THREE.DirectionalLight(0xdfe6ff, 1.6);
    gunes.position.set(-8, 18, 10);
    gunes.castShadow = true;
    gunes.shadow.mapSize.set(2048, 2048);
    Object.assign(gunes.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 50 });
    gunes.shadow.bias = -0.0005;
    sahne.add(gunes);

    uzayKur();
    boyutla();
    window.addEventListener('resize', boyutla);
    renderer.setAnimationLoop(kare);
  }

  // ---------- Uzay: yıldızlar, bulutsu, gezegen ----------
  function uzayKur() {
    const n = 2500, konum = new Float32Array(n * 3), renk = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, r = 150 + Math.random() * 60;
      const s = Math.sqrt(1 - u * u);
      konum.set([Math.cos(t) * s * r, u * r, Math.sin(t) * s * r], i * 3);
      const c = new THREE.Color().setHSL(0.55 + Math.random() * 0.25, 0.6, 0.65 + Math.random() * 0.35);
      renk.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(konum, 3));
    g.setAttribute('color', new THREE.BufferAttribute(renk, 3));
    const yildizlar = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.9, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false }));
    sahne.add(yildizlar);
    guncelle(dt => { yildizlar.rotation.y += dt * 0.004; });

    // Bulutsular: yumuşak renkli lekeler
    [[0x6a2bd9, -70, -40, -120, 120], [0x1aa6c9, 80, -30, -100, 100], [0xd92b8a, 10, -60, -140, 110]].forEach(([c, x, y, z, s]) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: parlamaDokusu(), color: c, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
      sp.position.set(x, y, z); sp.scale.set(s, s, 1);
      sahne.add(sp);
    });

    // Uzak gezegen ve halkası
    const gez = new THREE.Mesh(new THREE.SphereGeometry(14, 48, 32), new THREE.MeshStandardMaterial({ map: gezegenDokusu(), roughness: 0.9 }));
    gez.position.set(-55, -38, -95);
    sahne.add(gez);
    const halka = new THREE.Mesh(new THREE.RingGeometry(18, 26, 64), new THREE.MeshBasicMaterial({ color: 0xc9a6ff, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
    halka.position.copy(gez.position); halka.rotation.set(1.2, 0.3, 0.2);
    sahne.add(halka);
    guncelle(dt => { gez.rotation.y += dt * 0.02; });
  }

  let _parlama = null;
  function parlamaDokusu() {
    if (_parlama) return _parlama;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    return (_parlama = new THREE.CanvasTexture(c));
  }
  function gezegenDokusu() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    for (let y = 0; y < 128; y++) {
      const t = y / 128 + Math.sin(y * 0.3) * 0.02;
      g.fillStyle = `hsl(${265 + Math.sin(t * 9) * 25}, 55%, ${28 + Math.sin(t * 17) * 10}%)`;
      g.fillRect(0, y, 256, 1);
    }
    const d = new THREE.CanvasTexture(c);
    d.colorSpace = THREE.SRGBColorSpace;
    return d;
  }

  // ---------- Kamera ----------
  // yaricap: ekrana sığması gereken alan; egim: 0 = yandan, 1.57 = tam tepeden
  function kameraAyarla(yaricap, egim = 0.95) {
    bakis.yaricap = yaricap; bakis.egim = egim;
    boyutla();
  }
  function boyutla() {
    if (!renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    kamera.aspect = w / h;
    // Dikey ekranda daha tepeden bak: alan daha iyi sığar
    const egim = kamera.aspect < 1 ? Math.min(1.35, bakis.egim + 0.3) : bakis.egim;
    const yarim = THREE.MathUtils.degToRad(kamera.fov / 2);
    const dikey = bakis.yaricap * (0.62 + 0.38 * Math.sin(egim)) / Math.tan(yarim);
    const yatay = bakis.yaricap / (Math.tan(yarim) * kamera.aspect);
    const uzak = Math.max(dikey, yatay) * 1.04 + 1;
    kamera.position.set(0, Math.sin(egim) * uzak, Math.cos(egim) * uzak).add(bakis.merkez);
    kamera.lookAt(bakis.merkez);
    kamera.updateProjectionMatrix();
    kamera.userData.asil = kamera.position.clone();
  }
  function salla(miktar = 0.3) { sarsinti = Math.max(sarsinti, miktar); }

  // Ekrandaki noktanın y yüksekliğindeki zemin karşılığı
  const _duz = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _n = new THREE.Vector3();
  function zemineIsin(ex, ey, y = 0) {
    const r = renderer.domElement.getBoundingClientRect();
    isin.setFromCamera({ x: ((ex - r.left) / r.width) * 2 - 1, y: -((ey - r.top) / r.height) * 2 + 1 }, kamera);
    _duz.constant = -y;
    return isin.ray.intersectPlane(_duz, _n) ? { x: _n.x, z: _n.z } : null;
  }
  // Dünya noktasının ekrandaki yeri
  function ekranda(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(kamera);
    return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight };
  }

  // ---------- Kare döngüsü ----------
  function guncelle(fn) { guncellemeler.add(fn); return () => guncellemeler.delete(fn); }
  function kare() {
    const dt = Math.min(saat.getDelta(), 0.1), t = saat.elapsedTime;
    guncellemeler.forEach(fn => { if (fn(dt, t) === false) guncellemeler.delete(fn); });
    if (sarsinti > 0.001 && kamera.userData.asil) {
      kamera.position.copy(kamera.userData.asil).add(new THREE.Vector3((Math.random() - 0.5) * sarsinti, (Math.random() - 0.5) * sarsinti, (Math.random() - 0.5) * sarsinti));
      sarsinti *= Math.pow(0.02, dt);
      if (sarsinti <= 0.001) kamera.position.copy(kamera.userData.asil);
    }
    renderer.render(sahne, kamera);
  }
  // sure saniyede biten animasyon; adim(t: 0→1)
  function animasyon(sure, adim) {
    return new Promise(coz => {
      let g = 0;
      guncelle(dt => {
        g += dt;
        const t = Math.min(1, g / sure);
        adim(t);
        if (t >= 1) { coz(); return false; }
      });
    });
  }

  // ---------- İsim etiketi ----------
  function etiket(yazi, renk = '#ffffff') {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.font = '800 34px Inter, system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const w = Math.min(250, g.measureText(yazi).width + 28);
    g.fillStyle = 'rgba(5,4,20,0.7)';
    g.beginPath(); g.roundRect((256 - w) / 2, 8, w, 48, 24); g.fill();
    g.fillStyle = renk; g.fillText(yazi, 128, 33);
    const d = new THREE.CanvasTexture(c);
    d.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: d, transparent: true, depthWrite: false, depthTest: false }));
    sp.scale.set(2, 0.5, 1);
    sp.renderOrder = 10;
    return sp;
  }

  // ---------- Robot ----------
  // Uçan küçük robot. İleri yönü +x. Döndürmek için: robot.yon(a) → (cos a, sin a) yönüne bakar.
  function robotYap(renkHex, ad) {
    const renk = new THREE.Color(renkHex);
    const grup = new THREE.Group();
    const govde = new THREE.Group();   // havada süzülen kısım
    grup.add(govde);
    const malzemeler = [];
    const mal = (o) => { const m = new THREE.MeshStandardMaterial(o); malzemeler.push(m); return m; };
    const metal = mal({ color: 0xe9ecf5, metalness: 0.55, roughness: 0.32 });
    const koyu = mal({ color: 0x23263a, metalness: 0.6, roughness: 0.45 });
    const isik = mal({ color: renk, emissive: renk, emissiveIntensity: 1.6, roughness: 0.4 });
    const boya = mal({ color: renk, metalness: 0.3, roughness: 0.4 });
    const ekle = (geo, m, x, y, z, golge = true) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = golge; govde.add(o); return o; };

    ekle(new THREE.CylinderGeometry(0.36, 0.3, 0.1, 24), koyu, 0, 0.2, 0);                 // itici taban
    ekle(new THREE.CylinderGeometry(0.26, 0.26, 0.04, 24), isik, 0, 0.14, 0, false);         // alttan ışık
    ekle(new THREE.CapsuleGeometry(0.3, 0.32, 6, 18), metal, 0, 0.6, 0);                   // gövde
    const kusak = ekle(new THREE.TorusGeometry(0.31, 0.045, 8, 32), boya, 0, 0.6, 0);
    kusak.rotation.x = Math.PI / 2;
    ekle(new THREE.SphereGeometry(0.24, 24, 16), metal, 0, 1.05, 0);                        // kafa
    ekle(new THREE.BoxGeometry(0.12, 0.1, 0.32), isik, 0.19, 1.07, 0, false);               // vizör (ileri bakar)
    ekle(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 6), koyu, -0.05, 1.36, 0);          // anten
    ekle(new THREE.SphereGeometry(0.045, 10, 8), isik, -0.05, 1.48, 0, false);
    // Lazer silahı: sağ kolda, ileri doğru
    ekle(new THREE.SphereGeometry(0.1, 12, 10), boya, 0, 0.78, 0.33);
    const namlu = ekle(new THREE.CylinderGeometry(0.06, 0.075, 0.5, 12), koyu, 0.25, 0.78, 0.33);
    namlu.rotation.z = Math.PI / 2;
    ekle(new THREE.SphereGeometry(0.05, 10, 8), isik, 0.51, 0.78, 0.33, false);

    // Altındaki renkli parıltı (kimin nerede olduğu yukarıdan kolay görünsün)
    const parilti = new THREE.Mesh(new THREE.CircleGeometry(0.75, 32), new THREE.MeshBasicMaterial({ color: renk, map: parlamaDokusu(), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    parilti.rotation.x = -Math.PI / 2; parilti.position.y = 0.03;
    grup.add(parilti);

    const ad3 = etiket(ad, '#' + renk.getHexString());
    ad3.position.set(0, 1.95, 0);
    grup.add(ad3);

    const faz = Math.random() * 6;
    const bitir = guncelle((dt, t) => { govde.position.y = Math.sin(t * 2.6 + faz) * 0.06; });

    let saydamlik = 1;
    const robot = {
      grup, govde, renk, etiket: ad3, parilti,
      // Silah ucunun gövdeye göre yeri (ışın buradan çıkar)
      namluYuksekligi: 0.78, namluYan: 0.33,
      konum(x, z) { grup.position.x = x; grup.position.z = z; },
      yon(a) { govde.rotation.y = -a; },
      saydam(o) {
        saydamlik = o;
        malzemeler.forEach(m => { m.transparent = o < 1; m.opacity = o; m.depthWrite = o >= 1; });
        parilti.material.opacity = 0.55 * o;
      },
      get saydamlik() { return saydamlik; },
      goster(v) { grup.visible = v; },
      sil() { bitir(); grup.parent?.remove(grup); },
    };
    return robot;
  }

  // ---------- Lazer ışını ----------
  function isinYap(renkHex) {
    const renk = new THREE.Color(renkHex);
    const grup = new THREE.Group();
    const silindir = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
    silindir.translate(0, 0.5, 0); silindir.rotateZ(-Math.PI / 2);   // +x yönünde, 0'dan 1'e
    const ic = new THREE.Mesh(silindir, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false }));
    const dis = new THREE.Mesh(silindir, new THREE.MeshBasicMaterial({ color: renk, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
    const uc = new THREE.Sprite(new THREE.SpriteMaterial({ map: parlamaDokusu(), color: renk, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    uc.scale.set(0.9, 0.9, 1);
    grup.add(ic, dis, uc);
    let kalinlik = 1;
    const nesne = {
      grup,
      // (x1,z1) → (x2,z2), yükseklik y
      ayarla(x1, z1, x2, z2, y = 0.78) {
        const L = Math.max(0.01, Math.hypot(x2 - x1, z2 - z1));
        grup.position.set(x1, y, z1);
        grup.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
        ic.scale.set(L, 0.025 * kalinlik, 0.025 * kalinlik);
        dis.scale.set(L, 0.085 * kalinlik, 0.085 * kalinlik);
        uc.position.set(L, 0, 0);
      },
      kalin(k) { kalinlik = k; },
      opaklik(o) { ic.material.opacity = 0.95 * o; dis.material.opacity = 0.45 * o; uc.material.opacity = o; },
      goster(v) { grup.visible = v; },
    };
    return nesne;
  }

  // ---------- Patlama ----------
  function patlama(x, y, z, renkHex, guc = 1) {
    const renk = new THREE.Color(renkHex);
    const parcalar = [];
    const geo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    for (let i = 0; i < 34; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: i % 3 ? renk : 0xe9ecf5, emissive: i % 3 ? renk : 0x000000, emissiveIntensity: 0.8, metalness: 0.5, roughness: 0.4, transparent: true }));
      m.position.set(x, y, z);
      const s = 0.5 + Math.random() * 1.2; m.scale.setScalar(s);
      const a = Math.random() * Math.PI * 2, h = 2 + Math.random() * 5 * guc, k = 2 + Math.random() * 5 * guc;
      m.userData.v = new THREE.Vector3(Math.cos(a) * k, h, Math.sin(a) * k);
      m.userData.d = new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(10);
      sahne.add(m); parcalar.push(m);
    }
    const flas = new THREE.PointLight(renk, 30 * guc, 9, 1.6);
    flas.position.set(x, y + 0.5, z); sahne.add(flas);
    const top = new THREE.Sprite(new THREE.SpriteMaterial({ map: parlamaDokusu(), color: renk, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    top.position.set(x, y + 0.5, z); sahne.add(top);
    salla(0.35 * guc);
    let gecen = 0;
    guncelle(dt => {
      gecen += dt;
      parcalar.forEach(m => {
        m.userData.v.y -= 14 * dt;
        m.position.addScaledVector(m.userData.v, dt);
        m.rotation.x += m.userData.d.x * dt; m.rotation.y += m.userData.d.y * dt;
        m.material.opacity = Math.max(0, 1 - gecen / 1.6);
      });
      flas.intensity = Math.max(0, 30 * guc * (1 - gecen / 0.5));
      const s = 1 + gecen * 9; top.scale.set(s, s, 1); top.material.opacity = Math.max(0, 1 - gecen / 0.45);
      if (gecen > 1.7) {
        parcalar.forEach(m => { sahne.remove(m); m.material.dispose(); });
        geo.dispose(); sahne.remove(flas); sahne.remove(top);
        return false;
      }
    });
  }

  return {
    baslat, guncelle, animasyon, kameraAyarla, zemineIsin, ekranda, salla, etiket, robotYap, isinYap, patlama, parlamaDokusu,
    get sahne() { return sahne; }, get kamera() { return kamera; }, get tuval() { return renderer.domElement; },
  };
})();
