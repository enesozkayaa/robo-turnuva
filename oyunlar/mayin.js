// =============================================================
// Robo Turnuva - mini oyun: MAYIN KORIDORU
// Kurallar mayin-motor.js'te. Burası koridoru, gizli mayınları (sadece kendi taradığını görürsün),
// tarama çemberini, dumanı, patlamaları ve sondaki uzay üssünü çizer; kamera seni takip eder.
//
// Online: kurallar odayı açanda (kanal.evMi). Ev önce mayın tohumunu yollar (herkes aynı mayınları kurar),
// sonra saniyede 20 kez yerleri ve olayları yollar. Misafir kendi robotunu kendi cihazında yürütür ve
// taramasını kendisi yapar (taradığını sadece o görür); yerini eve gönderir.
// Mesajlar: ev → herkes { t: 'harita', tohum, sure }  { t: 'd', zt, kalan, o: [[id, x, z, a, durum, hasarli]], ol }
//           oyuncu → ev { t: 'g', x, z, a }
// =============================================================

(() => {
  const M = MayinMotor;
  const ADIM = 1 / 60, YAYIN_SN = 0.05;
  const DURUM_KOD = { oynuyor: 0, vardi: 1, patladi: 2 };
  const KOD_DURUM = ['oynuyor', 'vardi', 'patladi'];

  function zeminDokusu() {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#3a3628'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,240,200' : '0,0,0'},${Math.random() * 0.08})`; g.fillRect(Math.random() * 256, Math.random() * 256, 3 + Math.random() * 8, 3 + Math.random() * 8); }
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3; g.strokeRect(0, 0, 256, 256);
    const d = new THREE.CanvasTexture(c);
    d.wrapS = d.wrapT = THREE.RepeatWrapping; d.repeat.set(M.W, (M.L + 10) / 2);
    d.colorSpace = THREE.SRGBColorSpace;
    return d;
  }
  function usYap() {
    const g = new THREE.Group();
    const kubbe = new THREE.Mesh(new THREE.SphereGeometry(4.2, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9aa3c7, metalness: 0.7, roughness: 0.3 }));
    kubbe.position.z = -3.5; g.add(kubbe);
    const kapi = new THREE.Mesh(new THREE.BoxGeometry(M.W * 2 - 0.4, 2.4, 0.4), new THREE.MeshBasicMaterial({ color: 0x3dff6a, transparent: true, opacity: 0.6 }));
    kapi.position.set(0, 1.2, -0.3); g.add(kapi);
    const cerceve = new THREE.Mesh(new THREE.TorusGeometry(M.W - 0.2, 0.15, 8, 32, Math.PI), new THREE.MeshBasicMaterial({ color: 0x2ee6ff }));
    cerceve.position.set(0, 0, -0.3); g.add(cerceve);
    const anten = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 3, 8), new THREE.MeshStandardMaterial({ color: 0x3a3f60, metalness: 0.8 }));
    anten.position.set(1.5, 5, -3.5); g.add(anten);
    const isik = new THREE.PointLight(0x3dff6a, 8, 12, 1.4); isik.position.set(0, 2, 1); g.add(isik);
    return g;
  }

  Salon.oyunEkle({
    id: 'mayin',
    ad: 'Mayın Koridoru',
    ikon: '💣',
    ozet: 'Mayınlı koridordan uzay üssüne ilk sen var! Etrafını tara, mayınların yanından geç.',
    kurallar: [
      'Uzun bir koridordasınız. İleri, geri ve yanlara gidebilirsin.',
      `Yerde gizli <b>mayınlar</b> var. Her <b>${M.TARAMA_ARA} saniyede</b> bir etrafını <b>tarayabilirsin</b> (boşluk / sol tık / düğme): yakınındaki mayınlar birkaç saniye görünür, sonra yine gizlenir — yerlerini aklında tut! Başkalarının taramasını da görürsün.`,
      'İlk mayına basınca robotundan <b>duman</b> çıkar ve <b>sürünerek</b> yavaş gidersin. İkinci mayında <b>patlarsın</b>!',
      'Koridorun sonundaki <b>uzay üssüne</b> ilk varan kazanır. Süre bitince varamayan patlar, puan alamaz.',
      'Birbirinizi <b>itebilirsiniz</b>. Şanslıysan taramadan da koşabilirsin…',
      'Bilgisayar: <b>WASD</b>. Telefon: sol joystick ve tarama düğmesi.',
    ],
    ayarlar: [{ id: 'sure', ad: 'Süre (sn)', secenekler: [45, 60, 90], varsayilan: 60 }],
    baslat,
  });

  function baslat(b) {
    const { kanal } = b;
    const sure = [45, 60, 90].includes(+b.ayar?.sure) ? +b.ayar.sure : 60;
    const grup = new THREE.Group();
    Cekirdek.sahne.add(grup);
    Cekirdek.kameraAyarla(6, 0.95);
    let d = null, R = {}, hafiza = {}, ben = null, MY = [];
    let durdu = false, birikim = 0, bittiMi = false, sonSn = null, taramaIstek = false, sonTarama = -99;
    const gorunur = new Map();                 // mayın no → ne zamana kadar görünür (taramalar herkese açık, sonra gizlenir)
    const GORUNME_SN = 2.5;
    let saat = 0;
    const dumanlar = [];

    // ---------- Tarama düğmesi ----------
    const dugme = document.createElement('button');
    dugme.id = 'myTara';
    dugme.textContent = '📡 TARA';
    dugme.className = 'sagDugme';   // telefonda sağdaki joystick'in yerinde
    document.body.appendChild(dugme);
    dugme.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); taramaIstek = true; });
    const fareBas = e => { if ((e.target === Cekirdek.tuval || e.target.id === 'dokunmaAlani') && e.button === 0 && e.pointerType === 'mouse') taramaIstek = true; };
    const tus = e => { if (!e.repeat && (e.code === 'Space' || e.code === 'KeyE') && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); taramaIstek = true; } };
    window.addEventListener('pointerdown', fareBas);
    window.addEventListener('keydown', tus);

    function hudOyuncular() {
      if (!d) return;
      b.hud.oyuncular(d.oyuncular.map(o => ({
        ...o, ben: o.id === b.benId, canli: o.durum !== 'patladi',
        ek: o.durum === 'vardi' ? `🏁 ${o.sira}.` : o.durum === 'patladi' ? '💥' : o.hasarli ? '💨' : `${Math.max(0, Math.round(o.z - M.BITIS_Z))} m`,
      })));
    }

    // ---------- Koridoru kur (tohum gelince) ----------
    function kur(tohum) {
      d = M.yeni(b.oyuncular.map(o => ({ id: o.id, ad: o.ad, renk: o.renk, bot: o.bot })), tohum, sure);
      const uzun = M.L + 10;
      const zemin = new THREE.Mesh(new THREE.BoxGeometry(M.W * 2, 0.4, uzun), new THREE.MeshStandardMaterial({ map: zeminDokusu(), roughness: 0.9 }));
      zemin.position.set(0, -0.2, -M.L / 2 + 2); zemin.receiveShadow = true;
      grup.add(zemin);
      const duvarMal = new THREE.MeshStandardMaterial({ color: 0x3a3f60, metalness: 0.6, roughness: 0.4 });
      const neon = new THREE.MeshBasicMaterial({ color: 0xff8a2a });
      [-1, 1].forEach(s => {
        const w = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.9, uzun), duvarMal);
        w.position.set(s * (M.W + 0.17), 0.45, -M.L / 2 + 2); w.castShadow = true;
        const n = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.06, uzun), neon);
        n.position.set(s * (M.W + 0.17), 0.92, -M.L / 2 + 2);
        grup.add(w, n);
      });
      // Başlangıç çizgisi ve mesafe çizgileri
      const cizgi = (z, renk, kalin = 0.12) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(M.W * 2, kalin), new THREE.MeshBasicMaterial({ color: renk, transparent: true, opacity: 0.7 })); m.rotation.x = -Math.PI / 2; m.position.set(0, 0.01, z); grup.add(m); };
      cizgi(0.6, 0xffffff, 0.2);
      for (let z = -10; z > -M.L; z -= 10) cizgi(z, 0xffd23b, 0.06);
      const us = usYap(); us.position.set(0, 0, M.BITIS_Z - 0.4); grup.add(us);
      // Mayınlar (gizli; taranınca ya da patlayınca görünür)
      const govdeMal = new THREE.MeshStandardMaterial({ color: 0x2a2d3a, metalness: 0.7, roughness: 0.35 });
      MY = d.mayinlar.map(m => {
        const g = new THREE.Group();
        const disk = new THREE.Mesh(new THREE.CylinderGeometry(M.MAYIN_R + 0.06, M.MAYIN_R + 0.1, 0.1, 16), govdeMal);
        disk.position.y = 0.05;
        const isik = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff2030 }));
        isik.position.y = 0.12;
        const hale = new THREE.Sprite(new THREE.SpriteMaterial({ map: Cekirdek.parlamaDokusu(), color: 0xff2030, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        hale.position.y = 0.15; hale.scale.set(0.8, 0.8, 1);
        const krater = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), new THREE.MeshBasicMaterial({ color: 0x0b0a08, transparent: true, opacity: 0.8, depthWrite: false }));
        krater.rotation.x = -Math.PI / 2; krater.position.y = 0.015; krater.visible = false;
        g.add(disk, isik, hale);
        g.position.set(m.x, 0, m.z);
        g.visible = false;
        grup.add(g);
        const kr = new THREE.Group(); kr.position.set(m.x, 0, m.z); kr.add(krater); grup.add(kr);
        return { g, hale, krater };
      });
      d.oyuncular.forEach(o => {
        const r = Cekirdek.robotYap(o.renk, o.id === b.benId ? `${o.ad} (sen)` : o.ad, { silahsiz: true });
        r.grup.scale.setScalar(0.95);
        grup.add(r.grup);
        R[o.id] = r;
        hafiza[o.id] = {};
        o.hedefX = o.x; o.hedefZ = o.z;
      });
      ben = d.oyuncular.find(o => o.id === b.benId);
      hudOyuncular();
    }

    // Tarama (herkes görür): o oyuncunun renginde çember dalgası, o an çemberdeki mayınlar kısa süre görünür
    function taramaGoster(ol) {
      const o = d.oyuncular.find(p => p.id === ol.id);
      const renk = new THREE.Color(o.renk);
      if (ol.id === b.benId) sonTarama = d.t;
      ol.m.forEach(id => gorunur.set(id, saat + GORUNME_SN));
      Ses.belir();
      const halka = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color: renk, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
      halka.rotation.x = -Math.PI / 2; halka.position.set(ol.x, 0.05, ol.z);
      const disk = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: renk, transparent: true, opacity: 0.14, depthWrite: false }));
      disk.rotation.x = -Math.PI / 2; disk.position.set(ol.x, 0.03, ol.z);
      grup.add(halka, disk);
      Cekirdek.animasyon(GORUNME_SN, t => {
        const k = Math.min(1, t * 4);   // ilk çeyrekte yayılır, sonra solar
        const rr = 0.2 + k * M.TARAMA_R;
        halka.scale.setScalar(rr); disk.scale.setScalar(rr);
        halka.material.opacity = 0.85 * (1 - t); disk.material.opacity = 0.14 * (1 - t);
      }).then(() => { grup.remove(halka, disk); });
    }

    function dumanCikar(o) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: Cekirdek.parlamaDokusu(), color: 0x8a8a8a, transparent: true, opacity: 0.6, depthWrite: false }));
      s.position.set(o.x + (Math.random() - 0.5) * 0.3, 0.9, o.z + (Math.random() - 0.5) * 0.3);
      s.scale.setScalar(0.4);
      grup.add(s);
      dumanlar.push({ s, t: 0 });
    }

    // ---------- Olaylar ----------
    function olayIsle(ol) {
      if (ol.tip === 'mayin') {
        const m = MY[ol.m], o = d.oyuncular.find(p => p.id === ol.id);
        m.g.visible = false; m.krater.visible = true;
        Cekirdek.patlama(o.x, 0.3, o.z, ol.sonuc === 'patladi' ? o.renk : '#ff8a2a', ol.sonuc === 'patladi' ? 1 : 0.5);
        Ses.patlama();
        if (ol.sonuc === 'patladi') {
          R[o.id].goster(false);
          b.hud.bilgi(o.id === b.benId ? '💥 İkinci mayın! Patladın…' : `💥 ${o.ad} patladı!`, o.id === b.benId);
          if (o.id === b.benId) b.hud.perde('flas');
        } else {
          b.hud.bilgi(o.id === b.benId ? '💨 Mayına bastın! Hasarlısın, sürünerek gidiyorsun. Bir daha basarsan patlarsın!' : `💨 ${o.ad} mayına bastı!`, o.id === b.benId);
        }
        hudOyuncular();
      } else if (ol.tip === 'vardi') {
        const o = d.oyuncular.find(p => p.id === ol.id), r = R[o.id];
        Ses.kazanma();
        b.hud.bilgi(o.id === b.benId ? `🏁 Üsse vardın! ${ol.sira}. oldun!` : `🏁 ${o.ad} üsse vardı (${ol.sira}.)`);
        const z0 = r.grup.position.z;
        Cekirdek.animasyon(1, t => { r.grup.position.z = z0 - t * 3; r.saydam(1 - t); }).then(() => r.goster(false));
        hudOyuncular();
      } else if (ol.tip === 'sureBitti') {
        const o = d.oyuncular.find(p => p.id === ol.id);
        Cekirdek.patlama(o.x, 0.5, o.z, o.renk);
        R[o.id].goster(false);
        if (o.id === b.benId) { b.hud.bilgi('⏰ Süre bitti, patladın!', true); b.hud.perde('flas'); }
        hudOyuncular();
      } else if (ol.tip === 'it') { Ses.isabet(); }
      else if (ol.tip === 'tara') taramaGoster(ol);
      else if (ol.tip === 'bitti') bitir(ol);
    }
    function bitir(ol) {
      if (bittiMi) return;
      bittiMi = true;
      Kontrol.ac(false);
      const k = d.oyuncular.find(o => o.id === ol.kazanan);
      b.hud.buyuk(k ? `🏆 ${k.ad}` : '💥 KİMSE VARAMADI', '');
      const siralama = [...d.oyuncular].sort((a, c) => ((a.sira || 99) - (c.sira || 99)) || (a.z - c.z)).map(o => ({
        id: o.id, neden: o.durum === 'vardi' ? `🏁 üsse ${o.sira}. vardı` : `💥 ${Math.round(o.z - M.BITIS_Z)} m kala patladı`,
      }));
      setTimeout(() => { if (!durdu) b.bitti({ kazanan: ol.kazanan, siralama, aciklama: k ? 'Uzay üssüne ilk o vardı!' : 'Kimse üsse varamadı.' }); }, 1400);
    }

    // ---------- Ağ ----------
    const girdiler = {};
    let giden = [], yayinSayac = 0, gondermeSayac = 0;
    if (kanal.evMi) {
      const tohum = Math.floor(Math.random() * 1e9);
      kur(tohum);
      if (kanal.online) kanal.yayinla({ t: 'harita', tohum, sure });
      kanal.evDinle((m, id) => {
        if (id === b.benId) return;
        if (m.t === 'tara') { (girdiler[id] ??= {}).tara = true; return; }
        if (m.t !== 'g') return;
        const x = +m.x, z = +m.z, a = +m.a;
        if ([x, z].every(isFinite)) girdiler[id] = { ...(girdiler[id] || {}), x, z, a };
      });
    } else {
      b.hud.bilgi('⏳ Koridor yükleniyor…');
      kanal.dinle(m => {
        if (durdu) return;
        if (m.t === 'harita') { if (!d) kur(m.tohum); return; }
        if (m.t !== 'd' || !d) return;
        d.t = m.zt; d.kalan = m.kalan;
        m.o.forEach(([id, x, z, a, durum, hasarli]) => {
          const o = d.oyuncular.find(p => p.id === id);
          o.durum = KOD_DURUM[durum]; o.hasarli = !!hasarli;
          if (id === b.benId) return;
          o.hedefX = x; o.hedefZ = z; o.a = a;
        });
        m.ol.forEach(ol => {
          if (ol.tip === 'mayin') { d.mayinlar[ol.m].durum = 'patladi'; const o = d.oyuncular.find(p => p.id === ol.id); if (ol.sonuc === 'duman') o.hasarli = true; else o.durum = 'patladi'; }
          if (ol.tip === 'vardi') { const o = d.oyuncular.find(p => p.id === ol.id); o.durum = 'vardi'; o.sira = ol.sira; }
          if (ol.tip === 'sureBitti') d.oyuncular.find(p => p.id === ol.id).durum = 'patladi';
          if (ol.tip === 'it' && ol.id === b.benId) { ben.vx += ol.vx; ben.vz += ol.vz; }
          if (ol.tip === 'bitti') { d.bitti = true; d.kazanan = ol.kazanan; }
          olayIsle(ol);
        });
      });
    }
    const ozetle = () => d.oyuncular.map(o => [o.id, +o.x.toFixed(2), +o.z.toFixed(2), +o.a.toFixed(2), DURUM_KOD[o.durum], o.hasarli ? 1 : 0]);

    // ---------- Her kare ----------
    const kaldir = Cekirdek.guncelle((dt, t) => {
      if (durdu || !d) return;
      saat += dt;
      if (!bittiMi) {
        const [hx, hz] = Kontrol.hareket();
        if (kanal.evMi) {
          birikim += dt;
          while (birikim >= ADIM && !d.bitti) {
            birikim -= ADIM;
            const g = { [b.benId]: { hx, hz, tara: taramaIstek } };
            taramaIstek = false;
            d.oyuncular.forEach(o => {
              if (o.durum !== 'oynuyor') return;
              if (o.bot) {
                const bg = M.botGirdi(d, o.id, hafiza[o.id]);
                g[o.id] = bg;
              } else if (o.id !== b.benId && girdiler[o.id]) { g[o.id] = girdiler[o.id]; girdiler[o.id] = { ...girdiler[o.id], tara: false }; }
            });
            const ol = M.adim(d, ADIM, g);
            ol.forEach(olayIsle);
            if (kanal.online) giden.push(...ol);
          }
          if (kanal.online && ((yayinSayac += dt) >= YAYIN_SN || giden.some(o => o.tip === 'bitti'))) {
            yayinSayac = 0;
            kanal.yayinla({ t: 'd', zt: d.t, kalan: d.kalan, o: ozetle(), ol: giden });
            giden = [];
          }
        } else {
          d.t += dt;
          if (ben.durum === 'oynuyor' && d.t >= 0) M.yuru(ben, hx, hz, dt);
          if ((gondermeSayac += dt) >= YAYIN_SN) { gondermeSayac = 0; kanal.evaGonder({ t: 'g', x: ben.x, z: ben.z, a: ben.a }); }
          if (taramaIstek) { taramaIstek = false; if (ben.durum === 'oynuyor' && d.t >= 0) kanal.evaGonder({ t: 'tara' }); }
          d.oyuncular.forEach(o => {
            if (o.id === b.benId || o.durum !== 'oynuyor') return;
            const k = Math.min(1, dt * 14);
            o.x += (o.hedefX - o.x) * k; o.z += (o.hedefZ - o.z) * k;
          });
        }
      }

      // Kamera: beni (elendiysem öndeki robotu) takip eder, ileriyi daha çok gösterir
      const takip = ben.durum === 'oynuyor' ? ben : d.oyuncular.filter(o => o.durum === 'oynuyor').sort((a, c) => a.z - c.z)[0] || ben;
      Cekirdek.kameraOdak(takip.x * 0.5, takip.z - 2.4, 5.6, 0.95);

      // Üst yazı ve düğme
      if (!bittiMi) {
        if (d.t < 0) {
          const sn = Math.ceil(-d.t);
          if (sn !== sonSn) { sonSn = sn; Ses.bip(); }
          b.hud.buyuk('HAZIR', String(sn), 'yanda');
        } else {
          const sn = Math.max(0, Math.ceil(d.kalan));
          if (sn !== sonSn) { sonSn = sn; if (sn <= 5 && sn > 0) Ses.tik(); }
          b.hud.buyuk(`🏁 ${Math.max(0, Math.round(ben.z - M.BITIS_Z))} m`, String(sn), sn <= 10 ? 'ates yanda' : 'yanda', false);
        }
        const bekle = Math.max(0, Math.ceil(M.TARAMA_ARA - (d.t - sonTarama)));
        dugme.textContent = bekle > 0 && d.t >= 0 ? `📡 ${bekle}` : '📡 TARA';
        dugme.classList.toggle('hazir', bekle === 0 && d.t >= 0);
        dugme.hidden = ben.durum !== 'oynuyor';
      }
      if (Math.floor(t * 3) !== Math.floor((t - dt) * 3)) hudOyuncular();

      // Mayınlar: taradıklarım görünür ve yanıp söner
      d.mayinlar.forEach((m, i) => {
        const v = MY[i];
        const bitis = gorunur.get(m.id) || 0;
        v.g.visible = m.durum === 'gizli' && bitis > saat;
        if (v.g.visible) {
          const son = Math.min(1, (bitis - saat) / 0.6);   // son anda solarak gizlenir
          v.hale.material.opacity = (0.5 + Math.sin(t * 8 + i) * 0.4) * son;
          v.g.scale.setScalar(0.6 + son * 0.4);
        }
        if (m.durum === 'patladi') v.krater.visible = true;
      });

      // Robotlar ve duman
      d.oyuncular.forEach(o => {
        if (o.durum !== 'oynuyor') return;
        const r = R[o.id];
        r.konum(o.x, o.z); r.yon(o.a);
        // Hasarlı: sürünür (eğik ve alçak), duman çıkar
        r.govde.rotation.x = o.hasarli ? 0.5 : 0;
        r.grup.position.y = o.hasarli ? -0.25 : 0;
        if (o.hasarli && Math.random() < dt * 14) dumanCikar(o);
      });
      for (let i = dumanlar.length - 1; i >= 0; i--) {
        const p = dumanlar[i];
        p.t += dt;
        p.s.position.y += dt * 0.8;
        p.s.scale.setScalar(0.4 + p.t * 1.2);
        p.s.material.opacity = Math.max(0, 0.6 - p.t * 0.5);
        if (p.t > 1.2) { grup.remove(p.s); p.s.material.dispose(); dumanlar.splice(i, 1); }
      }
    });

    return {
      durdur() {
        durdu = true;
        kaldir();
        window.removeEventListener('pointerdown', fareBas);
        window.removeEventListener('keydown', tus);
        dugme.remove();
        Object.values(R).forEach(r => r.sil());
        Cekirdek.sahne.remove(grup);
        grup.traverse(n => { n.geometry?.dispose(); });
      },
      koptu(id) { const o = d?.oyuncular.find(p => p.id === id); if (o) { o.bot = true; delete girdiler[id]; } },
    };
  }
})();
