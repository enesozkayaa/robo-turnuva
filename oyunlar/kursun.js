// =============================================================
// Robo Turnuva - mini oyun: AĞIR ÇEKİM
// Kurallar kursun-motor.js'te; burası kolonlu odayı, ağır çekim kurşunları,
// izlerini ve vuruş efektlerini çizer, kontrolleri bağlar.
// =============================================================

(() => {
  const M = KursunMotor;
  const ADIM = 1 / 60;          // sabit simülasyon adımı
  const KY = 0.78;              // kurşun yüksekliği (silah hizası)

  function zeminDokusu() {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#161a2e'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.05})`;
      g.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 6, 2 + Math.random() * 6);
    }
    g.strokeStyle = '#0a0c18'; g.lineWidth = 6; g.strokeRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(155,92,255,0.18)'; g.lineWidth = 2; g.strokeRect(10, 10, 236, 236);
    const d = new THREE.CanvasTexture(c);
    d.wrapS = d.wrapT = THREE.RepeatWrapping;
    d.repeat.set(M.ODA.w, M.ODA.h);
    d.colorSpace = THREE.SRGBColorSpace;
    d.anisotropy = 4;
    return d;
  }

  function odaKur(grup) {
    const { w, h } = M.ODA;
    const zemin = new THREE.Mesh(new THREE.BoxGeometry(w * 2, 0.4, h * 2), new THREE.MeshStandardMaterial({ map: zeminDokusu(), metalness: 0.4, roughness: 0.7 }));
    zemin.position.y = -0.2; zemin.receiveShadow = true;
    grup.add(zemin);

    // Alçak duvarlar ve üstlerinde neon şerit
    const duvarMal = new THREE.MeshStandardMaterial({ color: 0x1c2036, metalness: 0.6, roughness: 0.45 });
    const neon = new THREE.MeshBasicMaterial({ color: 0x9b5cff });
    const D = 0.35, Y = 1.1;
    [[0, -h - D / 2, w * 2 + D * 2, D], [0, h + D / 2, w * 2 + D * 2, D], [-w - D / 2, 0, D, h * 2], [w + D / 2, 0, D, h * 2]].forEach(([x, z, sx, sz]) => {
      const d = new THREE.Mesh(new THREE.BoxGeometry(sx, Y, sz), duvarMal);
      d.position.set(x, Y / 2 - 0.2, z); d.castShadow = d.receiveShadow = true;
      const s = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.06, sz + 0.02), neon);
      s.position.set(x, Y - 0.2, z);
      grup.add(d, s);
    });

    // Kolonlar: metal gövde, parlayan halkalar
    const kolonMal = new THREE.MeshStandardMaterial({ color: 0x6a74a8, metalness: 0.6, roughness: 0.35 });
    const halkaMal = new THREE.MeshBasicMaterial({ color: 0x2ee6ff });
    M.KOLONLAR.forEach(([x, z]) => {
      const k = new THREE.Mesh(new THREE.CylinderGeometry(M.KOLON_R, M.KOLON_R * 1.08, 2.6, 24), kolonMal);
      k.position.set(x, 1.1, z); k.castShadow = k.receiveShadow = true;
      grup.add(k);
      [0.25, 1.6].forEach(y => {
        const r = new THREE.Mesh(new THREE.TorusGeometry(M.KOLON_R + 0.03, 0.035, 8, 32), halkaMal);
        r.rotation.x = Math.PI / 2; r.position.set(x, y, z);
        grup.add(r);
      });
      const isik = new THREE.PointLight(0x2ee6ff, 1.6, 4, 2);
      isik.position.set(x, 0.6, z);
      grup.add(isik);
    });
  }

  // Ağır çekim kurşun: parlak çekirdek + renkli hale (arkasında iz yok)
  // Kurşunlar çok olunca telefon kasmasın: şekil ve renkler bir kez yapılır, hepsi paylaşır
  let kursunGeo = null, kursunMal = null;
  const haleMal = new Map();
  function kursunYap(renk) {
    kursunGeo ??= new THREE.CapsuleGeometry(0.12, 0.4, 4, 10);
    kursunMal ??= new THREE.MeshBasicMaterial({ color: 0xffffff });
    if (!haleMal.has(renk)) haleMal.set(renk, new THREE.SpriteMaterial({ map: Cekirdek.parlamaDokusu(), color: renk, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const g = new THREE.Group();
    const cekirdek = new THREE.Mesh(kursunGeo, kursunMal);
    cekirdek.rotation.z = Math.PI / 2;   // +x yönünde uzun
    const hale = new THREE.Sprite(haleMal.get(renk));
    hale.scale.set(1.5, 1.5, 1);
    g.add(cekirdek, hale);
    return g;
  }

  function kivilcim(grup, x, z, renk, n = 10) {
    const parca = [];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: i % 2 ? renk : 0xffffff, transparent: true }));
      m.position.set(x, KY, z);
      const a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * 3;
      m.userData.v = new THREE.Vector3(Math.cos(a) * s, 1 + Math.random() * 3, Math.sin(a) * s);
      grup.add(m); parca.push(m);
    }
    let g = 0;
    Cekirdek.guncelle(dt => {
      g += dt;
      parca.forEach(m => { m.userData.v.y -= 12 * dt; m.position.addScaledVector(m.userData.v, dt); m.material.opacity = Math.max(0, 1 - g / 0.5); });
      if (g > 0.5) { parca.forEach(m => { grup.remove(m); m.geometry.dispose(); m.material.dispose(); }); return false; }
    });
  }

  const kalpler = can => '❤️'.repeat(Math.max(0, can)) + '🖤'.repeat(Math.max(0, M.CAN - Math.max(0, can)));

  Salon.oyunEkle({
    id: 'kursun',
    ad: 'Ağır Çekim',
    ikon: '⏳',
    ozet: 'Kurşunlar ağır çekimde geliyor ama atışlar gittikçe sıklaşıyor. Kaç, saklan, son kalan sen ol!',
    kurallar: [
      'Kolonlu bir odadasınız. Herkesin silahı <b>kendiliğinden</b> ateş eder; sen yürür ve nişan alırsın.',
      'Kurşunlar <b>ağır çekimde</b> gelir: gördüğün kurşundan kenara çekil ya da kolonun arkasına saklan. Kurşun kolonda ve duvarda durur.',
      'Kurşunların hızı hep aynı ama her <b>5 saniyede</b> silahlar <b>daha sık</b> ateş eder. Sonunda kurşunlar <b>peş peşe, durmadan</b> çıkar!',
      'Herkesin <b>3 canı</b> var. Vurulunca 1 can gider ve kısa süre yanıp sönersin (o sırada kurşun işlemez). Canı biten elenir.',
      'Bilgisayar: <b>WASD / ok tuşları</b> yürü, <b>fare</b> nişan. Telefon: <b>sol</b> joystick yürü, <b>sağ</b> joystick nişan.',
      'Ayakta kalan son robot kazanır.',
    ],
    baslat,
  });

  function baslat(b) {
    const d = M.yeni(b.oyuncular.map(o => ({ id: o.id, ad: o.ad, renk: o.renk, bot: o.bot })));
    const grup = new THREE.Group();
    Cekirdek.sahne.add(grup);
    odaKur(grup);
    const R = {}, hafiza = {};
    d.oyuncular.forEach(o => {
      const r = Cekirdek.robotYap(o.renk, o.ad);
      r.grup.scale.setScalar(1.25);
      r.konum(o.x, o.z); r.yon(o.a);
      grup.add(r.grup);
      R[o.id] = r;
      hafiza[o.id] = {};
    });
    const renk = id => d.oyuncular.find(o => o.id === id).renk;
    const KURSUN = new Map();   // kurşun no → nesne
    Cekirdek.kameraAyarla(M.ODA.w + 0.8, 1.02);

    let durdu = false, birikim = 0, sonSaniye = null, bittiMi = false, sonBasamak = 0;
    const ben = d.oyuncular.find(o => o.id === b.benId);
    let benA = ben.a;

    function hudOyuncular() {
      b.hud.oyuncular(d.oyuncular.map(o => ({ ...o, ben: o.id === b.benId, ek: kalpler(o.can) })));
    }
    hudOyuncular();
    b.hud.bilgi('Kurşunlar ağır çekimde gelir, atışlar gittikçe sıklaşır. Kaç ve saklan!');
    b.hud.ipucu(Kontrol.dokunmatik ? '' : 'WASD / oklar: yürü · Fare: nişan');

    function olayIsle(ol) {
      if (ol.tip === 'ates') {
        if (ol.id === b.benId || Math.random() < 0.5) Ses.agirAtes();
      } else if (ol.tip === 'carpti') {
        kivilcim(grup, ol.x, ol.z, renk(ol.sahip), 6);
      } else if (ol.tip === 'vurdu') {
        kivilcim(grup, ol.x, ol.z, renk(ol.id), 16);
        Ses.isabet();
        if (ol.id === b.benId) { b.hud.perde('flas'); Cekirdek.salla(0.25); }
        const ad = id => d.oyuncular.find(o => o.id === id).ad;
        if (ol.can > 0) b.hud.bilgi(`💥 ${ad(ol.kim)} → ${ad(ol.id)} (${ol.can} can kaldı)`);
        hudOyuncular();
      } else if (ol.tip === 'elendi') {
        const o = d.oyuncular.find(p => p.id === ol.id);
        Cekirdek.patlama(o.x, 0.7, o.z, o.renk);
        Ses.patlama();
        R[o.id].goster(false);
        const ad = d.oyuncular.find(p => p.id === ol.kim).ad;
        b.hud.bilgi(o.id === b.benId ? `💀 ${ad} seni eledi! Robotları izliyorsun…` : `💀 ${o.ad} elendi! (${ad} vurdu)`, o.id === b.benId);
        hudOyuncular();
      } else if (ol.tip === 'bitti') {
        bitir();
      }
    }

    function bitir() {
      bittiMi = true;
      Kontrol.ac(false);
      const k = d.oyuncular.find(o => o.id === d.kazanan);
      b.hud.buyuk(k ? `🏆 ${k.ad}` : '🤝 BERABERE', '');
      if (k) Cekirdek.animasyon(1.2, t => { R[k.id].grup.position.y = Math.sin(t * Math.PI) * 0.8; R[k.id].yon(k.a + t * Math.PI * 4); });
      const siralama = [...d.oyuncular].sort((a, c) => (c.canli - a.canli) || (c.olumSirasi - a.olumSirasi)).map(o => ({
        id: o.id,
        neden: o.canli ? `🏆 ${kalpler(o.can)} ile ayakta kaldı` : `💀 ${o.olumSirasi}. elenen`,
      }));
      setTimeout(() => { if (!durdu) b.bitti({ kazanan: d.kazanan, siralama }); }, 1200);
    }

    const kaldir = Cekirdek.guncelle((dt, t) => {
      if (durdu) return false;
      if (!bittiMi) {
        // Benim girdim: yürüme + nişan (nişan verilmezse yürüdüğüm yöne bakarım)
        const [hx, hz] = Kontrol.hareket();
        const a = ben.canli ? Kontrol.nisan(ben.x, ben.z, KY) : null;
        if (a !== null) benA = a;
        else if (Kontrol.dokunmatik && Math.hypot(hx, hz) > 0.2) benA = Math.atan2(hz, hx);   // telefonda nişan yoksa yürüdüğü yöne
        birikim += dt;
        while (birikim >= ADIM && !d.bitti) {
          birikim -= ADIM;
          const g = { [b.benId]: { hx, hz, a: benA } };
          M.canlilar(d).forEach(o => { if (o.bot) g[o.id] = M.botGirdi(d, o.id, hafiza[o.id]); });
          M.adim(d, ADIM, g).forEach(olayIsle);
        }
      }

      // Geri sayım ve hız göstergesi
      if (d.t < 0) {
        const sn = Math.ceil(-d.t);
        if (sn !== sonSaniye) { sonSaniye = sn; Ses.bip(); }
        b.hud.buyuk('HAZIR', String(sn));
      } else if (!bittiMi) {
        if (sonSaniye !== 0) { sonSaniye = 0; Ses.bip(true); b.hud.buyuk('⏳ BAŞLA!', '', 'ates'); }
        else if (d.t > 1) {
          const bas = M.hizBasamagi(d.t);
          if (bas !== sonBasamak) {
            sonBasamak = bas;
            Ses.uyari();
            b.hud.bilgi(M.sonBasamakMi(d.t) ? '🔥 ARTIK DURMADAN ATEŞ EDİYORLAR!' : `⚡ ATIŞLAR SIKLAŞTI! x${M.hizKati(d.t).toFixed(1)}`, true);
          }
          const s = Math.floor(d.t);
          b.hud.buyuk(`⏱ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}  ·  Atış sıklığı x${M.hizKati(d.t).toFixed(1)}`, '', '', false);
        }
      }

      // Robotlar
      d.oyuncular.forEach(o => {
        const r = R[o.id];
        if (!o.canli) return;
        r.konum(o.x, o.z); r.yon(o.a);
        // Vurulduktan sonra dokunulmazken yanıp söner
        r.saydam(o.koruma > 0 ? (Math.floor(t * 12) % 2 ? 0.25 : 0.9) : 1);
      });

      // Kurşunlar
      const var_ = new Set();
      d.kursunlar.forEach(k => {
        var_.add(k.k);
        let n = KURSUN.get(k.k);
        if (!n) { n = kursunYap(renk(k.sahip)); grup.add(n); KURSUN.set(k.k, n); n.userData.dogum = d.t; }
        n.position.set(k.x, KY, k.z);
        n.rotation.y = -Math.atan2(k.dz, k.dx);
      });
      KURSUN.forEach((n, no) => {
        if (var_.has(no)) return;
        grup.remove(n);   // şekil/renk paylaşılıyor, silinmez
        KURSUN.delete(no);
      });
    });

    return {
      durdur() {
        durdu = true;
        kaldir();
        Object.values(R).forEach(r => r.sil());
        Cekirdek.sahne.remove(grup);
        grup.traverse(n => { n.geometry?.dispose(); });
      },
    };
  }
})();
