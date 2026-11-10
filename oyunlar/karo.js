// =============================================================
// Robo Turnuva - mini oyun: DÜŞEN KARELER
// Kurallar karo-motor.js'te. Burası zemini, işaretleri, duvardaki işareti, titreyen ve düşen
// kareleri çizer; kontrolleri bağlar.
//
// Online: kurallar odayı açanda (kanal.evMi) yürür (60 kare/sn). Ev saniyede 20 kez herkese
// robotların yerini ve olayları (yeni tur, titreme, düşüş, itme, düşen oyuncu) yollar.
// Misafir kendi robotunu kendi cihazında yürütür, yerini eve gönderir; itilince evden gelen
// itme hızını kendine uygular.
// Mesajlar: ev → herkes { t: 'd', zt, faz, kalan, o: [[id, x, z, a, canli]], ol: [olaylar] }
//           oyuncu → ev { t: 'g', x, z }
// =============================================================

(() => {
  const M = KaroMotor;
  const ADIM = 1 / 60, YAYIN_SN = 0.05;
  const SEKIL_AD = ['KARE', 'YUVARLAK', 'ÜÇGEN'];
  const SEKIL_EMOJI = ['🟩', '🟢', '🔺'];

  // İşaret çizimi (yeşil parlak)
  function sekilCiz(g, s, cx, cy, r, renk = '#5dff6a', kalin = 10, aci = 0) {
    g.save();
    if (aci) { g.translate(cx, cy); g.rotate(aci); g.translate(-cx, -cy); }
    g.strokeStyle = renk; g.lineWidth = kalin; g.lineJoin = 'round';
    g.shadowColor = renk; g.shadowBlur = kalin * 2.2;
    g.beginPath();
    if (s === 0) g.rect(cx - r * 0.82, cy - r * 0.82, r * 1.64, r * 1.64);
    else if (s === 1) g.arc(cx, cy, r, 0, Math.PI * 2);
    else { g.moveTo(cx, cy - r); g.lineTo(cx + r * 0.95, cy + r * 0.7); g.lineTo(cx - r * 0.95, cy + r * 0.7); g.closePath(); }
    g.stroke(); g.stroke();
    g.restore();
  }
  function karoDokusu(s) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const z = g.createLinearGradient(0, 0, 128, 128);
    z.addColorStop(0, '#1e2340'); z.addColorStop(1, '#141830');
    g.fillStyle = z; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#2e3560'; g.lineWidth = 4; g.strokeRect(4, 4, 120, 120);
    sekilCiz(g, s, 64, 66, 30, '#5dff6a', 7);
    const d = new THREE.CanvasTexture(c);
    d.colorSpace = THREE.SRGBColorSpace;
    d.anisotropy = 4;
    return d;
  }
  function duvarDokusu() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 288;
    const d = new THREE.CanvasTexture(c);
    d.colorSpace = THREE.SRGBColorSpace;
    const g = c.getContext('2d');
    d.ciz = (s, yazi = '', sn = null, aci = 0) => {
      g.fillStyle = '#0a0c1c'; g.fillRect(0, 0, 512, 288);
      g.strokeStyle = sn !== null && sn <= 3 ? '#ff3050' : '#2ee6ff'; g.lineWidth = 6; g.strokeRect(6, 6, 500, 276);
      if (s !== null && s !== undefined) sekilCiz(g, s, 220, 150, 96, aci ? '#9fb4ff' : '#5dff6a', 16, aci);
      if (sn !== null) {
        g.fillStyle = sn <= 3 ? '#ff5070' : '#e6ecff'; g.font = '900 84px Orbitron, sans-serif'; g.textAlign = 'center';
        g.fillText(String(sn), 430, 178);
      }
      if (yazi) { g.fillStyle = '#e6ecff'; g.font = '900 54px Orbitron, sans-serif'; g.textAlign = 'center'; g.fillText(yazi, 256, 168); }
      d.needsUpdate = true;
    };
    return d;
  }

  Salon.oyunEkle({
    id: 'karo',
    ad: 'Düşen Kareler',
    ikon: '🔷',
    ozet: 'Duvarda hangi işaret çıkarsa o kareye koş! Diğerleri titreyip düşer. İt, kaç, son kalan sen ol.',
    kurallar: [
      'Yerde 8×8 kare var; her karenin üstünde parlayan bir <b>kare</b>, <b>yuvarlak</b> ya da <b>üçgen</b> işareti var.',
      'Her turda karşı duvardaki ekran döner, işaretler hızla değişir. <b>Son 2 saniye</b> kala doğru işaret belli olur: hemen o işaretli bir kareye koş!',
      'Süre bitince diğer kareler <b>titrer</b>, sonra <b>düşer</b>. Üstünde kalan da düşer ve elenir.',
      'Kareler düştükten sonra <b>3 saniye</b> itişme zamanı! Sonra düşenlerin <b>yarısı</b> küçük gruplar halinde sırayla geri gelir. Her turda işaretler karışır.',
      'Köşeleri birbirine değen iki kare arasından <b>çapraz geçebilirsin</b>; ama köşenin yanından, boşluktan geçersen düşersin!',
      'Koşarak çarpan rakibini <b>iter</b>. İtip boşluğa düşürebilirsin!',
      'Bilgisayar: <b>WASD / ok tuşları</b>. Telefon: <b>sol</b> joystick. Ayakta kalan son robot kazanır.',
    ],
    baslat,
  });

  function baslat(b) {
    const { kanal } = b;
    const d = M.yeni(b.oyuncular.map(o => ({ id: o.id, ad: o.ad, renk: o.renk, bot: o.bot })));
    const grup = new THREE.Group();
    Cekirdek.sahne.add(grup);
    Cekirdek.kameraAyarla(9.2, 0.9);

    // ---------- Zemin kareleri ----------
    const ustMal = [0, 1, 2].map(s => new THREE.MeshStandardMaterial({ map: karoDokusu(s), roughness: 0.5, metalness: 0.3, emissive: 0xffffff, emissiveMap: karoDokusu(s), emissiveIntensity: 0.55 }));
    const yanMal = new THREE.MeshStandardMaterial({ color: 0x2a3050, metalness: 0.6, roughness: 0.4 });
    const titreMal = new THREE.MeshStandardMaterial({ color: 0xff3050, emissive: 0xff1030, emissiveIntensity: 0.6, roughness: 0.5 });
    const karoGeo = new THREE.BoxGeometry(M.T - 0.05, 0.45, M.T - 0.05);
    const K = d.karolar.map((k, no) => {
      const i = no % M.N, j = Math.floor(no / M.N);
      const [x, z] = M.merkez(i, j);
      const m = new THREE.Mesh(karoGeo, [yanMal, yanMal, ustMal[k.sekil], yanMal, yanMal, yanMal]);
      m.position.set(x, -0.225, z);
      m.receiveShadow = true;
      grup.add(m);
      return { m, x, z, y: 0, durum: 'duruyor', hiz: 0, don: [0, 0] };
    });
    function karoSekil(no, s) { K[no].m.material[2] = ustMal[s]; }

    // ---------- Karşı duvar ----------
    const duvarD = duvarDokusu();
    duvarD.ciz(null, 'HAZIR');
    const duvar = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 4.05), new THREE.MeshBasicMaterial({ map: duvarD }));
    duvar.position.set(0, 2.6, -M.YARI - 2.2);
    grup.add(duvar);
    const cerceve = new THREE.Mesh(new THREE.BoxGeometry(7.8, 4.6, 0.3), new THREE.MeshStandardMaterial({ color: 0x1b1f3a, metalness: 0.7, roughness: 0.35 }));
    cerceve.position.set(0, 2.6, -M.YARI - 2.4);
    grup.add(cerceve);
    const duvarIsik = new THREE.PointLight(0x5dff6a, 0, 14, 1.4);
    duvarIsik.position.set(0, 2.6, -M.YARI - 1.2);
    grup.add(duvarIsik);

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

    let durdu = false, birikim = 0, bittiMi = false, sonSn = null, gizli = true, sonTik = null;
    function hudOyuncular() { b.hud.oyuncular(d.oyuncular.map(o => ({ ...o, ben: o.id === b.benId }))); }
    hudOyuncular();
    b.hud.bilgi('Duvardaki işaret son 2 saniyede belli olur. O an doğru kareye koş!');
    b.hud.ipucu(Kontrol.dokunmatik ? '' : 'WASD / oklar: yürü · Çarparak it!');

    // ---------- Olaylar (herkeste görsel) ----------
    function olayIsle(ol) {
      if (ol.tip === 'secim') {
        ol.sekiller.forEach((s, no) => karoSekil(no, s));
        gizli = true; sonSn = null;
        Ses.din();
        b.hud.bilgi(`🎲 İşaret ${M.GOSTER_SN} saniye kala belli olacak. Hazır ol!`);
      } else if (ol.tip === 'goster') {
        gizli = false;
        duvarD.ciz(ol.hedef, '', M.GOSTER_SN);
        duvarIsik.intensity = 6;
        Ses.din(true);
        b.hud.bilgi(`${SEKIL_EMOJI[ol.hedef]} ${SEKIL_AD[ol.hedef]}! KOŞ!`, true);
      } else if (ol.tip === 'itisme') {
        b.hud.bilgi('💪 Kareler birazdan geri gelecek. İtişme zamanı!');
      } else if (ol.tip === 'titreme') {
        Ses.uyari();
        b.hud.bilgi('⚠️ Kareler titriyor!', true);
        d.karolar.forEach((k, no) => { if (k.titre) K[no].durum = 'titre'; });
      } else if (ol.tip === 'dusus') {
        Ses.dusus();
        Cekirdek.salla(0.3);
        ol.karolar.forEach(no => { K[no].durum = 'dus'; K[no].hiz = 0; K[no].don = [(Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2]; });
        duvarD.ciz(null, '');
        duvarIsik.intensity = 0;
      } else if (ol.tip === 'geriGel') {
        ol.karolar.forEach(no => { const k = K[no]; k.durum = 'gel'; k.y = -10; k.m.rotation.set(0, 0, 0); k.m.visible = true; });
        if (ol.karolar.length) Ses.belir();
      } else if (ol.tip === 'it') {
        Ses.isabet();
        if (ol.id === b.benId) Cekirdek.salla(0.15);
      } else if (ol.tip === 'dustu') {
        const o = d.oyuncular.find(p => p.id === ol.id);
        Ses.dusus();
        const r = R[o.id];
        const y0 = r.grup.position.y;
        Cekirdek.animasyon(1.2, t => { r.grup.position.y = y0 - t * t * 14; r.govde.rotation.x = t * 4; }).then(() => r.goster(false));
        b.hud.bilgi(o.id === b.benId ? '💀 Düştün! Diğerlerini izliyorsun…' : `🕳️ ${o.ad} düştü!`, o.id === b.benId);
        if (o.id === b.benId) b.hud.perde('flas');
        hudOyuncular();
      } else if (ol.tip === 'bitti') bitir();
    }

    // Misafir: evden gelen olayı kendi kopyasına işler
    function aynayaIsle(ol) {
      if (ol.tip === 'secim') { d.tur = ol.tur; d.gosterildi = false; ol.sekiller.forEach((s, no) => { d.karolar[no].sekil = s; d.karolar[no].titre = false; }); }
      else if (ol.tip === 'goster') { d.hedef = ol.hedef; d.gosterildi = true; }
      else if (ol.tip === 'titreme') d.karolar.forEach(k => { k.titre = k.var && k.sekil !== d.hedef; });
      else if (ol.tip === 'dusus') ol.karolar.forEach(no => { d.karolar[no].var = false; d.karolar[no].titre = false; });
      else if (ol.tip === 'geriGel') ol.karolar.forEach(no => { d.karolar[no].var = true; });
      else if (ol.tip === 'it' && ol.id === b.benId) { ben.vx += ol.vx; ben.vz += ol.vz; }
      else if (ol.tip === 'dustu') { const o = d.oyuncular.find(p => p.id === ol.id); o.canli = false; }
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
        id: o.id, neden: o.canli ? `🏆 ${d.tur} tur ayakta kaldı` : `🕳️ ${o.olumSirasi}. düşen`,
      }));
      setTimeout(() => { if (!durdu) b.bitti({ kazanan: d.kazanan, siralama, aciklama: k ? 'Düşmeden ayakta kalan son robot o!' : 'Son robotlar aynı anda düştü.' }); }, 1200);
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
      // Misafirin kopyasında olumSirasi için sayaç
      let olum = 0;
      kanal.dinle(m => {
        if (durdu || m.t !== 'd') return;
        d.t = m.zt; d.faz = m.faz; d.fazKalan = m.kalan;
        m.o.forEach(([id, x, z, a, canli]) => {
          const o = d.oyuncular.find(p => p.id === id);
          if (id !== b.benId) { o.hedefX = x; o.hedefZ = z; o.a = a; }
        });
        m.ol.forEach(ol => { if (ol.tip === 'dustu') { const o = d.oyuncular.find(p => p.id === ol.id); if (o.canli) o.olumSirasi = ++olum; } aynayaIsle(ol); olayIsle(ol); });
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
            // Misafiri ev yerinden itemez (misafir kendini yürütür): itme hızı misafire olay olarak gider
            ol.forEach(olayIsle);
            if (kanal.online) giden.push(...ol);
          }
          if (kanal.online && ((yayinSayac += dt) >= YAYIN_SN || giden.some(o => o.tip === 'bitti'))) {
            yayinSayac = 0;
            kanal.yayinla({ t: 'd', zt: d.t, faz: d.faz, kalan: d.fazKalan, o: ozetle(), ol: giden });
            giden = [];
          }
        } else {
          // Misafir: kendi robotumu yürütürüm (itilince gelen hız da eklenir)
          d.fazKalan -= dt;
          if (ben.canli) {
            const hareket = d.faz !== 'baslangic';
            let ax = hareket ? hx : 0, az = hareket ? hz : 0;
            const L = Math.hypot(ax, az); if (L > 1) { ax /= L; az /= L; }
            ben.vx ??= 0; ben.vz ??= 0;
            const ex = ben.x, ez = ben.z;
            ben.x += (ax * M.HIZ + ben.vx) * dt; ben.z += (az * M.HIZ + ben.vz) * dt;
            const s = Math.exp(-5 * dt); ben.vx *= s; ben.vz *= s;
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

      // Üst yazı: işaret ve kalan süre
      if (!bittiMi) {
        if (d.faz === 'baslangic') {
          const sn = Math.max(1, Math.ceil(d.fazKalan));
          if (sn !== sonSn) { sonSn = sn; Ses.bip(); }
          b.hud.buyuk('HAZIR', String(sn));
        } else if (d.faz === 'secim') {
          // Duvarda işaret ve kalan saniye (üstteki yazı duvarı kapatmasın)
          const sn = Math.max(0, Math.ceil(d.fazKalan));
          if (gizli) {
            // İşaret belli değil: ekrandaki işaret döner ve hızla değişir (soluk renkte)
            const s = Math.floor(t * 6) % 3;
            duvarD.ciz(s, '', sn, t * 7);
            sonSn = sn;
            if (sn !== sonTik) { sonTik = sn; if (sn > M.GOSTER_SN) Ses.tik(); }
          } else if (sn !== sonSn) { sonSn = sn; if (sn > 0) Ses.tik(); duvarD.ciz(d.hedef, '', sn); }
          b.hud.buyuk('');
        } else b.hud.buyuk('');
      }

      // Kareler: titreme, düşme, geri gelme
      K.forEach(k => {
        if (k.durum === 'titre') {
          k.m.position.set(k.x + (Math.random() - 0.5) * 0.09, -0.225 + (Math.random() - 0.5) * 0.06, k.z + (Math.random() - 0.5) * 0.09);
          k.m.material[0] = titreMal;
        } else if (k.durum === 'dus') {
          k.hiz += 22 * dt; k.y -= k.hiz * dt;
          k.m.position.set(k.x, -0.225 + k.y, k.z);
          k.m.rotation.x += k.don[0] * dt; k.m.rotation.z += k.don[1] * dt;
          if (k.y < -30) { k.durum = 'yok'; k.m.visible = false; }
        } else if (k.durum === 'gel') {
          k.y += (0 - k.y) * Math.min(1, dt * 5);
          k.m.position.set(k.x, -0.225 + k.y, k.z);
          if (k.y > -0.01) { k.y = 0; k.durum = 'duruyor'; k.m.position.y = -0.225; }
        } else if (k.durum === 'duruyor') {
          k.m.position.set(k.x, -0.225, k.z);
        }
        if (k.durum !== 'titre' && k.m.material[0] === titreMal) k.m.material[0] = yanMal;
      });

      // Robotlar
      d.oyuncular.forEach(o => {
        if (!o.canli) return;
        R[o.id].konum(o.x, o.z); R[o.id].yon(o.a);
      });
      duvarIsik.intensity *= 0.995;
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
