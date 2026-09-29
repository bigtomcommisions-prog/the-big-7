import { hexToRgb } from '../dom.ts';
import type { Scene, SceneInput } from './types.ts';

type Uniforms = Record<string, number | [number, number, number]>;

const VERT = 'attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }';

/** Shared GLSL: hashing, value noise, fbm and a twinkling starfield. */
export const COMMON = /* glsl */ `
uniform vec2 uRes;
uniform float uTime;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
vec3 starfield(vec2 p, float density, float t) {
  vec3 c = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float s = 26.0 + float(i) * 38.0;
    vec2 g = p * s + float(i) * 13.1;
    vec2 id = floor(g), f = fract(g) - 0.5;
    float h = hash(id);
    if (h > 1.0 - density * 0.09) {
      vec2 o = vec2(hash(id + 3.1), hash(id + 7.7)) - 0.5;
      float d = length(f - o * 0.6);
      float tw = 0.65 + 0.35 * sin(t * (0.8 + h * 2.5) + h * 40.0);
      c += mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.9, 0.8), hash(id + 1.3)) * smoothstep(0.1, 0.0, d) * tw * (0.35 + h * 0.65);
    }
  }
  return c;
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.warn('Homebase shader error', gl.getShaderInfoLog(s));
    return null;
  }
  return s;
}

/**
 * A full-screen fragment shader scene. `uniforms` maps the theme's params and palette to shader
 * uniforms each frame (colours as vec3, everything else as float).
 */
export function glScene(canvas: HTMLCanvasElement, frag: string, uniforms: (input: SceneInput) => Uniforms): Scene | null {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
  if (!gl) return null;
  const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
  const precision = hp && hp.precision > 0 ? 'highp' : 'mediump';
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, `precision ${precision} float;\n${COMMON}\n${frag}`);
  if (!vs || !fs) return null;
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const locs = new Map<string, WebGLUniformLocation | null>();
  const u = (name: string) => {
    if (!locs.has(name)) locs.set(name, gl.getUniformLocation(prog, name));
    return locs.get(name)!;
  };
  let lost = false;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });

  return {
    resize(w, h) {
      gl.viewport(0, 0, w, h);
    },
    frame(time, _dt, input) {
      if (lost) return;
      gl.uniform2f(u('uRes'), canvas.width, canvas.height);
      gl.uniform1f(u('uTime'), time);
      for (const [name, v] of Object.entries(uniforms(input))) {
        if (typeof v === 'number') gl.uniform1f(u(name), v);
        else gl.uniform3f(u(name), v[0], v[1], v[2]);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    destroy() {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}

const num = (v: unknown, d = 0) => (typeof v === 'number' ? v : d);
const col = (v: unknown, d = '#ffffff') => hexToRgb(typeof v === 'string' ? v : d);

// ── Event Horizon: a black hole with a lensed, Doppler-brightened accretion disk ─────────────
export const EVENT_HORIZON = /* glsl */ `
uniform vec3 uDiskA, uDiskB, uGlow;
uniform float uSize, uSpin, uTilt, uStars, uExposure, uCx, uCy;
float disk(vec2 p, float rs) {
  float r = length(p);
  float a = atan(p.y, p.x);
  float inner = rs * 1.65, outer = rs * 5.0;
  float band = smoothstep(inner, inner * 1.12, r) * (1.0 - smoothstep(inner * 1.5, outer, r));
  float swirl = fbm(vec2(r * 16.0 / rs * 0.35, a * 2.2 - uTime * uSpin * 0.9 * (rs / r)));
  float streaks = 0.55 + 0.45 * sin(r * 90.0 / rs * 0.3 - uTime * uSpin * 2.0 + swirl * 6.0);
  return band * (0.25 + swirl * 1.1) * mix(0.8, 1.0, streaks) * pow(inner / r, 1.4);
}
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y - vec2(uCx, uCy);
  float rs = uSize;
  float r = length(uv);
  // Gravitational lensing: light passing near the hole is bent, magnifying what's behind.
  float bend = (rs * rs * 2.4) / max(r * r, rs * rs * 0.6);
  vec2 lensed = uv * (1.0 + bend);
  vec3 col = starfield(lensed * 1.2, uStars, uTime) * (1.0 - bend * 0.3);
  col += uGlow * 0.05 * fbm(lensed * 2.0 + uTime * 0.01);
  // Far side of the disk, lensed up over the top of the shadow.
  vec2 pb = vec2(lensed.x, lensed.y / uTilt);
  float back = disk(pb, rs) * smoothstep(-0.02, 0.06, uv.y);
  float dopB = 0.55 + 0.45 * cos(atan(pb.y, pb.x) + 1.57);
  col += mix(uDiskB, uDiskA, clamp(back * 0.9, 0.0, 1.0)) * back * (0.6 + dopB);
  // Event horizon shadow.
  col *= smoothstep(rs * 0.97, rs * 1.05, r);
  // Near side of the disk passes in front of the hole.
  vec2 pf = vec2(uv.x, uv.y / uTilt);
  float front = disk(pf, rs) * (1.0 - smoothstep(-0.03, 0.02, uv.y));
  float dopF = 0.55 + 0.45 * cos(atan(pf.y, pf.x) + 1.57);
  col += mix(uDiskB, uDiskA, clamp(front * 0.9, 0.0, 1.0)) * front * (0.6 + dopF);
  // Photon ring and halo.
  col += uGlow * exp(-pow((r - rs * 1.09) / (rs * 0.045), 2.0)) * 1.1;
  col += uGlow * 0.08 * exp(-max(r - rs, 0.0) / (rs * 1.6));
  col = 1.0 - exp(-col * uExposure);
  gl_FragColor = vec4(col, 1.0);
}`;
export const eventHorizonUniforms = ({ params: p }: SceneInput): Uniforms => ({
  uDiskA: col(p.diskA), uDiskB: col(p.diskB), uGlow: col(p.glow), uSize: num(p.size, 0.12), uSpin: num(p.spin, 1), uTilt: num(p.tilt, 0.28), uStars: num(p.stars, 1), uExposure: num(p.exposure, 1.4), uCx: num(p.x, 0), uCy: num(p.y, 0.24),
});

// ── Aurora: layered curtains over a mountain horizon ──────────────────────────────────────────
export const AURORA = /* glsl */ `
uniform vec3 uC1, uC2, uC3, uSky;
uniform float uSpeed, uIntensity, uStars, uHeight, uMountains;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime * uSpeed;
  vec3 col = mix(uSky * 0.35, uSky, uv.y);
  float glow = 0.0;
  vec3 light = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float x = p.x * (1.1 + fi * 0.15) + fi * 0.9;
    float wave = fbm(vec2(x * 1.3 + t * 0.04 * (1.0 + fi * 0.4), fi * 3.1 + t * 0.015));
    float base = uHeight + 0.12 * sin(x * 1.7 + t * 0.08 + fi * 1.3) + (wave - 0.5) * 0.35 - fi * 0.05;
    float d = uv.y - base;
    float curtain = smoothstep(-0.015, 0.03, d) * exp(-max(d, 0.0) * (5.5 - fi * 0.6));
    float rays = 0.45 + 0.55 * fbm(vec2(x * 22.0, t * 0.25 + fi * 5.0));
    vec3 c = mix(uC1, uC2, clamp(d * 3.0, 0.0, 1.0));
    c = mix(c, uC3, clamp(d * 1.6 - 0.35, 0.0, 1.0));
    float k = curtain * rays * (0.6 - fi * 0.1);
    light += c * k;
    glow += k;
  }
  col += light * uIntensity;
  col += starfield(p * 1.4, uStars, uTime) * clamp(1.0 - glow * 2.0, 0.0, 1.0) * smoothstep(0.1, 0.5, uv.y);
  // Mountains
  float m = uMountains * (0.1 + 0.07 * fbm(vec2(p.x * 2.6, 3.0)) + 0.04 * fbm(vec2(p.x * 9.0, 1.0)));
  float m2 = uMountains * (0.06 + 0.05 * fbm(vec2(p.x * 3.4 + 7.0, 5.0)));
  col = mix(col, uSky * 0.18 + light * 0.05, smoothstep(m + 0.004, m, uv.y));
  col = mix(col, uSky * 0.08, smoothstep(m2 + 0.004, m2, uv.y));
  gl_FragColor = vec4(col, 1.0);
}`;
export const auroraUniforms = ({ params: p }: SceneInput): Uniforms => ({
  uC1: col(p.c1), uC2: col(p.c2), uC3: col(p.c3), uSky: col(p.sky), uSpeed: num(p.speed, 1), uIntensity: num(p.intensity, 1.2), uStars: num(p.stars, 1), uHeight: num(p.height, 0.42), uMountains: p.mountains === false ? 0 : 1,
});

// ── Liquid gradient: soft moving colour fields with film grain ────────────────────────────────
export const LIQUID = /* glsl */ `
uniform vec3 uC1, uC2, uC3, uC4;
uniform float uSpeed, uGrain, uSoft, uWarp;
void main() {
  vec2 p = gl_FragCoord.xy / uRes;
  p.x *= uRes.x / uRes.y;
  float t = uTime * uSpeed * 0.12;
  vec2 q = p + uWarp * 0.25 * vec2(fbm(p * 1.6 + t), fbm(p * 1.6 - t + 4.0));
  float ar = uRes.x / uRes.y;
  vec2 b1 = vec2(ar * (0.25 + 0.2 * sin(t * 1.1)), 0.3 + 0.2 * cos(t * 0.9));
  vec2 b2 = vec2(ar * (0.75 + 0.2 * cos(t * 0.8)), 0.25 + 0.2 * sin(t * 1.3));
  vec2 b3 = vec2(ar * (0.7 + 0.2 * sin(t * 0.7 + 2.0)), 0.8 + 0.15 * cos(t * 1.2));
  vec2 b4 = vec2(ar * (0.25 + 0.2 * cos(t * 1.0 + 1.0)), 0.75 + 0.18 * sin(t * 0.6));
  float k = mix(2.0, 5.0, 1.0 - uSoft);
  float w1 = 1.0 / pow(distance(q, b1) + 0.05, k);
  float w2 = 1.0 / pow(distance(q, b2) + 0.05, k);
  float w3 = 1.0 / pow(distance(q, b3) + 0.05, k);
  float w4 = 1.0 / pow(distance(q, b4) + 0.05, k);
  vec3 col = (uC1 * w1 + uC2 * w2 + uC3 * w3 + uC4 * w4) / (w1 + w2 + w3 + w4);
  col += (hash(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5) * uGrain * 0.09;
  gl_FragColor = vec4(col, 1.0);
}`;
export const liquidUniforms = ({ params: p }: SceneInput): Uniforms => ({
  uC1: col(p.c1), uC2: col(p.c2), uC3: col(p.c3), uC4: col(p.c4), uSpeed: num(p.speed, 1), uGrain: num(p.grain, 0.5), uSoft: num(p.soft, 0.6), uWarp: num(p.warp, 0.6),
});

// ── Synthwave: striped sun, mountains and a scrolling perspective grid ────────────────────────
export const SYNTHWAVE = /* glsl */ `
uniform vec3 uSkyTop, uSkyBot, uSunA, uSunB, uGrid, uGround;
uniform float uSpeed, uGlow, uStars, uSunY, uSunR;
float gridLine(float x, float w) { float f = abs(fract(x) - 0.5); return smoothstep(w, 0.0, 0.5 - f); }
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float horizon = -0.08;
  vec3 col;
  if (p.y > horizon) {
    float hy = p.y - horizon;
    col = mix(uSkyBot, uSkyTop, smoothstep(0.0, 0.55, hy));
    col += starfield(p, uStars, uTime) * smoothstep(0.15, 0.45, hy);
    vec2 sc = vec2(0.0, horizon + uSunY);
    float r = uSunR;
    float d = length(p - sc);
    vec3 sun = mix(uSunB, uSunA, smoothstep(sc.y - r, sc.y + r, p.y));
    float cut = 1.0;
    if (p.y < sc.y + 0.02) {
      float k = (sc.y + 0.02 - p.y) / (r + 0.02);
      cut = step(k * 0.55, fract(p.y * 26.0 + uTime * uSpeed * 0.35));
    }
    col = mix(col, sun, smoothstep(r + 0.003, r, d) * cut);
    col += mix(uSunB, uSunA, 0.5) * uGlow * 0.35 * exp(-max(d - r, 0.0) * 7.0);
    float m = horizon + 0.025 + 0.09 * pow(abs(fbm(vec2(p.x * 2.2, 2.0)) - 0.35), 1.2) * smoothstep(0.05, 0.7, abs(p.x));
    col = mix(col, uGround * 1.6 + uGrid * 0.05, smoothstep(m + 0.003, m, p.y));
  } else {
    float z = 0.28 / (horizon - p.y + 0.002);
    float gx = p.x * z * 1.8;
    float gz = z + uTime * uSpeed * 0.9;
    float w = clamp(0.04 * z, 0.02, 0.45);
    float lines = max(gridLine(gx, w), gridLine(gz, w));
    float fade = smoothstep(0.0, 0.25, horizon - p.y);
    col = uGround + uGrid * lines * (0.25 + 0.75 * fade) * uGlow;
    col += uGrid * 0.25 * exp(-(horizon - p.y) * 12.0) * uGlow;
  }
  gl_FragColor = vec4(col, 1.0);
}`;
export const synthwaveUniforms = ({ params: p }: SceneInput): Uniforms => ({
  uSkyTop: col(p.skyTop), uSkyBot: col(p.skyBot), uSunA: col(p.sunA), uSunB: col(p.sunB), uGrid: col(p.grid), uGround: col(p.ground), uSpeed: num(p.speed, 1), uGlow: num(p.glow, 1), uStars: num(p.stars, 0.6), uSunY: num(p.sunY, 0.03), uSunR: num(p.sunSize, 0.22),
});

// ── Lava lamp: metaballs rising and falling ───────────────────────────────────────────────────
export const LAVA = /* glsl */ `
uniform vec3 uC1, uC2, uBg1, uBg2;
uniform float uSpeed, uCount, uSize;
void main() {
  vec2 p = gl_FragCoord.xy / uRes.y;
  float ar = uRes.x / uRes.y;
  float t = uTime * uSpeed * 0.25;
  float field = 0.0;
  for (int i = 0; i < 10; i++) {
    float fi = float(i);
    if (fi >= uCount) break;
    float x = ar * (0.12 + 0.76 * fract(sin(fi * 12.9898) * 43758.5453));
    x += 0.08 * sin(t * (0.6 + fi * 0.13) + fi);
    float y = 0.5 + 0.55 * sin(t * (0.35 + fi * 0.07) + fi * 2.1);
    float r = uSize * (0.07 + 0.05 * fract(sin(fi * 78.233) * 12345.678));
    field += r * r / (dot(p - vec2(x, y), p - vec2(x, y)) + 1e-4);
  }
  vec3 bg = mix(uBg2, uBg1, gl_FragCoord.y / uRes.y);
  float edge = smoothstep(0.95, 1.05, field);
  vec3 blob = mix(uC2, uC1, clamp(gl_FragCoord.y / uRes.y + (field - 1.0) * 0.08, 0.0, 1.0));
  blob += 0.12 * smoothstep(1.4, 3.0, field);
  vec3 col = mix(bg + mix(uC2, uC1, 0.5) * 0.08 * smoothstep(0.3, 1.0, field), blob, edge);
  gl_FragColor = vec4(col, 1.0);
}`;
export const lavaUniforms = ({ params: p }: SceneInput): Uniforms => ({
  uC1: col(p.c1), uC2: col(p.c2), uBg1: col(p.bg1), uBg2: col(p.bg2), uSpeed: num(p.speed, 1), uCount: num(p.count, 7), uSize: num(p.size, 1),
});
