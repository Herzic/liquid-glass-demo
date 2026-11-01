import { chromium, firefox, devices } from 'playwright';
const B = process.env.BASE || 'http://localhost:8765/demo/';
const args = ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'];
const strip = ({ defaultBrowserType, ...o }) => o;
const runs = [['iphone', chromium, strip(devices['iPhone 15 Pro'])], ['pixel', chromium, strip(devices['Pixel 7'])], ['desktop', chromium, { viewport: { width: 1280, height: 860 } }], ['firefox', firefox, { viewport: { width: 430, height: 900 } }]];
const pages = (process.env.PAGES || 'index.html|index.html?cc=1&wall=aurora|index.html?settings=1&wall=bg2|index.html?wall=light|classic.html|dom.html').split('|');
const only = process.env.ONLY;
for (const [tag, bt, o] of runs) {
  if (only && !only.split(',').includes(tag)) continue;
  const b = await bt.launch(bt === chromium ? { args } : {}); const ctx = await b.newContext(o);
  for (const p of pages) {
    const page = await ctx.newPage(); const errs = [];
    page.on('console', m => (m.type() === 'error' || (m.type() === 'warning' && m.text().includes('LiquidGlass'))) && errs.push(m.text()));
    page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
    await page.goto(B + p); await page.waitForTimeout(2500);
    const mode = await page.evaluate(() => window.__scene ? __scene.mode + '/' + __scene.stats.lastShapes : [...new Set((window.__glasses || []).map(g => g.mode))].join(','));
    const name = `shots/v3-${tag}-${p.replace(/[^a-z0-9]+/gi, '_')}.png`;
    await page.screenshot({ path: name });
    console.log(tag.padEnd(8), p.padEnd(34), mode.padEnd(10), errs.length ? errs.slice(0, 3).join(' | ') : 'OK');
    await page.close();
  }
  await b.close();
}
