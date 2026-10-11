// Raw-WebGL2 water wallpaper engine — clean-room port of the webbg-demo
// "Liquid Distortion Lab" pipeline (same author, same math), with Three.js
// replaced by ~120 lines of plain WebGL2: two programs, two RGBA16F sim
// targets ping-ponged per frame, one fullscreen triangle per pass.
//
//   sim pass  — wave-equation integration; the pointer brush and scheduled
//               drops inject pressure, borders mirror so waves reflect.
//   out pass  — the background (gradient) refracted through the sim's
//               pressure gradients, plus surface specular, shimmer,
//               chromatic aberration, color grade, vignette and grain.
//
// Everything tunable arrives as uniforms so Settings (#86) can drive the
// pipeline live without recompiles.

const VERT = `#version 300 es
  out vec2 vUv;
  void main() {
    // fullscreen triangle from gl_VertexID — no buffers, no matrices.
    // vUv (0,0) lands at clip (-1,-1): bottom-left origin, y-up — same
    // convention as the sim's mouse/drop coordinates.
    vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    vUv = p;
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  }
`;

const SIM_FRAG = `#version 300 es
  precision highp float;
  uniform sampler2D textureA;
  uniform vec2 mouse;          // sim-buffer pixels, origin bottom-left
  uniform vec2 resolution;     // sim-buffer pixels
  uniform int frame;
  uniform float waveSpeed;     // integration step (higher = faster waves)
  uniform float damping;       // per-frame pressure retention (0.99 = dies fast)
  uniform float rippleRadius;  // brush radius, UV units
  uniform float rippleStrength;
  uniform float drop;          // 1 this frame = inject a drop
  uniform vec2 dropPos;        // UV
  uniform float dropRadius;    // UV
  uniform float dropStrength;
  in vec2 vUv;
  out vec4 frag;

  void main() {
    if (frame == 0) { frag = vec4(0.0); return; }

    vec4 data = texture(textureA, vUv);
    float pressure = data.x;
    float pVel = data.y;

    vec2 texelSize = 1.0 / resolution;
    float pR = texture(textureA, vUv + vec2(texelSize.x, 0.0)).x;
    float pL = texture(textureA, vUv - vec2(texelSize.x, 0.0)).x;
    float pU = texture(textureA, vUv + vec2(0.0, texelSize.y)).x;
    float pD = texture(textureA, vUv - vec2(0.0, texelSize.y)).x;

    // mirror at the borders so waves reflect instead of vanishing
    if (vUv.x <= texelSize.x) pL = pR;
    if (vUv.x >= 1.0 - texelSize.x) pR = pL;
    if (vUv.y <= texelSize.y) pD = pU;
    if (vUv.y >= 1.0 - texelSize.y) pU = pD;

    pVel += waveSpeed * (-2.0 * pressure + pR + pL) / 4.0;
    pVel += waveSpeed * (-2.0 * pressure + pU + pD) / 4.0;
    pressure += waveSpeed * pVel * 0.85;
    pVel -= 0.004 * waveSpeed * pressure;
    pVel *= 1.0 - 0.0015 * waveSpeed;
    pressure *= damping;

    // state clamp: the explicit integrator diverges for extreme settings;
    // bounded state stays ugly-but-coherent instead of broken
    pressure = clamp(pressure, -64.0, 64.0);
    pVel = clamp(pVel, -64.0, 64.0);

    // pointer brush: continuous pressure while the pointer is near; the
    // inside mask gates it to on-screen positions
    vec2 mouseUV = mouse / resolution;
    float dist = distance(vUv, mouseUV);
    float inside = step(0.0, mouse.x) * step(mouse.x, resolution.x)
                 * step(0.0, mouse.y) * step(mouse.y, resolution.y);
    if (dist <= rippleRadius) {
      pressure += rippleStrength * (1.0 - dist / rippleRadius) * inside;
    }

    // one-shot drop (click, or the ambient rain scheduler)
    if (drop > 0.5) {
      float d = distance(vUv, dropPos);
      pressure += dropStrength * exp(-(d * d) / (2.0 * dropRadius * dropRadius));
    }

    frag = vec4(pressure, pVel, (pR - pL) * 0.5, (pU - pD) * 0.5);
  }
`;

