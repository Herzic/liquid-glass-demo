// Воспроизведение: медленная мобильная сеть (картинка грузится долго), iPhone/Pixel-эмуляция, реальная прокрутка
import { chromium, devices } from 'playwright';
const url = process.argv[2], out = process.argv[3], flags = (process.argv[4] || '').split(' ').filter(Boolean);
const { defaultBrowserType, ...d } = devices['Pixel 7'];
const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', ...flags] });
const ctx = await b.newContext(d); const p = await ctx.newPage(); const logs = [];
p.on('console', m => logs.push(m.type() + ': ' + m.text())); p.on('pageerror', e => logs.push('ERR ' + e.message));
const cdp = await ctx.newCDPSession(p);
await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200 * 1024, uploadThroughput: 50 * 1024 });
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(15000);
await p.mouse.wheel(0, 300); await p.waitForTimeout(800);
const r = await p.evaluate(() => ({ modes: [...new Set(__glasses.map(g => g.mode))], complete: document.getElementById('bg').complete,
  center: (() => { const g = __glasses.find(g => g.el.classList.contains('card') && g.canvas); if (!g) return null; const c = g.canvas; const x = c.getContext('2d').getImageData(c.width >> 1, c.height >> 1, 1, 1).data; return [...x]; })() }));
await p.screenshot({ path: out });
console.log(JSON.stringify(r), logs.filter(l => !l.startsWith('log')).slice(0, 5));
await b.close();
