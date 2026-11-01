import { GlassScene } from '../src/liquid-glass-scene.js?v=v3-20261101';

const $ = (s) => document.querySelector(s);
const q = new URLSearchParams(location.search);
const wall = $('#wall'), wallc = $('#wallc'), sheet = $('#sheet');
const photos = ['bg1', 'bg2', 'bg3', 'bg4'];
const imgs = {};
const loadImg = (n) => imgs[n] || (imgs[n] = new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = `assets/${n}.jpg?v=v3-20261101`; }));

// ---------- сгенерированные обои в духе iOS (canvas)
function genWall(kind) {
  const w = 900, h = 1600; wallc.width = w; wallc.height = h;
  const c = wallc.getContext('2d');
  const sets = { aurora: ['#0b1d4d', '#2f6bff', '#9b5cff', '#ff6fb1', '#ffd36e'], light: ['#f4f1ea', '#ffd9c2', '#c7e3ff', '#e8d7ff', '#ffffff'] }[kind];
  c.fillStyle = sets[0]; c.fillRect(0, 0, w, h);
  const blobs = [[.2, .25, .55, 1], [.85, .35, .5, 2], [.3, .75, .6, 3], [.8, .85, .45, 4], [.55, .55, .35, 2]];
  for (const [x, y, r, k] of blobs) { const g = c.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * w); g.addColorStop(0, sets[k]); g.addColorStop(1, sets[k] + '00'); c.fillStyle = g; c.fillRect(0, 0, w, h); }
}