const OUT_FRAG = `#version 300 es
  precision highp float;
  uniform sampler2D uScene;    // sim state: pressure, vel, dP/dx, dP/dy
  uniform vec2 uResolution;    // output pixels
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uGradAngle;    // degrees
  uniform float uTime;
  uniform float uDistortion;
  uniform float uNormalScale;
  uniform float uTurbulence;
  uniform float uTurbScale;
  uniform vec3 uLightDir;
  uniform float uSpecPower;
  uniform float uSpecGain;
  uniform vec3 uSpecTint;
  uniform float uChromatic;
  uniform float uShimmer;
  uniform float uBrightness;
  uniform float uContrast;
  uniform float uSaturation;
  uniform vec3 uTint;
  uniform float uTintAmount;
  uniform float uVignette;
  uniform float uVignetteRadius;
  uniform float uGrain;
  in vec2 vUv;
  out vec4 frag;

  vec3 background(vec2 uv) {
    float a = radians(uGradAngle);
    float g = 0.5 + 0.5 * dot(uv - 0.5, vec2(cos(a), sin(a)));
    return mix(uColorA, uColorB, clamp(g, 0.0, 1.0));
  }

  void main() {
    vec2 uv = vUv;
    float t = uTime * 0.25;

    vec4 data = texture(uScene, uv);
    vec2 distortion = uDistortion * data.zw;
    distortion += uTurbulence * vec2(
      sin(uv.y * uTurbScale + t * 0.8),
      cos(uv.x * uTurbScale * 0.8 + t * 0.7)
    );

    // refraction — optionally split per channel for chromatic aberration
    vec3 col;
    if (uChromatic > 0.0001) {
      col.r = background(uv + distortion * (1.0 - uChromatic * 0.5)).r;
      col.g = background(uv + distortion).g;
      col.b = background(uv + distortion * (1.0 + uChromatic * 0.5)).b;
    } else {
      col = background(uv + distortion);
    }

    // surface lighting
    vec3 normal = normalize(vec3(-data.z * uNormalScale, 0.6, -data.w * uNormalScale));
    float specular = pow(max(0.0, dot(normal, normalize(uLightDir))), uSpecPower) * uSpecGain;
    col += uSpecTint * specular;

    col *= 1.0 + 0.03 * sin(uv.y * 3.0 + t * 0.5) * uShimmer;

    // color grade
    col *= uBrightness;
    col = (col - 0.5) * uContrast + 0.5;
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(vec3(lum), col, uSaturation);
    col *= mix(vec3(1.0), uTint, uTintAmount);

    // overlay
    float r = distance(uv, vec2(0.5));
    col *= 1.0 - uVignette * smoothstep(uVignetteRadius, 1.0, r);
    float n = fract(sin(dot(uv * uResolution + mod(uTime, 10.0) * 13.7,
                            vec2(12.9898, 78.233))) * 43758.5453);
    col += (n - 0.5) * uGrain;

    frag = vec4(clamp(col, 0.0, 1.0), 1.0);
  }
`;

const OFFSCREEN = -1e5; // pointer parked outside the sim so the brush is gated off

const compile = (gl, type, src) => {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`watergl shader compile failed: ${log}`);
  }
  return sh;
};

const program = (gl, fragSrc) => {
  const p = gl.createProgram();
  const vert = compile(gl, gl.VERTEX_SHADER, VERT);
  const frag = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
  gl.attachShader(p, vert);
  gl.attachShader(p, frag);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error(`watergl link failed: ${log}`);
  }
  // linked — release the shader objects (deleting the program alone leaves
  // attached shaders alive)
  gl.detachShader(p, vert);
  gl.detachShader(p, frag);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  return p;
};

/* One-shot cached capability probe: WebGL2 with a float-renderable target.
   Lets the component choose the 2D fallback during its FIRST render (lazy
   state initializer) instead of discovering it inside an effect. */
