// =============================================================
// Robo Turnuva - mini oyun: KÜP HAFIZASI
// Ortada 3x3x3 (27 küçük küp) bir küp. Her tur örnek küpten görünür yerlerden birkaç küp eksiltilir:
// 5 saniye ezberle → örnek kaybolur → 10 saniyede kendi küpünde aynı küpleri sil (tıkla/dokun).
// Yanlış yapanı yukarıdan inen lazer taret vurur. Eksik sayısı her tur artar: 2, 3, 4, 5…
// Herkes yanılırsa kimse ölmez, aynı zorlukta yeni tur. Son kalan kazanır.
//
// Online: kurallar odayı açanda (kanal.evMi). Ev turu yollar, herkes kendi küpünü kendi ekranında kurar
// ve her değişikliği eve gönderir; süre bitince ev değerlendirir ve sonucu yollar.
// Mesajlar: ev → herkes { t: 'tur', no, eksik: [..], goster, kur }  { t: 'sonuc', dogru: [id], olen: [id], hedef }  { t: 'bitti', ... }
//           oyuncu → ev { t: 'cevap', no, eksik: [..], bitti }
// =============================================================

(() => {
  const GOSTER_SN = 5, KUR_SN = 10, SONUC_SN = 4, ILK_EKSIK = 2;
  const TAM_SN = 1.3;                // önce tam küp görünür, sonra eksilecekler birden fırlar
  const K = 0.82, ARA = 0.05;        // küçük küp boyu, aralık
  const MERKEZ_Y = 2.6;               // küp yüksekte: her yöne dönünce kürsüye/zemine değmesin
  const no = (x, y, z) => x + 3 * y + 9 * z;
  const xyz = n => [n % 3, Math.floor(n / 3) % 3, Math.floor(n / 9)];
  // Görünür yüzler (kameraya bakan ön z=2, üst y=2, sağ x=2): eksiltmeler buradan seçilir
  const GORUNUR = Array.from({ length: 27 }, (_, n) => n).filter(n => { const [x, y, z] = xyz(n); return x === 2 || y === 2 || z === 2; });
  const ayni = (a, b) => a.length === b.length && [...a].sort((p, q) => p - q).every((v, i) => v === [...b].sort((p, q) => p - q)[i]);

  function kupGrubu(renk, saydam = false) {
    const g = new THREE.Group();
    const geo = new THREE.BoxGeometry(K, K, K);
    const kenarGeo = new THREE.EdgesGeometry(geo);
    const parcalar = Array.from({ length: 27 }, (_, n) => {
      const [x, y, z] = xyz(n);
      const p = new THREE.Group();
      p.position.set((x - 1) * (K + ARA), (y - 1) * (K + ARA), (z - 1) * (K + ARA));
      p.userData.yer = p.position.clone();
      const mal = new THREE.MeshStandardMaterial({ color: renk, metalness: 0.3, roughness: 0.4, emissive: renk, emissiveIntensity: 0.15, transparent: saydam, opacity: saydam ? 0.9 : 1 });
      const m = new THREE.Mesh(geo, mal); m.castShadow = true; m.userData.n = n;
      const kenar = new THREE.LineSegments(kenarGeo, new THREE.LineBasicMaterial({ color: 0x0b0d1f }));
      // Silinen küpün yerinde soluk hayalet (tıklayınca geri gelir)
      const hayalet = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: renk, transparent: true, opacity: 0.08, depthWrite: false }));
      hayalet.userData.n = n; hayalet.visible = false;
      hayalet.scale.setScalar(0.6);   // küçük: arkasındaki küpe tıklamayı engellemesin
      const hKenar = new THREE.LineSegments(kenarGeo, new THREE.LineBasicMaterial({ color: renk, transparent: true, opacity: 0.35 }));
      hKenar.visible = false;
      p.add(m, kenar, hayalet, hKenar);
      g.add(p);
      return { p, m, kenar, hayalet, hKenar };
    });
    return {
      g, parcalar,
      ciz(eksik, hayaletGoster = false) {
        const s = new Set(eksik);
        parcalar.forEach((q, n) => {
          const yok = s.has(n);
          q.m.visible = q.kenar.visible = !yok;
          q.hayalet.visible = q.hKenar.visible = yok && hayaletGoster;
        });
      },
    };
  }

  Salon.oyunEkle({
    id: 'kup',
    ad: 'Küp Hafızası',
    ikon: '🧊',
    ozet: 'Örnek küpü 5 saniye ezberle, 10 saniyede aynısını yap! Yapamayanı lazer vurur.',
    kurallar: [
      'Ortada 3×3×3 bir küp var (27 küçük küp). Her turda örnek önce tam görünür, sonra <b>birkaç küp birden fırlayıp çıkar</b>.',
      `Örneği <b>${GOSTER_SN} saniye</b> ezberle. Sonra örnek kaybolur ve <b>${KUR_SN} saniyede</b> kendi küpünde aynı küpleri sil.`,
      'Silmek için küpe <b>tıkla / dokun</b>. Yanlış sildiysen soluk hayalet küpe tıkla, geri gelir. <b>Sürükleyerek</b> küpü sağa-sola ve yukarı-aşağı çevirebilirsin.',
      'Süre bitince küpün örnekle aynı değilse yukarıdan inen <b>lazer taret</b> seni vurur!',
      `Eksik sayısı her tur artar: <b>${ILK_EKSIK} → ${ILK_EKSIK + 1} → ${ILK_EKSIK + 2}…</b> Herkes yanılırsa kimse ölmez. Son kalan kazanır.`,
    ],
    baslat,
  });

  function baslat(b) {
    const { kanal } = b;
    Kontrol.ac(false);
    Cekirdek.kameraAyarla(4.9, 0.72);
    Cekirdek.kameraOdak(0, 0.6, 5.1, 0.62, 1.3);   // biraz yukarıya bak: küp ortada kalsın
    const grup = new THREE.Group();
    Cekirdek.sahne.add(grup);

    // ---------- Sahne: kürsü, robotlar, taret ----------
    const kursu = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 0.5, 40), new THREE.MeshStandardMaterial({ color: 0x23263a, metalness: 0.7, roughness: 0.35 }));
    kursu.position.y = 0.25; kursu.receiveShadow = true;
    grup.add(kursu);
    const halka = new THREE.Mesh(new THREE.TorusGeometry(1.95, 0.05, 8, 64), new THREE.MeshBasicMaterial({ color: 0x2ee6ff }));
    halka.rotation.x = Math.PI / 2; halka.position.y = 0.5; halka.scale.setScalar(0.62); grup.add(halka);
    // Küpün altında yerden yükselen ışık sütunu (küp havada süzülür)
    const sutun = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 1.2, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0x2ee6ff, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    sutun.position.y = 1.1; grup.add(sutun);
    const zemin = new THREE.Mesh(new THREE.CircleGeometry(9, 64), new THREE.MeshStandardMaterial({ color: 0x15182c, metalness: 0.4, roughness: 0.7 }));
    zemin.rotation.x = -Math.PI / 2; zemin.receiveShadow = true; grup.add(zemin);

    const oyuncular = b.oyuncular.map(o => ({ ...o, canli: true }));
    const ben = oyuncular.find(o => o.id === b.benId);
    const R = {};
    oyuncular.forEach((o, i) => {
      // Karşılıklı: ikisi küpün solunda, ikisi sağında (birbirine bakar)
      const a = [Math.PI - 0.38, -0.38, Math.PI + 0.38, 0.38][i % 4];
      const r = Cekirdek.robotYap(o.renk, o.id === b.benId ? `${o.ad} (sen)` : o.ad, { silahsiz: true });
      r.grup.scale.setScalar(1.1);
      const x = Math.cos(a) * 4.6, z = Math.sin(a) * 4.6;
      r.konum(x, z); r.yon(Math.atan2(-z, -x));
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.12, 24), new THREE.MeshStandardMaterial({ color: o.renk, emissive: o.renk, emissiveIntensity: 0.4 }));
      ped.position.set(x, 0.06, z);
      grup.add(ped, r.grup);
      R[o.id] = { r, x, z, ped };
    });
    const taret = new THREE.Group();
    const govde = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 0.6, 16), new THREE.MeshStandardMaterial({ color: 0xdfe6f5, metalness: 0.3, roughness: 0.35, emissive: 0x5a6a90, emissiveIntensity: 0.6 }));
    const namlu = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 1.1, 12), new THREE.MeshStandardMaterial({ color: 0xffb020, metalness: 0.3, roughness: 0.4, emissive: 0xff8a00, emissiveIntensity: 0.55 }));
    namlu.rotation.z = Math.PI / 2; namlu.position.set(0.6, -0.2, 0);
    const goz = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), new THREE.MeshBasicMaterial({ color: 0xff2030 }));
    goz.position.set(1.15, -0.2, 0);
    const kablo = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 6, 8), new THREE.MeshStandardMaterial({ color: 0x9aa6c4, emissive: 0x3a4460, emissiveIntensity: 0.5 }));
    kablo.position.y = 3.3;
    // Parlak şerit: taret karanlıkta da seçilsin
    const serit = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 8, 32), new THREE.MeshBasicMaterial({ color: 0x2ee6ff }));
    serit.rotation.x = Math.PI / 2; serit.position.y = -0.2;
    taret.add(govde, namlu, goz, kablo, serit);
    taret.position.set(0, 12, 0);
    grup.add(taret);

    // ---------- Küpler: örnek (sarı) ve benim küpüm ----------
    const ornek = kupGrubu(0xffd23b);
    ornek.g.position.y = MERKEZ_Y;
    const benim = kupGrubu(new THREE.Color(ben.renk).getHex());
    benim.g.position.y = MERKEZ_Y;
    benim.g.visible = false;
    grup.add(ornek.g, benim.g);
    // Küpün dönüşü: her yöne, durmadan (sürükledikçe dünya eksenlerine göre döner)
    const BAS_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.55, 0));
    const kupQ = BAS_Q.clone(), hedefQ = BAS_Q.clone(), _qY = new THREE.Quaternion(), _qX = new THREE.Quaternion();
    const EKSEN_Y = new THREE.Vector3(0, 1, 0), EKSEN_X = new THREE.Vector3(1, 0, 0);
    let miniKupler = [];   // küpün y ekseninde dönüşü (üç yüz görünsün)

    // ---------- Durum ----------
    let faz = 'bekle', fazBitis = 0, turNo = 0, hedef = [], benimEksik = [], bitirdim = false, durdu = false, sonSn = null;
    const simdi = () => performance.now() / 1000;
    const dugmeler = document.createElement('div');
    dugmeler.id = 'kupDugmeler';
    dugmeler.innerHTML = '<button data-k="geri" class="ikinci">↩ Geri al</button><button data-k="sifir" class="ikinci">🔄 Sıfırla</button><button data-k="bitti">✅ Bitti</button>';
    dugmeler.hidden = true;
    document.body.appendChild(dugmeler);
    const gecmis = [];
    function gonder() { kanal.evaGonder({ t: 'cevap', no: turNo, eksik: benimEksik, bitti: bitirdim }); }
    dugmeler.addEventListener('pointerdown', e => {
      const k = e.target.closest('[data-k]')?.dataset.k;
      if (!k || faz !== 'kur' || !ben.canli) return;
      e.preventDefault(); e.stopPropagation();
      if (k === 'geri' && gecmis.length) { benimEksik = gecmis.pop(); bitirdim = false; }
      else if (k === 'sifir') { gecmis.push([...benimEksik]); benimEksik = []; bitirdim = false; }
      else if (k === 'bitti') { bitirdim = !bitirdim; Ses.din(); }
      benim.ciz(benimEksik, true);
      dugmeCiz();
      gonder();
    });
    function dugmeCiz() {
      dugmeler.hidden = faz !== 'kur' || !ben.canli;
      dugmeler.querySelector('[data-k="bitti"]').textContent = bitirdim ? '✏️ Düzenle' : '✅ Bitti';
      b.hud.ipucu(faz === 'kur' && ben.canli ? `Silinen: ${benimEksik.length} küp` : '');
    }

    // Tıkla: küp sil / hayalete tıkla: geri koy. Sürükle: döndür.
    const isin = new THREE.Raycaster();
    let basili = null;
    const alan = Cekirdek.tuval;
    const ekranNoktasi = e => { const r = alan.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }; };
    const bas = e => { if (e.target !== alan) return; basili = { x: e.clientX, y: e.clientY, sonX: e.clientX, sonY: e.clientY, surukle: false }; };
    const surukle = e => {
      if (!basili) return;
      if (Math.hypot(e.clientX - basili.x, e.clientY - basili.y) > 8) basili.surukle = true;
      if (basili.surukle) {
        const dx = e.clientX - basili.sonX, dy = e.clientY - basili.sonY;
        // Sağa-sola: dikey eksen etrafında, yukarı-aşağı: yatay eksen etrafında (sınırsız)
        _qY.setFromAxisAngle(EKSEN_Y, dx * 0.012);
        _qX.setFromAxisAngle(EKSEN_X, dy * 0.012);
        hedefQ.premultiply(_qY).premultiply(_qX);
      }
      basili.sonX = e.clientX; basili.sonY = e.clientY;
    };
    const birak = e => {
      if (!basili) return;
      const tik = !basili.surukle;
      basili = null;
      if (!tik || faz !== 'kur' || !ben.canli || bitirdim) return;
      isin.setFromCamera(ekranNoktasi(e), Cekirdek.kamera);
      const hedefler = [];
      benim.parcalar.forEach(q => { if (q.m.visible) hedefler.push(q.m); if (q.hayalet.visible) hedefler.push(q.hayalet); });
      const vur = isin.intersectObjects(hedefler, false)[0];
      if (!vur) return;
      const n = vur.object.userData.n;
      gecmis.push([...benimEksik]);
      benimEksik = benimEksik.includes(n) ? benimEksik.filter(v => v !== n) : [...benimEksik, n];
      Ses.tik();
      benim.ciz(benimEksik, true);
      dugmeCiz();
      gonder();
    };
    window.addEventListener('pointerdown', bas);
    window.addEventListener('pointermove', surukle);
    window.addEventListener('pointerup', birak);

    function hudOyuncular(bitenler = new Set()) {
      b.hud.oyuncular(oyuncular.map(o => ({ ...o, ben: o.id === b.benId, ek: !o.canli ? '💀' : bitenler.has(o.id) ? '✅' : '' })));
    }
    hudOyuncular();

    // ---------- Herkeste: tur akışı ----------
    function turGeldi(m) {
      turNo = m.no; hedef = m.eksik; benimEksik = []; bitirdim = false; gecmis.length = 0;
      miniKupler.forEach(k => grup.remove(k.g)); miniKupler = [];
      faz = 'goster';
      hedefQ.copy(BAS_Q);
      ornek.g.visible = true; benim.g.visible = false;
      // Önce tam küp; sonra eksilecek parçalar birden fırlayıp kaybolur, ezberleme o an başlar
      fazBitis = simdi() + TAM_SN + GOSTER_SN;
      ornek.parcalar.forEach(q => { q.p.position.copy(q.p.userData.yer); q.p.scale.setScalar(1); });
      ornek.ciz([]);
      ornek.g.scale.setScalar(0.01);
      Cekirdek.animasyon(0.35, t => ornek.g.scale.setScalar(t));
      Ses.din(true);
      b.hud.bilgi(`🧠 Tur ${m.no}: dikkat! ${hedef.length} küp birazdan çıkacak…`);
      const turBu = m.no;
      setTimeout(() => {
        if (durdu || turNo !== turBu) return;
        Ses.patlama();
        b.hud.bilgi(`🧠 ${hedef.length} küp çıktı. Ezberle!`);
        const ucanlar = hedef.map(n => ornek.parcalar[n]);
        Cekirdek.animasyon(0.6, t => ucanlar.forEach(q => {
          q.p.position.copy(q.p.userData.yer).multiplyScalar(1 + t * 2.2);
          q.p.position.y += t * 1.5;
          q.p.scale.setScalar(1 - t * 0.9);
        })).then(() => {
          if (durdu || turNo !== turBu) return;
          ucanlar.forEach(q => { q.p.position.copy(q.p.userData.yer); q.p.scale.setScalar(1); });
          ornek.ciz(hedef);
        });
      }, TAM_SN * 1000);
      taret.position.y = 12;
      hudOyuncular();
      dugmeCiz();
    }
    function kurBasla() {
      faz = 'kur'; fazBitis = simdi() + KUR_SN;
      ornek.g.visible = false;
      benim.g.visible = ben.canli;
      benim.ciz([], true);
      Ses.gizlen();
      b.hud.bilgi(ben.canli ? '🔨 Şimdi aynısını yap: eksik küplere tıkla!' : '👀 Diğerleri küpü yapıyor…');
      dugmeCiz();
      if (ben.canli) gonder();
    }
    function sonucGeldi(m) {
      faz = 'sonuc';
      dugmeCiz();
      // Örnek tekrar görünür, benimki yanında
      ornek.g.visible = true; ornek.ciz(m.hedef);
      benim.g.visible = false;
      const benYanlis = m.olen.includes(b.benId) || (m.yanlis || []).includes(b.benId);
      b.hud.bilgi(m.hepsiYanlis ? '😅 Herkes yanıldı! Kimse ölmeyecek, tur tekrar.' : '🎯 Taret küpleri tek tek kontrol ediyor…');
      void benYanlis;
      // Herkesin yaptığı küp, kendi robotunun üstünde küçük olarak görünür (taret tararken bakılabilir)
      miniKupler.forEach(k => grup.remove(k.g)); miniKupler = [];
      Object.entries(m.cevaplar || {}).forEach(([id, eksik]) => {
        const o = oyuncular.find(p => p.id === +id), h = R[+id];
        if (!o || !h) return;
        const mk = kupGrubu(new THREE.Color(o.renk).getHex());
        // Küçük ve robotun dış yanında yukarıda: soldakiler daha sola, sağdakiler daha sağa (robotu kapatmasın)
        mk.g.scale.setScalar(0.27);
        mk.g.position.set(h.x + Math.sign(h.x) * 0.9, 3.15, h.z * 0.9);
        mk.ciz(eksik, true);
        grup.add(mk.g);
        miniKupler.push(mk);
      });
      // Taret iner, herkese sırayla bakar: 2 sn tarar → doğruysa yeşil ışık, yanlışsa kırmızı ışık ve ateş
      Cekirdek.animasyon(0.8, t => { taret.position.y = 12 - t * 7; });
      const kontrol = [...m.dogru, ...(m.yanlis || [])].map(id => ({ id, h: R[id], dogru: m.dogru.includes(id), olecek: m.olen.includes(id) }))
        .sort((a, c) => Math.atan2(a.h.z, a.h.x) - Math.atan2(c.h.z, c.h.x));
      const isinYap3 = (h, renk, kalin) => {
        const yon = Math.atan2(h.z, h.x);
        const a3 = new THREE.Vector3(Math.cos(yon) * 1.15, taret.position.y - 0.2, Math.sin(yon) * 1.15);
        const b3 = new THREE.Vector3(h.x, 0.9, h.z);
        const L = a3.distanceTo(b3);
        const g = new THREE.Group();
        const ic = new THREE.Mesh(new THREE.CylinderGeometry(kalin * 0.3, kalin * 0.3, L, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
        const dis = new THREE.Mesh(new THREE.CylinderGeometry(kalin, kalin * 1.6, L, 12, 1, true), new THREE.MeshBasicMaterial({ color: renk, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        g.add(ic, dis);
        g.position.copy(a3).lerp(b3, 0.5);
        g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b3.clone().sub(a3).normalize());
        grup.add(g);
        return { g, ic, dis, renk: c => { dis.material.color.set(c); }, opaklik: o => { ic.material.opacity = o; dis.material.opacity = 0.45 * o; } };
      };
      const ADIM_SN = 2.7;
      kontrol.forEach((k, sira) => {
        const bas = 900 + sira * ADIM_SN * 1000;
        // Dön ve taramaya başla (beyaz)
        setTimeout(() => {
          if (durdu) return;
          const hedefA = -Math.atan2(k.h.z, k.h.x);
          const ilkA = taret.rotation.y;
          let fark = hedefA - ilkA; fark = Math.atan2(Math.sin(fark), Math.cos(fark));
          Cekirdek.animasyon(0.35, t => { taret.rotation.y = ilkA + fark * t; });
          goz.material.color.set(0xffffff);
          Ses.uyari();
          const tarama = isinYap3(k.h, 0xffffff, 0.06);
          k.tarama = tarama;
          const bitis = Cekirdek.animasyon(2, t => tarama.opaklik(0.35 + 0.35 * Math.abs(Math.sin(t * 14))));
          void bitis;
        }, bas);
        // 2 saniye sonra karar
        setTimeout(() => {
          if (durdu) return;
          if (k.tarama) grup.remove(k.tarama.g);
          if (k.dogru) {
            goz.material.color.set(0x3dff6a);
            const yesil = isinYap3(k.h, 0x3dff6a, 0.14);
            Ses.din(true);
            k.h.ped.material.emissiveIntensity = 1.2;
            Cekirdek.animasyon(0.6, t => yesil.opaklik(1 - t)).then(() => grup.remove(yesil.g));
            if (k.id === b.benId) b.hud.bilgi('✅ Taret: DOĞRU!');
          } else {
            goz.material.color.set(0xff2030);
            const kirmizi = isinYap3(k.h, 0xff2030, 0.14);
            Ses.uyari();
            if (k.id === b.benId) b.hud.bilgi(k.olecek ? '🔴 Taret: YANLIŞ!' : '🔴 Yanlış ama herkes yanıldı, kurtuldun.', true);
            Cekirdek.animasyon(0.4, t => kirmizi.opaklik(1 - t * 0.5)).then(() => {
              grup.remove(kirmizi.g);
              if (durdu || !k.olecek) return;
              // Ateş!
              const lazer = isinYap3(k.h, 0xff2040, 0.11);
              Ses.lazer();
              setTimeout(() => { if (durdu) return; Cekirdek.patlama(k.h.x, 0.9, k.h.z, oyuncular.find(o => o.id === k.id).renk); Ses.patlama(); k.h.r.goster(false); if (k.id === b.benId) b.hud.perde('flas'); hudOyuncular(); }, 150);
              Cekirdek.animasyon(0.5, t => lazer.opaklik(1 - t)).then(() => grup.remove(lazer.g));
            });
          }
        }, bas + 2000);
      });
      m.olen.forEach(id => { oyuncular.find(o => o.id === id).canli = false; });
      setTimeout(() => {
        if (durdu) return;
        hudOyuncular();
        goz.material.color.set(0xff2030);
        Object.values(R).forEach(x => { x.ped.material.emissiveIntensity = 0.4; });
        Cekirdek.animasyon(0.8, t => { taret.position.y = 5 + t * 7; });
      }, 900 + kontrol.length * ADIM_SN * 1000 + 500);
    }

    kanal.dinle(m => {
      if (durdu) return;
      if (m.t === 'tur') turGeldi(m);
      else if (m.t === 'sonuc') sonucGeldi(m);
      else if (m.t === 'bitenler') hudOyuncular(new Set(m.ids));
      else if (m.t === 'bitti') {
        faz = 'bitti';
        dugmeCiz();
        const k = oyuncular.find(o => o.id === m.kazanan);
        b.hud.buyuk(k ? `🏆 ${k.ad}` : '🤝 BERABERE', '');
        setTimeout(() => { if (!durdu) b.bitti({ kazanan: m.kazanan, siralama: m.siralama, aciklama: k ? 'Küpü en iyi o ezberledi!' : '' }); }, 1500);
      }
    });

    // ---------- Sadece ev: turlar, botlar, değerlendirme ----------
    let ev = null;
    if (kanal.evMi) {
      ev = { tur: 0, eksik: ILK_EKSIK, cevap: {}, zaman: [], olumSira: 0 };
      oyuncular.forEach(o => { o.beceri = 0.75 + Math.random() * 0.25; });
      const yeniTur = () => {
        if (durdu) return;
        ev.tur++;
        // Görünür küplerden rastgele seç
        const havuz = [...GORUNUR].sort(() => Math.random() - 0.5);
        ev.hedef = havuz.slice(0, Math.min(ev.eksik, havuz.length));
        ev.cevap = {}; ev.bitenler = new Set();
        kanal.yayinla({ t: 'tur', no: ev.tur, eksik: ev.hedef });
        // Botlar: zorluk arttıkça yanılma ihtimali artar
        oyuncular.filter(o => o.canli && o.bot).forEach(o => {
          const dogruMu = Math.random() < Math.max(0.15, Math.min(0.97, o.beceri * (1.12 - 0.075 * ev.hedef.length)));
          let c = [...ev.hedef];
          if (!dogruMu) {
            // Bir küpü karıştır
            const yanlis = GORUNUR.filter(n => !c.includes(n));
            if (Math.random() < 0.5 && c.length > 1) c.pop();
            c.push(yanlis[Math.floor(Math.random() * yanlis.length)]);
          }
          ev.cevap[o.id] = c;
          ev.zaman.push(setTimeout(() => { if (!durdu) { ev.bitenler.add(o.id); kanal.yayinla({ t: 'bitenler', ids: [...ev.bitenler] }); } }, (TAM_SN + GOSTER_SN + 2 + Math.random() * 7) * 1000));
        });
        ev.zaman.push(setTimeout(degerlendir, (TAM_SN + GOSTER_SN + KUR_SN + 0.6) * 1000));
      };
      const degerlendir = () => {
        if (durdu) return;
        const canli = oyuncular.filter(o => o.canli);
        const dogru = canli.filter(o => ayni(ev.cevap[o.id] || [], ev.hedef)).map(o => o.id);
        const yanlis = canli.filter(o => !dogru.includes(o.id)).map(o => o.id);
        const hepsiYanlis = dogru.length === 0;
        const olen = hepsiYanlis ? [] : yanlis;
        olen.forEach(id => { const o = oyuncular.find(p => p.id === id); o.olumSira = ++ev.olumSira; o.olumTur = ev.tur; });
        const cevaplar = Object.fromEntries(canli.map(o => [o.id, ev.cevap[o.id] || []]));
        kanal.yayinla({ t: 'sonuc', dogru, olen, yanlis, hepsiYanlis, hedef: ev.hedef, cevaplar });
        if (!hepsiYanlis) ev.eksik++;
        const kalan = canli.filter(o => !olen.includes(o.id));
        ev.zaman.push(setTimeout(() => {
          if (durdu) return;
          if (kalan.length <= 1) {
            const sirali = [...oyuncular].sort((a, c) => (c.canli && !olen.includes(c.id)) - (a.canli && !olen.includes(a.id)) || (c.olumSira || 99) - (a.olumSira || 99));
            kanal.yayinla({
              t: 'bitti', kazanan: kalan[0]?.id ?? null,
              siralama: sirali.map(o => ({ id: o.id, neden: kalan.includes(o) ? `🏆 ${ev.tur} tur doğru yaptı` : `💥 ${o.olumTur}. turda yanıldı` })),
            });
          } else yeniTur();
        }, (1.4 + canli.length * 2.7 + 1.2) * 1000));   // taret herkesi sırayla tarar (kişi başı 2.7 sn)
      };
      kanal.evDinle((m, id) => {
        if (m.t !== 'cevap' || m.no !== ev.tur || !Array.isArray(m.eksik)) return;
        ev.cevap[id] = m.eksik.filter(n => Number.isInteger(n) && n >= 0 && n < 27);
        if (m.bitti) ev.bitenler.add(id); else ev.bitenler.delete(id);
        kanal.yayinla({ t: 'bitenler', ids: [...ev.bitenler] });
      });
      ev.koptu = id => { const o = oyuncular.find(p => p.id === id); if (o) o.bot = true; };
      ev.zaman.push(setTimeout(yeniTur, 1200));
    }

    // ---------- Her kare ----------
    const kaldir = Cekirdek.guncelle((dt, t) => {
      if (durdu) return false;
      kupQ.slerp(hedefQ, Math.min(1, dt * 12));
      ornek.g.quaternion.copy(kupQ); benim.g.quaternion.copy(kupQ);
      miniKupler.forEach(k => k.g.quaternion.copy(kupQ));
      ornek.g.position.y = benim.g.position.y = MERKEZ_Y + Math.sin(t * 1.5) * 0.05;
      if (faz === 'goster' && simdi() >= fazBitis) kurBasla();
      if (faz === 'goster' || faz === 'kur') {
        const sn = Math.max(0, Math.ceil(fazBitis - simdi()));
        if (sn !== sonSn) { sonSn = sn; if (sn <= 3 && sn > 0) Ses.tik(); }
        b.hud.buyuk(faz === 'goster' ? '🧠 EZBERLE' : '🔨 YAP', String(sn), sn <= 3 ? 'ates yanda' : 'yanda', false);
      } else if (faz === 'sonuc') b.hud.buyuk('🎯 SONUÇ', '', 'yanda', false);
      else if (faz === 'bekle') b.hud.buyuk('HAZIR', '', 'yanda', false);
    });

    b.hud.bilgi('⏳ Hazırlanıyor…');

    return {
      durdur() {
        durdu = true;
        kaldir();
        if (ev) ev.zaman.forEach(clearTimeout);
        window.removeEventListener('pointerdown', bas);
        window.removeEventListener('pointermove', surukle);
        window.removeEventListener('pointerup', birak);
        dugmeler.remove();
        Object.values(R).forEach(x => x.r.sil());
        Cekirdek.sahne.remove(grup);
        grup.traverse(n => { n.geometry?.dispose(); });
      },
      koptu(id) { ev?.koptu(id); },
    };
  }
})();
