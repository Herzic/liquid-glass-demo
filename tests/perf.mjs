import { chromium, devices } from 'playwright';
const args = ['--enable-unsafe-swiftshader','--use-angle=swiftshader','--ignore-gpu-blocklist'];
const cfgs = [
  ['desktop 1280x860 dpr1', { viewport: { width: 1280, height: 860 } }, 1],
  ['iPhone 15 Pro (dpr3, CPU x4 throttle)', (({defaultBrowserType, ...o}) => o)(devices['iPhone 15 Pro']), 4],
  ['Pixel 7 (dpr2.6, CPU x4 throttle)', (({defaultBrowserType, ...o}) => o)(devices['Pixel 7']), 4],
];
const res = [];
for (const [name, opts, thr] of cfgs) for (const mode of ['webgl', 'svg', 'css']) for (const low of [false, true]) {
  if (low && mode !== 'webgl') continue;
  const b = await chromium.launch({ args }); const ctx = await b.newContext(opts); const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p); await cdp.send('Performance.enable');
  if (thr > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: thr });
  await p.goto(`http://localhost:8765/demo/index.html?mode=${mode}`); await p.waitForTimeout(2000);
  if (low) await p.evaluate(async () => (await import('/src/liquid-glass.js')).setLowPower(true));
  const realMode = await p.evaluate(() => __glasses[0].mode);
  const m = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
  // idle
  let a = await m(); const f0 = await p.evaluate(() => __perf.drawn);
  await p.waitForTimeout(2000);
  let bb = await m(); const idleDraws = await p.evaluate(() => __perf.drawn) - f0;
  const idleCpu = (bb.TaskDuration - a.TaskDuration) / 2 * 100;
  // drag lens 3 s
  const box = await p.locator('#lens').boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down();
  await p.evaluate(() => { window.__fr = []; let l = performance.now(); (function f(t) { __fr.push(t - l); l = t; if (__fr.length < 1e5) requestAnimationFrame(f); })(l); });
  a = await m(); const d0 = await p.evaluate(() => __perf.drawn); const t0 = Date.now();
  for (let i = 0; i < 90; i++) { await p.mouse.move(box.x + 85 + Math.sin(i / 8) * 120, box.y + 85 + Math.cos(i / 8) * 160); await p.waitForTimeout(16); }
  const dt = (Date.now() - t0) / 1000;
  bb = await m(); await p.mouse.up();
  const r = await p.evaluate(() => { const f = __fr.slice(2).sort((a, b) => a - b); return { fps: 1000 / (f.reduce((s, x) => s + x, 0) / f.length), p95: f[Math.floor(f.length * .95)], glMs: __perf.avgMs }; });
  const draws = await p.evaluate(() => __perf.drawn) - d0;
  res.push({ device: name, mode: realMode, lowPower: low, idleDrawsPer2s: idleDraws, idleCpuPct: +idleCpu.toFixed(1),
    dragFps: +r.fps.toFixed(1), dragP95FrameMs: +r.p95.toFixed(1), renderMsPerFrame: +r.glMs.toFixed(2), dragCpuPct: +((bb.TaskDuration - a.TaskDuration) / dt * 100).toFixed(0), glassDraws: draws });
  await b.close();
}
console.table(res);
(await import('fs')).writeFileSync('tests/perf-results.json', JSON.stringify(res, null, 1));
