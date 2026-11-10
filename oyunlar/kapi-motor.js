// =============================================================
// Robo Turnuva - Son Sığınak: kurallar (ekran yok, sadece hesap)
// Yuvarlak meydanın arka yarısında yay şeklinde 8 kabin (her birine 1 robot sığar).
// Tur: bazı kapılar yeşil yanar ve açılır (ACIK_SN). Bu sürede bir an kabinlerin tavanından
// tuzak iner: içeride olan ölür (erken girip beklemek tehlikeli). Süre bitince kapılar kapanır,
// uzay aracı dışarıda kalanları alır. Açık kapı: 6 → 4 → 3 → 2 → 1 (ama en fazla kalan kişi - 1).
// Oyuncular birbirini itebilir. Son kalan kazanır.
// Sabit adımlı simülasyon: adim(d, dt, girdiler). Tarayıcıda ve Node'da (test) çalışır.
// Koordinat: zemin x-z; kabin i, açısı θ_i: ön yüzü meydanın merkezine bakar.
// =============================================================

const KapiMotor = (() => {
  const R = 8, KAPI_N = 8, W = 1.5, D = 1.4;          // meydan yarıçapı, kabin sayısı, kabin genişliği ve derinliği
  const ROBOT_R = 0.38, HIZ = 4.2;
  const SIRA = [6, 4, 3, 2, 1];
  const SURE = { baslangic: 3, acik: 10, kapanis: 0.7, saldiri: 3.2, cikis: 1.8 };
  const TUZAK = { uyari: 0.8, inis: 0.3, asagi: 0.5, kalkis: 0.6 };
  const ACILAR = Array.from({ length: KAPI_N }, (_, i) => (-165 + (150 / (KAPI_N - 1)) * i) * Math.PI / 180);
  const kabin = i => {
    const a = ACILAR[i], nx = Math.cos(a), nz = Math.sin(a);
    return { a, nx, nz, tx: -nz, tz: nx, cx: R * nx, cz: R * nz };
  };
  const KABIN = ACILAR.map((_, i) => kabin(i));
  // Noktanın kabine göre yeri: u = yana, v = derinlik (0 = kapı çizgisi, + = içeri)
  const yerel = (k, x, z) => [(x - k.cx) * k.tx + (z - k.cz) * k.tz, (x - k.cx) * k.nx + (z - k.cz) * k.nz];
  const dunya = (k, u, v) => [k.cx + k.tx * u + k.nx * v, k.cz + k.tz * u + k.nz * v];
  const BASLANGIC_YER = [[-1.6, 2.2], [1.6, 2.2], [-1.6, 4.4], [1.6, 4.4]];

  function yeni(oyuncular) {
    return {
      t: -SURE.baslangic, tur: 0, faz: 'baslangic', fazKalan: SURE.baslangic,
      kapilar: KABIN.map(() => ({ acik: false, dolu: null })),
      tuzak: { durum: 'yok', zaman: 0, baslama: 99 },
      bitti: false, kazanan: null, olumSayac: 0,
      oyuncular: oyuncular.map((o, k) => {
        const [x, z] = BASLANGIC_YER[k % 4];
        return { ...o, x, z, a: -Math.PI / 2, vx: 0, vz: 0, canli: true, olumSirasi: 0, neden: '' };
      }),
    };
  }
  const canlilar = d => d.oyuncular.filter(o => o.canli);
  const icindeki = d => d.kapilar.map(k => k.dolu).filter(id => id !== null);

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
  // Kabinlere kim girdi
  function dolulukGuncelle(d) {
    KABIN.forEach((k, i) => {
      const kp = d.kapilar[i];
      if (kp.dolu !== null) {
        const o = d.oyuncular.find(p => p.id === kp.dolu);
        if (!o || !o.canli || yerel(k, o.x, o.z)[1] < 0) kp.dolu = null;
      }
      if (kp.dolu === null && kp.acik) {
        const o = canlilar(d).find(p => { const [u, v] = yerel(k, p.x, p.z); return v > ROBOT_R * 0.6 && Math.abs(u) < W / 2; });
        if (o) kp.dolu = o.id;
      }
    });
  }

  function oldur(d, o, neden, olaylar) {
    o.canli = false; o.olumSirasi = ++d.olumSayac; o.neden = neden; o.olumTuru = d.tur;
    d.kapilar.forEach(k => { if (k.dolu === o.id) k.dolu = null; });
    return o.id;
  }
  function bitisKontrol(d, olaylar, onceCanli) {
    const kalan = canlilar(d);
    if (kalan.length <= 1) {
      d.bitti = true;
      // Hepsi aynı anda öldüyse berabere
      d.kazanan = kalan.length ? kalan[0].id : null;
      olaylar.push({ tip: 'bitti', kazanan: d.kazanan });
    }
    void onceCanli;
  }

  function fazaGec(d, faz, olaylar, rnd) {
    d.faz = faz; d.fazKalan = SURE[faz];
    if (faz === 'acik') {
      d.tur++;
      const n = Math.max(1, Math.min(SIRA[Math.min(d.tur - 1, SIRA.length - 1)], canlilar(d).length - 1));
      const sira = KABIN.map((_, i) => i).sort(() => rnd() - 0.5).slice(0, n);
      d.kapilar.forEach((k, i) => { k.acik = sira.includes(i); k.dolu = null; });
      // Tuzak açık sürenin ortalarında bir an iner (son 2.5 sn'ye kalmaz)
      d.tuzak = { durum: 'yok', zaman: 0, baslama: 2.5 + rnd() * (SURE.acik - 2.5 - TUZAK.uyari - TUZAK.inis - TUZAK.asagi - TUZAK.kalkis - 2.3) };
      olaylar.push({ tip: 'acik', tur: d.tur, acik: sira });
    } else if (faz === 'kapanis') {
      d.kapilar.forEach(k => { k.acik = false; });
      olaylar.push({ tip: 'kapanis', icerde: icindeki(d) });
    } else if (faz === 'saldiri') {
      const icerde = icindeki(d);
      const olen = canlilar(d).filter(o => !icerde.includes(o.id)).map(o => oldur(d, o, 'uzay', olaylar));
      olaylar.push({ tip: 'saldiri', olenler: olen, kurtulan: icerde });
      bitisKontrol(d, olaylar);
    } else if (faz === 'cikis') {
      // Kurtulanlar meydanın ortasına döner, kapılar boşalır
      canlilar(d).forEach((o, k) => { [o.x, o.z] = BASLANGIC_YER[k % 4]; o.vx = o.vz = 0; o.a = -Math.PI / 2; });
      d.kapilar.forEach(k => { k.dolu = null; k.acik = false; });
      olaylar.push({ tip: 'cikis', yerler: canlilar(d).map(o => [o.id, o.x, o.z]) });
    }
  }

  // girdiler: { id: { hx, hz } } ya da { x, z } (online: misafir kendi yerini gönderir)
  function adim(d, dt, girdiler = {}, rnd = Math.random) {
    const olaylar = [];
    if (d.bitti) return olaylar;
    d.t += dt;
    d.fazKalan -= dt;
    if (d.fazKalan <= 0) {
      const sira = { baslangic: 'acik', acik: 'kapanis', kapanis: 'saldiri', saldiri: 'cikis', cikis: 'acik' };
      fazaGec(d, sira[d.faz], olaylar, rnd);
      if (d.bitti) return olaylar;
    }
    const hareketli = d.faz === 'acik' || d.faz === 'kapanis' || d.faz === 'saldiri';
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
    // Çarpışma ve itme
    for (let i = 0; i < yasayan.length; i++) for (let j = i + 1; j < yasayan.length; j++) {
      const p = yasayan[i], q = yasayan[j];
      const dx = q.x - p.x, dz = q.z - p.z, L = Math.hypot(dx, dz), en = ROBOT_R * 2;
      if (L >= en || L < 1e-6) continue;
      const nx = dx / L, nz = dz / L, it = (en - L) / 2;
      p.x -= nx * it; p.z -= nz * it; q.x += nx * it; q.z += nz * it;
      kisitla(d, p); kisitla(d, q);
      const pY = Math.max(0, (p.hizX || 0) * nx + (p.hizZ || 0) * nz), qY = Math.max(0, -((q.hizX || 0) * nx + (q.hizZ || 0) * nz));
      if (d.t - (p.sonIt?.[q.id] || -9) < 0.35) continue;
      if (pY > qY + 0.5) { const g = 2 + pY; q.vx += nx * g; q.vz += nz * g; (p.sonIt ??= {})[q.id] = d.t; olaylar.push({ tip: 'it', id: q.id, vx: nx * g, vz: nz * g }); }
      else if (qY > pY + 0.5) { const g = 2 + qY; p.vx -= nx * g; p.vz -= nz * g; (p.sonIt ??= {})[q.id] = d.t; olaylar.push({ tip: 'it', id: p.id, vx: -nx * g, vz: -nz * g }); }
    }
    dolulukGuncelle(d);

    // Tuzak
    if (d.faz === 'acik') {
      const tz = d.tuzak, gecen = SURE.acik - d.fazKalan;
      const sinir = { uyari: tz.baslama, inis: tz.baslama + TUZAK.uyari, asagi: tz.baslama + TUZAK.uyari + TUZAK.inis };
      sinir.kalkis = sinir.asagi + TUZAK.asagi;
      sinir.bitti = sinir.kalkis + TUZAK.kalkis;
      const yeni = gecen >= sinir.bitti ? 'bitti' : gecen >= sinir.kalkis ? 'kalkis' : gecen >= sinir.asagi ? 'asagi' : gecen >= sinir.inis ? 'inis' : gecen >= sinir.uyari ? 'uyari' : 'yok';
      if (yeni !== tz.durum) {
        tz.durum = yeni;
        olaylar.push({ tip: 'tuzak', durum: yeni });
      }
      // Tuzak inikken içeride olan ölür
      if (tz.durum === 'asagi') {
        const olen = icindeki(d).map(id => oldur(d, d.oyuncular.find(p => p.id === id), 'tuzak', olaylar));
        if (olen.length) { olaylar.push({ tip: 'ezildi', olenler: olen }); bitisKontrol(d, olaylar); }
      }
    }
    return olaylar;
  }

  // ---------- Botlar ----------
  function botGirdi(d, id, hafiza, rnd = Math.random) {
    const o = d.oyuncular.find(p => p.id === id);
    if (!o.canli || d.faz !== 'acik') return { hx: 0, hz: 0 };
    if (hafiza.tur !== d.tur) {
      hafiza.tur = d.tur;
      hafiza.hedef = null;
      hafiza.gozu = rnd() < 0.15;                                 // gözü kara: tuzağı beklemeden girer
      hafiza.girisSn = 1.3 + rnd() * 1.6;                          // tuzak olmazsa son kaç saniyede girer
      hafiza.tepki = 0.15 + rnd() * 0.5;
      hafiza.kacabilir = rnd() < 0.55;                            // tuzak uyarısında içerideyse kaçmayı akıl eder mi
    }
    const kp = i => d.kapilar[i];
    const iceride = d.kapilar.findIndex(k => k.dolu === id);
    // Tuzak uyarısı: içerideyse kaçmaya çalışır
    if (iceride >= 0 && (d.tuzak.durum === 'uyari' || d.tuzak.durum === 'inis')) {
      if (!hafiza.kacabilir) return { hx: 0, hz: 0 };
      const k = KABIN[iceride];
      return { hx: -k.nx, hz: -k.nz };
    }
    if (iceride >= 0) return { hx: 0, hz: 0 };
    // Hedef kabin: açık, boş ve en yakın (başkası girmişse değiştir)
    const bos = KABIN.map((k, i) => i).filter(i => kp(i).acik && kp(i).dolu === null);
    if (hafiza.hedef === null || !bos.includes(hafiza.hedef)) {
      if (!bos.length) return { hx: 0, hz: 0 };
      const digerHedef = new Set(d.oyuncular.filter(p => p.id !== id).map(p => p.botHedef));
      bos.sort((a, b) => (digerHedef.has(a) - digerHedef.has(b)) || (Math.hypot(KABIN[a].cx - o.x, KABIN[a].cz - o.z) - Math.hypot(KABIN[b].cx - o.x, KABIN[b].cz - o.z)));
      hafiza.hedef = bos[0];
      o.botHedef = hafiza.hedef;
    }
    const k = KABIN[hafiza.hedef];
    const gecen = SURE.acik - d.fazKalan;
    if (gecen < hafiza.tepki) return { hx: 0, hz: 0 };
    const tuzakGecti = d.tuzak.durum === 'kalkis' || d.tuzak.durum === 'bitti';
    const tuzakYakin = d.tuzak.durum === 'uyari' || d.tuzak.durum === 'inis' || d.tuzak.durum === 'asagi';
    const gir = !tuzakYakin && (tuzakGecti || hafiza.gozu || d.fazKalan < hafiza.girisSn);
    const [tx, tz] = gir ? dunya(k, 0, D * 0.6) : dunya(k, 0, -1.0);
    const dx = tx - o.x, dz = tz - o.z, L = Math.hypot(dx, dz);
    if (L < 0.08) return { hx: 0, hz: 0 };
    const h = Math.min(1, L / 0.5);
    return { hx: dx / L * h, hz: dz / L * h };
  }

  return { R, KAPI_N, W, D, ROBOT_R, HIZ, SURE, TUZAK, KABIN, ACILAR, yerel, dunya, yeni, adim, botGirdi, canlilar, kisitla };
})();

if (typeof module !== 'undefined') module.exports = KapiMotor;
