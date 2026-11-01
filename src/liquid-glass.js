/*!
 * LiquidGlass — эффект «жидкого стекла» (в духе iOS 26) для веба.
 * Без зависимостей. Режимы: 'webgl' | 'svg' | 'css'. MIT.
 */

// ---------------------------------------------------------------------------
// Общая физика: профиль поверхности (squircle) и смещение по закону Снеллиуса
// ---------------------------------------------------------------------------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Высота выпуклой «сквиркл»-поверхности: t ∈ [0..1] от края внутрь. */
function surface(t) { return Math.pow(1 - Math.pow(1 - t, 4), 0.25); }

/**
 * Насколько сместится луч (в долях ширины ободка) при входе в стекло.
 * Луч падает вертикально; нормаль наклонена на угол = atan(slope).
 * Возвращает величину смещения ≥ 0 (направление — внутрь фигуры).
 */
function refractOffset(t, ior) {
  const e = 0.001;
  const t0 = clamp(t, 0, 1 - e);
  const slope = (surface(t0 + e) - surface(t0)) / e;
  const theta = Math.atan(slope);              // угол падения
  const sinR = Math.sin(theta) / ior;          // Снеллиус
  const r = Math.asin(clamp(sinR, -1, 1));
  return Math.tan(theta - r) * (1 - surface(t0) * 0.5);
}

/** SDF скруглённого прямоугольника (центр в 0). */
function sdRoundRect(px, py, hw, hh, r) {
  const qx = Math.abs(px) - hw + r, qy = Math.abs(py) - hh + r;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(ox, oy) - r;
}

// ---------------------------------------------------------------------------
// Определение возможностей
// ---------------------------------------------------------------------------
let _caps = null;
export function capabilities() {
  if (_caps) return _caps;
  const ua = navigator.userAgent;
  const isChromium = !!window.chrome || /Chrome\/|CriOS|Edg\//.test(ua) && !/Firefox/.test(ua);
  const isIOS = /iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const backdrop = CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)');
  let webgl2 = false;
  try { webgl2 = !!document.createElement('canvas').getContext('webgl2'); } catch (_) {}
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reducedTransparency = matchMedia('(prefers-reduced-transparency: reduce)').matches;
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  const lowEnd = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 2;
  // SVG-фильтры внутри backdrop-filter реально работают только в Chromium (не iOS: там это WebKit)
  const svgBackdrop = isChromium && !isIOS && backdrop;
  _caps = { isChromium, isIOS, backdrop, webgl2, svgBackdrop, reducedMotion, reducedTransparency, saveData, lowEnd,
    touch: navigator.maxTouchPoints > 0 };
  return _caps;
}

/** Лучший режим для элемента: webgl, если есть фон-источник; иначе svg (Chromium) или css. */
export function detectMode(opts = {}) {
  const c = capabilities();
  if (c.reducedTransparency) return 'css';
  if (opts.background && c.webgl2) return 'webgl';
  if (c.svgBackdrop) return 'svg';
  return 'css';
}

// ---------------------------------------------------------------------------
// Кэш карт смещения (для SVG-режима). Ключ: размеры+радиус+ободок+ior
// ---------------------------------------------------------------------------
const mapCache = new Map();
const MAP_CACHE_MAX = 32;

/**
 * Генерирует RGBA-карту смещения: R = dx, G = dy (128 = 0), B = 128, A = 255.
 * Вычисляется один раз, по 1D-профилю (LUT), O(w·h) лёгких операций.
 */
