// =============================================================
// Robo Turnuva - mini oyun: SON SIĞINAK
// Kurallar kapi-motor.js'te. Burası meydanı, 8 kabini (kapı, kırmızı/yeşil ışık, tavandaki tuzak),
// ufuktan gelen uzay aracını ve ışınını çizer; kontrolleri bağlar.
//
// Online: kurallar odayı açanda (kanal.evMi) yürür (60 kare/sn). Ev saniyede 20 kez herkese
// robotların yerini ve olayları yollar. Misafir kendi robotunu kendi cihazında yürütür (kapı ve
// kabin kurallarını kendisi de uygular), yerini eve gönderir; itilince gelen hızı kendine ekler.
// Mesajlar: ev → herkes { t: 'd', zt, faz, kalan, o: [[id, x, z, a, canli]], k: [[acik, dolu]], ol: [olaylar] }
//           oyuncu → ev { t: 'g', x, z }
// =============================================================

(() => {
  const M = KapiMotor;
  const ADIM = 1 / 60, YAYIN_SN = 0.05, H = 2.3;   // kabin yüksekliği

  function zeminDokusu() {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const g = c.getContext('2d');
    const r = g.createRadialGradient(256, 256, 20, 256, 256, 256);
    r.addColorStop(0, '#2a2f55'); r.addColorStop(1, '#12152a');
    g.fillStyle = r; g.fillRect(0, 0, 512, 512);
    g.strokeStyle = 'rgba(46,230,255,0.18)'; g.lineWidth = 2;
    for (let i = 1; i < 8; i++) { g.beginPath(); g.arc(256, 256, i * 32, 0, Math.PI * 2); g.stroke(); }
    for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; g.beginPath(); g.moveTo(256, 256); g.lineTo(256 + Math.cos(a) * 256, 256 + Math.sin(a) * 256); g.stroke(); }
    const d = new THREE.CanvasTexture(c);
    d.colorSpace = THREE.SRGBColorSpace;
    return d;
  }

  // Kabin: yerelde ön yüz z=0, derinlik +z (dışarı), genişlik x
  function kabinYap() {
    const g = new THREE.Group();
    const govdeMal = new THREE.MeshStandardMaterial({ color: 0x3a4166, metalness: 0.7, roughness: 0.35 });
    const W = M.W, D = M.D;
    const duvar = (sx, sy, sz, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), govdeMal); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
    duvar(0.12, H, D, -W / 2 - 0.06, H / 2, D / 2);
    duvar(0.12, H, D, W / 2 + 0.06, H / 2, D / 2);
    duvar(W + 0.24, H, 0.12, 0, H / 2, D + 0.06);
    duvar(W + 0.24, 0.14, D + 0.12, 0, H + 0.07, D / 2);
    // İç zemin ışığı
    const ic = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({ color: 0x2ee6ff, transparent: true, opacity: 0.15 }));
    ic.rotation.x = -Math.PI / 2; ic.position.set(0, 0.02, D / 2);
    g.add(ic);
    // Kapı (yukarı kayar)
    const kapiMal = new THREE.MeshStandardMaterial({ color: 0x8a92c2, metalness: 0.8, roughness: 0.25, emissive: 0x000000 });
    const kapi = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.08), kapiMal);
    kapi.position.set(0, H / 2, 0);
    kapi.castShadow = true;
    g.add(kapi);
    // Kapının üstünde ışık
    const lambaMal = new THREE.MeshBasicMaterial({ color: 0xff2030 });
    const lamba = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), lambaMal);
    lamba.position.set(0, H + 0.35, -0.05);
    g.add(lamba);
    const isik = new THREE.PointLight(0xff2030, 3, 4.5, 1.6);
    isik.position.set(0, H + 0.2, -0.6);
    g.add(isik);
    const hale = new THREE.Sprite(new THREE.SpriteMaterial({ map: Cekirdek.parlamaDokusu(), color: 0xff2030, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    hale.position.copy(lamba.position); hale.scale.set(1.2, 1.2, 1);
    g.add(hale);
    // Tuzak: dikenli ağır blok (tavandan iner)
    const tuzak = new THREE.Group();
    const blokMal = new THREE.MeshStandardMaterial({ color: 0x55586a, metalness: 0.9, roughness: 0.3, emissive: 0xff1020, emissiveIntensity: 0 });
    const blok = new THREE.Mesh(new THREE.BoxGeometry(W - 0.06, 0.35, D - 0.06), blokMal);
    tuzak.add(blok);
    for (let i = -1; i <= 1; i++) for (let j = 0; j < 2; j++) {
      const diken = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 8), blokMal);
      diken.rotation.x = Math.PI; diken.position.set(i * 0.45, -0.37, -D / 4 + j * D / 2 - 0.0);
      tuzak.add(diken);
    }
    tuzak.position.set(0, H - 0.25, D / 2);
    g.add(tuzak);
    return { g, kapi, kapiMal, lambaMal, isik, hale, tuzak, blokMal, ic, acik: false, kapiY: 0 };
  }

  function uzayAraciYap() {
    const g = new THREE.Group();
    const govde = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.4, 0.7, 48), new THREE.MeshStandardMaterial({ color: 0x9aa3c7, metalness: 0.9, roughness: 0.25 }));
    g.add(govde);
    const alt = new THREE.Mesh(new THREE.SphereGeometry(2.2, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a3f60, metalness: 0.8, roughness: 0.3 }));
    alt.position.y = -0.2; g.add(alt);
    const kubbe = new THREE.Mesh(new THREE.SphereGeometry(1.8, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x7dff4a, emissive: 0x2a8a10, emissiveIntensity: 0.8, transparent: true, opacity: 0.8 }));
    kubbe.position.y = 0.3; g.add(kubbe);
    const isiklar = [];
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: i % 2 ? 0x2ee6ff : 0xff3b8d }));
      m.position.set(Math.cos(a) * 4.1, 0, Math.sin(a) * 4.1);
      g.add(m); isiklar.push(m);
    }
    // Çekim ışını (koni)
    const isin = new THREE.Mesh(new THREE.CylinderGeometry(1.2, M.R + 0.5, 1, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0x7dff4a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    g.add(isin);
    return { g, isin, isiklar };
  }

  Salon.oyunEkle({
    id: 'kapi',
    ad: 'Son Sığınak',
    ikon: '🛸',
    ozet: 'Kapılar açılınca kabine kaç, uzay aracı gidince hemen çık! Rakibini tuzağa it.',
    kurallar: [
      'Meydanın <b>her tarafında</b> 8 kabin var. Her kabine <b>tek kişi</b> sığar.',
      '<b>5 saniye</b> bütün kapılar kapalı. Sonra bazı kapılar <b>yeşil</b> yanıp açılır: <b>3 saniye</b> içinde en yakın açık kabine gir!',
      'Kapılar kapanır, <b>uzay aracı</b> gelir ve dışarıda kalanları alır.',
      'Sonra kapılar açılır (sarı ışık): <b>2 saniye</b> içinde çık! Çıkmayanın kafasına tavandan <b>tuzak</b> iner.',
      'Çarparak <b>itebilirsin</b>: kapı açıkken rakibini kabine geri it, tuzak onun kafasına insin!',
      'Açık kapı sayısı: 4 kişiyle <b>6 → 4 → 3 → 2 → 1</b>, 2-3 kişiyle <b>4 → 3 → 2 → 1</b>.',
      'Bilgisayar: <b>WASD / ok tuşları</b>. Telefon: <b>sol</b> joystick. Son kalan kazanır.',
    ],
    baslat,
  });

  function baslat(b) {
    const { kanal } = b;
    const d = M.yeni(b.oyuncular.map(o => ({ id: o.id, ad: o.ad, renk: o.renk, bot: o.bot })));
    const grup = new THREE.Group();
    Cekirdek.sahne.add(grup);
    Cekirdek.kameraAyarla(10.4, 1.2);

    // ---------- Meydan ----------
    const zemin = new THREE.Mesh(new THREE.CylinderGeometry(M.R + 1.8, M.R + 2.2, 0.5, 64), new THREE.MeshStandardMaterial({ map: zeminDokusu(), metalness: 0.4, roughness: 0.6 }));
    zemin.position.y = -0.25; zemin.receiveShadow = true;
    grup.add(zemin);
    const kenar = new THREE.Mesh(new THREE.TorusGeometry(M.R + 1.9, 0.08, 8, 96), new THREE.MeshBasicMaterial({ color: 0x9b5cff }));
    kenar.rotation.x = Math.PI / 2; kenar.position.y = 0.01;
    grup.add(kenar);

    // ---------- Kabinler ----------
    const KB = M.KABIN.map(k => {
      const kb = kabinYap();
      kb.g.position.set(k.cx, 0, k.cz);
      kb.g.rotation.y = Math.PI / 2 - k.a;
      grup.add(kb.g);
      return kb;
    });
    // Işık: kırmızı (kapalı), yeşil (gir), sarı (çık!)
    function lambaCiz(kb, renk) {
      const c = renk === true ? 0x3dff6a : renk === 'sari' ? 0xffc21a : renk ? renk : 0xff2030;
      kb.lambaMal.color.set(c); kb.isik.color.set(c); kb.hale.material.color.set(c);
    }
    KB.forEach(kb => lambaCiz(kb, false));

    // ---------- Uzay aracı ----------
    const ufo = uzayAraciYap();
    ufo.g.position.set(0, 26, -80);
    grup.add(ufo.g);
    let ufoDurum = 'uzak';   // uzak → yaklasiyor → ustte (ışın) → gidiyor

    // ---------- Robotlar ----------
    const R = {}, hafiza = {};
    d.oyuncular.forEach(o => {
      const r = Cekirdek.robotYap(o.renk, o.ad, { silahsiz: true });
      r.grup.scale.setScalar(1.15);
      r.konum(o.x, o.z); r.yon(o.a);
      grup.add(r.grup);
      R[o.id] = r;
      hafiza[o.id] = {};
      o.hedefX = o.x; o.hedefZ = o.z;
    });
    const ben = d.oyuncular.find(o => o.id === b.benId);
    let durdu = false, birikim = 0, bittiMi = false, sonSn = null, tuzakUyari = false, tuzakInik = false, tuzakY = H - 0.25;

    function hudOyuncular() { b.hud.oyuncular(d.oyuncular.map(o => ({ ...o, ben: o.id === b.benId }))); }
    hudOyuncular();
    b.hud.bilgi('🛸 Kapılar açılınca en yakın yeşil kapıya koş! Uzay aracı gidince hemen çık.');
    b.hud.ipucu(Kontrol.dokunmatik ? '' : 'WASD / oklar: yürü · Çarparak it!');

    function olu(id, nasil) {
      const o = d.oyuncular.find(p => p.id === id), r = R[id];
      if (nasil === 'tuzak') {
        Cekirdek.patlama(r.grup.position.x, 0.6, r.grup.position.z, o.renk, 0.7);
        r.goster(false);
      } else {
        // Uzay aracının ışını yukarı çeker
        const x0 = r.grup.position.x, z0 = r.grup.position.z;
        Cekirdek.animasyon(1.8, t => {
          r.grup.position.set(x0 * (1 - t * 0.7), t * t * 9, z0 * (1 - t * 0.7));
          r.govde.rotation.y += 0.3; r.saydam(1 - t * 0.8);
        }).then(() => r.goster(false));
      }
    }

    // ---------- Olaylar (herkeste görsel) ----------
    function olayIsle(ol) {
      if (ol.tip === 'bekle') {
        KB.forEach(kb => { kb.acik = false; lambaCiz(kb, false); });
        tuzakInik = false; tuzakUyari = false;
        ufoDurum = 'uzak'; ufo.g.position.set(0, 26, -80); ufo.isin.material.opacity = 0;
        b.hud.bilgi('⏳ Kapılar birazdan açılacak. Hazır ol!');
      } else if (ol.tip === 'acik') {
        ol.acik.forEach(i => { KB[i].acik = true; lambaCiz(KB[i], true); });
        ufoDurum = 'yaklasiyor';
        Ses.din(true);
        b.hud.bilgi(`🟢 ${ol.acik.length} kapı açıldı! Hemen gir!`, true);
      } else if (ol.tip === 'kapanis') {
        KB.forEach(kb => { kb.acik = false; if (!ol.kilit) lambaCiz(kb, false); });
        Ses.dusus();
        if (!ol.kilit) { ufoDurum = 'ustte'; b.hud.bilgi('🛸 Uzay aracı geldi!'); }
        else { tuzakUyari = false; KB.forEach(kb => lambaCiz(kb, false)); }
      } else if (ol.tip === 'saldiri') {
        Ses.belir(); Ses.dusus();
        Cekirdek.salla(0.35);
        ol.olenler.forEach(id => olu(id, 'uzay'));
        const adlar = ol.olenler.map(id => d.oyuncular.find(p => p.id === id).ad);
        b.hud.bilgi(ol.olenler.includes(b.benId) ? '🛸 Uzay aracı seni aldı! Diğerlerini izliyorsun…' : ol.olenler.length ? `🛸 Uzay aracı aldı: ${adlar.join(', ')}` : '😮 Herkes saklandı!', ol.olenler.includes(b.benId));
        hudOyuncular();
      } else if (ol.tip === 'cikis') {
        ufoDurum = 'gidiyor';
        ol.acik.forEach(i => { KB[i].acik = true; lambaCiz(KB[i], 'sari'); });
        Ses.din();
        b.hud.bilgi('🏃 Kapılar açıldı: HEMEN ÇIK! Tuzak inecek. (Rakibini içeri itebilirsin!)', true);
      } else if (ol.tip === 'tuzakUyari') {
        tuzakUyari = true;
        Ses.uyari();
        b.hud.bilgi('⚠️ TUZAK İNİYOR!', true);
      } else if (ol.tip === 'tuzak') {
        tuzakInik = true; tuzakUyari = false;
        Ses.patlama(); Cekirdek.salla(0.25);
        ol.olenler.forEach(id => olu(id, 'tuzak'));
        if (ol.olenler.length) {
          const adlar = ol.olenler.map(id => d.oyuncular.find(p => p.id === id).ad);
          b.hud.bilgi(ol.olenler.includes(b.benId) ? '💀 Tuzak seni ezdi! Diğerlerini izliyorsun…' : `💀 Tuzak ezdi: ${adlar.join(', ')}`, true);
          if (ol.olenler.includes(b.benId)) b.hud.perde('flas');
        } else b.hud.bilgi('Herkes zamanında çıktı.');
        hudOyuncular();
      } else if (ol.tip === 'it') {
        Ses.isabet();
      } else if (ol.tip === 'bitti') bitir();
    }
    // Misafir: evden gelen olayı kendi kopyasına işler
    function aynayaIsle(ol) {
      if (ol.tip === 'bekle') { d.tur = ol.tur; d.kapilar.forEach(k => { k.acik = false; k.dolu = null; }); }
      else if (ol.tip === 'acik' || ol.tip === 'cikis') { d.acikKapilar = ol.acik; d.kapilar.forEach((k, i) => { k.acik = ol.acik.includes(i); }); }
      else if (ol.tip === 'kapanis') d.kapilar.forEach(k => { k.acik = false; });
      else if (ol.tip === 'saldiri' || ol.tip === 'tuzak') (ol.olenler || []).forEach(id => { const o = d.oyuncular.find(p => p.id === id); if (o.canli) { o.canli = false; o.olumSirasi = ++d.olumSayac; o.neden = ol.tip === 'tuzak' ? 'tuzak' : 'uzay'; o.olumTuru = d.tur; } });
      else if (ol.tip === 'it' && ol.id === b.benId) { ben.vx += ol.vx; ben.vz += ol.vz; }
      else if (ol.tip === 'bitti') { d.bitti = true; d.kazanan = ol.kazanan; }
    }

    function bitir() {
      if (bittiMi) return;
      bittiMi = true;
      Kontrol.ac(false);
      const k = d.oyuncular.find(o => o.id === d.kazanan);
      b.hud.buyuk(k ? `🏆 ${k.ad}` : '🤝 BERABERE', '');
      if (k) Cekirdek.animasyon(1.2, t => { R[k.id].grup.position.y = Math.sin(t * Math.PI) * 0.8; R[k.id].yon(k.a + t * Math.PI * 4); });
      const siralama = [...d.oyuncular].sort((a, c) => (c.canli - a.canli) || (c.olumSirasi - a.olumSirasi)).map(o => ({
        id: o.id, neden: o.canli ? '🏆 son sığınağa girdi' : o.neden === 'tuzak' ? `💀 ${o.olumTuru}. turda tuzakta ezildi` : `🛸 ${o.olumTuru}. turda uzay aracına yem oldu`,
      }));
      setTimeout(() => { if (!durdu) b.bitti({ kazanan: d.kazanan, siralama, aciklama: k ? 'Uzay aracından kaçan son robot o!' : 'Kimse kurtulamadı.' }); }, 1300);
    }

    // ---------- Ağ ----------
    const girdiler = {};
    let giden = [], yayinSayac = 0, gondermeSayac = 0;
    if (kanal.evMi) {
      kanal.evDinle((m, id) => {
        if (m.t !== 'g' || id === b.benId) return;
        const x = +m.x, z = +m.z;
        if (isFinite(x) && isFinite(z)) girdiler[id] = { x, z };
      });
    } else {
      kanal.dinle(m => {
        if (durdu || m.t !== 'd') return;
        d.t = m.zt; d.faz = m.faz; d.fazKalan = m.kalan;
        m.k.forEach(([acik, dolu], i) => { d.kapilar[i].acik = !!acik; d.kapilar[i].dolu = dolu; });
        m.o.forEach(([id, x, z, a]) => {
          if (id === b.benId) return;
          const o = d.oyuncular.find(p => p.id === id);
          o.hedefX = x; o.hedefZ = z; o.a = a;
        });
        m.ol.forEach(ol => { aynayaIsle(ol); olayIsle(ol); });
      });
    }
    const ozetle = () => d.oyuncular.map(o => [o.id, +o.x.toFixed(2), +o.z.toFixed(2), +o.a.toFixed(2), o.canli ? 1 : 0]);

    // ---------- Her kare ----------
    const kaldir = Cekirdek.guncelle((dt, t) => {
      if (durdu) return false;
      if (!bittiMi) {
        const [hx, hz] = Kontrol.hareket();
        if (kanal.evMi) {
          birikim += dt;
          while (birikim >= ADIM && !d.bitti) {
            birikim -= ADIM;
            const g = { [b.benId]: { hx, hz } };
            M.canlilar(d).forEach(o => {
              if (o.bot) g[o.id] = M.botGirdi(d, o.id, hafiza[o.id]);
              else if (o.id !== b.benId && girdiler[o.id]) g[o.id] = girdiler[o.id];
            });
            const ol = M.adim(d, ADIM, g);
            ol.forEach(olayIsle);
            if (kanal.online) giden.push(...ol);
          }
          if (kanal.online && ((yayinSayac += dt) >= YAYIN_SN || giden.some(o => o.tip === 'bitti'))) {
            yayinSayac = 0;
            kanal.yayinla({ t: 'd', zt: d.t, faz: d.faz, kalan: d.fazKalan, o: ozetle(), k: d.kapilar.map(k => [k.acik ? 1 : 0, k.dolu]), ol: giden });
            giden = [];
          }
        } else {
          // Misafir: kendi robotumu yürütürüm (kapı ve kabin kurallarını da uygularım)
          d.fazKalan -= dt;
          if (ben.canli) {
            const hareket = d.faz !== 'baslangic';
            let ax = hareket ? hx : 0, az = hareket ? hz : 0;
            const L = Math.hypot(ax, az); if (L > 1) { ax /= L; az /= L; }
            const ex = ben.x, ez = ben.z;
            ben.x += (ax * M.HIZ + ben.vx) * dt; ben.z += (az * M.HIZ + ben.vz) * dt;
            const s = Math.exp(-5 * dt); ben.vx *= s; ben.vz *= s;
            M.kisitla(d, ben);
            if (Math.hypot(ben.x - ex, ben.z - ez) > 0.002) ben.a = Math.atan2(ben.z - ez, ben.x - ex);
            if ((gondermeSayac += dt) >= YAYIN_SN) { gondermeSayac = 0; kanal.evaGonder({ t: 'g', x: ben.x, z: ben.z }); }
          }
          d.oyuncular.forEach(o => {
            if (o.id === b.benId || !o.canli) return;
            const k = Math.min(1, dt * 14);
            o.x += (o.hedefX - o.x) * k; o.z += (o.hedefZ - o.z) * k;
          });
        }
      }

      // Üst yazı (sol üstte): aşamaya göre kalan süre
      if (!bittiMi) {
        const sn = Math.max(0, Math.ceil(d.fazKalan));
        const yaz = { baslangic: ['HAZIR', ''], bekle: ['⏳ KAPILAR AÇILACAK', ''], giris: [`🚪 ${d.kapilar.filter(k => k.acik).length} KAPI · GİR!`, 'ates'], kapanis: ['🛸', 'ates'], saldiri: ['🛸', 'ates'], cikis: ['🏃 ÇIK!', 'ates'], tuzak: ['💀', 'ates'], kilit: ['', ''] }[d.faz] || ['', ''];
        const sayac = ['baslangic', 'bekle', 'giris', 'cikis'].includes(d.faz) ? String(Math.max(1, sn)) : '';
        if (sn !== sonSn) { sonSn = sn; if (d.faz === 'baslangic' || (d.faz === 'bekle' && sn <= 3) || d.faz === 'giris') Ses.tik(); }
        b.hud.buyuk(yaz[0], sayac, (yaz[1] + ' yanda').trim(), false);
      }

      // Kapılar yukarı kayar; tuzak çıkışta iner, yeni tura kadar inik kalır
      const hedefTuzak = tuzakInik ? 0.6 : H - 0.25;
      tuzakY += (hedefTuzak - tuzakY) * Math.min(1, dt * (tuzakInik ? 22 : 3));
      KB.forEach((kb, i) => {
        const hedefY = kb.acik ? H - 0.05 : 0;
        kb.kapiY += (hedefY - kb.kapiY) * Math.min(1, dt * 9);
        kb.kapi.position.y = H / 2 + kb.kapiY;
        const buKabin = (d.acikKapilar || []).includes(i);
        kb.tuzak.position.y = buKabin ? tuzakY : H - 0.25;
        const uyar = tuzakUyari && buKabin;
        kb.blokMal.emissiveIntensity = uyar ? (Math.floor(t * 8) % 2 ? 0.9 : 0.1) : 0;
        if (uyar) lambaCiz(kb, Math.floor(t * 8) % 2 ? 0xff2030 : 0xffc21a);
        kb.ic.material.color.set(uyar && Math.floor(t * 8) % 2 ? 0xff2030 : 0x2ee6ff);
        kb.ic.material.opacity = d.kapilar[i].dolu !== null ? 0.4 : 0.15;
        kb.hale.scale.setScalar(1.1 + Math.sin(t * 5 + i) * 0.12);
      });

      // Uzay aracı: kapılar açıkken yaklaşır, kapanınca meydanın üstüne gelir, çıkışta gider
      ufo.isiklar.forEach((m, i) => { m.visible = Math.floor(t * 6 + i) % 2 === 0; });
      ufo.g.rotation.y += dt * 0.8;
      if (ufoDurum === 'yaklasiyor') {
        const p = d.faz === 'giris' ? 1 - Math.max(0, d.fazKalan) / M.SURE.giris : 1;
        ufo.g.position.set(0, 26 - p * 15, -80 + p * 78);
      } else if (ufoDurum === 'ustte') {
        ufo.g.position.lerp(new THREE.Vector3(0, 8.5, 0), Math.min(1, dt * 3));
        ufo.isin.material.opacity = Math.min(0.35, ufo.isin.material.opacity + dt);
        ufo.isin.scale.set(1, 8.5, 1); ufo.isin.position.y = -4.25;
      } else if (ufoDurum === 'gidiyor') {
        ufo.isin.material.opacity = Math.max(0, ufo.isin.material.opacity - dt * 1.5);
        ufo.g.position.y += dt * 12; ufo.g.position.z -= dt * 30;
      }

      // Robotlar
      d.oyuncular.forEach(o => {
        if (!o.canli) return;
        R[o.id].konum(o.x, o.z); R[o.id].yon(o.a);
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
      koptu(id) { const o = d.oyuncular.find(p => p.id === id); if (o) { o.bot = true; delete girdiler[id]; } },
    };
  }
})();
