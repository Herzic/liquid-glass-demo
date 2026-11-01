import { chromium, devices } from 'playwright';
const { defaultBrowserType, ...ip } = devices['iPhone 15 Pro'];
const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader','--use-angle=swiftshader'] });
const ctx = await b.newContext(ip); const p = await ctx.newPage(); const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8765/demo/index.html'); await p.waitForTimeout(1500);
const box = await p.locator('#lens').boundingBox();
const cdp = await ctx.newCDPSession(p);
const tp = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
let x = box.x + 85, y = box.y + 85; await tp('touchStart', x, y);
for (let i = 0; i < 20; i++) { y -= 10; await tp('touchMove', x, y); await p.waitForTimeout(16); }
await tp('touchEnd'); await p.waitForTimeout(300);
const nb = await p.locator('#lens').boundingBox();
console.log('touch drag moved lens by', Math.round(box.y - nb.y), 'px');
await p.screenshot({ path: 'shots/iphone-after-touch.png' });
// dist build smoke
const r = await p.evaluate(async () => { const m = await import('/dist/liquid-glass.min.js'); const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:20px;top:300px;width:120px;height:60px;border-radius:30px'; document.body.append(d);
  const g = new m.Glass(d, { background: document.getElementById('bg') }); await new Promise(r => setTimeout(r, 300)); return [g.mode, g.canvas?.width]; });
console.log('dist build:', r, 'errors:', errs);
await b.close();
