/**
 * UI CONFIG — Layout, styling, CRT shader, background animation.
 * Pure data. Global-scope safe (var → auto window property).
 */
'use strict';

var UI_CONFIG = {
  LAYOUT: {
    SIM_SCALE: 2.4,
    CANVAS_SIZE: 320,
    GAME_CONTAINER_SIZE: 320,
    CSS_VAR_SIM_SCALE: '--sim-scale'
  },
  
  CRT: {
    ENABLED: true,
    SCANLINE_INTENSITY: 0.05,
    VIGNETTE: 0.1,
    CHROMATIC_ABERRATION: 0.002,
    NOISE: 0.08,
    TIME_INCREMENT: 0.03,
    FRAG_SHADER: [
      'varying vec2 vTextureCoord;',
      'uniform sampler2D uSampler;',
      'uniform float uTime;',
      'uniform float uScanline;',
      'uniform float uVignette;',
      'uniform float uAberration;',
      'uniform float uNoise;',
      '',
      'float rand(vec2 co){',
      '    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);',
      '}',
      '',
      'void main(void) {',
      '    vec2 uv = vTextureCoord;',
      '    float r = texture2D(uSampler, uv + vec2(uAberration, 0.0)).r;',
      '    float g = texture2D(uSampler, uv).g;',
      '    float b = texture2D(uSampler, uv - vec2(uAberration, 0.0)).b;',
      '    vec4 color = vec4(r, g, b, 1.0);',
      '    float scanline = sin(uv.y * 800.0 + uTime * 10.0) * uScanline;',
      '    color.rgb -= scanline;',
      '    float noise = (rand(uv + uTime) - 0.5) * uNoise;',
      '    color.rgb += noise;',
      '    vec2 dist = uv - 0.5;',
      '    color.rgb *= 1.0 - dot(dist, dist) * uVignette;',
      '    gl_FragColor = vec4(color.rgb, texture2D(uSampler, uv).a);',
      '}'
    ].join('\n')
  },
  
  BACKGROUND: {
    ENABLED: false,
    PARTICLE_COUNT: 40,
    GRID_SIZE: 60,
    GRID_SPEED: 0.15,
    GRID_LINE_WIDTH: 1,
    GRID_ALPHA: 0.05,
    HUE_SPEED: 0.5,
    PARTICLE_ALPHA: 0.04,
    PARTICLE_SIZE_MIN: 20,
    PARTICLE_SIZE_MAX: 60,
    PARTICLE_VELOCITY: 0.4,
    PARTICLE_BOB_AMP: 15,
    PARTICLE_BOB_SPEED: 0.01,
    BOUNDS_PADDING: 50
  },
  
  ANIMATION: {
    WINNER_HOLD_MS: 2500,
    WINNER_DELAY_MS: 500,
    LOADING_YIELD_EVERY: 4
  }
};

if (typeof window !== 'undefined') window.UI_CONFIG = UI_CONFIG;