export function displacementMap(w, h, radius, bezel, ior = 1.5, thickness = 28, magnify = 0) {
  w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
  const key = `${w}x${h}r${radius}b${bezel}i${ior}t${thickness}m${magnify}`;
  if (mapCache.has(key)) return mapCache.get(key);
  // LUT профиля смещения
  const N = 128, lut = new Float32Array(N + 1);
  let maxOff = 1e-6;
  for (let i = 0; i <= N; i++) { lut[i] = refractOffset(i / N, ior); maxOff = Math.max(maxOff, lut[i]); }
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(w, h), d = img.data;
  const hw = w / 2, hh = h / 2, r = Math.min(radius, hw, hh), e = 0.5;
  const fx = new Float32Array(w * h), fy = new Float32Array(w * h);
  let maxPx = 1;
  for (let y = 0; y < h; y++) {
    const py = y + 0.5 - hh;
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - hw, i = (y * w + x) * 4;
      const dist = sdRoundRect(px, py, hw, hh, r);
      let dx = 0, dy = 0;
      if (dist < 0 && -dist < bezel) {
        const t = -dist / bezel, m = lut[(t * N) | 0] / maxOff;
        // градиент SDF = внешняя нормаль
        const gx = sdRoundRect(px + e, py, hw, hh, r) - sdRoundRect(px - e, py, hw, hh, r);
        const gy = sdRoundRect(px, py + e, hw, hh, r) - sdRoundRect(px, py - e, hw, hh, r);
        const gl = Math.hypot(gx, gy) || 1;
        dx = -gx / gl * m * thickness; dy = -gy / gl * m * thickness;   // выборка смещается внутрь, px
      }
      if (dist < 0) { dx -= px * magnify; dy -= py * magnify; }           // лёгкое увеличение центра
      fx[i >> 2] = dx; fy[i >> 2] = dy;
      maxPx = Math.max(maxPx, Math.abs(dx), Math.abs(dy));
    }
  }
  for (let j = 0, i = 0; j < w * h; j++, i += 4) {
    d[i] = 128 + fx[j] / maxPx * 127; d[i + 1] = 128 + fy[j] / maxPx * 127; d[i + 2] = 128; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // feDisplacementMap: P' = P + scale·(C − 0.5)  ⇒ scale = 2·maxPx·(255/254)
  const res = { url: cv.toDataURL(), scale: 2 * maxPx * 255 / 254 };
  if (mapCache.size >= MAP_CACHE_MAX) mapCache.delete(mapCache.keys().next().value);
  mapCache.set(key, res);
  return res;
}

// ---------------------------------------------------------------------------
// Общий WebGL2-рендерер: ОДИН контекст на страницу, результат копируется
// в 2D-канвасы элементов (обходит лимит ~16 контекстов на мобильных).
// ---------------------------------------------------------------------------
const VERT = `#version 300 es
in vec2 p; out vec2 vUv;
void main(){ vUv = p*0.5+0.5; gl_Position = vec4(p,0.,1.); }`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex;
uniform vec2  uSize;      // размер стекла, CSS px
uniform vec4  uUvRect;    // xy = uv левого-верхнего угла в фоне, zw = размер в uv
uniform float uRadius, uBezel, uThick, uIor, uBlur, uAberr, uSpec, uSat, uBright, uMag;
uniform vec4  uTint;      // rgb + сила
uniform vec2  uLight;     // направление света
uniform vec2  uTexSize;

