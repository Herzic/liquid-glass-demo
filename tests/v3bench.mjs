// Микробенчмарк GPU-стоимости: непрерывная перерисовка 2 с при разных настройках
import { chromium, devices } from 'playwright';
const { defaultBrowserType, ...d } = devices['iPhone 15 Pro'];
const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext(d)).newPage();
await p.goto('http://localhost:8765/demo/index.html' + (process.argv[2] || '')); await p.waitForTimeout(2500);
const combos = JSON.parse(process.argv[3] || '[{}]');
for (const c of combos) {
  const r = await p.evaluate(async (c) => { const s = __scene; Object.assign(s.o, c.o || {}); s.o.dynamicResolution = false; s._dyn = 1;
    if (c.lp != null) s.lowPower = c.lp;
    const f0 = s.stats.frames, t0 = performance.now(); const end = t0 + 2000;
    await new Promise(res => { (function f() { s.invalidate(); if (performance.now() < end) requestAnimationFrame(f); else res(); })(); });
    return ((s.stats.frames - f0) / ((performance.now() - t0) / 1000)).toFixed(1); }, c);
  console.log(JSON.stringify(c), '→', r, 'draws/s');
}
await b.close();
