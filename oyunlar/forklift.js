// =============================================================
// Robo Turnuva - mini oyun: KUTU KAPMACA (forklift)
// Kurallar forklift-motor.js'te. Burası platformu, köşe bölgelerini, forkliftleri (üstünde robot),
// tahta kutuları ve yukarıdan düşüşlerini çizer; kontrolleri bağlar.
//
// Online: kurallar odayı açanda (kanal.evMi) yürür (60 kare/sn). Ev saniyede 20 kez herkese
// forkliftlerin ve kutuların yerini, olayları yollar. Misafir kendi forkliftini kendi cihazında sürer,
// yerini eve gönderir; "al/bırak" için { t: 'e' } yollar; çarpılınca gelen itme hızını kendine ekler.
// Mesajlar: ev → herkes { t: 'd', zt, kalan, o: [[id, x, z, a, kutu]], k: [[id, x, z, y, tasiyan]], ol }
//           oyuncu → ev { t: 'g', x, z, a }  { t: 'e' }
// =============================================================

(() => {
  const M = ForkliftMotor;
  const ADIM = 1 / 60, YAYIN_SN = 0.05;

  function zeminDokusu() {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#2a2e45'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#3a4066'; g.lineWidth = 4; g.strokeRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(255,210,59,0.25)'; g.lineWidth = 3; g.setLineDash([16, 12]);
    g.strokeRect(20, 20, 216, 216);
    const d = new THREE.CanvasTexture(c);
    d.wrapS = d.wrapT = THREE.RepeatWrapping; d.repeat.set(M.P / 1.5, M.P / 1.5);
    d.colorSpace = THREE.SRGBColorSpace;
    return d;
  }
  function kasaDokusu() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#b07a3e'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? '#a06a32' : '#c08a4a'; g.fillRect(0, i * 26, 128, 24); }
    g.strokeStyle = '#5a3a18'; g.lineWidth = 10; g.strokeRect(5, 5, 118, 118);
    g.beginPath(); g.moveTo(10, 10); g.lineTo(118, 118); g.stroke();
    const d = new THREE.CanvasTexture(c);
    d.colorSpace = THREE.SRGBColorSpace;
    return d;
  }

  // Forklift (ileri yönü +x): gövde, karşı ağırlık, tekerlekler, direk, çatallar, tavan; üstünde robot
  function forkliftYap(renk, ad) {
    const g = new THREE.Group();
    const boya = new THREE.MeshStandardMaterial({ color: renk, metalness: 0.4, roughness: 0.45 });
    const koyu = new THREE.MeshStandardMaterial({ color: 0x23263a, metalness: 0.7, roughness: 0.4 });
    const sari = new THREE.MeshStandardMaterial({ color: 0xffc21a, metalness: 0.3, roughness: 0.5 });
    const kutu = (sx, sy, sz, x, y, z, m) => { const k = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); k.position.set(x, y, z); k.castShadow = true; g.add(k); return k; };
    kutu(1.1, 0.45, 0.85, -0.05, 0.38, 0, boya);
    kutu(0.3, 0.55, 0.85, -0.55, 0.45, 0, koyu);                 // karşı ağırlık
    [[0.35, 0.42], [0.35, -0.42], [-0.4, 0.42], [-0.4, -0.42]].forEach(([x, z]) => {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.16, 16), koyu);
      t.rotation.x = Math.PI / 2; t.position.set(x, 0.2, z); g.add(t);
    });
    // Kabin direkleri ve tavan
    [[0.25, 0.36], [0.25, -0.36], [-0.4, 0.36], [-0.4, -0.36]].forEach(([x, z]) => kutu(0.05, 0.85, 0.05, x, 1.0, z, koyu));
    kutu(0.75, 0.05, 0.8, -0.08, 1.43, 0, koyu);
    // Direk ve çatal (çatal yüksekliği kutu taşırken değişir)
    kutu(0.08, 1.5, 0.08, 0.6, 0.75, 0.25, sari);
    kutu(0.08, 1.5, 0.08, 0.6, 0.75, -0.25, sari);
    const catal = new THREE.Group();
    [0.2, -0.2].forEach(z => { const f = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.1), sari); f.position.set(0.97, 0, z); f.castShadow = true; catal.add(f); });
    const arka = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.6), sari); arka.position.set(0.64, 0.18, 0); catal.add(arka);
    catal.position.y = 0.12;
    g.add(catal);
    // Sürücü robot
    const robot = Cekirdek.robotYap(renk, ad, { silahsiz: true });
    robot.grup.scale.setScalar(0.55);
    robot.grup.position.set(-0.12, 0.45, 0);
    robot.parilti.visible = false;
    g.add(robot.grup);
    return { g, catal, robot };
  }

  Salon.oyunEkle({
    id: 'forklift',
    ad: 'Kutu Kapmaca',
    ikon: '📦',
    ozet: 'Forklift sür, ortaya düşen kutuları kendi köşene taşı! Rakipten çalmak serbest.',
    kurallar: [
      'Herkes bir <b>forklift</b> sürer ve kare platformun bir köşesinde <b>kendi bölgesi</b> vardır.',
      `Açılışta ortada <b>4 kutu</b> hazır durur. Sonra her <b>${M.DUSUS_ARA} saniyede</b> ortaya yukarıdan <b>2 kutu</b> düşer.`,
      'Kutunun önüne gel ve <b>AL</b> (boşluk / sol tık / düğme). Kendi bölgene götür: bölgen <b>yeşil</b> yanınca boş bir yere <b>BIRAK</b>. Kutular üst üste konmaz; taşıdığın kutuyla diğerlerini ileri itebilirsin.',
      'Rakibin bölgesindeki kutuyu alıp kendine götürebilirsin! Kutu taşıyana hızla çarparsan kutusunu düşürür.',
      'Süre bitince bölgesinde <b>en çok kutu</b> olan kazanır.',
      'Bilgisayar: <b>WASD / ok tuşları</b> sür. Telefon: <b>sol</b> joystick, alttaki düğme.',
    ],
    ayarlar: [{ id: 'sure', ad: 'Süre (sn)', secenekler: [60, 90, 120], varsayilan: 90 }],
    baslat,
  });

  function baslat(b) {
    const { kanal } = b;
    const sure = [60, 90, 120].includes(+b.ayar?.sure) ? +b.ayar.sure : 90;
    const d = M.yeni(b.oyuncular.map(o => ({ id: o.id, ad: o.ad, renk: o.renk, bot: o.bot })), sure);
    const grup = new THREE.Group();
    Cekirdek.sahne.add(grup);
    Cekirdek.kameraAyarla(M.P + 0.8, 1.05);

    // ---------- Platform ve bölgeler ----------
    const zemin = new THREE.Mesh(new THREE.BoxGeometry(M.P * 2, 0.5, M.P * 2), new THREE.MeshStandardMaterial({ map: zeminDokusu(), roughness: 0.8, metalness: 0.3 }));
    zemin.position.y = -0.25; zemin.receiveShadow = true;
    grup.add(zemin);
    const kenar = new THREE.Mesh(new THREE.BoxGeometry(M.P * 2 + 0.4, 0.3, M.P * 2 + 0.4), new THREE.MeshBasicMaterial({ color: 0x9b5cff }));
    kenar.position.y = -0.4; grup.add(kenar);
    const BOL = M.BOLGE.map((bo, i) => {
      const o = d.oyuncular[i];
      const renk = new THREE.Color(o ? o.renk : '#555a70');
      const mal = new THREE.MeshBasicMaterial({ color: renk, transparent: true, opacity: o ? 0.28 : 0.12, depthWrite: false });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(M.Z, M.Z), mal);
      m.rotation.x = -Math.PI / 2; m.position.set(bo.cx, 0.02, bo.cz);
      const cizgiMal = new THREE.LineBasicMaterial({ color: renk });
      const h = M.Z / 2;
      const cizgi = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[-h, -h], [h, -h], [h, h], [-h, h]].map(([x, z]) => new THREE.Vector3(bo.cx + x, 0.04, bo.cz + z))), cizgiMal);
      grup.add(m, cizgi);
      return { mal, cizgiMal, renk };
    });

    // ---------- Forkliftler ----------
    const F = {}, hafiza = {};
    d.oyuncular.forEach(o => {
      const f = forkliftYap(o.renk, o.id === b.benId ? `${o.ad} (sen)` : o.ad);
      grup.add(f.g);
      F[o.id] = f;
      hafiza[o.id] = {};
      o.hedefX = o.x; o.hedefZ = o.z; o.hedefA = o.a;
    });
    const ben = d.oyuncular.find(o => o.id === b.benId);

    // ---------- Kutular ----------
    const kasaMal = new THREE.MeshStandardMaterial({ map: kasaDokusu(), roughness: 0.75 });
    const kasaGeo = new THREE.BoxGeometry(M.KUTU * 2, M.KUTU * 2, M.KUTU * 2);
    const golgeGeo = new THREE.CircleGeometry(M.KUTU * 1.2, 20);
    const K = new Map();   // kutu no → { m, golge }
    function kasa(id) {
      let n = K.get(id);
      if (!n) {
        const m = new THREE.Mesh(kasaGeo, kasaMal); m.castShadow = m.receiveShadow = true;
        const golge = new THREE.Mesh(golgeGeo, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
        golge.rotation.x = -Math.PI / 2;
        grup.add(m, golge);
        n = { m, golge, don: Math.random() * Math.PI };
        K.set(id, n);
      }
      return n;
    }

    // ---------- Eylem düğmesi ----------
    let eylemIstek = false;
    const dugme = document.createElement('button');
    dugme.id = 'flEylem';
    dugme.textContent = '📦 AL';
    document.body.appendChild(dugme);
    dugme.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); eylemIstek = true; });
    const fareBas = e => { if ((e.target === Cekirdek.tuval || e.target.id === 'dokunmaAlani') && e.button === 0 && e.pointerType === 'mouse') eylemIstek = true; };
    const tus = e => { if (!e.repeat && (e.code === 'Space' || e.code === 'Enter') && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); eylemIstek = true; } };
    window.addEventListener('pointerdown', fareBas);
    window.addEventListener('keydown', tus);

    let durdu = false, birikim = 0, bittiMi = false, sonSn = null;
    function hudOyuncular() {
      const s = M.sayim(d);
      b.hud.oyuncular(d.oyuncular.map((o, i) => ({ ...o, ben: o.id === b.benId, ek: `📦 ${s[i]}` })));
    }
    hudOyuncular();
    b.hud.bilgi('Ortaya düşen kutuları kendi köşene taşı!');
    b.hud.ipucu(Kontrol.dokunmatik ? '' : 'WASD: sür · Boşluk / sol tık: al-bırak');

    // ---------- Olaylar ----------
    function olayIsle(ol) {
      if (ol.tip === 'kutu') { Ses.uyari(); }
      else if (ol.tip === 'aldi') { Ses.tik(); if (ol.id === b.benId) b.hud.bilgi('📦 Kutu sende! Kendi bölgene götür, yeşil yanınca bırak.'); }
      else if (ol.tip === 'birakti') {
        if (ol.neden === 'carpma') { Ses.isabet(); const o = d.oyuncular.find(p => p.id === ol.id); b.hud.bilgi(ol.id === b.benId ? '💥 Çarptılar, kutun düştü!' : `💥 ${o.ad} kutusunu düşürdü!`); }
        else { Ses.din(); if (ol.id === b.benId) b.hud.bilgi('✅ Kutu bölgende!'); }
        hudOyuncular();
      } else if (ol.tip === 'it') { Cekirdek.salla(ol.id === b.benId ? 0.15 : 0.05); }
      else if (ol.tip === 'yerYok') { if (ol.id === b.benId) { Ses.uyari(); b.hud.bilgi('⛔ Burada kutu var! Boş bir yere götür ya da kutuyu ileri it.', true); } }
      else if (ol.tip === 'bitti') bitir(ol);
    }
    function bitir(ol) {
      if (bittiMi) return;
      bittiMi = true;
      Kontrol.ac(false);
      const s = ol.sayim || M.sayim(d);
      const k = d.oyuncular.find(o => o.id === ol.kazanan);
      b.hud.buyuk(k ? `🏆 ${k.ad}` : '🤝 BERABERE', '');
      const siralama = [...d.oyuncular].map((o, i) => ({ o, n: s[i] })).sort((a, c) => c.n - a.n).map(({ o, n }) => ({ id: o.id, neden: `📦 ${n} kutu` }));
      setTimeout(() => { if (!durdu) b.bitti({ kazanan: ol.kazanan, siralama, aciklama: k ? 'Bölgesinde en çok kutu onda!' : 'Kutu sayıları eşit!' }); }, 1300);
    }

    // ---------- Ağ ----------
    const girdiler = {};
    let giden = [], yayinSayac = 0, gondermeSayac = 0;
    if (kanal.evMi) {
      kanal.evDinle((m, id) => {
        if (id === b.benId) return;
        if (m.t === 'g') { const x = +m.x, z = +m.z, a = +m.a; if ([x, z, a].every(isFinite)) girdiler[id] = { ...(girdiler[id] || {}), x, z, a }; }
        else if (m.t === 'e') (girdiler[id] ??= {}).eylem = true;
      });
    } else {
      kanal.dinle(m => {
        if (durdu || m.t !== 'd') return;
        d.t = m.zt; d.kalan = m.kalan;
        m.o.forEach(([id, x, z, a, kutu]) => {
          const o = d.oyuncular.find(p => p.id === id);
          o.kutu = kutu;
          if (id === b.benId) return;
          o.hedefX = x; o.hedefZ = z; o.hedefA = a;
        });
        // Kutular: evdeki listeyle aynı olsun
        const varOlan = new Set();
        m.k.forEach(([id, x, z, y, tasiyan]) => {
          varOlan.add(id);
          let k = d.kutular.find(q => q.id === id);
          if (!k) { k = { id, x, z, y, tasiyan }; d.kutular.push(k); }
          Object.assign(k, { x, z, y, tasiyan });
        });
        d.kutular = d.kutular.filter(k => varOlan.has(k.id));
        m.ol.forEach(ol => {
          if (ol.tip === 'it' && ol.id === b.benId) { ben.vx += ol.vx; ben.vz += ol.vz; }
          if (ol.tip === 'bitti') { d.bitti = true; d.kazanan = ol.kazanan; }
          olayIsle(ol);
        });
        hudOyuncular();
      });
    }
    const ozetle = () => d.oyuncular.map(o => [o.id, +o.x.toFixed(2), +o.z.toFixed(2), +o.a.toFixed(2), o.kutu]);
    const kutuOzet = () => d.kutular.map(k => [k.id, +k.x.toFixed(2), +k.z.toFixed(2), +k.y.toFixed(2), k.tasiyan]);

    // ---------- Her kare ----------
    const kaldir = Cekirdek.guncelle((dt, t) => {
      if (durdu) return false;
      if (!bittiMi) {
        const [hx, hz] = Kontrol.hareket();
        if (kanal.evMi) {
          birikim += dt;
          while (birikim >= ADIM && !d.bitti) {
            birikim -= ADIM;
            const g = { [b.benId]: { hx, hz, eylem: eylemIstek } };
            eylemIstek = false;
            d.oyuncular.forEach(o => {
              if (o.bot) g[o.id] = M.botGirdi(d, o.id, hafiza[o.id]);
              else if (o.id !== b.benId && girdiler[o.id]) { g[o.id] = girdiler[o.id]; girdiler[o.id] = { ...girdiler[o.id], eylem: false }; }
            });
            const ol = M.adim(d, ADIM, g);
            ol.forEach(olayIsle);
            if (kanal.online) giden.push(...ol);
          }
          if (kanal.online && ((yayinSayac += dt) >= YAYIN_SN || giden.some(o => o.tip === 'bitti'))) {
            yayinSayac = 0;
            kanal.yayinla({ t: 'd', zt: d.t, kalan: d.kalan, o: ozetle(), k: kutuOzet(), ol: giden });
            giden = [];
          }
        } else {
          // Misafir: kendi forkliftimi sürerim
          d.t += dt;
          if (d.t >= 0) {
            M.sur(ben, hx, hz, dt);
            const s = Math.exp(-5 * dt); ben.vx *= s; ben.vz *= s;
          }
          if ((gondermeSayac += dt) >= YAYIN_SN) { gondermeSayac = 0; kanal.evaGonder({ t: 'g', x: ben.x, z: ben.z, a: ben.a }); }
          if (eylemIstek) { eylemIstek = false; kanal.evaGonder({ t: 'e' }); }
          d.oyuncular.forEach(o => {
            if (o.id === b.benId) return;
            const k = Math.min(1, dt * 14);
            o.x += (o.hedefX - o.x) * k; o.z += (o.hedefZ - o.z) * k;
            let fark = o.hedefA - o.a; fark = Math.atan2(Math.sin(fark), Math.cos(fark)); o.a += fark * k;
          });
        }
      }

      // Üst yazı: kalan süre (sol üstte)
      if (!bittiMi) {
        if (d.t < 0) {
          const sn = Math.ceil(-d.t);
          if (sn !== sonSn) { sonSn = sn; Ses.bip(); }
          b.hud.buyuk('HAZIR', String(sn), 'yanda');
        } else {
          const sn = Math.max(0, Math.ceil(d.kalan));
          if (sn !== sonSn) { sonSn = sn; if (sn <= 5 && sn > 0) Ses.tik(); }
          b.hud.buyuk('⏱ SÜRE', `${Math.floor(sn / 60)}:${String(sn % 60).padStart(2, '0')}`, sn <= 10 ? 'ates yanda' : 'yanda', false);
        }
        dugme.textContent = ben.kutu !== null ? (M.bolgede(ben.bolge, ben.x, ben.z) ? '✅ BIRAK' : '📦 BÖLGENE GÖTÜR') : '📦 AL';
        dugme.classList.toggle('yesil', ben.kutu !== null && M.bolgede(ben.bolge, ben.x, ben.z));
      }

      // Bölgeler: sahibi kutuyla içindeyse yeşil yanar
      d.oyuncular.forEach((o, i) => {
        const yesil = o.kutu !== null && M.bolgede(i, o.x, o.z);
        const bo = BOL[i];
        bo.mal.color.set(yesil ? 0x3dff6a : bo.renk);
        bo.mal.opacity = yesil ? 0.5 + Math.sin(t * 10) * 0.12 : 0.28;
        bo.cizgiMal.color.set(yesil ? 0x3dff6a : bo.renk);
      });

      // Forkliftler
      d.oyuncular.forEach(o => {
        const f = F[o.id];
        f.g.position.set(o.x, 0, o.z);
        f.g.rotation.y = -o.a;
        f.catal.position.y += ((o.kutu !== null ? 0.45 : 0.12) - f.catal.position.y) * Math.min(1, dt * 10);
      });
      // Kutular
      const var_ = new Set();
      d.kutular.forEach(k => {
        var_.add(k.id);
        const n = kasa(k.id);
        if (k.tasiyan !== null) {
          const o = d.oyuncular.find(p => p.id === k.tasiyan);
          const [ux, uz] = M.catalUcu(o);
          n.m.position.set(ux - Math.cos(o.a) * 0.05, F[o.id].catal.position.y + M.KUTU + 0.03, uz - Math.sin(o.a) * 0.05);
          n.m.rotation.set(0, -o.a, 0);
        } else {
          n.m.position.set(k.x, M.KUTU + k.y, k.z);
          n.m.rotation.set(0, n.don, 0);
        }
        n.golge.visible = k.y > 0.05;
        n.golge.position.set(k.x, 0.03, k.z);
        n.golge.scale.setScalar(1 - k.y / 12);
      });
      K.forEach((n, id) => { if (!var_.has(id)) { grup.remove(n.m, n.golge); K.delete(id); } });
      if (Math.floor(t * 4) !== Math.floor((t - dt) * 4)) hudOyuncular();
    });

    return {
      durdur() {
        durdu = true;
        kaldir();
        window.removeEventListener('pointerdown', fareBas);
        window.removeEventListener('keydown', tus);
        dugme.remove();
        Object.values(F).forEach(f => f.robot.sil());
        Cekirdek.sahne.remove(grup);
        grup.traverse(n => { n.geometry?.dispose(); });
      },
      koptu(id) { const o = d.oyuncular.find(p => p.id === id); if (o) { o.bot = true; delete girdiler[id]; } },
    };
  }
})();
