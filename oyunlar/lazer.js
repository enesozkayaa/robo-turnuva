// =============================================================
// Robo Turnuva - mini oyun: GÖRÜNMEZ LAZER
// Kurallar lazer-motor.js'te; burası kafesi çizer, turu yönetir, kontrolleri bağlar.
// Tur: hazırlan (herkes görünür) → 5 sn görünmez (yürü + nişan al) → ATEŞ → (her 2 turda) halka düşer.
// =============================================================

(() => {
  const M = LazerMotor;
  const Y = 0.78;   // lazer yüksekliği
  const UYARI_SN = 2; // düşecek halka görünmezliğin son kaç saniyesinde yanıp söner

  // ---------- Dokular ----------
  function panelDokusu() {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#20243c'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 400; i++) {   // hafif metal lekeleri
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.05})`;
      g.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 6, 2 + Math.random() * 6);
    }
    g.strokeStyle = '#0d0f1c'; g.lineWidth = 6; g.strokeRect(0, 0, 256, 256);
    g.strokeStyle = '#3a4166'; g.lineWidth = 2; g.strokeRect(6, 6, 244, 244);
    g.fillStyle = '#4a5280';
    [[18, 18], [238, 18], [18, 238], [238, 238]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); });
    g.strokeStyle = 'rgba(46,230,255,0.12)'; g.lineWidth = 2; g.beginPath(); g.moveTo(128, 30); g.lineTo(128, 226); g.moveTo(30, 128); g.lineTo(226, 128); g.stroke();
    const d = new THREE.CanvasTexture(c);
    d.wrapS = d.wrapT = THREE.RepeatWrapping;
    d.repeat.set(0.5, 0.5);
    d.colorSpace = THREE.SRGBColorSpace;
    d.anisotropy = 4;
    return d;
  }
  function telDokusu() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.strokeStyle = 'rgba(190,210,255,0.85)'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 64); g.moveTo(64, 0); g.lineTo(0, 64); g.stroke();
    const d = new THREE.CanvasTexture(c);
    d.wrapS = d.wrapT = THREE.RepeatWrapping;
    return d;
  }

  const kose = (r, k) => [Math.cos(k * Math.PI / 3) * r, Math.sin(k * Math.PI / 3) * r];
  function altigen(r) {
    const s = new THREE.Shape();
    for (let k = 0; k < 6; k++) { const [x, y] = kose(r, k); k ? s.lineTo(x, y) : s.moveTo(x, y); }
    s.closePath();
    return s;
  }
  function altigenCizgi(r, y, renk) {
    const n = [];
    for (let k = 0; k <= 6; k++) { const [x, z] = kose(r, k); n.push(new THREE.Vector3(x, y, z)); }
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(n), new THREE.LineBasicMaterial({ color: renk, transparent: true }));
  }

  // ---------- Kafes ve halkalar ----------
  function arenaKur(grup) {
    const doku = panelDokusu();
    const H = M.HALKALAR, KALIN = 0.5;
    const halkalar = H.map((r, i) => {
      const s = altigen(r);
      if (i < H.length - 1) s.holes.push(altigen(H[i + 1]));
      const geo = new THREE.ExtrudeGeometry(s, { depth: KALIN, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);   // şekil x-y düzleminden zemine (x-z)
      const mal = new THREE.MeshStandardMaterial({ map: doku, metalness: 0.5, roughness: 0.6, emissive: 0xff1030, emissiveIntensity: 0 });
      const mesh = new THREE.Mesh(geo, mal);
      mesh.position.y = -KALIN;
      mesh.receiveShadow = true;
      const kenar = altigenCizgi(r - 0.02, 0.02, 0x2ee6ff);
      const parca = new THREE.Group();
      parca.add(mesh, kenar);
      grup.add(parca);
      return { parca, mal, kenar };
    });

    // Kafesin tabanı (düşmez) ve tel örgü
    const R = M.KAFES;
    const cerceve = altigen(R + 0.25); cerceve.holes.push(altigen(H[0]));
    const cGeo = new THREE.ExtrudeGeometry(cerceve, { depth: 0.6, bevelEnabled: false });
    cGeo.rotateX(-Math.PI / 2);
    const cMesh = new THREE.Mesh(cGeo, new THREE.MeshStandardMaterial({ color: 0x151827, metalness: 0.7, roughness: 0.4 }));
    cMesh.position.y = -0.55;
    grup.add(cMesh);
    const tel = telDokusu();
    const YUK = 2.4;
    for (let k = 0; k < 6; k++) {
      const [x1, z1] = kose(R, k), [x2, z2] = kose(R, k + 1);
      const direk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, YUK + 0.1, 10), new THREE.MeshStandardMaterial({ color: 0x3a4166, metalness: 0.8, roughness: 0.3 }));
      direk.position.set(x1, YUK / 2, z1); direk.castShadow = true;
      const tepe = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), new THREE.MeshBasicMaterial({ color: 0x2ee6ff }));
      tepe.position.set(x1, YUK + 0.08, z1);
      const isik = new THREE.PointLight(0x2ee6ff, 3, 7, 1.8);
      isik.position.set(x1 * 0.9, YUK, z1 * 0.9);
      const td = tel.clone(); td.needsUpdate = true; td.repeat.set(R / 0.45, YUK / 0.45);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(R, YUK), new THREE.MeshBasicMaterial({ map: td, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
      panel.position.set((x1 + x2) / 2, YUK / 2, (z1 + z2) / 2);
      panel.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
      const ray = new THREE.Mesh(new THREE.BoxGeometry(R, 0.06, 0.06), new THREE.MeshBasicMaterial({ color: 0x2ee6ff }));
      ray.position.set((x1 + x2) / 2, YUK, (z1 + z2) / 2);
      ray.rotation.y = panel.rotation.y;
      grup.add(direk, tepe, isik, panel, ray);
    }
    return { halkalar };
  }

  // Son görüldüğü yer işareti (görünmezken)
  function hayaletYap(renk, ad) {
    const g = new THREE.Group();
    const halka = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.56, 32), new THREE.MeshBasicMaterial({ color: renk, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
    halka.rotation.x = -Math.PI / 2; halka.position.y = 0.04;
    const yazi = Cekirdek.etiket(`${ad} ?`, renk);
    yazi.position.y = 0.9; yazi.scale.multiplyScalar(0.8);
    g.add(halka, yazi);
    g.visible = false;
    return g;
  }

  Salon.oyunEkle({
    id: 'lazer',
    ad: 'Görünmez Lazer',
    ikon: '👻',
    ozet: '5 saniye herkes görünmez. Saklan, lazerini çevir, ATEŞ! Son kalan kazanır.',
    kurallar: [
      'Herkes altıgen kafeste, elinde ileriye ışık tutan bir lazer var.',
      'Tur başında herkesin yerine iyi bak: birazdan <b>5 saniye</b> herkes görünmez olacak. Sadece kendini görürsün.',
      'Bu 5 saniyede istediğin yere git ve lazerini çevir. Rakiplerin nereye kaçar, tahmin et!',
      'Süre bitince herkes görünür ve <b>lazer kime değerse o elenir</b>. Lazer ilk değdiği robotta durur.',
      'Her 2 turda bir dış halka <b>düşer</b>. Hangisi olduğu önceden belli değil: görünmezliğin <b>son 2 saniyesinde</b> 4 kez kırmızı yanıp söner. Hemen içeri kaçamazsan sen de düşersin!',
      'Bilgisayar: <b>WASD / ok tuşları</b> yürü, <b>fare</b> nişan. Telefon: <b>sol</b> joystick yürü, <b>sağ</b> joystick nişan.',
      'Kafeste ayakta kalan son robot kazanır.',
    ],
    baslat,
  });

  function baslat(b) {
    const d = M.yeni(b.oyuncular.map(o => ({ id: o.id, ad: o.ad, renk: o.renk, bot: o.bot })));
    const grup = new THREE.Group();
    Cekirdek.sahne.add(grup);
    const arena = arenaKur(grup);
    const R = {}, ISIN = {}, HAYALET = {};
    d.oyuncular.forEach(o => {
      const r = Cekirdek.robotYap(o.renk, o.ad);
      grup.add(r.grup);
      r.grup.scale.setScalar(1.25);
      r.konum(o.x, o.z); r.yon(o.a);
      R[o.id] = r;
      ISIN[o.id] = Cekirdek.isinYap(o.renk);
      ISIN[o.id].goster(false);
      grup.add(ISIN[o.id].grup);
      HAYALET[o.id] = hayaletYap(o.renk, o.ad);
      grup.add(HAYALET[o.id]);
    });
    Cekirdek.kameraAyarla(M.KAFES + 0.6, 0.98);

    const ben = () => d.oyuncular.find(o => o.id === b.benId);
    const poz = {};                 // turdaki anlık yerler { id: {x, z, a} }
    let hedefler = {};              // botların bu turki kararları
    let asama = 'hazir', zaman = 0, sonSaniye = 0, durdu = false, uyariVar = false;
    const bekle = sn => Cekirdek.animasyon(sn, () => {});

    function hudOyuncular() {
      b.hud.oyuncular(d.oyuncular.map(o => ({ ...o, ben: o.id === b.benId })));
    }
    // İleri doğru ışın: sadece kafes duvarına kadar (görünmezken kimseye çarpmaz)
    function isinCiz(id) {
      const p = poz[id], dx = Math.cos(p.a), dz = Math.sin(p.a);
      const L = M.duvaraKadar(M.KAFES, p.x, p.z, dx, dz);
      ISIN[id].ayarla(p.x, p.z, p.x + dx * L, p.z + dz * L, Y);
    }

    function turBasla() {
      if (durdu) return;
      asama = 'hazir'; zaman = M.SURE.hazir; sonSaniye = 0;
      M.canlilar(d).forEach(o => {
        poz[o.id] = { x: o.x, z: o.z, a: o.a };
        R[o.id].goster(true); R[o.id].saydam(1); R[o.id].konum(o.x, o.z); R[o.id].yon(o.a);
        ISIN[o.id].goster(false); ISIN[o.id].kalin(1); ISIN[o.id].opaklik(1);
      });
      if (ben().canli) { ISIN[b.benId].goster(true); isinCiz(b.benId); }
      uyariVar = false;   // halka sadece görünmezliğin son 2 saniyesinde yanıp söner
      b.hud.bilgi(ben().canli ? '👀 Rakiplerin nerede, iyi bak! Birazdan herkes görünmez olacak.' : '💀 Elendin. Robotları izliyorsun…');
      b.hud.ipucu(ben().canli && d.tur === 1 ? (Kontrol.dokunmatik ? 'Sol: yürü · Sağ: nişan' : 'WASD / oklar: yürü · Fare: nişan') : '');
      b.hud.buyuk(`TUR ${d.tur}`, String(Math.ceil(zaman)));
      Ses.bip();
      hudOyuncular();
    }

    function gizliBasla() {
      asama = 'gizli'; zaman = M.SURE.gizli; sonSaniye = Math.ceil(zaman);
      const izleyici = !ben().canli;
      hedefler = {};
      M.canlilar(d).forEach(o => {
        if (o.bot) hedefler[o.id] = M.botKarari(d, o.id);
        if (o.id === b.benId) { R[o.id].saydam(0.45); return; }
        if (izleyici) { R[o.id].saydam(0.45); ISIN[o.id].goster(true); isinCiz(o.id); return; }
        R[o.id].goster(false);
      });
      Ses.gizlen();
      b.hud.perde('gizli');
      b.hud.buyuk('👻 GÖRÜNMEZ', String(sonSaniye), 'gizli');
      b.hud.bilgi(izleyici ? '👻 Herkes görünmez. Sen hepsini görüyorsun.' : '👻 Kimse seni görmüyor! Yerini değiştir, lazerini çevir.');
    }

    async function ates() {
      asama = 'atis';
      b.hud.perde('flas');
      b.hud.ipucu('');
      const oncekiCanli = M.canlilar(d);
      const pozlar = {};
      oncekiCanli.forEach(o => { pozlar[o.id] = poz[o.id]; });
      const s = M.turuBitir(d, pozlar);
      Object.values(HAYALET).forEach(h => { h.visible = false; });
      oncekiCanli.forEach(o => {
        R[o.id].goster(true); R[o.id].saydam(1); R[o.id].konum(o.x, o.z); R[o.id].yon(o.a);
      });
      s.isinlar.forEach(i => { ISIN[i.id].ayarla(i.x1, i.z1, i.x2, i.z2, Y); ISIN[i.id].goster(true); ISIN[i.id].opaklik(1); });
      Ses.belir();
      b.hud.buyuk('⚡ ATEŞ!', '', 'ates');
      await Cekirdek.animasyon(0.3, t => s.isinlar.forEach(i => ISIN[i.id].kalin(1 + 1.6 * Math.sin(t * Math.PI))));
      Ses.lazer();
      if (durdu) return;
      s.vurulanlar.forEach(id => {
        const o = d.oyuncular.find(p => p.id === id);
        Cekirdek.patlama(o.x, 0.7, o.z, o.renk);
        R[id].goster(false);
      });
      if (s.vurulanlar.length) Ses.patlama();
      if (s.vurulanlar.includes(b.benId)) b.hud.perde('flas');
      // Kim kimi vurdu
      const ad = id => d.oyuncular.find(o => o.id === id).ad;
      const vuruslar = s.isinlar.filter(i => i.hedef !== null).map(i => `${ad(i.id)} → ${ad(i.hedef)}`);
      b.hud.bilgi(vuruslar.length ? `💥 ${vuruslar.join(' · ')}` : '😮 Kimse vurulmadı!');
      hudOyuncular();
      await bekle(1.3);
      await Cekirdek.animasyon(0.4, t => s.isinlar.forEach(i => ISIN[i.id].opaklik(1 - t)));
      s.isinlar.forEach(i => ISIN[i.id].goster(false));
      if (durdu) return;

      if (s.kucul) {
        const halka = arena.halkalar[s.seviye - 1];
        halka.mal.emissiveIntensity = 0;
        b.hud.buyuk('🕳️ HALKA DÜŞÜYOR', '', 'ates');
        b.hud.bilgi(s.dusenler.length ? `🕳️ Düşenler: ${s.dusenler.map(ad).join(', ')}` : '🕳️ Dış halka düştü, kimse düşmedi!', !!s.dusenler.length);
        Ses.dusus();
        Cekirdek.salla(0.25);
        const dusen = s.dusenler.map(id => R[id]);
        dusen.forEach(r => { halka.parca.attach(r.grup); });   // robot halkayla birlikte düşsün
        const yon = Math.random() * Math.PI * 2;
        await Cekirdek.animasyon(M.SURE.dusus, t => {
          halka.parca.position.y = -t * t * 30;
          halka.parca.rotation.x = Math.cos(yon) * t * 0.5;
          halka.parca.rotation.z = Math.sin(yon) * t * 0.5;
        });
        halka.parca.visible = false;
        hudOyuncular();
        if (durdu) return;
      }

      if (s.bitti) return bitir(s);
      await bekle(0.5);
      turBasla();
    }

    function bitir(s) {
      asama = 'bitti';
      const kazanan = d.oyuncular.find(o => o.id === s.kazanan);
      b.hud.buyuk(kazanan ? `🏆 ${kazanan.ad}` : '🤝 BERABERE', '');
      b.hud.bilgi('');
      if (kazanan) Cekirdek.animasyon(1.2, t => { R[kazanan.id].grup.position.y = Math.sin(t * Math.PI) * 0.8; R[kazanan.id].yon(kazanan.a + t * Math.PI * 4); });
      const siralama = [...d.oyuncular].sort((a, c) => (c.canli - a.canli) || (c.olumTuru - a.olumTuru)).map(o => ({
        id: o.id,
        neden: o.canli ? '🏆 ayakta kaldı' : o.neden === 'dustu' ? `🕳️ ${o.olumTuru}. turda düştü` : `⚡ ${o.olumTuru}. turda vuruldu`,
      }));
      setTimeout(() => { if (!durdu) b.bitti({ kazanan: s.kazanan, siralama }); }, 900);
    }

    // ---------- Her kare ----------
    const kaldir = Cekirdek.guncelle((dt, t) => {
      if (durdu) return false;
      // Düşecek halka kırmızı yanıp söner
      arena.halkalar.forEach((h, i) => {
        // Son 2 saniyede 4 kez yanıp söner (yarım saniyede bir yanar)
        const yan = uyariVar && i === d.seviye && asama === 'gizli' && Math.floor((UYARI_SN - Math.max(0, zaman)) * 4) % 2 === 0;
        h.mal.emissiveIntensity = yan ? 0.9 : 0;
        h.kenar.material.color.set(yan ? 0xff2040 : 0x2ee6ff);
      });
      if (asama !== 'hazir' && asama !== 'gizli') return;

      const o = ben();
      if (o.canli) {
        const p = poz[o.id];
        const a = Kontrol.nisan(p.x, p.z, Y);
        if (a !== null) p.a = a;
        if (asama === 'gizli') {
          const [hx, hz] = Kontrol.hareket();
          [p.x, p.z] = M.sinirla(M.platform(d), p.x + hx * M.HIZ * dt, p.z + hz * M.HIZ * dt);
        }
        R[o.id].konum(p.x, p.z); R[o.id].yon(p.a);
        isinCiz(o.id);
      }
      if (asama === 'gizli') {
        // Botlar hedeflerine yürür
        Object.entries(hedefler).forEach(([id, h]) => {
          const p = poz[id];
          const dx = h.x - p.x, dz = h.z - p.z, L = Math.hypot(dx, dz), adim = M.HIZ * dt;
          if (L > adim) { p.x += dx / L * adim; p.z += dz / L * adim; } else { p.x = h.x; p.z = h.z; }
          let fark = h.a - p.a;
          fark = Math.atan2(Math.sin(fark), Math.cos(fark));
          p.a += fark * Math.min(1, dt * 5);
          if (!o.canli) { R[id].konum(p.x, p.z); R[id].yon(p.a); isinCiz(+id); }
        });
      }

      zaman -= dt;
      const sn = Math.max(0, Math.ceil(zaman));
      if (asama === 'hazir') {
        b.hud.buyuk(`TUR ${d.tur}`, String(sn || ''));
        if (zaman <= 0) gizliBasla();
      } else {
        b.hud.buyuk('👻 GÖRÜNMEZ', String(sn || ''), 'gizli');
        if (sn !== sonSaniye) { sonSaniye = sn; if (sn > 0) Ses.tik(); }
        // Son 2 saniye: düşecek halka yanıp söner, botlar kaçmaya çalışır
        if (!uyariVar && zaman <= UYARI_SN && M.dusecekMi(d)) {
          uyariVar = true;
          Ses.uyari();
          b.hud.bilgi('⚠️ KIRMIZI HALKA DÜŞÜYOR! İçeri kaç!', true);
          Object.entries(hedefler).forEach(([id, h]) => {
            const p = poz[id];
            const kacis = M.kacisNoktasi(d, p.x, p.z);
            if (!kacis || Math.random() < 0.35) return;            // bazı botlar geç fark eder
            const gecikme = 0.1 + Math.random() * 0.4;
            setTimeout(() => { if (!durdu && asama === 'gizli') { h.x = kacis[0]; h.z = kacis[1]; } }, gecikme * 1000);
          });
        }
        if (zaman <= 0) { b.hud.perde(''); ates(); }
      }
    });

    turBasla();

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
