/*!
 * LiquidGlass Scene v3 — все стеклянные элементы страницы в ОДНОМ проходе WebGL2.
 * SDF-слияние форм (smooth union), пружинная физика нажатия/растяжения,
 * блик от наклона устройства или указателя, адаптивный тон, два слоя фона
 * (обои + прокручиваемый контент). Без зависимостей. MIT.
 */
const MAXS = 24;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const VS = `#version 300 es
uniform vec4 uBox[${MAXS}]; uniform vec2 uRes;
out vec2 vPos;
void main(){
  vec4 b = uBox[gl_InstanceID];
  int v = gl_VertexID; vec2 c = vec2((v==1||v==2||v==4)?1.:0., (v==2||v==4||v==5)?1.:0.);
  vec2 p = mix(b.xy, b.zw, c);                       // device px, y вниз
  vPos = p;
  gl_Position = vec4(p.x/uRes.x*2.-1., 1.-p.y/uRes.y*2., 0., 1.);
}`;

const FS = `#version 300 es
precision highp float;
#define MAXS ${MAXS}
in vec2 vPos; out vec4 o;
uniform vec2 uRes; uniform int uCount;
uniform vec4 uRect[MAXS];  // cx, cy, hw, hh (device px)
uniform vec4 uMat[MAXS];   // обратная матрица деформации (столбцы)
uniform vec4 uP1[MAXS];    // radius, bezel, thickness, blur (device px)
uniform vec4 uP2[MAXS];    // group, tone (яркость фона 0..1), glow, merge k (device px)
uniform sampler2D uBg, uSheet; uniform int uHasSheet;
uniform vec4 uBgRect, uBgUv, uSheetRect;   // прямоугольники на экране (device px) и crop обоев
uniform vec2 uBgTex, uSheetTex;            // текселей на device px
uniform float uIor, uAberr, uSpec, uMag, uSat, uShadow, uDpr, uTint;
uniform vec2 uLight;

vec3 sdg(vec2 p, vec2 b, float r){
  vec2 s = vec2(p.x < 0. ? -1. : 1., p.y < 0. ? -1. : 1.);
  vec2 q = abs(p) - b + r;
  float d = min(max(q.x,q.y),0.) + length(max(q,0.)) - r;
  vec2 g;
  if (q.x > 0. && q.y > 0.) g = s*q/max(length(q),1e-5);
  else g = q.x > q.y ? vec2(s.x,0.) : vec2(0.,s.y);
  return vec3(d, g);
}
float surf(float t){ float u=1.-clamp(t,0.,1.); float a=u*u; return sqrt(sqrt(max(1.-a*a,0.))); }
float refr(float t){
  float e=.002; t=clamp(t,0.,1.-e);
  float s=(surf(t+e)-surf(t))/e;
  float th=atan(s); float r=asin(clamp(sin(th)/max(uIor,1.),-1.,1.));
  return clamp(tan(clamp(th-r,0.,1.5)),0.,8.)*(1.-surf(t)*.5);
}
vec3 layer(vec2 pos, float blurPx){
  vec2 ub = uBgUv.xy + clamp((pos - uBgRect.xy)/uBgRect.zw, 0., 1.)*uBgUv.zw;
  float lb = blurPx > .25 ? clamp(log2(blurPx*uBgTex.x), 0., 8.) : 0.;
  vec3 c = textureLod(uBg, ub, lb).rgb;
  if (uHasSheet == 1) {
    vec2 us = (pos - uSheetRect.xy)/uSheetRect.zw;
    if (us.x >= 0. && us.y >= 0. && us.x <= 1. && us.y <= 1.) {
      float ls = blurPx > .25 ? clamp(log2(blurPx*uSheetTex.x), 0., 8.) : 0.;
      vec4 s = textureLod(uSheet, us, ls);
      c = mix(c, s.rgb, s.a);
    }
  }
  return c;
}
vec3 blurred(vec2 pos, float b){
  if (b < 6.) return layer(pos, b);     // 1 выборка: дробный мип-уровень даёт мягкое размытие
  float k = b*.6;
  return layer(pos,b)*.4 + (layer(pos+vec2(k,k),b)+layer(pos+vec2(-k,k),b)+layer(pos+vec2(k,-k),b)+layer(pos+vec2(-k,-k),b))*.15;
}
void main(){
  vec2 frag = vPos;
  float D = 1e5; vec2 G = vec2(0.,-1.); float gAcc = -2.;
  float wsum = 0.; vec4 P1 = vec4(0.), P2 = vec4(0.); float best = 1e5; vec2 rel0 = vec2(0.);
  for (int i = 0; i < MAXS; i++) {
    if (i >= uCount) break;
    vec2 rel = frag - uRect[i].xy;
    mat2 M = mat2(uMat[i].xy, uMat[i].zw);
    vec2 hb = uRect[i].zw;
    vec3 dg = sdg(M*rel, hb, min(uP1[i].x, min(hb.x,hb.y)));
    vec2 g = transpose(M)*dg.yz; float gl = max(length(g),1e-4);
    float d = dg.x/gl; g /= gl;
    float k = uP2[i].w, grp = uP2[i].x;
    if (D > 1e4) { D = d; G = g; gAcc = grp; }
    else if (k > 0. && (grp == gAcc || grp == 0. || gAcc == 0.)) {
      float h = clamp(.5 + .5*(d - D)/k, 0., 1.);
      D = mix(d, D, h) - k*h*(1.-h);
      vec2 gg = mix(g, G, h); G = gg/max(length(gg),1e-4);
    } else if (d < D) { D = d; G = g; gAcc = grp; }
    float w = exp(-clamp(d, -60., 60.)/6.);
    wsum += w; P1 += uP1[i]*w; P2 += uP2[i]*w;
    if (d < best) { best = d; rel0 = rel; }
  }
  P1 /= wsum; P2 /= wsum;
  float aa = clamp(.5 - D, 0., 1.);
  // мягкая внешняя тень (глубина)
  float sh = D > 0. ? uShadow * exp(-D/(9.*uDpr)) * .22 : 0.;
  if (aa <= 0.) { o = vec4(0.,0.,0.,sh); return; }

  float bezel = max(P1.y, 1.), thick = P1.z;
  float t = clamp(-D/bezel, 0., 1.);
  float off = t < 1. ? refr(t)*thick : 0.;
  vec2 n = G;
  vec2 disp = -n*off - rel0*uMag;
  vec2 pos = frag + disp;
  vec3 col;
  if (uAberr > 0. && t < 1.) {
    vec2 ca = -n*off*uAberr;
    col = vec3(layer(pos - ca, P1.w).r, blurred(pos, P1.w).g, layer(pos + ca, P1.w).b);
  } else col = blurred(pos, P1.w);

  float l = dot(col, vec3(.2126,.7152,.0722));
  col = mix(vec3(l), col, uSat);
  // адаптивный тон: на светлом — чуть светлее/молочнее, на тёмном — чуть темнее (как в iOS)
  float tone = P2.y;
  float lt = smoothstep(.3, .6, tone);
  vec3 tintC = mix(vec3(.04,.04,.06), vec3(1.), lt);
  col = mix(col, tintC, uTint * mix(2.6, 1.0, lt));
  col = col*1.02 + .015;

  vec2 L = normalize(uLight + vec2(1e-5));
  float facing = dot(n, L);
  float band = pow(1.-t, 3.);
  // блик в полосе линзирования: сильный со стороны света, отражённый — с противоположной
  float spec = band*(pow(max(facing,0.),2.)*.7 + pow(max(-facing,0.),2.)*.35);
  // тонкая яркая кромка
  float line = clamp(1. - abs(D + .9*uDpr)/(.9*uDpr), 0., 1.);
  float rim = line*(.18 + .75*pow(max(facing,0.),1.5) + .45*pow(max(-facing,0.),1.5));
  // внутренняя тень у кромки, отвернутой от света, + общий объём
  col *= 1. - band*.05 - band*.08*max(-facing,0.);
  col += (spec + rim) * uSpec * (1. + P2.z*1.2) + P2.z*.06;
  col = clamp(col, 0., 1.);
  o = vec4(col*aa, aa) + vec4(0.,0.,0.,sh)*(1.-aa);
}`;

