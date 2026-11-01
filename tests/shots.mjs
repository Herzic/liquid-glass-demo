import { chromium, firefox, devices } from 'playwright';
const B = 'http://localhost:8765/demo/';
const args = ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'];
const runs = [
  ['chromium', chromium, { viewport: { width: 1280, height: 860 } }, 'desktop'],
  ['chromium', chromium, devices['iPhone 15 Pro'], 'iphone'],
  ['chromium', chromium, devices['Pixel 7'], 'pixel'],
  ['firefox', firefox, { viewport: { width: 1280, height: 860 } }, 'firefox'],
];
const pages = [['index.html', ''], ['index.html?mode=svg', 'svg'], ['index.html?mode=css', 'css'], ['dom.html', 'dom']];
const out = [];
for (const [name, bt, ctxOpts, tag] of runs) {
  const b = await bt.launch(name === 'chromium' ? { args } : {});
  const { defaultBrowserType, ...o } = ctxOpts;
  const ctx = await b.newContext(o);
  for (const [p, suf] of pages) {
    const page = await ctx.newPage(); const errs = [];
    page.on('console', m => m.type() === 'error' || m.type() === 'warning' ? errs.push(m.text()) : 0);
    page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
    await page.goto(B + p); await page.waitForTimeout(1500);
    const modes = await page.evaluate(() => [...new Set((window.__glasses || []).map(g => g.mode))].join(','));
    const f = `shots/${tag}-${suf || 'auto'}.png`;
    await page.screenshot({ path: f });
    out.push({ tag, p, modes, errs });
    await page.close();
  }
  await b.close();
}
console.log(JSON.stringify(out, null, 1));
