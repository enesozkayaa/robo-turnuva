// =============================================================
// Robo Turnuva - mini oyun: BEZELYE SOFRASI
// Uzun yemek masası, ikişer karşılıklı 4 robot. Masanın ucunda dev gardiyan robot gazete okur.
// Herkesin tabağında 50 bezelye var: SOL tık = çatalı tabağa batır (bezelye al), SAĞ tık = ye.
// Gardiyan gazeteyi indirip bakarken çatalını oynatanı lazerle vurur (elenir).
// Gazete bazen iner gibi yapar (kandırma); gerçekten inerken de önce çok az belli olur.
// Tabağı ilk bitiren 1. olur; kimse bitiremezse sona kalan kazanır.
//
// Online: kurallar odayı açanda (kanal.evMi). Ev gazetenin ne yaptığını herkese yollar,
// oyuncular hamlelerini (batır/ye) eve gönderir; bakarken hamle yapan vurulur.
// Mesajlar: ev → herkes { t: 'faz', faz, sure, no }  { t: 'e', id, tip, tabak, catalda }
//                       { t: 'vur', id }  { t: 'durum', o: [[id, tabak, catalda, durum, sira]] }  { t: 'bitti', ... }
//           oyuncu → ev { t: 'eylem', tip: 'bat'|'ye', yak }
// =============================================================