float sdRR(vec2 p, vec2 b, float r){ vec2 q = abs(p)-b+r; return min(max(q.x,q.y),0.)+length(max(q,0.))-r; }
float surf(float t){ return pow(1.-pow(1.-t,4.),.25); }
float refr(float t){
  float e=.002; t=clamp(t,0.,1.-e);
  float s=(surf(t+e)-surf(t))/e;
  float th=atan(s); float r=asin(clamp(sin(th)/uIor,-1.,1.));
  return tan(th-r)*(1.-surf(t)*.5);
}
vec3 sat(vec3 c,float s){ float l=dot(c,vec3(.2126,.7152,.0722)); return mix(vec3(l),c,s); }
vec3 samp(vec2 uv, float lod){
  // фон вне текстуры зажимаем
  uv = clamp(uv, vec2(0.), vec2(1.));
  if (lod < .01) return texture(uTex, uv).rgb;
  // дешёвый «фрост»: мип-уровень + 4 тапа по диагонали
  vec2 px = exp2(lod) / uTexSize;
  vec3 c = textureLod(uTex, uv, lod).rgb*.4;
  c += textureLod(uTex, uv+vec2( px.x, px.y)*.75, lod).rgb*.15;
  c += textureLod(uTex, uv+vec2(-px.x, px.y)*.75, lod).rgb*.15;
  c += textureLod(uTex, uv+vec2( px.x,-px.y)*.75, lod).rgb*.15;
  c += textureLod(uTex, uv+vec2(-px.x,-px.y)*.75, lod).rgb*.15;
  return c;
}
void main(){
  vec2 frag = vec2(vUv.x, 1.-vUv.y)*uSize;          // CSS px, y вниз
  vec2 p = frag - uSize*.5;
  vec2 hb = uSize*.5;
  float r = min(uRadius, min(hb.x,hb.y));
  float d = sdRR(p, hb, r);
  float aa = smoothstep(.75, -.75, d);
  if (aa <= 0.) { o = vec4(0.); return; }
  // нормаль из градиента SDF
  vec2 e = vec2(.5,0.);
  vec2 n = normalize(vec2(sdRR(p+e.xy,hb,r)-sdRR(p-e.xy,hb,r), sdRR(p+e.yx,hb,r)-sdRR(p-e.yx,hb,r))+1e-6);
  float t = clamp(-d/uBezel, 0., 1.);
  float off = (t < 1.) ? refr(t) * uThick : 0.;
  vec2 disp = -n * off - p * uMag;                   // px: внутрь + лёгкое увеличение
  vec2 base = (frag + disp) / uSize;                 // 0..1 внутри стекла
  vec2 uv = uUvRect.xy + base*uUvRect.zw;
  vec3 col;
  if (uAberr > 0.) {
    vec2 ca = -n * off * uAberr / uSize * uUvRect.zw;
    col = vec3(samp(uv - ca, uBlur).r, samp(uv, uBlur).g, samp(uv + ca, uBlur).b);
  } else col = samp(uv, uBlur);
  col = sat(col, uSat) * uBright;
  col = mix(col, uTint.rgb, uTint.a);
  // блики: ободок, освещённый с направления uLight, и отражённый с противоположной стороны
  float rim = pow(1.-t, 3.) ;
  float ld = dot(n, normalize(uLight));
  float spec = rim * (pow(max(ld,0.),2.)*1. + pow(max(-ld,0.),2.)*.55);
  float edge = smoothstep(1.6,0.,abs(d+.9))*.35;     // тонкая светлая кромка
  col += (spec + edge) * uSpec;
  // лёгкая внутренняя тень у кромки — объём
  col *= 1. - rim*.08;
  o = vec4(col*aa, aa);
}`;

class SharedRenderer {
  constructor() {
    this.canvas = document.createElement('canvas');
    const gl = this.canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false,
      preserveDrawingBuffer: false, powerPreference: 'low-power', desynchronized: false });
    if (!gl) throw new Error('WebGL2 недоступен');
    this.gl = gl;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    gl.useProgram(pr); this.prog = pr;
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW); // один треугольник
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    const n = gl.getProgramParameter(pr, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(pr, i); this.u[a.name] = gl.getUniformLocation(pr, a.name); }
    this.textures = new Map(); // source -> {tex, w, h, version}
    this.lost = false;
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    this.canvas.addEventListener('webglcontextrestored', () => { renderer = null; Glass.all.forEach(g => g.invalidate(true)); });
  }
  texture(src, live) {
    const gl = this.gl;
    let t = this.textures.get(src);
    const w = src.videoWidth || src.naturalWidth || src.width, h = src.videoHeight || src.naturalHeight || src.height;
    if (!w || !h) return null;
    if (t && !live && t.w === w && t.h === h && !src.__lgDirty) return t;
    if (!t) { t = { tex: gl.createTexture(), w: 0, h: 0 }; this.textures.set(src, t); }
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    t.w = w; t.h = h; src.__lgDirty = false;
    return t;
  }
  draw(g, pw, ph, uvRect, tex) {
    const gl = this.gl, c = this.canvas, u = this.u, o = g.opts;
    if (c.width < pw || c.height < ph) { c.width = Math.max(c.width, pw); c.height = Math.max(c.height, ph); }
    gl.viewport(0, 0, pw, ph);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindTexture(gl.TEXTURE_2D, tex.tex);
    gl.uniform1i(u.uTex, 0);
    gl.uniform2f(u.uSize, g.w, g.h);
    gl.uniform4f(u.uUvRect, uvRect[0], uvRect[1], uvRect[2], uvRect[3]);
    gl.uniform2f(u.uTexSize, tex.w, tex.h);
    gl.uniform1f(u.uRadius, g.radius);
    gl.uniform1f(u.uBezel, o.bezel);
    gl.uniform1f(u.uThick, o.thickness);
    gl.uniform1f(u.uIor, o.ior);
    gl.uniform1f(u.uMag, o.magnify);
    // blur в CSS px -> уровень мипа текстуры
    const texPerCss = tex.w * uvRect[2] / g.w;
    gl.uniform1f(u.uBlur, o.blur > 0 ? Math.max(0, Math.log2(o.blur * texPerCss)) : 0);
    gl.uniform1f(u.uAberr, g.lowPower ? 0 : o.aberration);
    gl.uniform1f(u.uSpec, o.specular);
    gl.uniform1f(u.uSat, o.saturation);
    gl.uniform1f(u.uBright, o.brightness);
    gl.uniform4f(u.uTint, o.tint[0], o.tint[1], o.tint[2], o.tint[3]);
    gl.uniform2f(u.uLight, o.light[0], o.light[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // копируем в 2D-канвас элемента (в том же таске — буфер ещё валиден)
    const ctx = g.ctx2d;
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(c, 0, c.height - ph, pw, ph, 0, 0, pw, ph);
  }
}
let renderer = null;
const lumaCache = new WeakMap();
function getRenderer() {
  if (!renderer || renderer.lost) renderer = new SharedRenderer();
  return renderer;
}

// ---------------------------------------------------------------------------
// Планировщик: один rAF на всех, рендер только «грязных» элементов
// ---------------------------------------------------------------------------
const dirty = new Set();
let rafId = 0, lastFrame = 0;
const stats = { frames: 0, drawn: 0, lastMs: 0, avgMs: 0 };
function schedule() { if (!rafId) rafId = requestAnimationFrame(tick); }
function tick(now) {
  rafId = 0;
  const minDt = Glass.maxFps ? 1000 / Glass.maxFps - 1 : 0;
  if (minDt && now - lastFrame < minDt) { schedule(); return; }
  lastFrame = now;
  const t0 = performance.now();
  const list = [...dirty]; dirty.clear();
  for (const g of list) { if (g.visible && !document.hidden) g.render(); }
  // живые источники (видео/анимированный canvas) — продолжаем
  for (const g of Glass.all) if (g.isLive() && g.visible) dirty.add(g);
  const ms = performance.now() - t0;
  stats.frames++; stats.drawn += list.length; stats.lastMs = ms; stats.avgMs = stats.avgMs * 0.9 + ms * 0.1;
  if (dirty.size) schedule();
}

// глобальные слушатели (один раз)
let globalsBound = false;
function bindGlobals() {
  if (globalsBound) return; globalsBound = true;
  const all = () => { Glass.all.forEach(g => g.mode === 'webgl' && dirty.add(g)); schedule(); };
  addEventListener('scroll', all, { passive: true, capture: true });
  addEventListener('resize', all, { passive: true });
  if (window.visualViewport) visualViewport.addEventListener('resize', all, { passive: true });
  document.addEventListener('visibilitychange', all);
}

// ---------------------------------------------------------------------------
// Публичный класс
// ---------------------------------------------------------------------------
const DEFAULTS = {
  mode: 'auto',          // 'auto' | 'webgl' | 'svg' | 'css'
  background: null,      // HTMLImageElement | HTMLCanvasElement | HTMLVideoElement — для webgl
  fit: 'cover',          // как фон вписан в свой бокс: 'cover' | 'contain' | 'fill'
  live: false,           // обновлять текстуру каждый кадр (видео/анимированный canvas)
  radius: null,          // px; null = из CSS border-radius
  bezel: 22,             // ширина преломляющего ободка, px
  thickness: 28,         // «толщина» стекла: максимальный сдвиг, px
  ior: 1.5,              // показатель преломления
  magnify: 0.04,         // увеличение центра линзы (0 — нет)
  adaptive: true,        // светлый/тёмный текст по яркости фона (webgl)
  blur: 2,               // размытие (фрост), CSS px
  aberration: 0.12,      // хроматическая аберрация (0 — выкл.)
  specular: 0.55,        // яркость бликов
  saturation: 1.35,
  brightness: 1.04,
  tint: [1, 1, 1, 0.06], // rgb 0..1 + сила
  light: [-0.6, -0.8],   // направление света (x, y вниз)
  maxDpr: 2,             // предел DPR
  lowPower: 'auto',      // true | false | 'auto' (save-data, слабое устройство, reduced-motion)
};

export class Glass {
  constructor(el, options = {}) {
    this.el = el;
    this.opts = { ...DEFAULTS, ...options };
    const c = capabilities();
    this.lowPower = this.opts.lowPower === 'auto' ? (c.saveData || c.lowEnd || c.reducedMotion) : !!this.opts.lowPower;
    let mode = this.opts.mode === 'auto' ? detectMode(this.opts) : this.opts.mode;
    if (mode === 'webgl' && (!c.webgl2 || !this.opts.background)) mode = c.svgBackdrop ? 'svg' : 'css';
    if (mode === 'svg' && !c.svgBackdrop) mode = 'css';
    this.mode = mode;
    this.visible = true;
    el.classList.add('lg', 'lg--' + mode);
    el.dataset.lgMode = mode;
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    this.measure();
    if (mode === 'webgl') this._initWebGL();
    else if (mode === 'svg') this._initSVG();
    else this._initCSS();
    this._ro = new ResizeObserver(() => { this.measure(); this.invalidate(true); });
    this._ro.observe(el);
    this._io = new IntersectionObserver(([en]) => { this.visible = en.isIntersecting; if (this.visible) this.invalidate(); }, { rootMargin: '64px' });
    this._io.observe(el);
    Glass.all.add(this);
    bindGlobals();
    this.invalidate();
  }
  measure() {
    const r = this.el.getBoundingClientRect();
    this.w = r.width; this.h = r.height;
    const br = getComputedStyle(this.el).borderTopLeftRadius || '0';
    const cssR = br.includes('%') ? parseFloat(br) / 100 * Math.min(this.w, this.h) : (parseFloat(br) || 0);
    this.radius = this.opts.radius ?? cssR;
  }
  dpr() {
    let d = Math.min(devicePixelRatio || 1, this.opts.maxDpr);
    if (this.lowPower) d = Math.min(d, 1.5);
    return d;
  }
  isLive() { return this.mode === 'webgl' && this.opts.live && !this.lowPower ? true :
    (this.mode === 'webgl' && this.opts.live && this.lowPower && (stats.frames & 1) === 0); }
  invalidate(remeasure) {
    if (remeasure) this.measure();
    if (this.mode === 'svg' && remeasure) this._updateSVG();
    if (this.mode === 'webgl') { dirty.add(this); schedule(); }
  }
  /** Обновить параметры на лету. */
  set(options) { Object.assign(this.opts, options); if (this.mode === 'svg') this._updateSVG(true); this.invalidate(true); }

  // ---- WebGL ------------------------------------------------------------
  _initWebGL() {
    const cv = document.createElement('canvas');
    cv.className = 'lg__canvas';
    cv.setAttribute('aria-hidden', 'true');
    Object.assign(cv.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', borderRadius: 'inherit',
      pointerEvents: 'none', zIndex: '-1' });
    this.el.prepend(cv);
    this.canvas = cv; this.ctx2d = cv.getContext('2d', { alpha: true });
    if (getComputedStyle(this.el).isolation !== 'isolate') this.el.style.isolation = 'isolate';
    const bg = this.opts.background;
    if (bg instanceof HTMLImageElement && !bg.complete) bg.addEventListener('load', () => this.invalidate(), { once: true });
    if (bg instanceof HTMLVideoElement) {
      bg.addEventListener('loadeddata', () => this.invalidate());
      bg.addEventListener('play', () => this.invalidate());
    }
  }
  _uvRect() {
    const bg = this.opts.background;
    const br = bg.getBoundingClientRect(), er = this.el.getBoundingClientRect();
    const nw = bg.videoWidth || bg.naturalWidth || bg.width, nh = bg.videoHeight || bg.naturalHeight || bg.height;
    // область фона, видимая в боксе br (учёт object-fit)
    let sx = 0, sy = 0, sw = 1, sh = 1;
    const fit = this.opts.fit;
    if (fit !== 'fill' && nw && nh) {
      const s = fit === 'cover' ? Math.max(br.width / nw, br.height / nh) : Math.min(br.width / nw, br.height / nh);
      const dw = nw * s, dh = nh * s;
      sw = br.width / dw; sh = br.height / dh; sx = (1 - sw) / 2; sy = (1 - sh) / 2;
    }
    const u0 = (er.left - br.left) / br.width, v0 = (er.top - br.top) / br.height;
    return [sx + u0 * sw, sy + v0 * sh, er.width / br.width * sw, er.height / br.height * sh];
  }
  render() {
    if (this.mode !== 'webgl' || this.destroyed) return;
    const d = this.dpr();
    const pw = Math.max(1, Math.round(this.w * d)), ph = Math.max(1, Math.round(this.h * d));
    if (this.canvas.width !== pw || this.canvas.height !== ph) { this.canvas.width = pw; this.canvas.height = ph; }
    let r;
    try { r = getRenderer(); } catch (e) { console.warn('[LiquidGlass]', e); this._fallback(); return; }
    const tex = r.texture(this.opts.background, this.isLive());
    if (!tex) return;
    const uv = this._uvRect();
    r.draw(this, pw, ph, uv, tex);
    if (this.opts.adaptive) this._tone(uv);
  }
  /** Адаптивный тон: средняя яркость фона под стеклом (по 32×32-превью источника). */
  _tone(uv) {
    const src = this.opts.background;
    let L = lumaCache.get(src);
    if (!L || L.dirty !== (src.currentSrc || src.src || 0) || this.isLive()) {
      const c = document.createElement('canvas'); c.width = c.height = 32;
      const x = c.getContext('2d', { willReadFrequently: true });
      try { x.drawImage(src, 0, 0, 32, 32); L = { d: x.getImageData(0, 0, 32, 32).data, dirty: src.currentSrc || src.src || 0 }; }
      catch (_) { return; }                                   // tainted canvas — пропускаем
      lumaCache.set(src, L);
    }
    let sum = 0, n = 0;
    const x0 = clamp(uv[0] * 32 | 0, 0, 31), x1 = clamp((uv[0] + uv[2]) * 32 | 0, 0, 31);
    const y0 = clamp(uv[1] * 32 | 0, 0, 31), y1 = clamp((uv[1] + uv[3]) * 32 | 0, 0, 31);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = (y * 32 + x) * 4; sum += 0.2126 * L.d[i] + 0.7152 * L.d[i + 1] + 0.0722 * L.d[i + 2]; n++;
    }
    const tone = sum / n / 255 * this.opts.brightness > 0.62 ? 'light' : 'dark';
    if (this.el.dataset.lgTone !== tone) this.el.dataset.lgTone = tone;
  }
  _fallback() {
    this.canvas && this.canvas.remove();
    this.el.classList.remove('lg--webgl');
    this.mode = capabilities().svgBackdrop ? 'svg' : 'css';
    this.el.classList.add('lg--' + this.mode); this.el.dataset.lgMode = this.mode;
    this.mode === 'svg' ? this._initSVG() : this._initCSS();
  }

  // ---- SVG (Chromium) ---------------------------------------------------
  _initSVG() {
    this.id = 'lg-f-' + Math.random().toString(36).slice(2, 9);
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
    svg.innerHTML = `<filter id="${this.id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse">
      <feImage result="map" preserveAspectRatio="none"/>
      <feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="G" result="dR"/>
      <feColorMatrix in="dR" type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="r"/>
      <feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="G" result="dG"/>
      <feColorMatrix in="dG" type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" result="g"/>
      <feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="G" result="dB"/>
      <feColorMatrix in="dB" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" result="b"/>
      <feBlend in="r" in2="g" mode="screen" result="rg"/>
      <feBlend in="rg" in2="b" mode="screen"/>
    </filter>`;
    (document.getElementById('lg-defs') || document.body).appendChild(svg);
    this.svg = svg;
    this._updateSVG(true);
  }
  _updateSVG() {
    if (!this.svg) return;
    const o = this.opts, w = Math.round(this.w), h = Math.round(this.h);
    if (w < 2 || h < 2) return;
    const key = `${w}x${h}|${this.radius}|${o.bezel}|${o.thickness}|${o.magnify}|${o.ior}|${o.aberration}|${o.blur}|${o.saturation}`;
    if (key === this._svgKey) return;               // ничего не изменилось — фильтр не трогаем
    this._svgKey = key;
    const f = this.svg.firstElementChild;
    const img = f.querySelector('feImage');
    const map = displacementMap(w, h, this.radius, o.bezel, o.ior, o.thickness, o.magnify);
    img.setAttribute('href', map.url);
    img.setAttribute('width', w); img.setAttribute('height', h);
    f.setAttribute('width', w); f.setAttribute('height', h);
    const scale = map.scale;
    const ab = this.lowPower ? 0 : o.aberration;
    const maps = f.querySelectorAll('feDisplacementMap');
    maps[0].setAttribute('scale', scale * (1 + ab));
    maps[1].setAttribute('scale', scale);
    maps[2].setAttribute('scale', scale * (1 - ab));
    const bf = `url(#${this.id}) blur(${o.blur}px) saturate(${o.saturation}) brightness(${o.brightness})`;
    this.el.style.backdropFilter = bf;
    this.el.style.setProperty('--lg-tint', `rgba(${o.tint.slice(0, 3).map(v => v * 255 | 0)},${o.tint[3]})`);
  }

  // ---- CSS fallback ----------------------------------------------------
  _initCSS() {
    const o = this.opts;
    const bf = `blur(${Math.max(o.blur * 4, 8)}px) saturate(${o.saturation + 0.3}) brightness(${o.brightness})`;
    this.el.style.backdropFilter = bf;
    this.el.style.webkitBackdropFilter = bf;
    this.el.style.setProperty('--lg-tint', `rgba(${o.tint.slice(0, 3).map(v => v * 255 | 0)},${Math.max(o.tint[3], 0.12)})`);
  }

  destroy() {
    this.destroyed = true;
    this._ro.disconnect(); this._io.disconnect();
    Glass.all.delete(this); dirty.delete(this);
    this.canvas && this.canvas.remove();
    this.svg && this.svg.remove();
    this.el.style.backdropFilter = ''; this.el.style.webkitBackdropFilter = '';
    this.el.classList.remove('lg', 'lg--' + this.mode);
  }
}
Glass.all = new Set();
Glass.maxFps = 0; // 0 = без ограничения (частота дисплея)

/** Пометить фон изменённым (для canvas-источника без live). */
export function markBackgroundDirty(src) { src.__lgDirty = true; Glass.all.forEach(g => g.opts.background === src && g.invalidate()); }
/** Применить ко всем элементам по селектору. */
export function liquidGlass(target, options) {
  const els = typeof target === 'string' ? document.querySelectorAll(target) : target instanceof Element ? [target] : target;
  return [...els].map(el => new Glass(el, options));
}
/** Режим энергосбережения для всех: ограничение FPS и DPR. */
export function setLowPower(on) { Glass.maxFps = on ? 30 : 0; Glass.all.forEach(g => { g.lowPower = on; g.invalidate(true); }); }
export const perfStats = stats;
export default liquidGlass;