// ---------- прокручиваемый контент, нарисованный в canvas (его же преломляет стекло)
async function drawSheet() {
  const W = sheet.parentElement.clientWidth, S = Math.min(devicePixelRatio || 1, 1.5);
  const P = await Promise.all(photos.map(loadImg));
  const blocks = [];
  let y = 0; const pad = 16, cw = W - pad * 2;
  const rr = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
  const wrap = (c, text, x, y, maxW, lh) => { let line = '', yy = y; for (const w of text.split(' ')) { const t = line ? line + ' ' + w : w; if (c.measureText(t).width > maxW && line) { c.fillText(line, x, yy); line = w; yy += lh; } else line = t; } c.fillText(line, x, yy); return yy + lh; };
  const ops = [];
  { const y0 = y; ops.push((c) => { const y = y0; c.fillStyle = '#fff'; c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = 18; c.font = '800 38px system-ui, -apple-system, sans-serif'; c.fillText('Сегодня', pad, y + 40); c.font = '600 15px system-ui'; c.fillText('ВОСКРЕСЕНЬЕ, 1 НОЯБРЯ', pad, y + 64); c.shadowBlur = 0; }); } y += 84;
  // погода
  { const y0 = y; ops.push((c) => { const g = c.createLinearGradient(0, y0, 0, y0 + 150); g.addColorStop(0, '#2f80ed'); g.addColorStop(1, '#56ccf2'); c.fillStyle = g; rr(c, pad, y0, cw, 150, 26); c.fill();
    c.fillStyle = '#fff'; c.font = '600 16px system-ui'; c.fillText('Екатеринбург', pad + 18, y0 + 30); c.font = '300 64px system-ui'; c.fillText('−3°', pad + 14, y0 + 100); c.font = '500 14px system-ui'; c.fillText('Снег · Макс. 0° Мин. −6°', pad + 18, y0 + 132);
    c.font = '54px system-ui'; c.fillText('❄︎', pad + cw - 80, y0 + 90); }); y += 166; }
  // фото-сетка
  { const y0 = y, s = (cw - 10) / 2; ops.push((c) => { P.forEach((im, i) => { if (!im) return; const x = pad + (i % 2) * (s + 10), yy = y0 + Math.floor(i / 2) * (s + 10);
      c.save(); rr(c, x, yy, s, s, 20); c.clip(); const k = Math.max(s / im.width, s / im.height); c.drawImage(im, x + (s - im.width * k) / 2, yy + (s - im.height * k) / 2, im.width * k, im.height * k); c.restore(); }); }); y += s * 2 + 26; }
  // статья (светлая карточка с тёмным текстом — тест преломления текста)
  { const y0 = y; const text = 'Liquid Glass — новый материал интерфейса. Он преломляет и отражает то, что под ним, динамически подстраивается под контент и свет. Элементы управления «плавают» над содержимым, а при нажатии оживают: растягиваются, светятся и сливаются друг с другом, как капли. Съешь же ещё этих мягких французских булок, да выпей чаю.';
    const c0 = document.createElement('canvas').getContext('2d'); c0.font = '17px system-ui'; let hh = 60; { let line = ''; for (const w of text.split(' ')) { const t = line ? line + ' ' + w : w; if (c0.measureText(t).width > cw - 36 && line) { hh += 25; line = w; } else line = t; } hh += 25 + 20; }
    ops.push((c) => { c.fillStyle = 'rgba(255,255,255,.96)'; rr(c, pad, y0, cw, hh, 26); c.fill(); c.fillStyle = '#111'; c.font = '700 22px system-ui'; c.fillText('Новый дизайн', pad + 18, y0 + 38); c.font = '17px system-ui'; c.fillStyle = '#333'; wrap(c, text, pad + 18, y0 + 68, cw - 36, 25); }); y += hh + 16; }
  // альбомы
  { const y0 = y; const cols = [['#ff375f', '#ff9f0a'], ['#5e5ce6', '#64d2ff'], ['#30d158', '#ffd60a'], ['#bf5af2', '#ff375f']]; const s = (cw - 30) / 4;
    ops.push((c) => { c.fillStyle = '#fff'; c.font = '700 22px system-ui'; c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 10; c.fillText('Недавно слушали', pad, y0 + 24); c.shadowBlur = 0;
      cols.forEach(([a, b], i) => { const x = pad + i * (s + 10), g = c.createLinearGradient(x, y0 + 40, x + s, y0 + 40 + s); g.addColorStop(0, a); g.addColorStop(1, b); c.fillStyle = g; rr(c, x, y0 + 40, s, s, 14); c.fill();
        c.fillStyle = '#fff'; c.font = '600 12px system-ui'; c.fillText(['Синтвейв', 'Lo-Fi', 'Лето', 'Ночь'][i], x, y0 + 58 + s); }); }); y += s + 76; }
  // список
  { const y0 = y; const items = ['Напоминания', 'Заметки', 'Фото', 'Музыка', 'Карты', 'Погода', 'Камера', 'Сообщения', 'Почта', 'Календарь'];
    const colors = ['#ff9500', '#ffcc00', '#ff2d55', '#fa233b', '#34c759', '#0a84ff', '#8e8e93', '#30d158', '#007aff', '#ff3b30'];
    ops.push((c) => { c.fillStyle = 'rgba(28,28,30,.82)'; rr(c, pad, y0, cw, items.length * 52 + 8, 26); c.fill();
      items.forEach((t, i) => { const yy = y0 + 4 + i * 52; c.fillStyle = colors[i]; rr(c, pad + 14, yy + 10, 32, 32, 8); c.fill(); c.fillStyle = '#fff'; c.font = '17px system-ui'; c.fillText(t, pad + 60, yy + 32); c.fillStyle = '#8e8e93'; c.fillText('›', pad + cw - 26, yy + 32);
        if (i < items.length - 1) { c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(pad + 60, yy + 51, cw - 74, 1); } }); }); y += items.length * 52 + 24; }
  // полосы
  { const y0 = y; ops.push((c) => { for (let i = 0; i < 14; i++) { c.fillStyle = `hsl(${i * 26},90%,${i % 2 ? 60 : 50}%)`; rr(c, pad, y0 + i * 34, cw, 26, 13); c.fill(); c.fillStyle = 'rgba(255,255,255,.95)'; c.font = '700 14px system-ui'; c.fillText('ПОЛОСА ' + (i + 1) + ' — проверка преломления', pad + 14, y0 + i * 34 + 18); } }); y += 14 * 34 + 10; }
  const H = Math.ceil(y);
  sheet.width = Math.round(W * S); sheet.height = Math.round(H * S); sheet.style.height = H + 'px';
  const c = sheet.getContext('2d'); c.scale(S, S); c.textBaseline = 'alphabetic';
  ops.forEach(f => f(c));
  scene.updateSheet();
}

