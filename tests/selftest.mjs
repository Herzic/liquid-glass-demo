// Принудительно ломаем WebGL-выборку (шейдер возвращает чёрное) — должна сработать самопроверка → CSS
import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const p = await b.newPage(); const logs = []; p.on('console', m => logs.push(m.text()));
await p.route('**/src/liquid-glass.js', async r => { const res = await r.fetch(); let t = await res.text();
  t = t.replace('col = clamp(col, 0., 1.);', 'col = vec3(0.);'); await r.fulfill({ response: res, body: t }); });
await p.goto('http://localhost:8765/demo/index.html'); await p.waitForTimeout(2500);
console.log(await p.evaluate(() => [...new Set(__glasses.map(g => g.mode))]), logs.filter(l => l.includes('LiquidGlass')).slice(0, 3));
await b.close();
