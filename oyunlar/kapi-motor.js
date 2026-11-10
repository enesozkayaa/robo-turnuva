// =============================================================
// Robo Turnuva - Son Sığınak: kurallar (ekran yok, sadece hesap)
// Yuvarlak meydanın çevresinde, her tarafında 8 kabin (her birine 1 robot sığar).
// Tur:
//   bekle (10 sn)   → bütün kapılar kapalı, herkes meydanda
//   giris (5 sn)    → bazı kapılar yeşil yanar ve açılır: içeri gir
//   kapanis         → kapılar kapanır
//   saldiri         → uzay aracı dışarıda kalanları alır
//   cikis (2 sn)    → kapılar açılır: hemen çık! (son anda tuzak uyarısı)
//   tuzak           → tavandan tuzak iner, içeride olan ölür (rakibini içeri itebilirsin!)
//   kilit           → tuzak inik kalır, kapılar kapanır → yeni tur
// Açık kapı: 4 kişiyle 6 → 4 → 3 → 2 → 1, 2-3 kişiyle 4 → 3 → 2 → 1. Son kalan kazanır.
// Sabit adımlı simülasyon: adim(d, dt, girdiler). Tarayıcıda ve Node'da (test) çalışır.
// =============================================================

const KapiMotor = (() => {
  const R = 8, KAPI_N = 8, W = 1.5, D = 1.4;          // meydan yarıçapı, kabin sayısı, kabin genişliği ve derinliği
  const ROBOT_R = 0.38, HIZ = 4.2;
  const SURE = { baslangic: 3, bekle: 10, giris: 5, kapanis: 0.7, saldiri: 3.2, cikis: 2, tuzak: 0.7, kilit: 0.8 };
  const UYARI_SN = 0.9;                               // çıkış süresinin son kaç saniyesinde tuzak uyarır
  const SIRA_4 = [6, 4, 3, 2, 1], SIRA_3 = [4, 3, 2, 1];
  const ACILAR = Array.from({ length: KAPI_N }, (_, i) => (-90 + i * 360 / KAPI_N) * Math.PI / 180);
  const KABIN = ACILAR.map(a => {
    const nx = Math.cos(a), nz = Math.sin(a);
    return { a, nx, nz, tx: -nz, tz: nx, cx: R * nx, cz: R * nz };
  });
  // Noktanın kabine göre yeri: u = yana, v = derinlik (0 = kapı çizgisi, + = içeri)
  const yerel = (k, x, z) => [(x - k.cx) * k.tx + (z - k.cz) * k.tz, (x - k.cx) * k.nx + (z - k.cz) * k.nz];
  const dunya = (k, u, v) => [k.cx + k.tx * u + k.nx * v, k.cz + k.tz * u + k.nz * v];
  const BASLANGIC_YER = [[-1.3, -1.3], [1.3, 1.3], [1.3, -1.3], [-1.3, 1.3]];
  const iceride = (k, o) => { const [u, v] = yerel(k, o.x, o.z); return v > ROBOT_R * 0.6 && Math.abs(u) < W / 2; };

  function yeni(oyuncular) {
    return {
      t: -SURE.baslangic, tur: 0, faz: 'baslangic', fazKalan: SURE.baslangic,
      sira: oyuncular.length >= 4 ? SIRA_4 : SIRA_3,
      kapilar: KABIN.map(() => ({ acik: false, dolu: null })),
      acikKapilar: [], tuzakUyardi: false,
      bitti: false, kazanan: null, olumSayac: 0,
      oyuncular: oyuncular.map((o, k) => {
        const [x, z] = BASLANGIC_YER[k % 4];
        return { ...o, x, z, a: Math.atan2(-z, -x), vx: 0, vz: 0, canli: true, olumSirasi: 0, neden: '' };
      }),
    };
  }
  const canlilar = d => d.oyuncular.filter(o => o.canli);

  // Robotu meydanın ve kabinlerin içinde tutar
  function kisitla(d, o) {
    let kabinde = false;
    KABIN.forEach((k, i) => {
      const kp = d.kapilar[i];
      let [u, v] = yerel(k, o.x, o.z);
      const girebilir = (kp.acik && kp.dolu === null) || kp.dolu === o.id;
      // Açık kapının tam önündeyse meydanın kenarı onu durdurmasın (içeri girebilsin)
      if (girebilir && v > -ROBOT_R - 0.6 && Math.abs(u) <= W / 2 - ROBOT_R + 0.06) kabinde = true;
      if (v <= -ROBOT_R || Math.abs(u) >= W / 2 + ROBOT_R) return;
      if (girebilir && Math.abs(u) <= W / 2 - ROBOT_R + 0.06) {
        u = Math.max(-(W / 2 - ROBOT_R), Math.min(W / 2 - ROBOT_R, u));
        v = Math.min(D - ROBOT_R, v);
        if (v > 0) kabinde = true;
      } else if (v > -ROBOT_R) {
        v = -ROBOT_R;   // kapalı ya da dolu: kapının önünde kalır
      }
      [o.x, o.z] = dunya(k, u, v);
    });
    if (!kabinde) {
      const L = Math.hypot(o.x, o.z), en = R - ROBOT_R;
      if (L > en) { o.x *= en / L; o.z *= en / L; }
    }
  }
  function dolulukGuncelle(d) {
    KABIN.forEach((k, i) => {
      const kp = d.kapilar[i];
      if (kp.dolu !== null) {
        const o = d.oyuncular.find(p => p.id === kp.dolu);
        if (!o || !o.canli || yerel(k, o.x, o.z)[1] < 0) kp.dolu = null;
      }
      if (kp.dolu === null && kp.acik) {
        const o = canlilar(d).find(p => iceride(k, p));
        if (o) kp.dolu = o.id;
      }
    });
  }
  const kabindekiler = d => canlilar(d).filter(o => KABIN.some((k, i) => d.kapilar[i].dolu === o.id || iceride(k, o)));

  function oldur(d, o, neden) {
    o.canli = false; o.olumSirasi = ++d.olumSayac; o.neden = neden; o.olumTuru = d.tur;
    d.kapilar.forEach(k => { if (k.dolu === o.id) k.dolu = null; });
    return o.id;
  }
  function bitisKontrol(d, olaylar) {
    const kalan = canlilar(d);
    if (kalan.length <= 1) {
      d.bitti = true;
      d.kazanan = kalan.length ? kalan[0].id : null;
      olaylar.push({ tip: 'bitti', kazanan: d.kazanan });
    }
  }

  function fazaGec(d, faz, olaylar, rnd) {
    d.faz = faz; d.fazKalan = SURE[faz];
    if (faz === 'bekle') {
      d.tur++;
      d.kapilar.forEach(k => { k.acik = false; k.dolu = null; });
      olaylar.push({ tip: 'bekle', tur: d.tur });
    } else if (faz === 'giris') {
      const n = Math.max(1, Math.min(KAPI_N, d.sira[Math.min(d.tur - 1, d.sira.length - 1)]));
      d.acikKapilar = KABIN.map((_, i) => i).sort(() => rnd() - 0.5).slice(0, n);
      d.kapilar.forEach((k, i) => { k.acik = d.acikKapilar.includes(i); k.dolu = null; });
      olaylar.push({ tip: 'acik', acik: d.acikKapilar });
    } else if (faz === 'kapanis') {
      d.kapilar.forEach(k => { k.acik = false; });
      olaylar.push({ tip: 'kapanis' });
    } else if (faz === 'saldiri') {
      const kurtulan = kabindekiler(d).map(o => o.id);
      const olen = canlilar(d).filter(o => !kurtulan.includes(o.id)).map(o => oldur(d, o, 'uzay'));
      olaylar.push({ tip: 'saldiri', olenler: olen, kurtulan });
      bitisKontrol(d, olaylar);
    } else if (faz === 'cikis') {
      d.tuzakUyardi = false;
      d.kapilar.forEach((k, i) => { k.acik = d.acikKapilar.includes(i); });
      olaylar.push({ tip: 'cikis', acik: d.acikKapilar });
    } else if (faz === 'tuzak') {
      dolulukGuncelle(d);
      const olen = kabindekiler(d).map(o => oldur(d, o, 'tuzak'));
      olaylar.push({ tip: 'tuzak', olenler: olen });
      bitisKontrol(d, olaylar);
    } else if (faz === 'kilit') {
      d.kapilar.forEach(k => { k.acik = false; k.dolu = null; });
      olaylar.push({ tip: 'kapanis', kilit: true });
    }
  }

  // girdiler: { id: { hx, hz } } ya da { x, z } (online: misafir kendi yerini gönderir)
  function adim(d, dt, girdiler = {}, rnd = Math.random) {
    const olaylar = [];
    if (d.bitti) return olaylar;
    d.t += dt;
    d.fazKalan -= dt;
    if (d.fazKalan <= 0) {
      const sira = { baslangic: 'bekle', bekle: 'giris', giris: 'kapanis', kapanis: 'saldiri', saldiri: 'cikis', cikis: 'tuzak', tuzak: 'kilit', kilit: 'bekle' };
      fazaGec(d, sira[d.faz], olaylar, rnd);
      if (d.bitti) return olaylar;
    }
    if (d.faz === 'cikis' && !d.tuzakUyardi && d.fazKalan <= UYARI_SN) {
      d.tuzakUyardi = true;
      olaylar.push({ tip: 'tuzakUyari' });
    }
    const hareketli = d.faz !== 'baslangic';
    const yasayan = canlilar(d);
    yasayan.forEach(o => {
      const g = girdiler[o.id] || {};
      const ex = o.x, ez = o.z;
      if (hareketli && typeof g.x === 'number' && isFinite(g.x) && isFinite(g.z)) { o.x = g.x; o.z = g.z; }
      else {
        let hx = hareketli ? +g.hx || 0 : 0, hz = hareketli ? +g.hz || 0 : 0;
        const L = Math.hypot(hx, hz);
        if (L > 1) { hx /= L; hz /= L; }
        o.x += (hx * HIZ + o.vx) * dt; o.z += (hz * HIZ + o.vz) * dt;
      }
      const s = Math.exp(-5 * dt); o.vx *= s; o.vz *= s;
      kisitla(d, o);
      const mx = o.x - ex, mz = o.z - ez;
      if (Math.hypot(mx, mz) > 0.002) o.a = Math.atan2(mz, mx);
      o.hizX = mx / dt; o.hizZ = mz / dt;
    });
    // Çarpışma ve itme (rakibini kabine geri itebilirsin)
    for (let i = 0; i < yasayan.length; i++) for (let j = i + 1; j < yasayan.length; j++) {
      const p = yasayan[i], q = yasayan[j];
      const dx = q.x - p.x, dz = q.z - p.z, L = Math.hypot(dx, dz), en = ROBOT_R * 2;
      if (L >= en || L < 1e-6) continue;
      const nx = dx / L, nz = dz / L, it = (en - L) / 2;
      p.x -= nx * it; p.z -= nz * it; q.x += nx * it; q.z += nz * it;
      kisitla(d, p); kisitla(d, q);
      const pY = Math.max(0, (p.hizX || 0) * nx + (p.hizZ || 0) * nz), qY = Math.max(0, -((q.hizX || 0) * nx + (q.hizZ || 0) * nz));
      if (d.t - (p.sonIt?.[q.id] || -9) < 0.35) continue;
      if (pY > qY + 0.5) { const g = 2.4 + pY * 1.1; q.vx += nx * g; q.vz += nz * g; (p.sonIt ??= {})[q.id] = d.t; olaylar.push({ tip: 'it', id: q.id, vx: nx * g, vz: nz * g }); }
      else if (qY > pY + 0.5) { const g = 2.4 + qY * 1.1; p.vx -= nx * g; p.vz -= nz * g; (p.sonIt ??= {})[q.id] = d.t; olaylar.push({ tip: 'it', id: p.id, vx: -nx * g, vz: -nz * g }); }
    }
    dolulukGuncelle(d);
    return olaylar;
  }

  // ---------- Botlar ----------
  function botGirdi(d, id, hafiza, rnd = Math.random) {
    const o = d.oyuncular.find(p => p.id === id);
    if (!o.canli) return { hx: 0, hz: 0 };
    if (hafiza.faz !== d.faz || hafiza.tur !== d.tur) {
      hafiza.faz = d.faz; hafiza.tur = d.tur; hafiza.hedef = null;
      hafiza.tepki = d.t + 0.1 + rnd() * 0.55;
      hafiza.saldirgan ??= rnd() < 0.5;
      hafiza.uyusuk = rnd() < 0.12;                 // bu tur çıkmayı geç akıl eder
      hafiza.gezin = [(rnd() - 0.5) * 6, (rnd() - 0.5) * 6];
    }
    const git = (tx, tz, h = 1) => {
      const dx = tx - o.x, dz = tz - o.z, L = Math.hypot(dx, dz);
      if (L < 0.08) return { hx: 0, hz: 0 };
      const k = Math.min(1, L / 0.5) * h;
      return { hx: dx / L * k, hz: dz / L * k };
    };
    const benimKabin = KABIN.findIndex((k, i) => d.kapilar[i].dolu === id || iceride(k, o));
    if (d.faz === 'bekle') return git(...hafiza.gezin, 0.5);   // meydanda gezinir
    if (d.t < hafiza.tepki) return { hx: 0, hz: 0 };
    if (d.faz === 'giris') {
      if (benimKabin >= 0) return git(...dunya(KABIN[benimKabin], 0, D * 0.6));
      const bos = KABIN.map((k, i) => i).filter(i => d.kapilar[i].acik && d.kapilar[i].dolu === null);
      if (!bos.length) return { hx: 0, hz: 0 };
      if (hafiza.hedef === null || !bos.includes(hafiza.hedef)) {
        bos.sort((a, b) => Math.hypot(KABIN[a].cx - o.x, KABIN[a].cz - o.z) - Math.hypot(KABIN[b].cx - o.x, KABIN[b].cz - o.z));
        hafiza.hedef = bos[rnd() < 0.85 ? 0 : Math.min(1, bos.length - 1)];
      }
      return git(...dunya(KABIN[hafiza.hedef], 0, D * 0.6));
    }
    if (d.faz === 'cikis') {
      // İçerideyse hemen çık (uyuşuk olan geç kalır)
      if (benimKabin >= 0) {
        if (hafiza.uyusuk && d.fazKalan > 0.12) return { hx: 0, hz: 0 };
        const k = KABIN[benimKabin];
        return git(...dunya(k, 0, -2.2));
      }
      // Saldırgan bot: kabin kapısının önündeki rakibi içeri iter
      if (hafiza.saldirgan) {
        const kurban = canlilar(d).filter(p => p.id !== id).map(p => {
          const i = d.acikKapilar.filter(i => d.kapilar[i].dolu === null || d.kapilar[i].dolu === p.id)
            .sort((a, b) => Math.hypot(KABIN[a].cx - p.x, KABIN[a].cz - p.z) - Math.hypot(KABIN[b].cx - p.x, KABIN[b].cz - p.z))[0];
          return i === undefined ? null : { p, i, uz: Math.hypot(KABIN[i].cx - p.x, KABIN[i].cz - p.z) };
        }).filter(x => x && x.uz < 2.6).sort((a, b) => a.uz - b.uz)[0];
        if (kurban) {
          const k = KABIN[kurban.i], p = kurban.p;
          // Rakibin kabine göre arkasına geç, sonra kabine doğru koş
          const [kx, kz] = dunya(k, 0, D * 0.5);
          const dx = kx - p.x, dz = kz - p.z, L = Math.hypot(dx, dz) || 1;
          const [arkaX, arkaZ] = [p.x - dx / L * 0.85, p.z - dz / L * 0.85];
          if (Math.hypot(arkaX - o.x, arkaZ - o.z) > 0.35) return git(arkaX, arkaZ);
          return { hx: dx / L, hz: dz / L };
        }
      }
      return git(0, 0, 0.6);
    }
    return { hx: 0, hz: 0 };
  }

  return { R, KAPI_N, W, D, ROBOT_R, HIZ, SURE, UYARI_SN, KABIN, ACILAR, yerel, dunya, yeni, adim, botGirdi, canlilar, kisitla };
})();

if (typeof module !== 'undefined') module.exports = KapiMotor;