// ---------- сцена
const num = (k) => q.has(k) ? +q.get(k) : undefined;
const extra = Object.fromEntries(Object.entries({ mode: q.get('mode') || undefined, aberration: num('ab'), maxDpr: num('dpr'), dynamicResolution: q.has('nodyn') ? false : undefined }).filter(([, v]) => v !== undefined));
const scene = new GlassScene({ background: wall, sheet, light: 'pointer', lowPower: q.has('low') ? true : 'auto', ...extra });
window.__scene = scene;
const add = (sel, o) => document.querySelectorAll(sel).forEach(el => scene.add(el, o));
add('#topbar', { group: 2, bezel: 16, thickness: 18, blur: 0.5 });
add('#btnWall, #btnSet', { group: 2, bezel: 16, thickness: 20, blur: 0.5, interactive: true, pressScale: 1.15 });
add('#mini', { group: 1, bezel: 18, thickness: 22, blur: 1, interactive: true, pressScale: 1.03 });
add('#tabbar', { group: 1, bezel: 20, thickness: 24, blur: 1 });
add('#search', { group: 1, bezel: 20, thickness: 24, blur: 1, interactive: true, pressScale: 1.15 });
add('.cc .tile', { group: 3, bezel: 18, thickness: 22, blur: 2, interactive: true, pressScale: 1.04 });
add('#settings', { group: 4, bezel: 22, thickness: 22, blur: 7 });
const lensShape = scene.add($('#lens'), { group: 0, merge: 30, bezel: 30, thickness: 30, blur: 0, draggable: true, pressScale: 1.12 });
$('#mode').textContent = scene.mode + (scene.lowPower ? ' · энергосбережение' : '');

// ---------- обои
const wallList = [...photos.map(p => ({ id: p, label: { bg1: 'Горы', bg2: 'Город', bg3: 'Мост', bg4: 'Пёс' }[p] })), { id: 'aurora', label: 'Аврора' }, { id: 'light', label: 'Светлые' }];
let wi = 0;
function setWall(id) {
  wi = wallList.findIndex(w => w.id === id);
  if (photos.includes(id)) { wallc.hidden = true; wall.hidden = false; wall.src = `assets/${id}.jpg?v=v3-20261101`; scene.set({ background: wall }); }
  else { genWall(id); wall.hidden = true; wallc.hidden = false; scene.set({ background: wallc }); scene.updateBackground(); }
  document.querySelectorAll('#walls button').forEach((b, i) => b.classList.toggle('on', i === wi));
}
wall.addEventListener('load', () => scene.updateBackground());
$('#walls').innerHTML = wallList.map(w => `<button>${w.label}</button>`).join('');
document.querySelectorAll('#walls button').forEach((b, i) => b.onclick = () => setWall(wallList[i].id));
$('#btnWall').onclick = () => setWall(wallList[(wi + 1) % wallList.length].id);
setWall(q.get('wall') || 'bg1');

// ---------- таб-бар: индикатор на пружине со «сплющиванием»
const tabs = [...document.querySelectorAll('.tab')], ind = $('#ind');
let ix = 0, iv = 0, it = 0, iw = 0;
function placeInd(i) { const t = tabs[i]; it = t.offsetLeft; iw = t.offsetWidth; tabs.forEach((x, j) => x.classList.toggle('on', j === i)); if (!ind.style.width) { ix = it; ind.style.width = iw + 'px'; } springInd(); }
function springInd() { let last = performance.now(); const f = (now) => { const dt = Math.min(.033, (now - last) / 1000); last = now; const a = 340 * (it - ix) - 24 * iv; iv += a * dt; ix += iv * dt;
  const sq = Math.min(Math.abs(iv) / 2500, .25); ind.style.width = iw + 'px'; ind.style.transform = `translateX(${ix - 4}px) scale(${1 + sq}, ${1 - sq * .6})`;
  if (Math.abs(it - ix) > .3 || Math.abs(iv) > 2) requestAnimationFrame(f); else ind.style.transform = `translateX(${it - 4}px)`; }; requestAnimationFrame(f); }