(() => {
  const BEZELYE = 50;
  const EYLEM_SN = 0.3;          // çatalın bir hareketi
  const TOLERANS = 0.25;         // gardiyan bakmaya başladıktan sonra bu kadar süre tepki payı
  const BASLANGIC = 3;
  // Gazete: okurken 0 (yukarıda), bakarken 1 (aşağıda)
  const FAZ_SURE = {
    okuyor: () => 2.2 + Math.random() * 4.2,
    kandirma: () => 0.75,
    indiriyor: () => 0.75,
    bakiyor: () => 2 + Math.random() * 1.6,
    kaldiriyor: () => 0.55,
  };
  // Oturma yerleri: [x, z, yön]  (sol taraf +x'e, sağ taraf -x'e bakar)
  const KOLTUK = [[-2.05, 1.3, 0], [2.05, 1.3, Math.PI], [-2.05, -0.8, 0], [2.05, -0.8, Math.PI]];
  const MASA_Y = 0.55, GARDIYAN_Z = -3.6;

  // ---------- Yardımcı çizimler ----------
  function gazeteDokusu() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 360;
    const g = c.getContext('2d');
    g.fillStyle = '#ece6d6'; g.fillRect(0, 0, 512, 360);
    g.fillStyle = '#1a1a1a';
    g.font = '900 52px Georgia, serif'; g.textAlign = 'center';
    g.fillText('ROBO GAZETE', 256, 62);
    g.fillRect(20, 76, 472, 4);
    g.font = '800 26px Georgia, serif';
    g.fillText('BEZELYE HIRSIZLARI ARANIYOR!', 256, 116);
    g.fillStyle = '#555';
    for (let s = 0; s < 3; s++) for (let i = 0; i < 9; i++) {
      const w = 130 + Math.random() * 20;
      g.fillRect(28 + s * 160, 140 + i * 22, w, 9);
    }
    g.fillStyle = '#888'; g.fillRect(340, 140, 140, 90);
    const d = new THREE.CanvasTexture(c);
    d.colorSpace = THREE.SRGBColorSpace;
    return d;
  }
  // Gerçek çatal: yassı sap, daralan boyun, geniş baş, 4 diş (dişler aşağı, sap yukarı).
  // Sapın ucu yerel (0, CATAL_SAP_UCU, 0): robotun eli orayı tutar.
  const CATAL_OLCEK = 2.6, CATAL_SAP_UCU = 0.33;
  const CATAL_DIS_UCU = -0.195 * CATAL_OLCEK;   // dişlerin ucu, çatalın merkezine göre (dünya ölçüsü)
  function catalYap() {
    const g = new THREE.Group();
    const mal = new THREE.MeshStandardMaterial({ color: 0xdfe4ee, metalness: 0.95, roughness: 0.18 });
    const parca = (geo, x, y, rz = 0) => { const m = new THREE.Mesh(geo, mal); m.position.set(x, y, 0); m.rotation.z = rz; m.castShadow = true; g.add(m); return m; };
    // Sap: yassı çubuk ve yuvarlak uç
    parca(new THREE.BoxGeometry(0.034, 0.3, 0.012), 0, 0.26);
    parca(new THREE.CylinderGeometry(0.026, 0.026, 0.012, 16), 0, 0.41).rotation.x = Math.PI / 2;
    // Boyun: dar, başa doğru açılır
    parca(new THREE.BoxGeometry(0.022, 0.1, 0.012), 0, 0.07);
    parca(new THREE.CylinderGeometry(0.012, 0.045, 0.05, 4, 1), 0, 0.0).scale.z = 0.25;
    // Baş ve 4 diş
    parca(new THREE.BoxGeometry(0.1, 0.03, 0.012), 0, -0.035);
    [-0.039, -0.013, 0.013, 0.039].forEach(x => {
      parca(new THREE.BoxGeometry(0.011, 0.13, 0.01), x, -0.11);
      parca(new THREE.ConeGeometry(0.0065, 0.025, 6), x, -0.185, Math.PI);
    });
    g.scale.setScalar(CATAL_OLCEK);
    // Dişlere batırılmış bezelyeler: alttan yukarı dizilir (50'ye kadar)
    const taneler = new THREE.InstancedMesh(new THREE.SphereGeometry(0.02, 10, 8), new THREE.MeshStandardMaterial({ color: 0x5fd03a, roughness: 0.5, emissive: 0x1a4a0a, emissiveIntensity: 0.4 }), BEZELYE);
    const m = new THREE.Matrix4();
    for (let k = 0; k < BEZELYE; k++) {
      const dis = [-0.039, -0.013, 0.013, 0.039][k % 4], sira = Math.floor(k / 4);
      m.makeTranslation(dis + (Math.random() - 0.5) * 0.01, -0.155 + sira * 0.034, (k % 2 ? 1 : -1) * 0.012);
      taneler.setMatrixAt(k, m);
    }
    taneler.count = 0;
    g.add(taneler);
    g.userData.taneler = taneler;
    return g;
  }

  Salon.oyunEkle({
    id: 'bezelye',
    ad: 'Bezelye Sofrası',
    ikon: '🍽️',
    ozet: 'Gardiyan gazete okurken bezelyeleri gizlice ye! Gazeteyi indirince kıpırdayan vurulur.',
    kurallar: [
      `Herkesin tabağında <b>${BEZELYE} bezelye</b> var. Masanın ucunda dev gardiyan robot gazete okuyor.`,
      '<b>Sol tık</b> (ya da Z): çatalı tabağa batır, her batırışta çatala bir bezelye takılır (istersen 50 tanesini birden biriktir). <b>Sağ tık</b> (ya da X): çataldakilerin hepsini bir kerede ye. Telefonda alttaki iki düğme.',
      'Gardiyan gazeteyi <b>indirip bakarken</b> çatalını oynatırsan seni <b>lazerle vurur</b>, elenirsin!',
      'Dikkat: gazete bazen <b>iner gibi yapıp</b> geri kalkar. Gerçekten inerken de önce çok az kıpırdar. Durup bekle, kalkınca kaldığın yerden devam et.',
      'Tabağını <b>ilk bitiren 1.</b> olur. Kimse bitiremezse ayakta <b>son kalan</b> kazanır.',
    ],
    baslat,
  });

  function baslat(b) {
    const { kanal } = b;
    Kontrol.ac(false);
    Cekirdek.kameraAyarla(4.5, 0.58);
    const grup = new THREE.Group();
    Cekirdek.sahne.add(grup);
    const ben = b.oyuncular.find(o => o.id === b.benId);

    // ---------- Masa, sandalyeler, oda ----------
    const tahta = new THREE.MeshStandardMaterial({ color: 0x5a3a26, roughness: 0.7, metalness: 0.1 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x2a2f48, metalness: 0.7, roughness: 0.4 });
    const masa = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.1, 5.4), tahta);
    masa.position.set(0, MASA_Y - 0.05, -0.1); masa.castShadow = masa.receiveShadow = true;
    grup.add(masa);
    const ortu = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.012, 5.2), new THREE.MeshStandardMaterial({ color: 0x9b2335, roughness: 0.9 }));
    ortu.position.set(0, MASA_Y + 0.006, -0.1);
    grup.add(ortu);
    [[-1.1, 2.4], [1.1, 2.4], [-1.1, -2.6], [1.1, -2.6]].forEach(([x, z]) => {
      const ayak = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, MASA_Y, 8), metal);
      ayak.position.set(x, MASA_Y / 2 - 0.05, z);
      grup.add(ayak);
    });
    const zemin = new THREE.Mesh(new THREE.CircleGeometry(8, 48), new THREE.MeshStandardMaterial({ color: 0x14172a, metalness: 0.4, roughness: 0.7 }));
    zemin.rotation.x = -Math.PI / 2; zemin.position.set(0, -0.05, -0.5); zemin.receiveShadow = true;
    grup.add(zemin);
    // Masanın üstünde asılı lamba
    const lamba = new THREE.PointLight(0xffd9a0, 6, 9, 1.6);
    lamba.position.set(0, 3.2, 0);
    grup.add(lamba);

    // ---------- Gardiyan ----------
    const gardiyan = Cekirdek.robotYap('#ff3040', 'GARDİYAN');
    gardiyan.grup.scale.setScalar(2.4);
    gardiyan.konum(0, GARDIYAN_Z);
    gardiyan.yon(Math.PI / 2);   // masaya (kameraya) bakar
    gardiyan.etiket.visible = false;
    grup.add(gardiyan.grup);
    const koltuk = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.2, 0.3), metal);
    koltuk.position.set(0, 1.1, GARDIYAN_Z - 0.75);
    grup.add(koltuk);
    // Gazete
    const gazete = new THREE.Group();
    const kagit = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.34), new THREE.MeshStandardMaterial({ map: gazeteDokusu(), side: THREE.DoubleSide, roughness: 0.9 }));
    kagit.castShadow = true;
    gazete.add(kagit);
    grup.add(gazete);
    // Gözler: bakarken kırmızı parlar
    const goz = new THREE.Sprite(new THREE.SpriteMaterial({ map: Cekirdek.parlamaDokusu(), color: 0xff2030, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    goz.position.set(0, 2.6, GARDIYAN_Z + 0.6); goz.scale.set(1.6, 0.8, 1);
    goz.material.opacity = 0;
    grup.add(goz);
    const gozIsik = new THREE.PointLight(0xff2030, 0, 8, 1.5);
    gozIsik.position.set(0, 2.6, GARDIYAN_Z + 1);
    grup.add(gozIsik);
    let gazeteP = 0;   // 0 yukarıda (okuyor) → 1 aşağıda (bakıyor)
    function gazeteCiz(p) {
      gazeteP = p;
      gazete.position.set(0, 2.55 - p * 1.45, GARDIYAN_Z + 1.05 + p * 0.35);
      gazete.rotation.x = -p * 1.25;
    }
    gazeteCiz(0);
    const isin = Cekirdek.isinYap('#ff3040');
    isin.goster(false);
    grup.add(isin.grup);

    // ---------- Oyuncular, tabaklar, çatallar ----------
    const P = {};
    const tabakGeo = new THREE.CylinderGeometry(0.42, 0.36, 0.05, 32);
    const tabakMal = new THREE.MeshStandardMaterial({ color: 0xf4f4f8, roughness: 0.35, metalness: 0.1 });
    const taneGeo = new THREE.SphereGeometry(0.045, 10, 8);
    const taneMal = new THREE.MeshStandardMaterial({ color: 0x5fd03a, roughness: 0.5, emissive: 0x1a4a0a, emissiveIntensity: 0.4 });
    b.oyuncular.forEach((o, i) => {
      const [x, z, yon] = KOLTUK[i];
      const sag = x > 0;
      const r = Cekirdek.robotYap(o.renk, o.id === b.benId ? `${o.ad} (sen)` : o.ad, { silahsiz: true });
      r.grup.scale.setScalar(1.15);
      r.konum(x, z); r.yon(yon);
      grup.add(r.grup);
      const tx = sag ? 0.72 : -0.72;
      const tabak = new THREE.Mesh(tabakGeo, tabakMal);
      tabak.position.set(tx, MASA_Y + 0.03, z); tabak.receiveShadow = true;
      grup.add(tabak);
      // Bezelyeler: tabağa rastgele dağılmış küçük toplar (yenildikçe sayı azalır)
      const taneler = new THREE.InstancedMesh(taneGeo, taneMal, BEZELYE);
      const m = new THREE.Matrix4();
      for (let k = 0; k < BEZELYE; k++) {
        const a = Math.random() * Math.PI * 2, u = Math.sqrt(Math.random()) * 0.3;
        m.makeTranslation(tx + Math.cos(a) * u, MASA_Y + 0.08 + Math.random() * 0.03, z + Math.sin(a) * u);
        taneler.setMatrixAt(k, m);
      }
      taneler.castShadow = true;
      grup.add(taneler);
      const catal = catalYap();
      grup.add(catal);
      // Kol: omuzdan çatalın sapına uzanan silindir + el
      const kolMal = new THREE.MeshStandardMaterial({ color: o.renk, metalness: 0.3, roughness: 0.4 });
      const kolGeo = new THREE.CylinderGeometry(0.055, 0.065, 1, 10); kolGeo.translate(0, 0.5, 0);
      const kol = new THREE.Mesh(kolGeo, kolMal); kol.castShadow = true;
      const el = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), kolMal);
      grup.add(kol, el);
      const ic = sag ? -1 : 1;   // masanın ortasına doğru
      const yer = {
        dinlen: new THREE.Vector3(tx - ic * 0.42, MASA_Y + 0.62, z + 0.1),
        tabak: new THREE.Vector3(tx, MASA_Y + 0.07 - CATAL_DIS_UCU, z),
        agiz: new THREE.Vector3(x + ic * 0.95, 1.25, z + 0.05),
        // Çatalın eğimi: dinlenirken sap robota doğru, batırırken dik, yerken dişler ağza doğru
        eDinlen: ic * 0.85, eTabak: ic * 0.15, eAgiz: -ic * 1.45,
      };
      catal.position.copy(yer.dinlen);
      catal.rotation.z = yer.eDinlen;
      P[o.id] = { o, r, catal, kol, el, taneler, yer, sag, tabak: BEZELYE, catalda: 0, durum: 'oynuyor', sira: 0, anim: null };
    });

    function hudOyuncular() {
      b.hud.oyuncular(b.oyuncular.map(o => {
        const p = P[o.id];
        const ek = p.durum === 'bitti' ? `✅ ${p.sira}.` : p.durum === 'vuruldu' ? '💀' : `🟢 ${p.tabak + p.catalda}`;
        return { ...o, ben: o.id === b.benId, canli: p.durum !== 'vuruldu', ek };
      }));
    }
    hudOyuncular();

    // Çatal hareketi (herkeste görsel): bat → tabağa iner, bezelye alır; ye → ağza gider
    function catalOynat(id, tip) {
      const p = P[id];
      p.anim = { tip, t: 0 };
      if (tip === 'bat') Ses.tik();
      else Ses.ham();
    }
    const _omuz = new THREE.Vector3(), _sap = new THREE.Vector3(), _yon = new THREE.Vector3(), _yukari = new THREE.Vector3(0, 1, 0);
    function catalGuncelle(p, dt) {
      const { catal, yer } = p;
      if (!p.anim) {
        catal.position.lerp(yer.dinlen, Math.min(1, dt * 10));
        catal.rotation.z += (yer.eDinlen - catal.rotation.z) * Math.min(1, dt * 10);
      } else {
        p.anim.t += dt / EYLEM_SN;
        const t = Math.min(1, p.anim.t), git = Math.sin(t * Math.PI);   // 0 → 1 → 0
        const yemek = p.anim.tip === 'ye';
        catal.position.lerpVectors(yer.dinlen, yemek ? yer.agiz : yer.tabak, git);
        catal.rotation.z = yer.eDinlen + ((yemek ? yer.eAgiz : yer.eTabak) - yer.eDinlen) * git;
        if (t >= 0.5 && !p.anim.ald) {
          p.anim.ald = true;
          const fs = catal.userData.taneler;
          fs.count = yemek ? 0 : Math.min(BEZELYE, Math.max(fs.count + 1, p.catalda));
        }
        if (t >= 1) p.anim = null;
      }
      // Kol: omuzdan sapın ucuna
      catal.updateMatrixWorld();
      p.r.omuz.getWorldPosition(_omuz);
      catal.localToWorld(_sap.set(0, CATAL_SAP_UCU, 0));
      _yon.subVectors(_sap, _omuz);
      const L = _yon.length();
      p.kol.position.copy(_omuz);
      p.kol.scale.set(1, L, 1);
      p.kol.quaternion.setFromUnitVectors(_yukari, _yon.normalize());
      p.el.position.copy(_sap);
    }
    function tabakCiz(p) {
      p.taneler.count = p.tabak;
      if (!p.anim) p.catal.userData.taneler.count = Math.min(BEZELYE, p.catalda);
    }

    // ---------- Herkeste: gazete fazı ----------
    let faz = 'bekle', fazSure = 1, fazGecen = 0, fazNo = 0, bakmaBasladi = 0, bitti = false, durdu = false;
    let kandirmaDerin = 0.15;
    function fazGeldi(m) {
      faz = m.faz; fazSure = m.sure; fazGecen = 0; fazNo = m.no;
      if (faz === 'bakiyor') {
        bakmaBasladi = performance.now();
        Ses.uyari();
      } else if (faz === 'okuyor') {
        b.hud.buyuk('');
      } else if (faz === 'kandirma') {
        kandirmaDerin = 0.1 + Math.random() * 0.12;
      }
    }
    function gazeteHesapla() {
      const t = Math.min(1, fazGecen / fazSure);
      if (faz === 'okuyor' || faz === 'bekle') return 0;
      if (faz === 'kandirma') return Math.sin(t * Math.PI) * kandirmaDerin;          // iner gibi yapar, geri kalkar
      if (faz === 'indiriyor') return t < 0.65 ? (t / 0.65) * 0.12 : 0.12 + ((t - 0.65) / 0.35) * 0.88;   // önce azıcık, sonra hızla
      if (faz === 'bakiyor') return 1;
      if (faz === 'kaldiriyor') return 1 - t;
      return 0;
    }

    // ---------- Benim hamlem ----------
    let sonEylem = 0;
    function eylem(tip) {
      if (bitti || durdu || faz === 'bekle') return;
      const p = P[b.benId];
      if (p.durum !== 'oynuyor' || p.anim) return;
      if (tip === 'bat' && !p.tabak) return;
      if (tip === 'ye' && !p.catalda) return;
      const simdi = performance.now();
      if (simdi - sonEylem < EYLEM_SN * 900) return;
      sonEylem = simdi;
      // Gardiyan bakarken (tepki payı geçtiyse) kıpırdadım mı?
      const yak = faz === 'bakiyor' && (simdi - bakmaBasladi) / 1000 > TOLERANS;
      catalOynat(b.benId, tip);
      kanal.evaGonder({ t: 'eylem', tip, yak, no: fazNo });
    }
    const fareBas = e => {
      if (e.target !== Cekirdek.tuval) return;
      if (e.button === 0) eylem('bat');
      else if (e.button === 2) eylem('ye');
    };
    const sagTikEngel = e => { if (e.target === Cekirdek.tuval || e.target.closest?.('#bzDugmeler')) e.preventDefault(); };
    const tus = e => {
      if (e.repeat || document.activeElement?.tagName === 'INPUT') return;
      if (e.code === 'KeyZ') eylem('bat');
      else if (e.code === 'KeyX') eylem('ye');
    };
    window.addEventListener('pointerdown', fareBas);
    window.addEventListener('contextmenu', sagTikEngel);
    window.addEventListener('keydown', tus);
    // Telefon düğmeleri
    const dugmeler = document.createElement('div');
    dugmeler.id = 'bzDugmeler';
    dugmeler.innerHTML = '<button data-e="bat">🍴 BATIR</button><button data-e="ye">😋 YE</button>';
    dugmeler.addEventListener('pointerdown', e => { const d = e.target.closest('[data-e]'); if (d) { e.preventDefault(); eylem(d.dataset.e); } });
    document.body.appendChild(dugmeler);
    b.hud.ipucu(Kontrol.dokunmatik ? '' : 'Sol tık / Z: batır · Sağ tık / X: ye');

    // ---------- Herkeste: evden gelenler ----------
    function vuruldu(id) {
      const p = P[id];
      // Gardiyanın silahından lazer
      const s = p.r.grup.position;
      isin.ayarla(0.7, GARDIYAN_Z + 1.2, s.x, s.z, 1.15);
      isin.goster(true); isin.opaklik(1);
      Ses.lazer();
      Cekirdek.animasyon(0.5, t => isin.opaklik(1 - t)).then(() => isin.goster(false));
      setTimeout(() => {
        if (durdu) return;
        Cekirdek.patlama(s.x, 0.9, s.z, p.o.renk);
        Ses.patlama();
        p.r.goster(false);
        p.catal.visible = false; p.kol.visible = false; p.el.visible = false;
      }, 120);
      if (id === b.benId) { b.hud.perde('flas'); b.hud.bilgi('💀 Gardiyan seni gördü! Diğerlerini izliyorsun…', true); }
      else b.hud.bilgi(`💥 Gardiyan ${p.o.ad}'ı yakaladı!`);
    }
    kanal.dinle(m => {
      if (durdu) return;
      if (m.t === 'faz') fazGeldi(m);
      else if (m.t === 'e') {
        const p = P[m.id];
        if (m.id !== b.benId) catalOynat(m.id, m.tip);
        p.tabak = m.tabak; p.catalda = m.catalda;
        tabakCiz(p);
        hudOyuncular();
      } else if (m.t === 'vur') vuruldu(m.id);
      else if (m.t === 'durum') {
        m.o.forEach(([id, tabak, catalda, durum, sira]) => {
          const p = P[id];
          const yeniBitti = durum === 'bitti' && p.durum !== 'bitti';
          Object.assign(p, { tabak, catalda, durum, sira });
          tabakCiz(p);
          if (yeniBitti) {
            Ses.kazanma();
            b.hud.bilgi(id === b.benId ? `🎉 Tabağını bitirdin! ${sira}. oldun!` : `🎉 ${p.o.ad} tabağını bitirdi! (${sira}.)`);
            Cekirdek.animasyon(1, t => { p.r.grup.position.y = Math.sin(t * Math.PI) * 0.7; });
          }
        });
        hudOyuncular();
      } else if (m.t === 'bitti') {
        bitti = true;
        b.hud.buyuk('');
        const k = b.oyuncular.find(o => o.id === m.kazanan);
        b.hud.bilgi(k ? `🏆 ${k.ad} kazandı!` : '');
        setTimeout(() => { if (!durdu) b.bitti({ kazanan: m.kazanan, siralama: m.siralama, aciklama: m.aciklama }); }, 1200);
      } else if (m.t === 'sayim') {
        b.hud.buyuk(m.sn ? 'HAZIR' : '🍽️ AFİYET OLSUN!', m.sn ? String(m.sn) : '', m.sn ? '' : 'ates');
        if (m.sn) Ses.bip(); else Ses.bip(true);
      }
    });

    // ---------- Sadece ev: gazete, hamleler, botlar ----------
    let ev = null;
    if (kanal.evMi) {
      ev = { faz: 'bekle', zaman: 0, no: 0, siraSayac: 0, olumSayac: 0, bitti: false, zamanlayicilar: [] };
      const durumYay = () => kanal.yayinla({ t: 'durum', o: Object.values(P).map(p => [p.o.id, p.tabak, p.catalda, p.durum, p.sira]) });
      const fazBaslat = (f, sure = FAZ_SURE[f]()) => {
        ev.faz = f; ev.no++; ev.fazBasla = performance.now(); ev.fazSure = sure;
        kanal.yayinla({ t: 'faz', faz: f, sure, no: ev.no });
        ev.kandirmaKaldi ??= 0;
        if (f === 'okuyor') ev.kandirmaKaldi = Math.random() < 0.55 ? 1 + (Math.random() < 0.35 ? 1 : 0) : 0;
        botlarFazaTepki(f);
      };
      ev.fazBaslat = fazBaslat;
      // Bir fazdan sonrakine geçiş
      ev.sonraki = () => {
        if (ev.bitti) return;
        const f = ev.faz;
        if (f === 'okuyor') {
          if (ev.kandirmaKaldi > 0) { ev.kandirmaKaldi--; fazBaslat('kandirma'); }
          else fazBaslat('indiriyor');
        } else if (f === 'kandirma') {
          // Kandırmadan sonra bir süre daha okur
          ev.faz = 'okuyor'; ev.no++; ev.fazBasla = performance.now(); ev.fazSure = 1 + Math.random() * 2.5;
          kanal.yayinla({ t: 'faz', faz: 'okuyor', sure: ev.fazSure, no: ev.no });
          botlarFazaTepki('okuyor');
        } else if (f === 'indiriyor') fazBaslat('bakiyor');
        else if (f === 'bakiyor') fazBaslat('kaldiriyor');
        else if (f === 'kaldiriyor') fazBaslat('okuyor');
      };

      // Hamle (ev kendi hamlesi, misafirler ve botlar için aynı)
      ev.eylem = (id, tip, yak) => {
        const p = P[id];
        if (!p || ev.bitti || p.durum !== 'oynuyor') return;
        const simdi = performance.now();
        if (p.sonEylem && simdi - p.sonEylem < EYLEM_SN * 800) return;
        // Bakarken kıpırdadı mı? (misafir kendisi bildirir; ev kendi saatine de bakar, gecikme payıyla)
        const bakarken = ev.faz === 'bakiyor' && (simdi - ev.fazBasla) / 1000 > TOLERANS + (id === b.benId || p.o.bot ? 0 : 0.6);
        if (yak || bakarken) return yakala(id, tip);
        // Çatala istediği kadar bezelye batırabilir; ye: çataldakilerin hepsi birden yenir
        if (tip === 'bat' && p.tabak > 0) { p.tabak--; p.catalda++; }
        else if (tip === 'ye' && p.catalda) { p.catalda = 0; }
        else return;
        p.sonEylem = simdi;
        kanal.yayinla({ t: 'e', id, tip, tabak: p.tabak, catalda: p.catalda });
        if (!p.tabak && !p.catalda) {
          p.durum = 'bitti'; p.sira = ++ev.siraSayac;
          durumYay();
          sonKontrol();
        }
      };
      const yakala = (id, tip) => {
        const p = P[id];
        if (p.durum !== 'oynuyor') return;
        kanal.yayinla({ t: 'e', id, tip, tabak: p.tabak, catalda: p.catalda });
        p.durum = 'vuruldu'; p.olum = ++ev.olumSayac;
        kanal.yayinla({ t: 'vur', id });
        durumYay();
        sonKontrol();
      };
      const sonKontrol = () => {
        const oynayan = Object.values(P).filter(p => p.durum === 'oynuyor');
        if (oynayan.length > 1) return;
        if (oynayan.length === 1 && ev.siraSayac === 0 && Object.values(P).length > 1) {
          // Kimse bitiremedi, son kalan kazandı
        } else if (oynayan.length === 1 && ev.siraSayac > 0) {
          // Biri bitirdi; kalan son kişi sıradakini alır
        }
        ev.bitti = true;
        ev.zamanlayicilar.forEach(clearTimeout);
        // Sıralama: bitirenler (bitirme sırası), sonra hâlâ oynayan, sonra vurulanlar (en son vurulan önde)
        const liste = Object.values(P);
        const sirali = [
          ...liste.filter(p => p.durum === 'bitti').sort((a, c) => a.sira - c.sira),
          ...liste.filter(p => p.durum === 'oynuyor'),
          ...liste.filter(p => p.durum === 'vuruldu').sort((a, c) => c.olum - a.olum),
        ];
        const kazanan = sirali[0];
        const neden = p => p.durum === 'bitti' ? `🍽️ tabağını ${p.sira}. bitirdi` : p.durum === 'oynuyor' ? `🟢 ayakta kaldı (${p.tabak + p.catalda} bezelye kaldı)` : `💀 ${p.olum}. vuruldu (${p.tabak + p.catalda} bezelye kaldı)`;
        kanal.yayinla({
          t: 'bitti', kazanan: kazanan ? kazanan.o.id : null,
          siralama: sirali.map(p => ({ id: p.o.id, neden: neden(p) })),
          aciklama: kazanan?.durum === 'bitti' ? 'Tabağını ilk o bitirdi!' : 'Gardiyana yakalanmayan son kişi o oldu!',
        });
      };

      // Botlar: okurken kendi hızlarında yer, gazete inerken çoğu durur, kalkınca devam eder
      const botlar = Object.values(P).filter(p => p.o.bot);
      botlar.forEach(p => {
        p.bot = { hiz: 0.3 + Math.random() * 0.15, dikkat: 0.8 + Math.random() * 0.15, duruyor: true, sonraki: 0 };
      });
      function botlarFazaTepki(f) {
        Object.values(P).filter(p => p.o.bot && p.durum === 'oynuyor').forEach(p => {
          p.bot ??= { hiz: 0.45, dikkat: 0.85, duruyor: false, sonraki: 0 };
          const tepki = (0.12 + Math.random() * 0.35) * 1000;
          if (f === 'kandirma' || f === 'indiriyor') {
            // Fark ederse durur (kandırmada da durabilir, vakit kaybeder)
            if (Math.random() < (f === 'kandirma' ? 0.6 : p.bot.dikkat)) ev.zamanlayicilar.push(setTimeout(() => { p.bot.duruyor = true; }, tepki));
          } else if (f === 'okuyor') {
            ev.zamanlayicilar.push(setTimeout(() => { p.bot.duruyor = false; }, tepki + Math.random() * 400));
          }
        });
      }
      ev.botAdim = () => {
        const simdi = performance.now();
        botlar.forEach(p => {
          if (p.durum !== 'oynuyor' || !p.bot || p.bot.duruyor || p.anim) return;
          if (simdi < p.bot.sonraki) return;
          p.bot.sonraki = simdi + p.bot.hiz * 1000 * (0.8 + Math.random() * 0.5);
          // Bot birkaç bezelye biriktirip bir kerede yer
          p.bot.yigin ??= 1 + Math.floor(Math.random() * 6);
          const ye = p.catalda >= p.bot.yigin || (!p.tabak && p.catalda);
          if (ye) p.bot.yigin = 1 + Math.floor(Math.random() * 6);
          ev.eylem(p.o.id, ye ? 'ye' : 'bat', false);
        });
      };
      ev.koptu = id => { const p = P[id]; if (p) { p.o.bot = true; p.bot = { hiz: 0.5, dikkat: 0.85, duruyor: ev.faz !== 'okuyor', sonraki: 0 }; botlar.push(p); } };

      kanal.evDinle((m, id) => {
        if (m.t !== 'eylem' || (m.tip !== 'bat' && m.tip !== 'ye')) return;
        ev.eylem(id, m.tip, !!m.yak);
      });

      // Başlangıç sayımı
      for (let i = 0; i <= BASLANGIC; i++) {
        ev.zamanlayicilar.push(setTimeout(() => { if (!durdu) kanal.yayinla({ t: 'sayim', sn: BASLANGIC - i }); }, 500 + i * 1000));
      }
      ev.zamanlayicilar.push(setTimeout(() => { if (!durdu) fazBaslat('okuyor'); }, 500 + BASLANGIC * 1000));
    }

    // ---------- Her kare ----------
    const kaldir = Cekirdek.guncelle((dt, t) => {
      if (durdu) return false;
      if (faz !== 'bekle') fazGecen += dt;
      gazeteCiz(gazeteHesapla());
      const bakis = faz === 'bakiyor' ? 1 : faz === 'kaldiriyor' ? 1 - Math.min(1, fazGecen / fazSure) : 0;
      goz.material.opacity = bakis * (0.75 + 0.25 * Math.sin(t * 10));
      gozIsik.intensity = bakis * 8;
      gardiyan.govde.rotation.y = -Math.PI / 2 + (faz === 'bakiyor' ? Math.sin(t * 1.6) * 0.25 : 0);   // bakarken sağa sola döner
      Object.values(P).forEach(p => catalGuncelle(p, dt));
      if (ev && !ev.bitti && ev.faz !== 'bekle') {
        if ((performance.now() - ev.fazBasla) / 1000 >= ev.fazSure) ev.sonraki();
        ev.botAdim();
      }
    });

    b.hud.bilgi('Gardiyan gazete okurken ye. Gazeteyi indirince KIPIRDAMA!');

    return {
      durdur() {
        durdu = true;
        if (ev) ev.zamanlayicilar.forEach(clearTimeout);
        kaldir();
        window.removeEventListener('pointerdown', fareBas);
        window.removeEventListener('contextmenu', sagTikEngel);
        window.removeEventListener('keydown', tus);
        dugmeler.remove();
        Object.values(P).forEach(p => p.r.sil());
        gardiyan.sil();
        Cekirdek.sahne.remove(grup);
      },
      koptu(id) { ev?.koptu(id); },
    };
  }
})();
