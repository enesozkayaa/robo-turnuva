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

    // Kolonlar: metal gövde, parlayan halkalar. Her kolonun kendi rengi var (inmeden önce kırmızı yanar)
    return M.KOLONLAR.map(([x, z]) => {
      const kg = new THREE.Group();
      kg.position.set(x, 0, z);
      const mal = new THREE.MeshStandardMaterial({ color: 0x6a74a8, metalness: 0.6, roughness: 0.35, emissive: 0xff1030, emissiveIntensity: 0 });
      const halkaMal = new THREE.MeshBasicMaterial({ color: 0x2ee6ff });
      const k = new THREE.Mesh(new THREE.CylinderGeometry(M.KOLON_R, M.KOLON_R * 1.08, 2.6, 24), mal);
      k.position.y = 1.1; k.castShadow = k.receiveShadow = true;
      kg.add(k);
      [0.25, 1.6].forEach(y => {
        const r = new THREE.Mesh(new THREE.TorusGeometry(M.KOLON_R + 0.03, 0.035, 8, 32), halkaMal);
        r.rotation.x = Math.PI / 2; r.position.y = y;
        kg.add(r);
      });
      const isik = new THREE.PointLight(0x2ee6ff, 1.6, 4, 2);
      isik.position.y = 0.6;
      kg.add(isik);
      grup.add(kg);
      return { kg, mal, halkaMal, isik, uyari: false };
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
      'Kurşunların hızı hep aynı ama her <b>8 saniyede</b> silahlar <b>daha sık</b> ateş eder. Sonunda kurşunlar <b>peş peşe, durmadan</b> çıkar!',
      `Her <b>${M.KOLON_SN} saniyede</b> bir kolon önce kırmızı yanıp söner, sonra yere iner. Kimse elenmezse sonunda oda bomboş kalır!`,
      'Herkesin <b>3 canı</b> var. Vurulunca 1 can gider ve kısa süre yanıp sönersin (o sırada kurşun işlemez). Canı biten elenir.',
      'Bilgisayar: <b>WASD / ok tuşları</b> yürü, <b>fare</b> nişan. Telefon: <b>sol</b> joystick yürü, <b>sağ</b> joystick nişan.',
      'Ayakta kalan son robot kazanır.',
    ],
    baslat,
  });

  // Online: kurallar odayı açanda (kanal.evMi) yürür (60 kare/sn). Ev saniyede 20 kez herkese
  // robotların yerini, canlarını ve olayları (yeni kurşun, vuruş, kolon) yollar. Misafir kendi robotunu
  // kendi cihazında yürütür (gecikme hissedilmesin) ve yerini eve gönderir; kurşunları kendisi ilerletir.
  // Mesajlar: ev → herkes { t: 'd', zt, o: [[id, x, z, a, can, koruma, canli, olumSirasi]], ol: [olaylar] }
  //           oyuncu → ev { t: 'g', x, z, a }
  const YAYIN_SN = 0.05;

  function baslat(b) {
    const { kanal } = b;
    const d = M.yeni(b.oyuncular.map(o => ({ id: o.id, ad: o.ad, renk: o.renk, bot: o.bot })));
    const grup = new THREE.Group();
    Cekirdek.sahne.add(grup);
    const KOLON = odaKur(grup);
    const R = {}, hafiza = {};
    d.oyuncular.forEach(o => {
      const r = Cekirdek.robotYap(o.renk, o.ad);
      r.grup.scale.setScalar(1.25);
      r.konum(o.x, o.z); r.yon(o.a);
      grup.add(r.grup);
      R[o.id] = r;
      hafiza[o.id] = {};
      o.hedefX = o.x; o.hedefZ = o.z; o.hedefA = o.a;
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

    // Ekrandaki etkiler (herkeste aynı)
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
      } else if (ol.tip === 'kolonUyari') {
        KOLON[ol.i].uyari = true;
        Ses.uyari();
        b.hud.bilgi('⚠️ Kırmızı yanan kolon iniyor! Arkasında saklanma.', true);
      } else if (ol.tip === 'kolonGitti') {
        const k = KOLON[ol.i];
        k.uyari = false;
        Ses.dusus();
        Cekirdek.salla(0.2);
        kivilcim(grup, M.KOLONLAR[ol.i][0], M.KOLONLAR[ol.i][1], 0xff3050, 18);
        b.hud.bilgi(ol.kalan ? `🧱 Bir kolon indi! ${ol.kalan} kolon kaldı.` : '🧱 Son kolon da indi! Artık saklanacak yer yok!', !ol.kalan);
        Cekirdek.animasyon(0.9, t => { k.kg.position.y = -2.8 * t * t; k.isik.intensity = 1.6 * (1 - t); })
          .then(() => { k.kg.visible = false; });
      } else if (ol.tip === 'bitti') {
        bitir();
      }
    }

    // Misafir: evden gelen olayı kendi kopyasına işler (kurşun ekle/sil, can, kolon)
    function aynayaIsle(ol) {
      if (ol.tip === 'ates' && ol.kr) d.kursunlar.push({ ...ol.kr });
      else if (ol.tip === 'carpti' || ol.tip === 'vurdu') d.kursunlar = d.kursunlar.filter(k => k.k !== ol.k);
      if (ol.tip === 'vurdu') { const o = d.oyuncular.find(p => p.id === ol.id); o.can = ol.can; o.koruma = M.KORUMA ?? 1.2; }
      else if (ol.tip === 'elendi') { const o = d.oyuncular.find(p => p.id === ol.id); o.canli = false; o.can = 0; }
      else if (ol.tip === 'kolonGitti') d.kolonlar = d.kolonlar.filter(k => k.i !== ol.i);
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
        id: o.id,
        neden: o.canli ? `🏆 ${kalpler(o.can)} ile ayakta kaldı` : `💀 ${o.olumSirasi}. elenen`,
      }));
      setTimeout(() => { if (!durdu) b.bitti({ kazanan: d.kazanan, siralama }); }, 1200);
    }

    // ---------- Ağ ----------
    const girdiler = {};          // (ev) misafirlerin son gönderdiği yer/yön
    let giden = [], yayinSayac = 0, gondermeSayac = 0;
    if (kanal.evMi) {
      kanal.evDinle((m, id) => {
        if (m.t !== 'g' || id === b.benId) return;
        const x = +m.x, z = +m.z, a = +m.a;
        if ([x, z, a].every(isFinite)) girdiler[id] = { x, z, a };
      });
    } else {
      kanal.dinle(m => {
        if (durdu || m.t !== 'd') return;
        d.t = m.zt;
        m.o.forEach(([id, x, z, a, can, koruma, canli, olumSirasi]) => {
          const o = d.oyuncular.find(p => p.id === id);
          Object.assign(o, { can, koruma, canli: !!canli, olumSirasi });
          if (id === b.benId) {
            // Kendi robotum bende yürür; ev çok farklı bir yer biliyorsa (ör. itildim) ona uyarım
            if (Math.hypot(o.x - x, o.z - z) > 2) { o.x = x; o.z = z; }
          } else { o.hedefX = x; o.hedefZ = z; o.hedefA = a; }
        });
        m.ol.forEach(ol => { aynayaIsle(ol); olayIsle(ol); });
      });
    }
    const ozetle = () => d.oyuncular.map(o => [o.id, +o.x.toFixed(2), +o.z.toFixed(2), +o.a.toFixed(2), o.can, +o.koruma.toFixed(2), o.canli ? 1 : 0, o.olumSirasi]);

    const kaldir = Cekirdek.guncelle((dt, t) => {
      if (durdu) return false;
      if (!bittiMi) {
        // Benim girdim: yürüme + nişan (nişan verilmezse yürüdüğüm yöne bakarım)
        let [hx, hz] = Kontrol.hareket();
        const a = ben.canli ? Kontrol.nisan(ben.x, ben.z, KY) : null;
        if (a !== null) benA = a;
        else if (Kontrol.dokunmatik && Math.hypot(hx, hz) > 0.2) benA = Math.atan2(hz, hx);   // telefonda nişan yoksa yürüdüğü yöne
        if (kanal.evMi) {
          birikim += dt;
          while (birikim >= ADIM && !d.bitti) {
            birikim -= ADIM;
            const g = { [b.benId]: { hx, hz, a: benA } };
            M.canlilar(d).forEach(o => {
              if (o.bot) g[o.id] = M.botGirdi(d, o.id, hafiza[o.id]);
              else if (o.id !== b.benId && girdiler[o.id]) g[o.id] = girdiler[o.id];
            });
            const ol = M.adim(d, ADIM, g);
            ol.forEach(olayIsle);
            if (kanal.online) giden.push(...ol);
          }
          // Herkese durum
          if (kanal.online && ((yayinSayac += dt) >= YAYIN_SN || giden.some(o => o.tip === 'bitti'))) {
            yayinSayac = 0;
            kanal.yayinla({ t: 'd', zt: d.t, o: ozetle(), ol: giden });
            giden = [];
          }
        } else {
          // Misafir: kendi robotumu yürütürüm, kurşunları ilerletirim
          d.t += dt;
          if (ben.canli) {
            if (d.t < 0) hx = hz = 0;
            M.hareketEt(d, ben, hx, hz, dt);
            ben.a = benA;
            if ((gondermeSayac += dt) >= YAYIN_SN) { gondermeSayac = 0; kanal.evaGonder({ t: 'g', x: ben.x, z: ben.z, a: ben.a }); }
          }
          d.kursunlar = d.kursunlar.filter(k => {
            k.x += k.dx * k.hiz * dt; k.z += k.dz * k.hiz * dt;
            if (Math.abs(k.x) > M.ODA.w || Math.abs(k.z) > M.ODA.h) return false;
            return !d.kolonlar.some(({ x, z }) => Math.hypot(k.x - x, k.z - z) < M.KOLON_R + M.KURSUN_R);
          });
          d.oyuncular.forEach(o => {
            if (o.id === b.benId) return;
            const k = Math.min(1, dt * 14);
            o.x += (o.hedefX - o.x) * k; o.z += (o.hedefZ - o.z) * k;
            let fark = o.hedefA - o.a; fark = Math.atan2(Math.sin(fark), Math.cos(fark));
            o.a += fark * k;
          });
          d.oyuncular.forEach(o => { if (o.koruma > 0) o.koruma = Math.max(0, o.koruma - dt); });
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

      // İnecek kolon kırmızı yanıp söner
      KOLON.forEach(k => {
        const yan = k.uyari && Math.floor(t * 4) % 2 === 0;
        k.mal.emissiveIntensity = yan ? 0.9 : 0;
        k.halkaMal.color.set(yan ? 0xff2040 : 0x2ee6ff);
      });

      // Kurşunlar
      const var_ = new Set();
      d.kursunlar.forEach(k => {
        var_.add(k.k);
        let n = KURSUN.get(k.k);
        if (!n) { n = kursunYap(renk(k.sahip)); grup.add(n); KURSUN.set(k.k, n); }
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
      // (ev) Bağlantısı kopan oyuncunun yerine bot oynar
      koptu(id) {
        const o = d.oyuncular.find(p => p.id === id);
        if (o) o.bot = true;
      },
    };
  }
})();
