// =============================================================
// Robo Turnuva - kontroller (bütün mini oyunlar için ortak)
// Bilgisayar: WASD / ok tuşları ile yürü, fare ile nişan al.
// Telefon: ekranın sol yarısı = yürüme joystick'i, sağ yarısı = nişan joystick'i
// (parmağı nereye koyarsan joystick orada açılır).
// Ekran yönü: yukarı = -z, sağ = +x.
// =============================================================

const Kontrol = (() => {
  const tuslar = new Set();
  let fare = null;                      // {x, y} ekran noktası (bilgisayar)
  let aktif = false;
  const sol = { id: null, x: 0, y: 0, dx: 0, dy: 0 };
  const sag = { id: null, x: 0, y: 0, dx: 0, dy: 0, aci: null };
  const YARICAP = 55;
  let dokunmatik = matchMedia('(pointer: coarse)').matches;
  let elSol, elSag;

  function kur() {
    elSol = joystickYap('sol', '🚶');
    elSag = joystickYap('sag', '🎯');
    window.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      tuslar.add(e.code);
      if (aktif && /^(Arrow|Space)/.test(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', e => tuslar.delete(e.code));
    window.addEventListener('blur', () => tuslar.clear());
    window.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') fare = { x: e.clientX, y: e.clientY }; });

    const alan = document.getElementById('dokunmaAlani');
    alan.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse') return;
      dokunmatik = true; gorunum();
      const j = e.clientX < window.innerWidth / 2 ? sol : sag;
      if (j.id !== null) return;
      j.id = e.pointerId; j.x = e.clientX; j.y = e.clientY; j.dx = j.dy = 0;
      alan.setPointerCapture(e.pointerId);
      ciz();
      e.preventDefault();
    });
    alan.addEventListener('pointermove', e => {
      const j = e.pointerId === sol.id ? sol : e.pointerId === sag.id ? sag : null;
      if (!j) return;
      let dx = e.clientX - j.x, dy = e.clientY - j.y;
      const L = Math.hypot(dx, dy);
      if (L > YARICAP) { dx *= YARICAP / L; dy *= YARICAP / L; }
      j.dx = dx / YARICAP; j.dy = dy / YARICAP;
      if (j === sag && L > 12) sag.aci = Math.atan2(dy, dx);
      ciz();
      e.preventDefault();
    });
    const birak = e => {
      const j = e.pointerId === sol.id ? sol : e.pointerId === sag.id ? sag : null;
      if (!j) return;
      j.id = null; j.dx = j.dy = 0;
      ciz();
    };
    alan.addEventListener('pointerup', birak);
    alan.addEventListener('pointercancel', birak);
  }

  function joystickYap(taraf, ikon) {
    const el = document.createElement('div');
    el.className = `joy ${taraf}`;
    el.innerHTML = `<div class="topuz">${ikon}</div>`;
    document.getElementById('dokunmaAlani').appendChild(el);
    return el;
  }
  // Joystick'ler: dokunulmuyorsa köşede bekler, dokununca parmağın altına gelir
  function ciz() {
    [[sol, elSol], [sag, elSag]].forEach(([j, el]) => {
      el.classList.toggle('basili', j.id !== null);
      if (j.id !== null) { el.style.left = `${j.x}px`; el.style.top = `${j.y}px`; }
      else { el.style.left = ''; el.style.top = ''; }
      el.firstChild.style.transform = `translate(${j.dx * YARICAP}px, ${j.dy * YARICAP}px)`;
    });
  }
  function gorunum() {
    const alan = document.getElementById('dokunmaAlani');
    alan.hidden = !aktif;
    alan.classList.toggle('dokunmatik', dokunmatik);
    document.body.classList.toggle('dokunmatik', dokunmatik);
  }

  // Yürüme yönü: [x, z], uzunluğu en fazla 1
  function hareket() {
    let x = 0, z = 0;
    if (tuslar.has('KeyW') || tuslar.has('ArrowUp')) z -= 1;
    if (tuslar.has('KeyS') || tuslar.has('ArrowDown')) z += 1;
    if (tuslar.has('KeyA') || tuslar.has('ArrowLeft')) x -= 1;
    if (tuslar.has('KeyD') || tuslar.has('ArrowRight')) x += 1;
    if (sol.id !== null) { x += sol.dx; z += sol.dy; }
    const L = Math.hypot(x, z);
    return L > 1 ? [x / L, z / L] : [x, z];
  }
  // Nişan açısı: fare robotun neresindeyse oraya; telefonda sağ joystick yönü. Yoksa null.
  function nisan(rx, rz, y = 0.78) {
    if (sag.aci !== null && dokunmatik) return sag.aci;
    if (fare && !dokunmatik) {
      const p = Cekirdek.zemineIsin(fare.x, fare.y, y);
      if (p && Math.hypot(p.x - rx, p.z - rz) > 0.05) return Math.atan2(p.z - rz, p.x - rx);
    }
    return null;
  }

  return {
    kur, hareket, nisan,
    ac(v) { aktif = v; if (!v) { sol.id = sag.id = null; sol.dx = sol.dy = sag.dx = sag.dy = 0; sag.aci = null; ciz(); } gorunum(); },
    // Yeni turda sağ joystick'in eski yönü kalmasın diye (isteğe bağlı)
    nisanSifirla(a = null) { sag.aci = a; },
    get dokunmatik() { return dokunmatik; },
  };
})();
