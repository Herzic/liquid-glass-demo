import { chromium } from 'playwright';
const [,, url, sel, out, w=1280, h=860] = process.argv;
const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader','--use-angle=swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2 });
await p.goto(url); await p.waitForTimeout(1500);
const r = await p.locator(sel).first().boundingBox();
await p.screenshot({ path: out, clip: { x: r.x - 20, y: r.y - 20, width: r.width + 40, height: r.height + 40 } });
await b.close();
