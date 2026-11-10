// =============================================================
// Robo Turnuva - Kutu Kapmaca: kurallar (ekran yok, sadece hesap)
// Kare platform, her köşede bir oyuncunun bölgesi. Herkes forklift sürer.
// Her 10 saniyede ortaya yukarıdan 2 kutu düşer. Kutuyu çatalla al (eylem), kendi bölgene götür;
// bölgen yeşil yanınca (kutuyla içindeyken) bırak (eylem). Rakibin bölgesinden kutu çalabilirsin.
// Kutu taşıyan forklifte hızlı çarpılırsa kutu düşer. Süre bitince bölgesinde en çok kutu olan kazanır.
// Sabit adımlı simülasyon: adim(d, dt, girdiler). Tarayıcıda ve Node'da (test) çalışır.
// =============================================================

const ForkliftMotor = (() => {
  const P = 8.5;                       // platform yarı kenarı
  const Z = 3.8;                       // köşe bölgesi kenarı
  const FR = 0.72;                     // forklift çarpışma yarıçapı
  const KUTU = 0.34;                   // kutu yarı kenarı
  const HIZ = 4.6, DONUS = 4.2;        // ileri hız, dönüş hızı (rad/sn)
  const CATAL = 1.0;                   // çatalın ucu forkliftin merkezinden ne kadar önde
  const DUSME_SN = 1.1, DUSUS_ARA = 10, DUSUS_ADET = 2;
  const BASLANGIC = 3;
  // Bölgeler: köşe merkezleri (oyuncu sırasına göre)
  const BOLGE = [[-1, -1], [1, 1], [1, -1], [-1, 1]].map(([sx, sz]) => ({ cx: sx * (P - Z / 2), cz: sz * (P - Z / 2) }));
  const bolgede = (i, x, z) => Math.abs(x - BOLGE[i].cx) <= Z / 2 && Math.abs(z - BOLGE[i].cz) <= Z / 2;
  const kutuBolgesi = (d, k) => d.oyuncular.findIndex((o, i) => bolgede(i, k.x, k.z));

  function yeni(oyuncular, sure = 90) {
    return {
      t: -BASLANGIC, sure, kalan: sure, bitti: false, kazanan: null,
      // Açılışta ortada 4 kutu hazır durur; yukarıdan düşmeler 10 saniye sonra başlar
      kutular: [[-0.9, -0.9], [0.9, 0.9], [0.9, -0.9], [-0.9, 0.9]].map(([x, z], i) => ({ id: i + 1, x, z, y: 0, tasiyan: null })),
      sonrakiKutu: 5, dususSayac: DUSUS_ARA,
      oyuncular: oyuncular.map((o, i) => {
        const b = BOLGE[i];
        return { ...o, bolge: i, x: b.cx * 0.8, z: b.cz * 0.8, a: Math.atan2(-b.cz, -b.cx), vx: 0, vz: 0, hiz: 0, kutu: null, sonEylem: -9 };
      }),
    };
  }
  // Bölgelerdeki kutu sayıları (taşınanlar sayılmaz)
  function sayim(d) {
    const s = d.oyuncular.map(() => 0);
    d.kutular.forEach(k => { if (k.tasiyan === null && k.y <= 0) { const i = kutuBolgesi(d, k); if (i >= 0) s[i]++; } });
    return s;
  }
  const catalUcu = o => [o.x + Math.cos(o.a) * CATAL, o.z + Math.sin(o.a) * CATAL];
  // İki kutu (kare) üst üste biniyor mu
  const cakisir = (x1, z1, x2, z2) => Math.abs(x1 - x2) < KUTU * 2 - 0.02 && Math.abs(z1 - z2) < KUTU * 2 - 0.02;
  // Kutuyu (cx, cz) noktasından uzaklaştır: en az örtüşen eksende it (kare kutular yan yana dizilsin)
  function itAyir(k, cx, cz, mesafe = KUTU * 2) {
    const dx = k.x - cx, dz = k.z - cz;
    if (Math.abs(dx) >= Math.abs(dz)) k.x = cx + (dx >= 0 ? 1 : -1) * mesafe;
    else k.z = cz + (dz >= 0 ? 1 : -1) * mesafe;
    sinirla(k, KUTU);
  }
  const sinirla = (o, r) => { o.x = Math.max(-P + r, Math.min(P - r, o.x)); o.z = Math.max(-P + r, Math.min(P - r, o.z)); };

  function kutuBirak(d, o, olaylar, neden) {
    const k = d.kutular.find(q => q.id === o.kutu);
    o.kutu = null;
    if (!k) return;
    k.tasiyan = null;
    [k.x, k.z] = catalUcu(o);
    sinirla(k, KUTU);
    olaylar.push({ tip: 'birakti', id: o.id, k: k.id, x: k.x, z: k.z, neden });
  }

  // Forklift sürüşü: istenen yöne döner, o yöne gider (online misafir kendi forkliftini de bununla sürer)
  function sur(o, hx, hz, dt) {
    const L = Math.min(1, Math.hypot(hx, hz));
    if (L > 0.1) {
      let fark = Math.atan2(hz, hx) - o.a; fark = Math.atan2(Math.sin(fark), Math.cos(fark));
      o.a += Math.max(-DONUS * dt, Math.min(DONUS * dt, fark));
      const ileri = Math.cos(fark);
      o.hiz = HIZ * L * (ileri > 0 ? Math.max(0.25, ileri) : -0.45);
    } else o.hiz *= Math.exp(-8 * dt);
    o.x += (Math.cos(o.a) * o.hiz + o.vx) * dt; o.z += (Math.sin(o.a) * o.hiz + o.vz) * dt;
    sinirla(o, FR);
  }

  // girdiler: { id: { hx, hz, eylem } } ya da online misafir için { x, z, a, eylem }
  function adim(d, dt, girdiler = {}, rnd = Math.random) {
    const olaylar = [];
    if (d.bitti) return olaylar;
    d.t += dt;
    if (d.t < 0) return olaylar;
    d.kalan -= dt;
    // Kutu düşür
    d.dususSayac -= dt;
    if (d.dususSayac <= 0) {
      d.dususSayac = DUSUS_ARA;
      for (let n = 0; n < DUSUS_ADET; n++) {
        const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 3.2;
        const k = { id: d.sonrakiKutu++, x: Math.cos(a) * r, z: Math.sin(a) * r, y: 9, tasiyan: null };
        d.kutular.push(k);
        olaylar.push({ tip: 'kutu', k: k.id, x: k.x, z: k.z });
      }
    }
    d.kutular.forEach(k => { if (k.y > 0) k.y = Math.max(0, k.y - (9 / DUSME_SN) * dt); });

    // Forkliftler: istenen yöne döner ve o yöne gider
    d.oyuncular.forEach(o => {
      const g = girdiler[o.id] || {};
      const ex = o.x, ez = o.z;
      if (typeof g.x === 'number' && isFinite(g.x) && isFinite(g.z)) { o.x = g.x; o.z = g.z; if (isFinite(+g.a)) o.a = +g.a; }
      else sur(o, +g.hx || 0, +g.hz || 0, dt);
      const s = Math.exp(-5 * dt); o.vx *= s; o.vz *= s;
      sinirla(o, FR);
      o.hizX = (o.x - ex) / dt; o.hizZ = (o.z - ez) / dt;
    });
    // Forkliftler çarpışır; kutu taşıyana hızlı çarpılırsa kutusu düşer
    const F = d.oyuncular;
    for (let i = 0; i < F.length; i++) for (let j = i + 1; j < F.length; j++) {
      const p = F[i], q = F[j], dx = q.x - p.x, dz = q.z - p.z, L = Math.hypot(dx, dz), en = FR * 2;
      if (L >= en || L < 1e-6) continue;
      const nx = dx / L, nz = dz / L, it = (en - L) / 2;
      p.x -= nx * it; p.z -= nz * it; q.x += nx * it; q.z += nz * it;
      sinirla(p, FR); sinirla(q, FR);
      const pY = Math.max(0, (p.hizX || 0) * nx + (p.hizZ || 0) * nz), qY = Math.max(0, -((q.hizX || 0) * nx + (q.hizZ || 0) * nz));
      if (d.t - (p.sonIt?.[q.id] || -9) < 0.5) continue;
      const [vuran, yiyen, sgn, hiz] = pY > qY ? [p, q, 1, pY] : [q, p, -1, qY];
      if (hiz < 2) continue;
      (p.sonIt ??= {})[q.id] = d.t;
      const g = 1.5 + hiz * 0.7;
      yiyen.vx += nx * sgn * g; yiyen.vz += nz * sgn * g;
      olaylar.push({ tip: 'it', id: yiyen.id, kim: vuran.id, vx: nx * sgn * g, vz: nz * sgn * g });
      if (yiyen.kutu !== null && hiz > 3) kutuBirak(d, yiyen, olaylar, 'carpma');
    }
    // Taşınan kutu yerdeki kutulara çarparsa onları önünden iter
    d.kutular.forEach(k => {
      if (k.tasiyan === null) return;
      const o = F.find(p => p.id === k.tasiyan);
      const [ux, uz] = catalUcu(o);
      d.kutular.forEach(q => {
        if (q === k || q.tasiyan !== null || q.y > 0 || !cakisir(q.x, q.z, ux, uz)) return;
        itAyir(q, ux, uz);
      });
    });
    // Yerdeki kutular birbirinin içine geçmez
    const yerde = d.kutular.filter(k => k.tasiyan === null && k.y <= 0);
    for (let tekrar = 0; tekrar < 2; tekrar++) {
      for (let i = 0; i < yerde.length; i++) for (let j = i + 1; j < yerde.length; j++) {
        const a = yerde[i], c = yerde[j];
        if (!cakisir(a.x, a.z, c.x, c.z)) continue;
        const mx = (a.x + c.x) / 2, mz = (a.z + c.z) / 2;
        itAyir(a, mx, mz, KUTU); itAyir(c, mx, mz, KUTU);
      }
    }
    // Yerdeki kutular forkliftin gövdesinden itilir
    d.kutular.forEach(k => {
      if (k.tasiyan !== null || k.y > 0) return;
      F.forEach(o => {
        const dx = k.x - o.x, dz = k.z - o.z, L = Math.hypot(dx, dz), en = FR * 0.8 + KUTU;
        if (L < en && L > 1e-6) { k.x = o.x + dx / L * en; k.z = o.z + dz / L * en; sinirla(k, KUTU); }
      });
    });
    // Eylem: kutu al / bırak
    F.forEach(o => {
      const g = girdiler[o.id] || {};
      if (!g.eylem || d.t - o.sonEylem < 0.25) return;
      o.sonEylem = d.t;
      if (o.kutu === null) {
        const [ux, uz] = catalUcu(o);
        const k = d.kutular.filter(q => q.tasiyan === null && q.y <= 0 && Math.hypot(q.x - ux, q.z - uz) < 0.75)
          .sort((a, b) => Math.hypot(a.x - ux, a.z - uz) - Math.hypot(b.x - ux, b.z - uz))[0];
        if (k) { k.tasiyan = o.id; o.kutu = k.id; olaylar.push({ tip: 'aldi', id: o.id, k: k.id }); }
      } else if (bolgede(o.bolge, o.x, o.z)) {
        // Bırakılacak yer bölgenin içinde ve başka kutunun üstünde olmamalı (kutular iç içe geçmesin)
        const b = BOLGE[o.bolge];
        let [x, z] = catalUcu(o);
        x = Math.max(b.cx - Z / 2 + KUTU, Math.min(b.cx + Z / 2 - KUTU, x));
        z = Math.max(b.cz - Z / 2 + KUTU, Math.min(b.cz + Z / 2 - KUTU, z));
        if (d.kutular.some(q => q.id !== o.kutu && q.tasiyan === null && q.y <= 0 && cakisir(q.x, q.z, x, z))) {
          olaylar.push({ tip: 'yerYok', id: o.id });
          return;
        }
        kutuBirak(d, o, olaylar, 'bolge');
        const son = olaylar[olaylar.length - 1];
        const k = d.kutular.find(q => q.id === son.k);
        k.x = x; k.z = z; son.x = x; son.z = z;
      }
    });
    // Taşınan kutular çatalın ucunda
    d.kutular.forEach(k => {
      if (k.tasiyan === null) return;
      const o = F.find(p => p.id === k.tasiyan);
      [k.x, k.z] = catalUcu(o);
    });

    if (d.kalan <= 0) {
      d.bitti = true;
      const s = sayim(d);
      const enCok = Math.max(...s);
      const birinciler = d.oyuncular.filter((o, i) => s[i] === enCok);
      d.kazanan = birinciler.length === 1 ? birinciler[0].id : null;
      olaylar.push({ tip: 'bitti', kazanan: d.kazanan, sayim: s });
    }
    return olaylar;
  }

  // ---------- Botlar ----------
  function botGirdi(d, id, hafiza, rnd = Math.random) {
    const o = d.oyuncular.find(p => p.id === id);
    if (d.t < 0) return {};
    hafiza.hirs ??= rnd();                    // rakipten çalmayı ne kadar sever
    const git = (tx, tz, yavas = false) => {
      const dx = tx - o.x, dz = tz - o.z, L = Math.hypot(dx, dz);
      if (L < 0.05) return { hx: 0, hz: 0 };
      const h = yavas ? Math.min(1, L / 1.5) : 1;
      return { hx: dx / L * h, hz: dz / L * h };
    };
    const b = BOLGE[o.bolge];
    if (o.kutu !== null) {
      // Kendi bölgesinde boş bir yer seç (forklift oraya gelince çatalın ucu boş yere denk gelsin)
      const bos = (x, z) => !d.kutular.some(q => q.tasiyan === null && q.y <= 0 && cakisir(q.x, q.z, x, z));
      if (!hafiza.yer || hafiza.yerKutu !== o.kutu || !bos(...hafiza.yer) || d.t > hafiza.yerSure) {
        hafiza.yerKutu = o.kutu; hafiza.yerSure = d.t + 6;
        let en = null;
        for (let n = 0; n < 25; n++) {
          const x = b.cx + (rnd() - 0.5) * (Z - KUTU * 2.2), z = b.cz + (rnd() - 0.5) * (Z - KUTU * 2.2);
          if (bos(x, z)) { en = [x, z]; break; }
        }
        hafiza.yer = en || [b.cx, b.cz];
      }
      const [yx, yz] = hafiza.yer;
      const [ux, uz] = catalUcu(o);
      if (bolgede(o.bolge, o.x, o.z) && Math.hypot(ux - yx, uz - yz) < 0.35) return { hx: 0, hz: 0, eylem: true };
      // Çatal ucu boş yere gelecek şekilde, yere doğru yaklaş
      const dx = yx - o.x, dz = yz - o.z, L = Math.hypot(dx, dz) || 1;
      return git(yx - dx / L * CATAL, yz - dz / L * CATAL, L < 2.2);
    }
    // Hedef kutu: yerde, kendi bölgesinde olmayan; ortadakiler ya da (hırslıysa) rakip bölgesindekiler
    if (hafiza.hedef === undefined || !d.kutular.some(k => k.id === hafiza.hedef && k.tasiyan === null && kutuBolgesi(d, k) !== o.bolge) || d.t > hafiza.yenile) {
      hafiza.yenile = d.t + 1.5;
      const adaylar = d.kutular.filter(k => k.tasiyan === null && kutuBolgesi(d, k) !== o.bolge && (k.y <= 0 || k.y < 4));
      adaylar.sort((p, q) => {
        const puan = k => Math.hypot(k.x - o.x, k.z - o.z) - (kutuBolgesi(d, k) >= 0 ? hafiza.hirs * 3 - 1.5 : 0);
        return puan(p) - puan(q);
      });
      hafiza.hedef = adaylar.length ? adaylar[Math.floor(rnd() * Math.min(2, adaylar.length))].id : null;
    }
    const k = d.kutular.find(q => q.id === hafiza.hedef);
    if (!k) return git(o.x * 0.6, o.z * 0.6, true);
    // Kutuya çatal önden gelecek şekilde yaklaş
    const [ux, uz] = catalUcu(o);
    const uzak = Math.hypot(k.x - ux, k.z - uz);
    if (uzak < 0.6 && k.y <= 0) return { hx: 0, hz: 0, eylem: true };
    const dx = k.x - o.x, dz = k.z - o.z, L = Math.hypot(dx, dz) || 1;
    return git(k.x - dx / L * (CATAL * 0.95), k.z - dz / L * (CATAL * 0.95), L < 2);
  }

  return { P, Z, FR, KUTU, HIZ, CATAL, BOLGE, DUSUS_ARA, BASLANGIC, bolgede, kutuBolgesi, sayim, catalUcu, sur, sinirla, yeni, adim, botGirdi };
})();

if (typeof module !== 'undefined') module.exports = ForkliftMotor;
