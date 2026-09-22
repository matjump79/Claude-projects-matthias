// render.js — the accumulation renderer.
//
// This scene exists to produce ONE photograph, not to run at frame rate, which
// changes what is worth doing. Instead of approximating soft light with a post
// process, the frame is rendered many times and averaged, and on every pass:
//
//   * the camera is jittered by a fraction of a pixel, which gives proper
//     analytic antialiasing rather than 4x MSAA on the geometry edges only;
//   * the sun is jittered inside its own angular diameter, which softens the
//     shadow edge exactly as the real penumbra does;
//   * a second shadow-casting light is aimed along a fresh cosine-weighted
//     direction over the sky hemisphere, with the sky's colour in that
//     direction.
//
// That last one is the important one. Averaged over enough passes it IS ambient
// occlusion — not a screen-space guess at it, but the real thing: the sky is
// sampled as an area source and anything that blocks part of the sky darkens by
// exactly the fraction it blocks. It is why the eaves, the alleys, the undersides
// of the jetties and the ground beneath the trees go dark on their own.
//
// It is also why nothing here has a screen-space pass: screen-space effects
// sample outside the tile they are drawn in, and this frame is rendered in
// tiles. Doing the light properly sidesteps the whole problem.

import * as THREE from '../vendor/three.module.js';

const FS_VERT = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/** Adds one HDR sample into the accumulation buffer. */
const ACCUM_FRAG = `
  uniform sampler2D tSample;
  varying vec2 vUv;
  void main() { gl_FragColor = vec4(texture2D(tSample, vUv).rgb, 1.0); }
`;

/**
 * Divide by the sample count, then grade.
 *
 * ACES for the tone curve, then a small amount of the things a real lens and a
 * real film stock do: a warm lift in the highlights and a cool one in the
 * shadows, a gentle saturation push, a vignette, and enough grain to stop the
 * sky banding.
 */
const RESOLVE_FRAG = `
  uniform sampler2D tAccum;
  uniform float uSamples;
  uniform float uExposure;
  uniform float uVignette;
  uniform float uGrain;
  uniform float uSaturation;
  uniform vec3  uLift;
  uniform vec3  uGain;
  uniform vec2  uFullRes;
  uniform vec2  uTileOrigin;
  uniform vec2  uTileSize;
  varying vec2 vUv;

  vec3 aces(vec3 x) {
    const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec3 col = texture2D(tAccum, vUv).rgb / max(uSamples, 1.0);
    col *= uExposure;

    // lift/gain split-tone, applied in linear light
    col = col * uGain + uLift * (1.0 - smoothstep(0.0, 0.35, col));

    col = aces(col);

    // saturation about luma
    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(vec3(l), col, uSaturation);

    // Vignette, computed against the FULL frame rather than the tile, or every
    // tile would get its own dark corners and the seams would show.
    vec2 p = (uTileOrigin + vUv * uTileSize) / uFullRes - 0.5;
    float r = length(p * vec2(1.0, 0.86));
    col *= mix(1.0, 1.0 - uVignette, smoothstep(0.32, 0.86, r));

    // grain
    float g = (hash(gl_FragCoord.xy * 0.017 + 3.7) - 0.5) * uGrain;
    col += g;

    gl_FragColor = vec4(max(col, 0.0), 1.0);
  }
`;

export class Accumulator {
  constructor(renderer, width, height) {
    this.renderer = renderer;
    this.w = width;
    this.h = height;

    const opts = {
      type: THREE.FloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      stencilBuffer: false,
      colorSpace: THREE.LinearSRGBColorSpace,
    };
    this.sampleRT = new THREE.WebGLRenderTarget(width, height, { ...opts, samples: 0 });
    this.accumRT = new THREE.WebGLRenderTarget(width, height, { ...opts, depthBuffer: false });

    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geo = new THREE.PlaneGeometry(2, 2);

    this.accumMat = new THREE.ShaderMaterial({
      uniforms: { tSample: { value: this.sampleRT.texture } },
      vertexShader: FS_VERT,
      fragmentShader: ACCUM_FRAG,
      blending: THREE.AdditiveBlending,
      depthTest: false, depthWrite: false,
    });
    this.resolveMat = new THREE.ShaderMaterial({
      uniforms: {
        tAccum: { value: this.accumRT.texture },
        uSamples: { value: 1 },
        uExposure: { value: 1.0 },
        uVignette: { value: 0.26 },
        uGrain: { value: 0.006 },
        uSaturation: { value: 1.18 },
        uLift: { value: new THREE.Vector3(0.002, 0.004, 0.009) },
        uGain: { value: new THREE.Vector3(1.05, 1.005, 0.95) },
        uFullRes: { value: new THREE.Vector2(width, height) },
        uTileOrigin: { value: new THREE.Vector2(0, 0) },
        uTileSize: { value: new THREE.Vector2(width, height) },
      },
      vertexShader: FS_VERT,
      fragmentShader: RESOLVE_FRAG,
      depthTest: false, depthWrite: false,
    });

    this.accumQuad = new THREE.Mesh(geo, this.accumMat);
    this.accumQuad.frustumCulled = false;
    this.resolveQuad = new THREE.Mesh(geo, this.resolveMat);
    this.resolveQuad.frustumCulled = false;
  }

