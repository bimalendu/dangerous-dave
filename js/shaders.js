// GLSL for the post-processing pipeline (WebGL2).
(function (DD) {
  'use strict';

  const VERT = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

  // Separable 9-tap gaussian using linear sampling.
  const BLUR = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uDir;
in vec2 vUv;
out vec4 o;
void main() {
  vec3 c = texture(uTex, vUv).rgb * 0.2270270270;
  c += (texture(uTex, vUv + uDir * 1.3846153846).rgb + texture(uTex, vUv - uDir * 1.3846153846).rgb) * 0.3162162162;
  c += (texture(uTex, vUv + uDir * 3.2307692308).rgb + texture(uTex, vUv - uDir * 3.2307692308).rgb) * 0.0702702703;
  o = vec4(c, 1.0);
}`;

  // Final composite: heat/water distortion, point lights, bloom, grading, optional CRT.
  const COMPOSITE = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform sampler2D uEmis;
uniform sampler2D uBloom;
uniform vec2 uRes;
uniform float uTime;
uniform float uCRT;
uniform vec3 uAmbient;
uniform vec4 uLights[16];
uniform vec3 uLightCol[16];
uniform int uNumLights;
in vec2 vUv;
out vec4 o;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 uv = vUv;
  if (uCRT > 0.5) {
    vec2 c = uv * 2.0 - 1.0;
    c *= 1.0 + vec2(c.y * c.y, c.x * c.x) * vec2(0.035, 0.05);
    uv = c * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { o = vec4(0.0, 0.0, 0.0, 1.0); return; }
  }
  vec2 p = vec2(uv.x * 640.0, (1.0 - uv.y) * 400.0);          // logical pixel, y down
  float field = step(40.0, p.y) * step(p.y, 360.0);           // 1 inside the playfield, 0 on the HUD

  vec3 bl = texture(uBloom, uv).rgb;
  float heat = max(bl.r - bl.b, 0.0);
  float wet = max(bl.b - bl.r * 1.2, 0.0);
  vec2 off = vec2(sin(p.y * 0.42 + uTime * 8.0), 0.35 * cos(p.x * 0.3 + uTime * 6.0)) * heat * 0.0026
           + vec2(sin(p.x * 0.21 + uTime * 3.0), cos(p.y * 0.33 + uTime * 2.5)) * wet * 0.0022;
  off *= field;

  vec3 sc = texture(uScene, uv + off).rgb;
  vec3 em = texture(uEmis, uv + off).rgb;

  vec3 light = uAmbient;
  for (int i = 0; i < 16; i++) {
    if (i >= uNumLights) break;
    vec4 L = uLights[i];
    float a = clamp(1.0 - distance(p, L.xy) / L.z, 0.0, 1.0);
    light += uLightCol[i] * a * a;
  }
  light = mix(vec3(1.0), light, field);

  vec3 col = sc * light + em * 0.3 + bl * 0.85;
  float peak = max(col.r, max(col.g, col.b));
  col *= 1.0 / (1.0 + max(peak - 0.85, 0.0) * 0.55);          // soft shoulder, keeps hue
  col = mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, 1.08);

  vec2 q = uv - 0.5;
  col *= 1.0 - dot(q, q) * 0.75;                              // vignette
  col += (hash(uv * uRes + fract(uTime) * 61.0) - 0.5) * 0.018;

  if (uCRT > 0.5) {
    col *= 0.82 + 0.18 * sin(p.y * 6.28318 * 1.0);
    float m = mod(floor(vUv.x * uRes.x), 3.0);
    col *= vec3(m == 0.0 ? 1.06 : 0.96, m == 1.0 ? 1.06 : 0.96, m == 2.0 ? 1.06 : 0.96);
    col *= 1.12;
  }
  o = vec4(col, 1.0);
}`;

  DD.Shaders = { VERT: VERT, BLUR: BLUR, COMPOSITE: COMPOSITE };
})(globalThis.DD = globalThis.DD || {});