tabs.forEach((t, i) => t.addEventListener('click', () => { placeInd(i); if (t.id === 'tabCC') toggleCC(); }));
requestAnimationFrame(() => placeInd(0));

// ---------- пункт управления
function toggleCC(force) { const cc = $('#cc'); const show = force ?? cc.hidden; if (!show && cc.hidden) return; cc.hidden = !show; $('#lens').style.display = show ? 'none' : ''; scene.shapes.forEach(s => scene.setShape(s.el, {})); scene.animate(300); }
$('#cc').addEventListener('click', e => { if (e.target.id === 'cc') toggleCC(false); });
document.querySelectorAll('.tg').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); b.classList.toggle('on'); }));
document.querySelectorAll('.vs').forEach(v => { const f = v.querySelector('.fill'); const set = (x) => { v.dataset.v = x; f.style.height = (x * 100) + '%'; }; set(+v.dataset.v);
  const mv = e => { const r = v.getBoundingClientRect(); set(Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height))); };
  v.addEventListener('pointerdown', e => { v.setPointerCapture(e.pointerId); mv(e); }); v.addEventListener('pointermove', e => e.buttons && mv(e)); });
if (q.has('cc')) toggleCC(true);

// ---------- настройки
const under = ['#mini', '#tabbar', '#search', '#lens'];
function showSettings(on) { $('#settings').hidden = !on; under.forEach(s => $(s).style.visibility = on ? 'hidden' : ''); if (on) toggleCC(false);
  scene.shapes.forEach(s => scene.setShape(s.el, {})); scene.animate(300); }
$('#btnSet').onclick = () => showSettings($('#settings').hidden);
$('#close').onclick = () => showSettings(false);
if (q.has('settings')) showSettings(true);
document.querySelectorAll('[data-k]').forEach(i => i.addEventListener('input', () => { scene.shapes.forEach(s => { if (s.el.id !== 'lens' && s.el.id !== 'settings') { s.o[i.dataset.k] = +i.value; } }); scene.invalidate(); }));
document.querySelectorAll('[data-g]').forEach(i => i.addEventListener('input', () => { if (i.dataset.g === 'merge') { lensShape.o.merge = +i.value; scene.invalidate(); } else scene.set({ [i.dataset.g]: +i.value }); }));
document.querySelectorAll('#light button').forEach(b => b.onclick = async () => { const ok = await scene.setLight(b.dataset.l); document.querySelectorAll('#light button').forEach(x => x.classList.toggle('on', x.dataset.l === scene.o.light)); if (!ok) alert('Доступ к датчику наклона не выдан'); });
$('#low').checked = scene.lowPower; $('#low').onchange = e => scene.setLowPower(e.target.checked);
$('#play').onclick = e => { e.stopPropagation(); e.target.textContent = e.target.textContent === '▶' ? '❚❚' : '▶'; };

// ---------- арт для плеера
loadImg('bg4').then(i => { if (i) ['#miniArt', '#ccArt'].forEach(s => $(s).style.backgroundImage = `url(${i.src})`); });

// ---------- контент
drawSheet(); let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(drawSheet, 150); });

// ---------- FPS
const fpsEl = $('#fps'); let n = 0, t0 = performance.now();
(function loop(t) { n++; if (t - t0 > 1000) { fpsEl.textContent = `${Math.round(n * 1000 / (t - t0))} fps · ${scene.stats.avgMs.toFixed(1)} ms`; n = 0; t0 = t; } requestAnimationFrame(loop); })(t0);
