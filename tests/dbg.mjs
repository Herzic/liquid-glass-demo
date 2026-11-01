import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader','--use-angle=swiftshader'] });
const p = await b.newPage();
await p.goto('http://localhost:8765/demo/index.html?mode=svg'); await p.waitForTimeout(1000);
const r = await p.evaluate(() => { const g = __glasses.find(g=>g.el.id==='lens'); const f=g.svg.firstElementChild; return {bf:g.el.style.backdropFilter, w:f.getAttribute('width'), img:f.querySelector('feImage').getAttribute('href').slice(0,40), sc:[...f.querySelectorAll('feDisplacementMap')].map(m=>m.getAttribute('scale')), html:g.svg.outerHTML.slice(0,300)}; });
console.log(r);
const href = await p.evaluate(() => __glasses.find(g=>g.el.id==='lens').svg.querySelector('feImage').getAttribute('href'));
(await import('fs')).writeFileSync('shots/map.png', Buffer.from(href.split(',')[1], 'base64'));
await b.close();