  clear() {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.accumRT);
    r.setClearColor(0x000000, 1);
    r.clear(true, false, false);
    r.setRenderTarget(prev);
  }

  /** Render one pass of the scene and fold it into the accumulation buffer. */
  add(scene, camera) {
    const r = this.renderer;
    r.setRenderTarget(this.sampleRT);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
    r.render(scene, camera);

    // The additive blend into the accumulation buffer only works if the buffer
    // is NOT cleared first. renderer.render() clears its target by default, so
    // every pass would wipe the sum and leave just the last one — an image that
    // comes out exactly `samples` times too dark.
    const wasAutoClear = r.autoClear;
    r.autoClear = false;
    this.quadScene.clear();
    this.quadScene.add(this.accumQuad);
    r.setRenderTarget(this.accumRT);
    r.render(this.quadScene, this.quadCam);
    r.autoClear = wasAutoClear;
    r.setRenderTarget(null);
  }

  /** Average, grade and present. */
  resolve(samples, tileOrigin, tileSize, fullRes) {
    const r = this.renderer;
    const u = this.resolveMat.uniforms;
    u.uSamples.value = samples;
    if (tileOrigin) u.uTileOrigin.value.set(tileOrigin[0], tileOrigin[1]);
    if (tileSize) u.uTileSize.value.set(tileSize[0], tileSize[1]);
    if (fullRes) u.uFullRes.value.set(fullRes[0], fullRes[1]);
    this.quadScene.clear();
    this.quadScene.add(this.resolveQuad);
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCam);
  }

  get grade() { return this.resolveMat.uniforms; }
}

/** Cosine-weighted direction over the upper hemisphere. */
export function cosineHemisphere(rand) {
  const u1 = rand(), u2 = rand();
  const r = Math.sqrt(u1), phi = 2 * Math.PI * u2;
  return new THREE.Vector3(r * Math.cos(phi), Math.sqrt(Math.max(0, 1 - u1)), r * Math.sin(phi));
}

/** A small random rotation of `dir` inside a cone of the given half-angle. */
export function jitterCone(dir, halfAngleRad, rand, out) {
  const u1 = rand(), u2 = rand();
  const cosT = 1 - u1 * (1 - Math.cos(halfAngleRad));
  const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
  const phi = 2 * Math.PI * u2;
  // build a frame around dir
  const w = out.copy(dir).normalize();
  const helper = Math.abs(w.y) < 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(helper, w).normalize();
  const v = new THREE.Vector3().crossVectors(w, u);
  return out.set(0, 0, 0)
    .addScaledVector(u, Math.cos(phi) * sinT)
    .addScaledVector(v, Math.sin(phi) * sinT)
    .addScaledVector(w, cosT)
    .normalize();
}

/**
 * The colour of the sky in a given direction, matching the dome's gradient.
 * Used to tint each hemisphere sample, so the ambient light is blue from
 * overhead and warm near the horizon, as it actually is.
 */
export function skyColour(dir, sunDir, out) {
  const h = Math.max(-1, Math.min(1, dir.y));
  const t = Math.pow(Math.max(0, h), 0.55);
  // horizon -> zenith
  const r = 0.86 * (1 - t) + 0.16 * t;
  const g = 0.84 * (1 - t) + 0.34 * t;
  const b = 0.70 * (1 - t) + 0.72 * t;
  // a warm bias on the sun's side of the sky
  const c = Math.max(0, dir.dot(sunDir));
  const warm = Math.pow(c, 3.0) * 0.35;
  return out.setRGB(r + warm * 0.30, g + warm * 0.18, b);
}