let support;
export function waterSupported() {
  if (support === undefined) {
    try {
      const gl = document.createElement('canvas').getContext('webgl2', { antialias: false, alpha: false });
      support = !!(gl && (gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float')));
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      support = false;
    }
  }
  return support;
}

export default function createWaterEngine(canvas, params) {
  const gl = canvas.getContext('webgl2', {
    antialias: false, alpha: false, powerPreference: 'high-performance',
    preserveDrawingBuffer: true, // wallpapers composite async; keep the frame readable
  });
  if (!gl) throw new Error('watergl: WebGL2 unavailable');
  // RGBA16F render targets need one of these; without either the sim cannot
  // store signed pressure — the caller falls back to the 2D canvas FX.
  if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) {
    throw new Error('watergl: no float render-target support');
  }

  const simProg = program(gl, SIM_FRAG);
  const outProg = program(gl, OUT_FRAG);
  const locs = (p, names) => Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)]));
  const simU = locs(simProg, ['textureA', 'mouse', 'resolution', 'frame', 'waveSpeed', 'damping',
    'rippleRadius', 'rippleStrength', 'drop', 'dropPos', 'dropRadius', 'dropStrength']);
  const outU = locs(outProg, ['uScene', 'uResolution', 'uColorA', 'uColorB', 'uGradAngle', 'uTime',
    'uDistortion', 'uNormalScale', 'uTurbulence', 'uTurbScale', 'uLightDir', 'uSpecPower', 'uSpecGain',
    'uSpecTint', 'uChromatic', 'uShimmer', 'uBrightness', 'uContrast', 'uSaturation', 'uTint',
    'uTintAmount', 'uVignette', 'uVignetteRadius', 'uGrain']);
  gl.bindVertexArray(gl.createVertexArray());

  let p = structuredClone(params);
  let w = 0;
  let h = 0;
  let sw = 0;
  let sh = 0;
  let targetA = null;
  let targetB = null;
  let frame = 0;
  let time = 0;
  const mouse = { x: OFFSCREEN, y: OFFSCREEN };
  let pendingDrop = null;
  let rainCarry = 0;

  const hexToV3 = (hex) => {
    const n = parseInt(hex.replace('#', ''), 16) || 0;
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };

  const makeTarget = () => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, sw, sh);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fbo };
  };

  const clearTargets = () => {
    // frame 0 makes the sim shader emit zeros — run it into both buffers so
    // neither starts as uninitialized memory
    const run = (read, write) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
      gl.viewport(0, 0, sw, sh);
      gl.useProgram(simProg);
      gl.uniform1i(simU.textureA, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, read.tex);
      gl.uniform2f(simU.resolution, sw, sh);
      gl.uniform1i(simU.frame, 0);
      gl.uniform2f(simU.mouse, OFFSCREEN, OFFSCREEN);
      gl.uniform1f(simU.drop, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    run(targetA, targetB);
    run(targetB, targetA);
    frame = 1;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };

  const resize = (width, height) => {
    w = width;
    h = height;
    canvas.width = w;
    canvas.height = h;
    sw = Math.max(2, Math.floor(w * p.water.simScale));
    sh = Math.max(2, Math.floor(h * p.water.simScale));
    if (targetA) { gl.deleteTexture(targetA.tex); gl.deleteFramebuffer(targetA.fbo); }
    if (targetB) { gl.deleteTexture(targetB.tex); gl.deleteFramebuffer(targetB.fbo); }
    targetA = makeTarget();
    targetB = makeTarget();
    clearTargets();
  };

  const setParams = (next) => {
    const simResChanged = next.water.simScale !== p.water.simScale;
    p = structuredClone(next);
    if (simResChanged) resize(w, h); // sim buffers follow the new resolution
  };

  const setUniforms = () => {
    const u = outU;
    gl.useProgram(outProg);
    gl.uniform2f(u.uResolution, w, h);
    gl.uniform3fv(u.uColorA, hexToV3(p.bg.colorA));
    gl.uniform3fv(u.uColorB, hexToV3(p.bg.colorB));
    gl.uniform1f(u.uGradAngle, p.bg.angle);
    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uDistortion, p.optics.distortion);
    gl.uniform1f(u.uNormalScale, p.optics.normalScale);
    gl.uniform1f(u.uTurbulence, p.optics.turbulence);
    gl.uniform1f(u.uTurbScale, p.optics.turbScale);
    gl.uniform3f(u.uLightDir, p.optics.lightX, p.optics.lightY, p.optics.lightZ);
    gl.uniform1f(u.uSpecPower, p.optics.specPower);
    gl.uniform1f(u.uSpecGain, p.optics.specGain);
    gl.uniform3fv(u.uSpecTint, hexToV3(p.optics.specTint));
    gl.uniform1f(u.uChromatic, p.optics.chromatic);
    gl.uniform1f(u.uShimmer, p.optics.shimmer);
    gl.uniform1f(u.uBrightness, p.grade.brightness);
    gl.uniform1f(u.uContrast, p.grade.contrast);
    gl.uniform1f(u.uSaturation, p.grade.saturation);
    gl.uniform3fv(u.uTint, hexToV3(p.grade.tint));
    gl.uniform1f(u.uTintAmount, p.grade.tintAmount);
    gl.uniform1f(u.uVignette, p.overlay.vignette);
    gl.uniform1f(u.uVignetteRadius, p.overlay.vignetteRadius);
    gl.uniform1f(u.uGrain, p.overlay.grain);
  };

  /* One frame: integrate the sim into the other buffer, then display THE
     BUFFER JUST WRITTEN (displaying the stale one lags everything a frame). */
  const step = (dt, speed = 1) => {
    time += dt * speed;
    frame += 1;

    const s = simU;
    gl.useProgram(simProg);
    gl.uniform2f(s.mouse, mouse.x, mouse.y);
    gl.uniform1i(s.frame, frame);
    gl.uniform1f(s.waveSpeed, p.water.waveSpeed);
    gl.uniform1f(s.damping, p.water.damping);
    gl.uniform1f(s.rippleRadius, p.water.rippleRadius);
    gl.uniform1f(s.rippleStrength, p.water.rippleStrength);
    gl.uniform1f(s.dropRadius, p.water.dropRadius);
    gl.uniform1f(s.dropStrength, p.water.dropStrength);

    // one queued drop per frame (click or rain) keeps the impulse channel
    // single-valued without extra shader state
    if (pendingDrop) {
      gl.uniform2f(s.dropPos, pendingDrop[0], pendingDrop[1]);
      pendingDrop = null;
      gl.uniform1f(s.drop, 1);
    } else {
      gl.uniform1f(s.drop, 0);
    }

    if (p.water.rain && p.water.rainRate > 0) {
      rainCarry += dt * speed * p.water.rainRate;
      // one drop per frame; an explicit click drop wins over the rain
      if (rainCarry >= 1 && !pendingDrop) {
        rainCarry -= 1;
        pendingDrop = [Math.random(), Math.random()];
      }
      if (rainCarry > 3) rainCarry = 0; // clamp after tab stalls
    }

    const write = frame % 2 === 0 ? targetB : targetA;
    const read = frame % 2 === 0 ? targetA : targetB;

    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.viewport(0, 0, sw, sh);
    gl.uniform1i(s.textureA, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, read.tex);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    setUniforms();
    gl.uniform1i(outU.uScene, 0);
    gl.bindTexture(gl.TEXTURE_2D, write.tex);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  // draw one calm frame and stop — reduced-motion wallpapers get a still
  const drawStatic = () => {
    step(0, 0);
  };

  const pointer = (xSim, ySim) => { mouse.x = xSim; mouse.y = ySim; };
  const pointerOff = () => { mouse.x = OFFSCREEN; mouse.y = OFFSCREEN; };
  const addDrop = (u, v) => { pendingDrop = [u, v]; };

  const dispose = () => {
    if (targetA) { gl.deleteTexture(targetA.tex); gl.deleteFramebuffer(targetA.fbo); }
    if (targetB) { gl.deleteTexture(targetB.tex); gl.deleteFramebuffer(targetB.fbo); }
    gl.deleteProgram(simProg);
    gl.deleteProgram(outProg);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };

  resize(window.innerWidth, window.innerHeight);

  return {
    resize, step, drawStatic, setParams, pointer, pointerOff, addDrop, dispose,
    // driver/debug introspection (?water-debug): live sim counters
    debug: () => ({ frame, time, sw, sh, mouse: { ...mouse } }),
  };
}
