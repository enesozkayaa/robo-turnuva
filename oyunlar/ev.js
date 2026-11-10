// =============================================================
// Robo Turnuva - mini oyun: KARANLIK EV
// Kurallar ev-motor.js'te. Burası kuş bakışı evi (odalar, duvarlar, eşyalar), silahı,
// karanlığı, fenerleri ve lazeri çizer; kontrolleri bağlar.
// Karanlıkta başka bir robotu ancak bir fener onu aydınlatıyorsa ya da onun feneri açıksa görürsün.
//
// Online: kurallar odayı açanda (kanal.evMi). Ev önce evin tohumunu yollar (herkes aynı evi kurar),
// sonra saniyede 20 kez yerleri ve olayları yollar. Misafir kendi robotunu kendi cihazında yürütür,
// yerini/fenerini eve gönderir; ateş edince { t: 'ates' } yollar.
// Mesajlar: ev → herkes { t: 'harita', tohum, turSayisi }  { t: 'd', zt, faz, kalan, isik, avci, o, ol }
//           oyuncu → ev { t: 'g', x, z, a, fener }  { t: 'ates' }
// =============================================================

(() => {
  const M = EvMotor;
  const ADIM = 1 / 60, YAYIN_SN = 0.05, DUVAR_H = 1.3;
  const ODA_RENK = [0x3b3150, 0x2f3d52, 0x3f3a2c, 0x2c4238, 0x47303a];
  const ESYA_RENK = { dolap: [0x7a4a2a, 0x5d3a22], masa: [0xa0703a, 0x8a6030], sandik: [0x8a5a2a, 0x6b4520], yatak: [0x4a6aa8, 0x6a4a98], kitaplik: [0x5a3a20, 0x4a2e18] };

  function evKur(grup, h) {
    // Oda zeminleri
    h.odalar.forEach(o => {
      const [cx, cz] = M.hucreMerkez(o.i, o.j);
      const z = new THREE.Mesh(new THREE.PlaneGeometry(M.C, M.C), new THREE.MeshStandardMaterial({ color: o.salon ? 0x23305a : ODA_RENK[o.renk], roughness: 0.85 }));
      z.rotation.x = -Math.PI / 2; z.position.set(cx, 0, cz); z.receiveShadow = true;
      grup.add(z);
    });
    const duvarMal = new THREE.MeshStandardMaterial({ color: 0xc8cde0, roughness: 0.7 });
    const ustMal = new THREE.MeshBasicMaterial({ color: 0x8f97c0 });
    h.kutular.forEach(k => {
      const w = k.x2 - k.x1, dd = k.z2 - k.z1;
      if (k.tip === 'duvar') {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, DUVAR_H, dd), [duvarMal, duvarMal, ustMal, duvarMal, duvarMal, duvarMal]);
        m.position.set((k.x1 + k.x2) / 2, DUVAR_H / 2, (k.z1 + k.z2) / 2);
        m.castShadow = m.receiveShadow = true;
        grup.add(m);
        return;
      }
      const renk = ESYA_RENK[k.tip][k.renk % 2];
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, k.h, dd), new THREE.MeshStandardMaterial({ color: renk, roughness: 0.7 }));
      m.position.set((k.x1 + k.x2) / 2, k.h / 2, (k.z1 + k.z2) / 2);
      m.castShadow = m.receiveShadow = true;
      grup.add(m);
      // Küçük ayrıntılar: yatakta yastık, dolapta kapı çizgisi, masada üst tabla
      if (k.tip === 'yatak') {
        const uzun = dd > w;
        const y = new THREE.Mesh(new THREE.BoxGeometry(uzun ? w * 0.8 : 0.35, 0.12, uzun ? 0.35 : dd * 0.8), new THREE.MeshStandardMaterial({ color: 0xf0f0f6 }));
        y.position.set(uzun ? (k.x1 + k.x2) / 2 : k.x1 + 0.25, k.h + 0.06, uzun ? k.z1 + 0.25 : (k.z1 + k.z2) / 2);
        grup.add(y);
      } else if (k.tip === 'masa') {
        const t = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.06, dd + 0.08), new THREE.MeshStandardMaterial({ color: 0xc89058 }));
        t.position.set((k.x1 + k.x2) / 2, k.h + 0.03, (k.z1 + k.z2) / 2);
        grup.add(t);
      } else if (k.tip === 'dolap' || k.tip === 'kitaplik') {
        const t = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 0.04, dd * 0.92), new THREE.MeshStandardMaterial({ color: 0x3a2412 }));
        t.position.set((k.x1 + k.x2) / 2, k.h + 0.02, (k.z1 + k.z2) / 2);
        grup.add(t);
      }
    });
  }

  function silahYap() {
    const g = new THREE.Group();
    const govde = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.14), new THREE.MeshStandardMaterial({ color: 0x23263a, metalness: 0.7, roughness: 0.3 }));
    const namlu = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.4, 12), new THREE.MeshStandardMaterial({ color: 0x3a3f60, metalness: 0.8 }));
    namlu.rotation.z = Math.PI / 2; namlu.position.x = 0.35;
    const uc = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff2040 }));
    uc.position.x = 0.56;
    const kabza = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.12), new THREE.MeshStandardMaterial({ color: 0xff3b8d }));
    kabza.position.set(-0.12, -0.15, 0);
    g.add(govde, namlu, uc, kabza);
    return g;
  }

  Salon.oyunEkle({
    id: 'ev',
    ad: 'Karanlık Ev',
    ikon: '🔦',
    ozet: 'Silahı bulan avcı olur, ışıklar söner. Fenerle saklan, avcıya yakalanma!',
    kurallar: [
      'Kuş bakışı bir evdesiniz: odalar, kapılar, dolaplar, masalar. Herkes ortadaki salondan başlar.',
      'Ekranda sadece bulunduğun <b>oda</b> görünür; kapıdan geçince diğer odaya geçersin. Odalardan birinde <b>lazer silahı</b> saklı: ara! İlk bulan <b>avcı</b> olur ve <b>ışıklar söner</b> (30 saniye).',
      'Karanlıkta herkesin <b>feneri</b> var (aç/kapa). Fener yakını gösterir ama feneri açık olanı uzaktan herkes görür! Avcının feneri çok sönüktür.',
      'Avcı <b>lazerle</b> ateş eder: lazer duvar ve eşyadan geçmez, kapılardan geçer. Bir eşyanın arkasına saklan!',
      'Sonra <b>ışıklar açılır</b> (10 saniye): kaç, avcı da kovalar.',
      `Puan: tur sonunda kalan her saklanan <b>+${M.PUAN.kalan}</b>, avcı vurduğu her kişi için <b>+${M.PUAN.vurus}</b>. En çok puanı toplayan kazanır.`,
      'Bilgisayar: <b>WASD</b> yürü, <b>fare</b> nişan, <b>sol tık / boşluk</b>: fener aç-kapa ya da ateş. Telefon: sol joystick yürü, sağ joystick nişan, alttaki düğme.',
    ],
    ayarlar: [{ id: 'tur', ad: 'Kaç tur?', secenekler: [1, 2, 3, 4, 5], varsayilan: 3 }],
    baslat,
  });

  function baslat(b) {
    const { kanal } = b;
    const turSayisi = [1, 2, 3, 4, 5].includes(+b.ayar?.tur) ? +b.ayar.tur : 3;
    const grup = new THREE.Group();
    Cekirdek.sahne.add(grup);
    Cekirdek.kameraAyarla(M.YARI + 0.8, 1.45);
    let d = null, R = {}, hafiza = {}, ben = null, silah = null, silahIsik = null, maske = [], kam = null;
    let durdu = false, birikim = 0, bittiMi = false, sonSn = null, benA = 0, atesIstek = false;
    let isikHedef = 1, isikSimdi = 1;
    const FENER_RENK = 0xfff2c8;

    // ---------- Telefon/bilgisayar eylem düğmesi ----------
    const dugme = document.createElement('button');
    dugme.id = 'evEylem';
    dugme.textContent = '🔦 FENER';
    document.body.appendChild(dugme);
    function eylem() {
      if (!d || !ben?.canli || bittiMi) return;
      if (ben.id === d.avci) { if (d.faz === 'karanlik' || d.faz === 'aydinlik') atesIstek = true; }
      else if (!d.isikAcik) { ben.fener = !ben.fener; Ses.tik(); }
    }
    dugme.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); eylem(); });
    const fareBas = e => { if (e.target === Cekirdek.tuval && e.button === 0 && e.pointerType === 'mouse') eylem(); };
    const tus = e => {
      if (e.repeat || document.activeElement?.tagName === 'INPUT') return;
      if (e.code === 'Space' || e.code === 'KeyF') { e.preventDefault(); eylem(); }
    };
    window.addEventListener('pointerdown', fareBas);
    window.addEventListener('keydown', tus);

    function hudOyuncular() {
      if (!d) return;
      b.hud.oyuncular(d.oyuncular.map(o => ({ ...o, ben: o.id === b.benId, ek: `⭐${d.puan[o.id]}${o.id === d.avci ? ' 🔫' : ''}` })));
    }

    // ---------- Evi kur (tohum gelince) ----------
    function kur(tohum) {
      d = M.yeni(b.oyuncular.map(o => ({ id: o.id, ad: o.ad, renk: o.renk, bot: o.bot })), tohum, turSayisi);
      evKur(grup, d.harita);
      d.oyuncular.forEach(o => {
        const r = Cekirdek.robotYap(o.renk, o.ad, { silahsiz: true });
        r.grup.scale.setScalar(0.95);
        grup.add(r.grup);
        // Fener: robotun önüne doğru dar bir ışık (duvarlar gölge yapar)
        const isik = new THREE.SpotLight(FENER_RENK, 0, M.FENER.menzil + 1, M.FENER.aci, 0.45, 1.2);
        isik.castShadow = true;
        isik.shadow.mapSize.set(512, 512);
        isik.shadow.camera.near = 0.2; isik.shadow.camera.far = M.FENER.menzil + 2;
        const hedef = new THREE.Object3D();
        grup.add(isik, hedef);
        isik.target = hedef;
        // Avcının elindeki silah (görünmez başlar)
        const tabanca = silahYap();
        tabanca.position.set(0.22, 0.78, 0.3);
        tabanca.visible = false;
        r.govde.add(tabanca);
        R[o.id] = { r, isik, hedef, tabanca };
        hafiza[o.id] = {};
      });
      ben = d.oyuncular.find(o => o.id === b.benId);
      // Maske: bulunduğun odanın dışını kapatan 4 siyah perde (sadece o oda görünsün)
      maske = [0, 1, 2, 3].map(() => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x04030c }));
        m.rotation.x = -Math.PI / 2; m.position.y = DUVAR_H + 0.05; m.renderOrder = 5;
        grup.add(m);
        return m;
      });
      silah = silahYap();
      silah.scale.setScalar(1.6);
      silahIsik = new THREE.PointLight(0xff3050, 6, 4, 1.6);
      grup.add(silah, silahIsik);
      hudOyuncular();
    }

    // ---------- Olaylar ----------
    function olayIsle(ol) {
      if (ol.tip === 'tur') {
        d.silah = ol.silah;
        silah.visible = true; silahIsik.visible = true;
        Object.values(R).forEach(x => { x.tabanca.visible = false; x.r.goster(true); x.r.saydam(1); x.r.grup.position.y = 0; });
        isikHedef = 1;
        b.hud.bilgi(`🔎 Tur ${ol.tur}/${d.turSayisi}: silah odalardan birinde saklı. Odaları gez, ilk bulan avcı olur!`);
        Ses.din(true);
        hudOyuncular();
      } else if (ol.tip === 'silahAlindi') {
        d.avci = ol.id;
        silah.visible = false; silahIsik.visible = false;
        R[ol.id].tabanca.visible = true;
        const o = d.oyuncular.find(p => p.id === ol.id);
        b.hud.bilgi(ol.id === b.benId ? '🔫 Silah sende! Işıklar sönüyor… Avla!' : `🔫 Silahı ${o.ad} buldu! Işıklar sönüyor, SAKLAN!`, true);
        hudOyuncular();
      } else if (ol.tip === 'karanlik') {
        isikHedef = 0.03;
        Ses.dusus();
      } else if (ol.tip === 'aydinlik') {
        isikHedef = 1;
        Ses.din(true);
        b.hud.bilgi(ben.id === d.avci ? '💡 Işıklar açıldı! Kovala!' : '💡 Işıklar açıldı! KAÇ!', true);
      } else if (ol.tip === 'ates') {
        const o = d.oyuncular.find(p => p.id === ol.id);
        const isin = Cekirdek.isinYap('#ff2040');
        isin.ayarla(ol.x1, ol.z1, ol.x2, ol.z2, 0.78);
        grup.add(isin.grup);
        Ses.lazer();
        Cekirdek.animasyon(0.35, t => isin.opaklik(1 - t)).then(() => grup.remove(isin.grup));
        void o;
      } else if (ol.tip === 'vuruldu') {
        const o = d.oyuncular.find(p => p.id === ol.id);
        const x = R[o.id].r.grup.position;
        Cekirdek.patlama(x.x, 0.6, x.z, o.renk, 0.8);
        Ses.patlama();
        R[o.id].r.goster(false);
        R[o.id].isik.intensity = 0;
        b.hud.bilgi(o.id === b.benId ? '💀 Avcı seni vurdu! İzliyorsun…' : `💥 Avcı ${o.ad}'ı vurdu!`, o.id === b.benId);
        if (o.id === b.benId) b.hud.perde('flas');
        hudOyuncular();
      } else if (ol.tip === 'turSonu') {
        d.puan = ol.puan;
        isikHedef = 1;
        const avci = d.oyuncular.find(p => p.id === ol.avci);
        const kalan = ol.kalan.map(id => d.oyuncular.find(p => p.id === id).ad);
        b.hud.bilgi(`🏁 Tur bitti! ${kalan.length ? `Kurtulan: ${kalan.join(', ')} (+${M.PUAN.kalan})` : 'Kimse kurtulamadı'} · ${avci ? `${avci.ad} ${ol.vurus} vuruş (+${ol.vurus * M.PUAN.vurus})` : ''}`);
        Ses.kazanma();
        hudOyuncular();
      } else if (ol.tip === 'bitti') bitir(ol);
    }
    function aynayaIsle(ol) {
      if (ol.tip === 'tur') {
        d.tur = ol.tur; d.avci = null; d.isikAcik = true;
        d.oyuncular.forEach(o => { o.canli = true; o.fener = false; });
      } else if (ol.tip === 'silahAlindi') d.avci = ol.id;
      else if (ol.tip === 'karanlik') d.isikAcik = false;
      else if (ol.tip === 'aydinlik') { d.isikAcik = true; d.oyuncular.forEach(o => { o.fener = false; }); }
      else if (ol.tip === 'vuruldu') { const o = d.oyuncular.find(p => p.id === ol.id); o.canli = false; o.fener = false; }
      else if (ol.tip === 'turSonu') d.puan = ol.puan;
      else if (ol.tip === 'bitti') { d.bitti = true; d.kazanan = ol.kazanan; d.puan = ol.puan; }
    }

    function bitir(ol) {
      if (bittiMi) return;
      bittiMi = true;
      Kontrol.ac(false);
      d.puan = ol.puan;
      hudOyuncular();
      const k = d.oyuncular.find(o => o.id === ol.kazanan);
      b.hud.buyuk(k ? `🏆 ${k.ad}` : '🤝 BERABERE', '');
      const siralama = [...d.oyuncular].sort((a, c) => d.puan[c.id] - d.puan[a.id]).map(o => ({ id: o.id, neden: `⭐ ${d.puan[o.id]} puan` }));
      setTimeout(() => { if (!durdu) b.bitti({ kazanan: ol.kazanan, siralama, aciklama: k ? 'En çok puanı o topladı!' : 'Puanlar eşit!' }); }, 1300);
    }

    // ---------- Ağ ----------
    const girdiler = {};
    let giden = [], yayinSayac = 0, gondermeSayac = 0;
    if (kanal.evMi) {
      const tohum = Math.floor(Math.random() * 1e9);
      kur(tohum);
      // Harita her şeyden önce gitsin (misafir evi kurmadan durum gelirse kaçırır)
      if (kanal.online) kanal.yayinla({ t: 'harita', tohum, turSayisi });
      kanal.evDinle((m, id) => {
        if (id === b.benId) return;
        if (m.t === 'g') {
          const x = +m.x, z = +m.z, a = +m.a;
          if ([x, z, a].every(isFinite)) girdiler[id] = { ...(girdiler[id] || {}), x, z, a, fener: !!m.fener };
        } else if (m.t === 'ates') (girdiler[id] ??= {}).ates = true;
      });
    } else {
      kanal.dinle(m => {
        if (durdu) return;
        if (m.t === 'harita') { if (!d) kur(m.tohum); return; }
        if (m.t !== 'd' || !d) return;
        d.t = m.zt; d.faz = m.faz; d.fazKalan = m.kalan; d.isikAcik = !!m.isik; d.avci = m.avci;
        if (m.s) d.silah = m.s;
        if (m.p) d.puan = m.p;
        m.o.forEach(([id, x, z, a, canli, fener]) => {
          const o = d.oyuncular.find(p => p.id === id);
          if (id === b.benId) { if (!canli) o.canli = false; return; }   // kendi fenerim bende
          o.fener = !!fener;
          o.hedefX = x; o.hedefZ = z; o.a = a; o.canli = !!canli;
          if (o.ilk === undefined) { o.ilk = true; o.x = x; o.z = z; }
        });
        // Tur başında herkes salona döner: kendi yerimi de evden al
        m.ol.forEach(ol => {
          aynayaIsle(ol);
          if (ol.tip === 'tur') { const kendim = m.o.find(x => x[0] === b.benId); if (kendim) { ben.x = kendim[1]; ben.z = kendim[2]; } d.oyuncular.forEach(o => { const s = m.o.find(x => x[0] === o.id); if (s) { o.x = o.hedefX = s[1]; o.z = o.hedefZ = s[2]; } }); }
          olayIsle(ol);
        });
      });
    }
    const ozetle = () => d.oyuncular.map(o => [o.id, +o.x.toFixed(2), +o.z.toFixed(2), +o.a.toFixed(2), o.canli ? 1 : 0, o.fener ? 1 : 0]);

    // ---------- Her kare ----------
    const kaldir = Cekirdek.guncelle((dt, t) => {
      if (durdu || !d) return;
      if (!bittiMi) {
        const [hx, hz] = Kontrol.hareket();
        if (ben.canli) {
          const a = Kontrol.nisan(ben.x, ben.z, 0.78);
          if (a !== null) benA = a; else if (Math.hypot(hx, hz) > 0.2) benA = Math.atan2(hz, hx);
        }
        if (kanal.evMi) {
          birikim += dt;
          while (birikim >= ADIM && !d.bitti) {
            birikim -= ADIM;
            const g = { [b.benId]: { hx, hz, a: benA, fener: ben.fener, ates: atesIstek } };
            atesIstek = false;
            M.canlilar(d).forEach(o => {
              if (o.bot) g[o.id] = M.botGirdi(d, o.id, hafiza[o.id]);
              else if (o.id !== b.benId && girdiler[o.id]) { g[o.id] = girdiler[o.id]; girdiler[o.id] = { ...girdiler[o.id], ates: false }; }
            });
            // Botların fener isteği motor tarafından uygulanır
            const ol = M.adim(d, ADIM, g);
            ol.forEach(olayIsle);
            if (kanal.online) giden.push(...ol);
          }
          if (kanal.online && ((yayinSayac += dt) >= YAYIN_SN || giden.some(o => o.tip === 'bitti'))) {
            yayinSayac = 0;
            kanal.yayinla({ t: 'd', zt: d.t, faz: d.faz, kalan: d.fazKalan, isik: d.isikAcik ? 1 : 0, avci: d.avci, s: d.silah, p: d.puan, o: ozetle(), ol: giden });
            giden = [];
          }
        } else {
          // Misafir: kendi robotumu yürütürüm
          d.fazKalan -= dt;
          if (ben.canli) {
            const hareket = d.faz !== 'baslangic' && d.faz !== 'son';
            let ax = hareket ? hx : 0, az = hareket ? hz : 0;
            const L = Math.hypot(ax, az); if (L > 1) { ax /= L; az /= L; }
            ben.x += ax * M.HIZ * dt; ben.z += az * M.HIZ * dt;
            M.kutudanIt(d.harita, ben); M.kutudanIt(d.harita, ben);
            ben.a = benA;
            if ((gondermeSayac += dt) >= YAYIN_SN) { gondermeSayac = 0; kanal.evaGonder({ t: 'g', x: ben.x, z: ben.z, a: ben.a, fener: ben.fener }); }
            if (atesIstek) { atesIstek = false; kanal.evaGonder({ t: 'ates' }); }
          }
          d.oyuncular.forEach(o => {
            if (o.id === b.benId || !o.canli) return;
            const k = Math.min(1, dt * 14);
            o.x += (o.hedefX - o.x) * k; o.z += (o.hedefZ - o.z) * k;
          });
        }
      }

      // Işık seviyesi: elenen izleyici biraz daha fazla görür
      const hedefIsik = !ben.canli && isikHedef < 1 ? 0.3 : isikHedef;
      isikSimdi += (hedefIsik - isikSimdi) * Math.min(1, dt * 4);
      Cekirdek.isikSeviyesi(isikSimdi);

      // Üst yazı (sol üstte)
      if (!bittiMi) {
        const sn = Math.max(0, Math.ceil(d.fazKalan));
        const yaz = { baslangic: ['HAZIR', String(Math.max(1, sn)), ''], arama: ['🔎 SİLAHI BUL', '', ''], karanlik: ['🔦 KARANLIK', String(sn), 'gizli'], aydinlik: ['💡 IŞIKLAR AÇIK', String(sn), 'ates'], son: ['🏁 TUR BİTTİ', '', ''] }[d.faz] || ['', '', ''];
        if (sn !== sonSn) { sonSn = sn; if ((d.faz === 'baslangic') || (d.faz !== 'son' && d.faz !== 'arama' && sn <= 3 && sn > 0)) Ses.tik(); }
        b.hud.buyuk(yaz[0], yaz[1], (yaz[2] + ' yanda').trim(), false);
        b.hud.perde(d.faz === 'karanlik' && ben.canli ? 'gizli' : '');
        dugme.textContent = ben.id === d.avci ? '🔫 ATEŞ' : ben.fener ? '🔦 KAPAT' : '🔦 FENER';
        dugme.classList.toggle('acik', !!ben.fener);
        dugme.hidden = !ben.canli || d.faz === 'baslangic' || d.faz === 'son' || (ben.id !== d.avci && d.isikAcik);
      }

      // Silah: döner ve parlar
      silah.visible = silahIsik.visible = d.faz === 'arama' || (d.faz === 'baslangic' && !!d.silah);
      if (silah.visible && d.silah) {
        silah.position.set(d.silah.x, 0.45 + Math.sin(t * 3) * 0.1, d.silah.z);
        silah.rotation.y += dt * 2;
        silahIsik.position.set(d.silah.x, 1, d.silah.z);
      }

      // Kamera ve maske: sadece bulunduğum oda görünür (elenince bütün ev)
      const h = d.harita;
      let hedefKutu;
      if (ben.canli) {
        const k = h.odaKutu[M.odaBul(h, ben.x, ben.z)];
        hedefKutu = { x1: k.x1 - 0.12, z1: k.z1 - 0.12, x2: k.x2 + 0.12, z2: k.z2 + 0.12 };
      } else hedefKutu = { x1: -60, z1: -60, x2: 60, z2: 60 };
      if (!kam) kam = { ...hedefKutu };
      const yumus = Math.min(1, dt * 7);
      ['x1', 'z1', 'x2', 'z2'].forEach(k => { kam[k] += (hedefKutu[k] - kam[k]) * yumus; });
      const genis = 80;
      const [mSol, mSag, mUst, mAlt] = maske;
      mSol.scale.set(genis, genis * 2, 1); mSol.position.set(kam.x1 - genis / 2, DUVAR_H + 0.05, (kam.z1 + kam.z2) / 2);
      mSag.scale.set(genis, genis * 2, 1); mSag.position.set(kam.x2 + genis / 2, DUVAR_H + 0.05, (kam.z1 + kam.z2) / 2);
      mUst.scale.set(kam.x2 - kam.x1, genis, 1); mUst.position.set((kam.x1 + kam.x2) / 2, DUVAR_H + 0.05, kam.z1 - genis / 2);
      mAlt.scale.set(kam.x2 - kam.x1, genis, 1); mAlt.position.set((kam.x1 + kam.x2) / 2, DUVAR_H + 0.05, kam.z2 + genis / 2);
      if (ben.canli) {
        const r = Math.max(kam.x2 - kam.x1, kam.z2 - kam.z1) / 2 + 0.3;
        Cekirdek.kameraOdak((kam.x1 + kam.x2) / 2, (kam.z1 + kam.z2) / 2, r, 1.38);
      } else Cekirdek.kameraOdak(0, 0, M.YARI + 0.8, 1.45);
      const benimOda = ben.canli ? M.odaBul(h, ben.x, ben.z) : null;

      // Robotlar, fenerler ve görünürlük (karanlıkta sadece aydınlanan görünür)
      const izleyen = ben.canli ? ben : null;
      d.oyuncular.forEach(o => {
        const x = R[o.id];
        if (!o.canli) { x.r.goster(false); x.isik.intensity = 0; return; }
        x.r.konum(o.x, o.z); x.r.yon(o.a);
        const avci = o.id === d.avci;
        const fenerAcik = !d.isikAcik && (o.fener || avci);
        const f = avci ? M.AVCI_FENER : M.FENER;
        x.isik.intensity = fenerAcik ? (avci ? 3 : 9) : 0;
        x.isik.distance = f.menzil + 1; x.isik.angle = f.aci;
        x.isik.position.set(o.x, 1.1, o.z);
        x.hedef.position.set(o.x + Math.cos(o.a) * 3, 0, o.z + Math.sin(o.a) * 3);
        const ayniOda = benimOda === null || M.odaBul(h, o.x, o.z) === benimOda;
        const gorunsun = !izleyen || (ayniOda && (d.isikAcik || M.gorunur(d, izleyen, o)));
        x.r.goster(gorunsun);
        x.r.etiket.visible = d.isikAcik || o.id === b.benId;
      });
    });

    if (!kanal.evMi) b.hud.bilgi('⏳ Ev yükleniyor…');

    return {
      durdur() {
        durdu = true;
        kaldir();
        Cekirdek.isikSeviyesi(1);
        window.removeEventListener('pointerdown', fareBas);
        window.removeEventListener('keydown', tus);
        dugme.remove();
        Object.values(R).forEach(x => x.r.sil());
        Cekirdek.sahne.remove(grup);
        grup.traverse(n => { n.geometry?.dispose(); if (n.isLight && n.shadow?.map) n.shadow.map.dispose(); });
      },
      koptu(id) { const o = d?.oyuncular.find(p => p.id === id); if (o) { o.bot = true; delete girdiler[id]; } },
    };
  }
})();