// ---------------------------------------------------------------- пружины
class Spring {
  constructor(v, k = 380, c = 24) { this.v = v; this.t = v; this.vel = 0; this.k = k; this.c = c; }
  step(dt) {
    const a = this.k * (this.t - this.v) - this.c * this.vel;
    this.vel += a * dt; this.v += this.vel * dt;
    if (Math.abs(this.t - this.v) < 1e-4 && Math.abs(this.vel) < 1e-3) { this.v = this.t; this.vel = 0; return false; }
    return true;
  }
}

const DEF = {
  background: null,        // img | canvas | video — обои (fixed или любой бокс)
  sheet: null,             // canvas — прокручиваемый контент поверх обоев (необязательно)
  fit: 'cover',
  zIndex: 1,
  maxDpr: 2,
  lowPower: 'auto',
  ior: 1.5, aberration: 0.1, specular: 0.9, magnify: 0.03, saturation: 1.25, shadow: 1, tint: 0.05,
  light: 'pointer',        // 'fixed' | 'pointer' | 'tilt'
  dynamicResolution: true, // снижать DPR во время движения, если кадры медленные
  lightDir: [-0.55, -0.85],
};
const SHAPE_DEF = { radius: null, bezel: 20, thickness: 24, blur: 1, group: 1, merge: 0, interactive: false, draggable: false, pressScale: 1.08 };

