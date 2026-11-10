// =============================================================
// Robo Turnuva - Ağır Çekim: kurallar (ekran yok, sadece hesap)
// Kolonlu oda. Herkesin silahı kendiliğinden ateş eder; kurşunlar ağır çekimde gider,
// süre geçtikçe hızlanır. Kurşun kolonda ve duvarda durur. 3 can, canı biten elenir.
// Sabit adımlı simülasyon: adim(d, dt, girdiler). Tarayıcıda ve Node'da (test) çalışır.
// Koordinat: zemin x-z, yön açısı a → (cos a, sin a).
// =============================================================

const KursunMotor = (() => {
  const ODA = { w: 10, h: 6.5 };                       // yarı genişlik / yarı derinlik
  const KOLON_R = 0.7;
  const KOLONLAR = [[-5, -2.6], [0, -3.4], [5, -2.6], [-5, 2.6], [0, 3.4], [5, 2.6], [-1.8, 0], [1.8, 0]];
  const ROBOT_R = 0.45, KURSUN_R = 0.16;
  const HIZ = 3.6;                                     // robot yürüme hızı
  const CAN = 3, KORUMA = 1.2;                         // vurulunca kısa süre dokunulmaz
  const BASLANGIC = 3;                                 // "hazır" geri sayımı (sn)

  // Kurşun hızı: yavaş başlar, her saniye artar (Matrix'ten gerçeğe)
  const kursunHizi = t => Math.min(11, 2 + t * 0.09);
  const atesAraligi = t => Math.max(0.85, 1.7 - t * 0.01);
  const hizKati = t => kursunHizi(t) / kursunHizi(0);

  const KOSELER = [[-8, -4.8], [8, 4.8], [8, -4.8], [-8, 4.8]];
  function yeni(oyuncular) {
    return {
      t: -BASLANGIC, bitti: false, kazanan: null, sonrakiK: 1, kursunlar: [],
      oyuncular: oyuncular.map((o, i) => {
        const [x, z] = KOSELER[i % 4];
        return { ...o, x, z, a: Math.atan2(-z, -x), vx: 0, vz: 0, can: CAN, canli: true, koruma: 0, atesSayac: 0.6 + i * 0.35, olumSirasi: 0 };
      }),
    };
  }
  const canlilar = d => d.oyuncular.filter(o => o.canli);

  // Robotu odanın ve kolonların içinden dışarı iter
  function yerlestir(o) {
    o.x = Math.max(-ODA.w + ROBOT_R, Math.min(ODA.w - ROBOT_R, o.x));
    o.z = Math.max(-ODA.h + ROBOT_R, Math.min(ODA.h - ROBOT_R, o.z));
    KOLONLAR.forEach(([kx, kz]) => {
      const dx = o.x - kx, dz = o.z - kz, L = Math.hypot(dx, dz), en = KOLON_R + ROBOT_R;
      if (L < en) { const k = L > 1e-6 ? en / L : 0; o.x = kx + (L > 1e-6 ? dx * k : en); o.z = kz + dz * k; }
    });
  }

  // girdiler: { id: { hx, hz, a } }  hx/hz: yürüme yönü (uzunluk ≤ 1), a: nişan açısı
  function adim(d, dt, girdiler = {}) {
    const olaylar = [];
    if (d.bitti) return olaylar;
    d.t += dt;
    const basladi = d.t >= 0;
    const yasayan = canlilar(d);

    yasayan.forEach(o => {
      const g = girdiler[o.id] || {};
      if (typeof g.a === 'number' && isFinite(g.a)) o.a = g.a;
      let hx = +g.hx || 0, hz = +g.hz || 0;
      const L = Math.hypot(hx, hz);
      if (L > 1) { hx /= L; hz /= L; }
      if (!basladi) hx = hz = 0;
      const ex = o.x, ez = o.z;
      o.x += hx * HIZ * dt; o.z += hz * HIZ * dt;
      yerlestir(o);
      o.vx = (o.x - ex) / dt; o.vz = (o.z - ez) / dt;
      if (o.koruma > 0) o.koruma = Math.max(0, o.koruma - dt);
    });
    // Robotlar birbirinin içine girmesin
    for (let i = 0; i < yasayan.length; i++) for (let j = i + 1; j < yasayan.length; j++) {
      const p = yasayan[i], q = yasayan[j], dx = q.x - p.x, dz = q.z - p.z, L = Math.hypot(dx, dz), en = ROBOT_R * 2;
      if (L < en && L > 1e-6) { const it = (en - L) / 2; p.x -= dx / L * it; p.z -= dz / L * it; q.x += dx / L * it; q.z += dz / L * it; yerlestir(p); yerlestir(q); }
    }
    if (!basladi) return olaylar;

    // Kendiliğinden ateş
    yasayan.forEach(o => {
      o.atesSayac -= dt;
      if (o.atesSayac > 0) return;
      o.atesSayac += atesAraligi(d.t);
      const ca = Math.cos(o.a), sa = Math.sin(o.a), yan = 0.41;
      const k = { k: d.sonrakiK++, sahip: o.id, x: o.x + ca * 0.75 - sa * yan, z: o.z + sa * 0.75 + ca * yan, dx: ca, dz: sa, hiz: kursunHizi(d.t) };
      // Namlu kolonun içindeyse kurşun hemen söner
      if (KOLONLAR.some(([kx, kz]) => Math.hypot(k.x - kx, k.z - kz) < KOLON_R)) { olaylar.push({ tip: 'carpti', x: k.x, z: k.z, sahip: o.id, k: k.k }); return; }
      d.kursunlar.push(k);
      olaylar.push({ tip: 'ates', id: o.id, k: k.k });
    });

    // Kurşunlar ilerler (hepsi şu anki hıza uyar: zaman herkes için hızlanır)
    const hiz = kursunHizi(d.t);
    d.kursunlar = d.kursunlar.filter(k => {
      k.hiz = hiz;
      k.x += k.dx * hiz * dt; k.z += k.dz * hiz * dt;
      if (Math.abs(k.x) > ODA.w - KURSUN_R || Math.abs(k.z) > ODA.h - KURSUN_R) { olaylar.push({ tip: 'carpti', x: k.x, z: k.z, sahip: k.sahip, k: k.k }); return false; }
      if (KOLONLAR.some(([kx, kz]) => Math.hypot(k.x - kx, k.z - kz) < KOLON_R + KURSUN_R)) { olaylar.push({ tip: 'carpti', x: k.x, z: k.z, sahip: k.sahip, k: k.k }); return false; }
      const h = canlilar(d).find(o => o.id !== k.sahip && Math.hypot(o.x - k.x, o.z - k.z) < ROBOT_R + KURSUN_R);
      if (!h) return true;
      if (h.koruma > 0) return true;   // dokunulmazken kurşun içinden geçer
      h.can--; h.koruma = KORUMA;
      olaylar.push({ tip: 'vurdu', id: h.id, kim: k.sahip, x: k.x, z: k.z, k: k.k, can: h.can });
      if (h.can <= 0) {
        h.canli = false;
        h.olumSirasi = d.oyuncular.filter(o => !o.canli).length;
        olaylar.push({ tip: 'elendi', id: h.id, kim: k.sahip });
      }
      return false;
    });

    const kalan = canlilar(d);
    if (kalan.length <= 1) {
      d.bitti = true;
      d.kazanan = kalan.length ? kalan[0].id : null;
      olaylar.push({ tip: 'bitti', kazanan: d.kazanan });
    }
    return olaylar;
  }

  // ---------- Botlar ----------
  // hafiza: bot başına küçük nesne (dolaşma hedefi, fark ettiği kurşunlar)
  function botGirdi(d, id, hafiza, rnd = Math.random) {
    const o = d.oyuncular.find(p => p.id === id);
    const rakipler = canlilar(d).filter(p => p.id !== id);
    if (!o.canli || !rakipler.length) return { hx: 0, hz: 0, a: o.a };
    hafiza.beceri ??= 0.55 + rnd() * 0.3;            // kurşunu fark etme olasılığı
    hafiza.gordu ??= new Map();                       // kurşun no → fark etti mi
    hafiza.hata ??= 0; hafiza.hataSure ??= 0;

    // Nişan: en yakın rakip, hareketini biraz öne alarak
    const h = rakipler.reduce((en, p) => Math.hypot(p.x - o.x, p.z - o.z) < Math.hypot(en.x - o.x, en.z - o.z) ? p : en);
    const uzak = Math.hypot(h.x - o.x, h.z - o.z);
    const varis = uzak / kursunHizi(Math.max(0, d.t));
    hafiza.hataSure -= 1 / 60;
    if (hafiza.hataSure <= 0) { hafiza.hata = (rnd() - 0.5) * 0.5; hafiza.hataSure = 0.8 + rnd(); }
    const tx = h.x + h.vx * varis * 0.5, tz = h.z + h.vz * varis * 0.5;
    const a = Math.atan2(tz - o.z, tx - o.x) + hafiza.hata;

    // Tehlikeli kurşun var mı? (yakında robota çok yaklaşacak olan)
    let kac = null, enYakin = Infinity;
    d.kursunlar.forEach(k => {
      if (k.sahip === id) return;
      const rx = o.x - k.x, rz = o.z - k.z;
      const t = (rx * k.dx + rz * k.dz) / k.hiz;          // en yakın anına kalan süre
      if (t < 0 || t > 1.6) return;
      const px = rx - k.dx * t * k.hiz, pz = rz - k.dz * t * k.hiz, dik = Math.hypot(px, pz);
      if (dik > ROBOT_R + KURSUN_R + 0.45) return;
      if (!hafiza.gordu.has(k.k)) hafiza.gordu.set(k.k, rnd() < hafiza.beceri);
      if (!hafiza.gordu.get(k.k) || t >= enYakin) return;
      enYakin = t;
      // Kurşunun yoluna dik, uzak tarafa kaç
      let nx = -k.dz, nz = k.dx;
      if (px * nx + pz * nz < 0) { nx = -nx; nz = -nz; }
      kac = [nx, nz];
    });
    if (hafiza.gordu.size > 200) hafiza.gordu.clear();
    if (kac) return { hx: kac[0], hz: kac[1], a };

    // Dolaşma: rakiple 4-8 birim arası mesafe, ara sıra yeni hedef
    hafiza.dolas ??= null; hafiza.dolasSure ??= 0;
    hafiza.dolasSure -= 1 / 60;
    if (!hafiza.dolas || hafiza.dolasSure <= 0 || Math.hypot(hafiza.dolas[0] - o.x, hafiza.dolas[1] - o.z) < 0.4) {
      for (let i = 0; i < 10; i++) {
        const x = (rnd() * 2 - 1) * (ODA.w - 1.2), z = (rnd() * 2 - 1) * (ODA.h - 1.2);
        const m = Math.hypot(x - h.x, z - h.z);
        if (m > 4 && m < 9 && !KOLONLAR.some(([kx, kz]) => Math.hypot(x - kx, z - kz) < KOLON_R + 0.8)) { hafiza.dolas = [x, z]; break; }
      }
      hafiza.dolasSure = 1.5 + rnd() * 2;
    }
    if (!hafiza.dolas) return { hx: 0, hz: 0, a };
    const dx = hafiza.dolas[0] - o.x, dz = hafiza.dolas[1] - o.z, L = Math.hypot(dx, dz) || 1;
    return { hx: dx / L * 0.8, hz: dz / L * 0.8, a };
  }

  return { ODA, KOLON_R, KOLONLAR, ROBOT_R, KURSUN_R, HIZ, CAN, BASLANGIC, kursunHizi, atesAraligi, hizKati, yeni, adim, botGirdi, canlilar };
})();

if (typeof module !== 'undefined') module.exports = KursunMotor;
