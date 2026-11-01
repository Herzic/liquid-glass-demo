// Взаимодействия: растяжение линзы при быстром перетаскивании, слияние с таб-баром, нажатие (пружина)
import { chromium, devices } from 'playwright';
const { defaultBrowserType, ...d } = devices['iPhone 15 Pro'];
const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const ctx = await b.newContext(d); const p = await ctx.newPage(); const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto((process.env.BASE || 'http://localhost:8765/demo/') + 'index.html'); await p.waitForTimeout(2000);
const cdp = await ctx.newCDPSession(p);
const tp = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
const lens = await p.locator('#lens').boundingBox();
let x = lens.x + lens.width / 2, y = lens.y + lens.height / 2;
await tp('touchStart', x, y);
for (let i = 0; i < 8; i++) { x += 22; y += 14; await tp('touchMove', x, y); await p.waitForTimeout(16); }
const stretch = await p.evaluate(() => { const s = __scene.shapes.find(s => s.el.id === 'lens'); return { sx: s.sx.v.toFixed(3), ang: (s.ang * 180 / Math.PI).toFixed(0), tr: s.el.style.transform }; });
await p.screenshot({ path: 'shots/v3-stretch.png' });
// тянем к таб-бару (слияние)
const tab = await p.locator('#tabbar').boundingBox();
const tx = tab.x + tab.width * 0.55, ty = tab.y - 62;
for (let i = 0; i < 30; i++) { x += (tx - x) * 0.2; y += (ty - y) * 0.2; await tp('touchMove', x, y); await p.waitForTimeout(16); }
await p.waitForTimeout(500);
await p.screenshot({ path: 'shots/v3-merge.png' });
await tp('touchEnd'); await p.waitForTimeout(600);
const after = await p.evaluate(() => { const s = __scene.shapes.find(s => s.el.id === 'lens'); return { sx: s.sx.v, scale: s.scale.v }; });
// нажатие на кнопку поиска: пружина масштаба
const sb = await p.locator('#search').boundingBox();
await tp('touchStart', sb.x + 30, sb.y + 30); await p.waitForTimeout(120);
const pressed = await p.evaluate(() => __scene.shapes.find(s => s.el.id === 'search').scale.v.toFixed(3));
await tp('touchEnd');
console.log({ stretch, afterRelease: after, pressedScale: pressed, errs });
await b.close();
