import { chromium, devices } from 'playwright';
const args = ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'];
const strip = ({ defaultBrowserType, ...o }) => o;
const cfgs = process.env.QUICK ? [['iPhone 15 Pro · CPU×4', strip(devices['iPhone 15 Pro']), 4]] : [['iPhone 15 Pro · CPU×4', strip(devices['iPhone 15 Pro']), 4], ['Pixel 7 · CPU×4', strip(devices['Pixel 7']), 4], ['Desktop 1280×860', { viewport: { width: 1280, height: 860 } }, 1]];
const res = [];
for (const [name, o, thr] of cfgs) for (const low of (process.env.VARIANTS ? process.env.VARIANTS.split(',') : [false, true])) {
  const b = await chromium.launch({ args }); const ctx = await b.newContext(o); const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p); await cdp.send('Performance.enable');
  await p.goto(`http://localhost:8765/demo/index.html${low === true ? '?low=1' : low ? '?' + low : ''}`); await p.waitForTimeout(2500);
  if (thr > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: thr });
  const met = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
  const startFr = () => p.evaluate(() => { window.__fr = []; let l = performance.now(); window.__f0 = __scene.stats.frames; (function f(t) { __fr.push(t - l); l = t; if (__fr.length < 1e5) requestAnimationFrame(f); })(l); });
  const endFr = () => p.evaluate(() => { const f = __fr.slice(3).sort((a, b) => a - b); return { fps: 1000 / (f.reduce((s, x) => s + x, 0) / f.length), p95: f[Math.floor(f.length * .95)] || 0, draws: __scene.stats.frames - __f0, js: __scene.stats.avgMs }; });
  const row = (sc, r, cpu) => res.push({ device: name, lowPower: low, scenario: sc, fps: +r.fps.toFixed(1), p95ms: +r.p95.toFixed(1), glassDraws: r.draws, jsMsPerDraw: +r.js.toFixed(2), cpuPct: +cpu.toFixed(0) });
  // покой
  let a = await met(); await startFr(); await p.waitForTimeout(2000); let r = await endFr(); let bb = await met();
  row('покой 2 с', r, (bb.TaskDuration - a.TaskDuration) / 2 * 100);
  // прокрутка ленты
  a = await met(); await startFr(); const t0 = Date.now();
  for (let i = 0; i < 60; i++) { await p.mouse.wheel(0, i < 30 ? 25 : -25); await p.waitForTimeout(16); }
  r = await endFr(); bb = await met(); row('прокрутка', r, (bb.TaskDuration - a.TaskDuration) / ((Date.now() - t0) / 1000) * 100);
  // перетаскивание линзы + слияние с таб-баром
  const lb = await p.locator('#lens').boundingBox(), tb = await p.locator('#tabbar').boundingBox();
  let x = lb.x + lb.width / 2, y = lb.y + lb.height / 2; await p.mouse.move(x, y); await p.mouse.down();
  a = await met(); await startFr(); const t1 = Date.now();
  for (let i = 0; i < 90; i++) { const k = i / 89; await p.mouse.move(x + Math.sin(i / 7) * 90, y + (tb.y - 40 - y) * k); await p.waitForTimeout(16); }
  r = await endFr(); bb = await met(); await p.mouse.up(); row('перетаскивание+слияние', r, (bb.TaskDuration - a.TaskDuration) / ((Date.now() - t1) / 1000) * 100);
  await b.close();
}
console.table(res);
(await import('fs')).writeFileSync('tests/v3-perf-results.json', JSON.stringify(res, null, 1));