export class GlassScene {
  constructor(options = {}) {
    this.o = { ...DEF, ...options };
    this.shapes = [];
    const mm = (q) => typeof matchMedia === 'function' && matchMedia(q).matches;
    this.reducedMotion = mm('(prefers-reduced-motion: reduce)');
    const weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 2 || !!(navigator.connection && navigator.connection.saveData);
    this.lowPower = this.o.lowPower === 'auto' ? (weak || this.reducedMotion) : !!this.o.lowPower;
    this.mode = 'webgl';
    this.stats = { frames: 0, avgMs: 0, lastShapes: 0 };
    this._light = [new Spring(this.o.lightDir[0], 120, 18), new Spring(this.o.lightDir[1], 120, 18)];
    this._dirty = true; this._good = 0;
    this._tick = this._tick.bind(this);
    if (this.o.mode === 'css' || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-transparency: reduce)').matches)) { this.shapes = []; this._toCSS(); }
    else try { this._initGL(); } catch (e) { console.warn('[LiquidGlass] WebGL2 недоступен, CSS-режим:', e.message); this._toCSS(); }
    this._bind();
    this.setLight(this.o.light);
    this.invalidate();
  }

  // ------------------------------------------------------------ WebGL
  _initGL() {
    const cv = document.createElement('canvas');
    cv.className = 'lg-scene';
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = `position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:${this.o.zIndex}`;
    document.body.prepend(cv);
    const gl = cv.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
    if (!gl) { cv.remove(); throw new Error('нет webgl2'); }
    this.cv = cv; this.gl = gl;
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
    const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    gl.useProgram(p); this.prog = p;
    this.u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); this.u[a.name.replace('[0]', '')] = gl.getUniformLocation(p, a.name); }
    gl.bindVertexArray(gl.createVertexArray());
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
    this.tex = { bg: this._mkTex(0), sheet: this._mkTex(1) };
    gl.uniform1i(this.u.uBg, 0); gl.uniform1i(this.u.uSheet, 1);
    this.A = { rect: new Float32Array(MAXS * 4), mat: new Float32Array(MAXS * 4), p1: new Float32Array(MAXS * 4), p2: new Float32Array(MAXS * 4), box: new Float32Array(MAXS * 4) };
    cv.addEventListener('webglcontextlost', e => { e.preventDefault(); this._lost = true; });
    cv.addEventListener('webglcontextrestored', () => { this._lost = false; cv.remove(); try { this._initGL(); this.invalidate(); } catch (_) { this._toCSS(); } });
  }
  _mkTex(unit) { const gl = this.gl, t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return { t, unit, ver: null, w: 1, h: 1 }; }
  static ready(s) {
    if (!s) return false;
    if (s instanceof HTMLImageElement) return s.complete && s.naturalWidth > 0;
    if (s instanceof HTMLVideoElement) return s.readyState >= 2;
    return s.width > 0 && s.height > 0;
  }
  _upload(slot, src, limit) {
    const gl = this.gl, T = this.tex[slot];
    if (!GlassScene.ready(src)) return false;
    const w = src.videoWidth || src.naturalWidth || src.width, h = src.videoHeight || src.naturalHeight || src.height;
    let up = src, tw = w, th = h; const lim = Math.min(this.maxTex, limit);
    if (w > lim || h > lim) { const k = lim / Math.max(w, h); tw = Math.round(w * k); th = Math.round(h * k);
      const c = this['_sc' + slot] || (this['_sc' + slot] = document.createElement('canvas')); c.width = tw; c.height = th;
      c.getContext('2d').drawImage(src, 0, 0, tw, th); up = c; }
    gl.activeTexture(gl.TEXTURE0 + T.unit); gl.bindTexture(gl.TEXTURE_2D, T.t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, up);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.getError() ? gl.LINEAR : gl.LINEAR_MIPMAP_LINEAR);
    T.w = tw; T.h = th; T.srcW = w; T.srcH = h;
    // превью 32×N для адаптивного тона
    const pw = 32, ph = Math.max(1, Math.round(32 * h / w));
    const pc = document.createElement('canvas'); pc.width = pw; pc.height = ph;
    const px = pc.getContext('2d', { willReadFrequently: true }); px.drawImage(up, 0, 0, pw, ph);
    try { T.preview = { d: px.getImageData(0, 0, pw, ph).data, w: pw, h: ph }; } catch (_) { T.preview = null; }
    T.verified = false; this._uploaded = true;
    return true;
  }

  // ------------------------------------------------------------ API
  add(el, opts = {}) {
    const s = { el, o: { ...SHAPE_DEF, ...opts }, scale: new Spring(1, 420, 22), sx: new Spring(1, 300, 16), ang: 0, glow: new Spring(0, 300, 26),
      drag: null, tx: 0, ty: 0, vx: 0, vy: 0 };
    el.classList.add('lg-item');
    if (this.mode === 'css') this._cssItem(s);
    this._measureShape(s);
    if (s.o.interactive || s.o.draggable) this._interact(s);
    this.shapes.push(s);
    this.invalidate();
    return s;
  }
  remove(el) { const i = this.shapes.findIndex(s => s.el === el); if (i >= 0) { const s = this.shapes[i]; s.cleanup && s.cleanup(); this.shapes.splice(i, 1); this.invalidate(); } }
  setShape(el, opts) { const s = this.shapes.find(s => s.el === el); if (s) { Object.assign(s.o, opts); this._measureShape(s); this.invalidate(); } }
  set(opts) { Object.assign(this.o, opts); if ('background' in opts) this._bgVer = null; if ('sheet' in opts) this._shVer = null; if ('light' in opts) this.setLight(opts.light); this.invalidate(); }
  /** Сообщить, что содержимое canvas-слоя изменилось. */
  updateSheet() { this._shVer = null; this.invalidate(); }
  updateBackground() { this._bgVer = null; this.invalidate(); }
  invalidate() { this._dirty = true; if (!this._raf) this._raf = requestAnimationFrame(this._tick); }
  /** Перерисовывать каждый кадр в течение ms (CSS-анимации/переходы стеклянных элементов). */
  animate(ms = 400) { this._until = Math.max(this._until || 0, performance.now() + ms); this.invalidate(); }
  setLowPower(on) { this.lowPower = on; this.invalidate(); }

  /** Блик: 'fixed' | 'pointer' | 'tilt'. Для 'tilt' на iOS вызывать из обработчика нажатия (запрос разрешения). */
  async setLight(mode) {
    this.o.light = mode;
    if (mode === 'tilt' && typeof DeviceOrientationEvent !== 'undefined') {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        try { if (await DeviceOrientationEvent.requestPermission() !== 'granted') { this.o.light = 'pointer'; return false; } } catch (_) { this.o.light = 'pointer'; return false; }
      }
      if (!this._ori) { this._ori = e => { if (this.o.light !== 'tilt' || e.gamma == null) return;
        const gx = clamp(e.gamma / 35, -1, 1), gy = clamp((e.beta - 40) / 35, -1, 1);
        this._light[0].t = -0.25 - gx * 0.9; this._light[1].t = -0.85 + gy * 0.9; this.invalidate(); };
        addEventListener('deviceorientation', this._ori); }
      return true;
    }
    if (mode === 'fixed') { this._light[0].t = this.o.lightDir[0]; this._light[1].t = this.o.lightDir[1]; this.invalidate(); }
    return true;
  }

  // ------------------------------------------------------------ события
  _bind() {
    const inv = () => this.invalidate();
    const re = () => { this.shapes.forEach(s => this._measureShape(s)); this.invalidate(); };
    addEventListener('scroll', inv, { passive: true, capture: true });
    addEventListener('resize', re, { passive: true });
    window.visualViewport && visualViewport.addEventListener('resize', re, { passive: true });
    document.addEventListener('visibilitychange', inv);
    addEventListener('pointermove', e => {
      if (this.o.light !== 'pointer') return;
      const x = (e.clientX / innerWidth) * 2 - 1, y = (e.clientY / innerHeight) * 2 - 1;
      // свет «идёт» от указателя: края, обращённые к нему, ярче
      const l = Math.hypot(x, y) || 1;
      this._light[0].t = x / l * Math.min(1, l + 0.3); this._light[1].t = y / l * Math.min(1, l + 0.3) - 0.2;
      this.invalidate();
    }, { passive: true });
    if (typeof ResizeObserver !== 'undefined') this._ro = new ResizeObserver(re);
  }
  _measureShape(s) {
    const cs = getComputedStyle(s.el);
    s.w = s.el.offsetWidth; s.h = s.el.offsetHeight;
    const br = cs.borderTopLeftRadius || '0';
    s.r = s.o.radius ?? (br.includes('%') ? parseFloat(br) / 100 * Math.min(s.w, s.h) : parseFloat(br) || 0);
    this._ro && !s._obs && (this._ro.observe(s.el), s._obs = true);
  }
  _interact(s) {
    const el = s.el;
    const down = e => {
      s.pressed = true; s.scale.t = s.o.pressScale; s.glow.t = 1;
      if (s.o.draggable) { el.setPointerCapture(e.pointerId); s.drag = { x: e.clientX - s.tx, y: e.clientY - s.ty, lx: e.clientX, ly: e.clientY, lt: performance.now() }; }
      this.invalidate();
    };
    const move = e => {
      if (!s.drag) return;
      const now = performance.now(), dt = Math.max(1, now - s.drag.lt) / 1000;
      const vx = (e.clientX - s.drag.lx) / dt, vy = (e.clientY - s.drag.ly) / dt;
      s.vx = s.vx * 0.6 + vx * 0.4; s.vy = s.vy * 0.6 + vy * 0.4;
      s.drag.lx = e.clientX; s.drag.ly = e.clientY; s.drag.lt = now;
      s.tx = e.clientX - s.drag.x; s.ty = e.clientY - s.drag.y;
      el.style.translate = `${s.tx}px ${s.ty}px`;
      const sp = Math.hypot(s.vx, s.vy);
      if (sp > 30) s.ang = Math.atan2(s.vy, s.vx);
      s.sx.t = 1 + Math.min(sp / 2600, 0.38);            // растяжение вдоль скорости
      this.invalidate();
    };
    const up = () => { s.pressed = false; s.scale.t = 1; s.glow.t = 0; s.sx.t = 1; s.drag = null; s.vx = s.vy = 0; this.invalidate(); };
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
    if (s.o.draggable) el.style.touchAction = 'none';
    s.cleanup = () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
  }

  // ------------------------------------------------------------ кадр
  _tick(now) {
    this._raf = 0;
    const dt = Math.min(0.033, this._last ? (now - this._last) / 1000 : 0.016); this._last = now;
    if ((this.lowPower || this._cap30) && this._lastDraw && now - this._lastDraw < 31) { this._raf = requestAnimationFrame(this._tick); return; }
    let active = false;
    for (const s of this.shapes) {
      if (this.reducedMotion) { s.scale.v = s.scale.t; s.sx.v = s.sx.t; s.glow.v = s.glow.t; }
      else { active = s.scale.step(dt) | active; active = s.sx.step(dt) | active; active = s.glow.step(dt) | active; }
      // CSS-трансформация содержимого = та же деформация, что в шейдере
      const k = s.scale.v, e = s.sx.v;
      const a = s.ang, c = Math.cos(a), sn = Math.sin(a), A = k * e, B = k / Math.sqrt(e);
      // D = R(a)·diag(A,B)·R(−a)
      s.D = [c * c * A + sn * sn * B, c * sn * (A - B), c * sn * (A - B), sn * sn * A + c * c * B];
      const tr = `matrix(${s.D[0]},${s.D[1]},${s.D[2]},${s.D[3]},0,0)`;
      if (s._tr !== tr) { s.el.style.transform = (k === 1 && e === 1) ? '' : tr; s._tr = tr; }
    }
    if (!this.reducedMotion) { active = this._light[0].step(dt) | active; active = this._light[1].step(dt) | active; }
    else { this._light[0].v = this._light[0].t; this._light[1].v = this._light[1].t; }
    const drew = this._dirty || active;
    if (drew) {
      this._dirty = false;
      if (document.hidden) { this._dirty = true; return; }
      const t0 = performance.now(); this._uploaded = false;
      if (this.mode === 'webgl' && !this._lost) this._draw();
      const ms = performance.now() - t0;
      this.stats.frames++; if (!this._uploaded) this.stats.avgMs = this.stats.avgMs * 0.9 + ms * 0.1; this._lastDraw = now;
    }
    if (this._until && now < this._until) { active = true; this._dirty = true; }
    // динамическое разрешение: при медленных кадрах во время движения снижаем внутренний DPR,
    // в покое — дорисовываем один чёткий кадр
    const moving = drew;
    if (this.o.dynamicResolution !== false) {
      if (moving && this._prevT) {
        const lim = (this.lowPower || this._cap30) ? 40 : 22;
        const ft = now - this._prevT; this._ft = (this._ft || 16.7) * 0.8 + ft * 0.2;
        if (this._ft > lim) this._good = 0;
        if (this._ft > lim && (this._dyn || 1) > 0.5) { this._dyn = Math.max(0.5, (this._dyn || 1) * 0.78); this._ft = 16.7; }
        else if (this._ft > lim && !this._cap30) { this._cap30 = true; this.stats.capped = (this.stats.capped || 0) + 1; }
        else if (this._ft < lim * 0.7 && (this._dyn || 1) < 1 && ++this._good > 90) { this._dyn = Math.min(1, this._dyn * 1.15); this._good = 0; }
      }
      if (moving && !this._sharpDraw) this._sharp = false;
      this._sharpDraw = false;
      // уровень качества запоминается между жестами; в покое — один чёткий кадр в полном разрешении
      if (!moving && (this._dyn || 1) < 1 && !this._sharp) {
        clearTimeout(this._sharpT);
        this._sharpT = setTimeout(() => { this._sharp = true; this._sharpDraw = true; this._ft = 16.7; this.invalidate(); }, 250);
      }
    }
    this._prevT = moving ? now : 0;
    if (active || this._dirty) this._raf = requestAnimationFrame(this._tick);
  }

  _rectOf(el) { const r = el.getBoundingClientRect(); return r; }
  _coverUv(src, br) {
    const nw = src.videoWidth || src.naturalWidth || src.width, nh = src.videoHeight || src.naturalHeight || src.height;
    if (this.o.fit === 'fill' || !nw) return [0, 0, 1, 1];
    const s = this.o.fit === 'cover' ? Math.max(br.width / nw, br.height / nh) : Math.min(br.width / nw, br.height / nh);
    const sw = br.width / (nw * s), sh = br.height / (nh * s);
    return [(1 - sw) / 2, (1 - sh) / 2, sw, sh];
  }
  _luma(T, u, v) {
    const P = T.preview; if (!P) return 0.5;
    const x = clamp(u * P.w | 0, 0, P.w - 1), y = clamp(v * P.h | 0, 0, P.h - 1), i = (y * P.w + x) * 4;
    return [(0.2126 * P.d[i] + 0.7152 * P.d[i + 1] + 0.0722 * P.d[i + 2]) / 255, P.d[i + 3] / 255];
  }

  _draw() {
    const gl = this.gl, o = this.o, u = this.u;
    const base = Math.min(devicePixelRatio || 1, this.lowPower ? 1.25 : o.maxDpr);
    // шаг 0.25 — чтобы не переразмечать canvas каждый кадр
    const dpr = Math.max(Math.min(base, 1), Math.round(base * (this._sharp ? 1 : (this._dyn || 1)) * 4) / 4);
    const cr = this.cv.getBoundingClientRect();
    const W = Math.max(1, Math.round(cr.width * dpr)), H = Math.max(1, Math.round(cr.height * dpr));
    if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; }
    // текстуры
    const bg = o.background, sheet = o.sheet;
    const bgVer = bg && (bg.currentSrc || bg.src || bg) ;
    if (bg && (this._bgVer !== bgVer || bg instanceof HTMLVideoElement)) { if (this._upload('bg', bg, 2048)) this._bgVer = bgVer; else { this._dirty = true; } }
    if (sheet && this._shVer !== sheet) { if (this._upload('sheet', sheet, 4096)) this._shVer = sheet; }
    if (!bg || this._bgVer == null) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); return; }

    const bgR = bg.getBoundingClientRect();
    const bgUv = this._coverUv(bg, bgR);
    const shR = sheet ? sheet.getBoundingClientRect() : null;
    const A = this.A; let n = 0;
    const pad = 26 * dpr;
    for (const s of this.shapes) {
      if (n >= MAXS) break;
      const r = this._rectOf(s.el);
      if (r.bottom < -60 || r.top > cr.height + 60 || r.right < -60 || r.left > cr.width + 60 || !s.w) continue;
      if (!r.width || !r.height) continue;
      if (s.el.checkVisibility ? !s.el.checkVisibility({ visibilityProperty: true, checkVisibilityCSS: true }) : getComputedStyle(s.el).visibility === 'hidden') continue;
      if (!s.w) this._measureShape(s);
      const cx = (r.left + r.width / 2 - cr.left) * dpr, cy = (r.top + r.height / 2 - cr.top) * dpr;
      const hw = s.w / 2 * dpr, hh = s.h / 2 * dpr;
      const D = s.D || [1, 0, 0, 1], det = D[0] * D[3] - D[1] * D[2] || 1;
      // обратная матрица (column-major: [m00, m10, m01, m11])
      const i0 = D[3] / det, i1 = -D[1] / det, i2 = -D[2] / det, i3 = D[0] / det;
      // точный AABB деформированного прямоугольника + поля под тень/слияние
      const ex = Math.abs(D[0]) * hw + Math.abs(D[2]) * hh + pad + s.o.merge * dpr;
      const ey = Math.abs(D[1]) * hw + Math.abs(D[3]) * hh + pad + s.o.merge * dpr;
      A.rect.set([cx, cy, hw, hh], n * 4);
      A.mat.set([i0, i1, i2, i3], n * 4);
      A.p1.set([s.r * dpr, s.o.bezel * dpr, s.o.thickness * dpr, s.o.blur * dpr], n * 4);
      // тон под стеклом: обои (+ контент поверх)
      const ux = bgUv[0] + clamp((cx / dpr + cr.left - bgR.left) / bgR.width, 0, 1) * bgUv[2];
      const uy = bgUv[1] + clamp((cy / dpr + cr.top - bgR.top) / bgR.height, 0, 1) * bgUv[3];
      let [tone] = this._luma(this.tex.bg, ux, uy);
      if (shR) { const sx = (cx / dpr + cr.left - shR.left) / shR.width, sy = (cy / dpr + cr.top - shR.top) / shR.height;
        if (sx >= 0 && sy >= 0 && sx <= 1 && sy <= 1) { const [l2, a2] = this._luma(this.tex.sheet, sx, sy); tone = tone * (1 - a2) + l2 * a2; } }
      s.tone = s.tone == null ? tone : s.tone * 0.8 + tone * 0.2;
      const toneAttr = s.tone > 0.55 ? 'light' : 'dark';
      if (s.el.dataset.lgTone !== toneAttr) s.el.dataset.lgTone = toneAttr;
      A.p2.set([s.o.group, s.tone, s.glow.v, s.o.merge * dpr], n * 4);
      A.box.set([cx - ex, cy - ey, cx + ex, cy + ey], n * 4);
      n++;
    }
    this.stats.lastShapes = n;
    gl.viewport(0, 0, W, H);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    if (!n) return;
    gl.uniform2f(u.uRes, W, H); gl.uniform1i(u.uCount, n);
    gl.uniform4fv(u.uRect, A.rect); gl.uniform4fv(u.uMat, A.mat); gl.uniform4fv(u.uP1, A.p1); gl.uniform4fv(u.uP2, A.p2); gl.uniform4fv(u.uBox, A.box);
    gl.uniform4f(u.uBgRect, (bgR.left - cr.left) * dpr, (bgR.top - cr.top) * dpr, bgR.width * dpr, bgR.height * dpr);
    gl.uniform4f(u.uBgUv, bgUv[0], bgUv[1], bgUv[2], bgUv[3]);
    gl.uniform2f(u.uBgTex, this.tex.bg.w * bgUv[2] / (bgR.width * dpr), 0);
    const hasSheet = !!(shR && this._shVer);
    gl.uniform1i(u.uHasSheet, hasSheet ? 1 : 0);
    if (hasSheet) { gl.uniform4f(u.uSheetRect, (shR.left - cr.left) * dpr, (shR.top - cr.top) * dpr, shR.width * dpr, shR.height * dpr);
      gl.uniform2f(u.uSheetTex, this.tex.sheet.w / (shR.width * dpr), 0); }
    gl.uniform1f(u.uIor, o.ior); gl.uniform1f(u.uAberr, this.lowPower ? 0 : o.aberration);
    gl.uniform1f(u.uSpec, o.specular); gl.uniform1f(u.uMag, o.magnify); gl.uniform1f(u.uSat, o.saturation);
    gl.uniform1f(u.uShadow, o.shadow); gl.uniform1f(u.uDpr, dpr); gl.uniform1f(u.uTint, o.tint);
    gl.uniform2f(u.uLight, this._light[0].v, this._light[1].v);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex.bg.t);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tex.sheet.t);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
    if (!this.tex.bg.verified) this._selfTest(A, dpr, H);
  }
  /** Самопроверка после первого кадра: чёрное стекло на светлом фоне → CSS-режим. */
  _selfTest(A, dpr, H) {
    this.tex.bg.verified = true;
    const gl = this.gl, x = A.rect[0] | 0, y = A.rect[1] | 0, px = new Uint8Array(4);
    gl.readPixels(x, H - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const tone = A.p2[1];
    if (tone > 0.1 && (px[0] + px[1] + px[2] < 12 || px[3] < 8)) {
      this._fails = (this._fails || 0) + 1;
      console.warn('[LiquidGlass] самопроверка не прошла (' + this._fails + ')', [...px]);
      if (this._fails >= 2) this._toCSS(); else { this._bgVer = null; setTimeout(() => this.invalidate(), 120); }
    }
  }
  _toCSS() {
    this.mode = 'css';
    this.cv && (this.cv.style.display = 'none');
    this.shapes && this.shapes.forEach(s => this._cssItem(s));
    document.documentElement.classList.add('lg-css-fallback');
  }
  _cssItem(s) {
    const bf = `blur(${Math.max(12, s.o.blur * 6)}px) saturate(1.8)`;
    s.el.style.backdropFilter = bf; s.el.style.webkitBackdropFilter = bf;
    s.el.classList.add('lg-item--css');
  }
  destroy() { cancelAnimationFrame(this._raf); this.shapes.forEach(s => s.cleanup && s.cleanup()); this.cv && this.cv.remove(); this._ro && this._ro.disconnect(); this._ori && removeEventListener('deviceorientation', this._ori); }
}
export default GlassScene;
