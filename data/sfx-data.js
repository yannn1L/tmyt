/**
 * SFX DATA — Pure sound definitions. No playback logic.
 * Edit baseFreq, type, dur, vol here to tune sounds.
 */

export const SFX_DATA = {
  START: { baseFreq: 150, type: 'sawtooth', dur: 0.6, vol: 0.10, slideUp: true },
  CRIT: { baseFreq: 800, type: 'square', dur: 0.1, vol: 0.08, slideDown: true },
  CLICK: { freq: 600, type: 'sine', dur: 0.05, vol: 0.10 },
  SPREAD: { baseFreq: 300, rndFreq: 100, type: 'sine', dur: 0.02, vol: 0.06 },
  CAPTURE: { baseFreq: 120, rndFreq: 50, type: 'square', dur: 0.10, vol: 0.04, slideDown: true },
  BURN: { baseFreq: 80, rndFreq: 40, type: 'sawtooth', dur: 0.20, vol: 0.05 },
  FREEZE: { baseFreq: 800, rndFreq: 200, type: 'sine', dur: 0.10, vol: 0.05 },
  BLOCK: { freq: 200, type: 'triangle', dur: 0.15, vol: 0.04 },
  ZAP: { baseFreq: 400, type: 'sawtooth', dur: 0.05, vol: 0.03 },
  CHIME: { baseFreq: 1200, type: 'sine', dur: 0.20, vol: 0.05 },
  VOID: { baseFreq: 100, type: 'sine', dur: 0.30, vol: 0.05 },
  SNIPE: { baseFreq: 900, type: 'square', dur: 0.05, vol: 0.03, slideDown: true },
  BOMB: { baseFreq: 60, type: 'sawtooth', dur: 0.40, vol: 0.10 },
  TOCK: { baseFreq: 1000, type: 'sine', dur: 0.02, vol: 0.05 },
  GLITCH: { baseFreq: 200, rndFreq: 600, type: 'square', dur: 0.08, vol: 0.05 },
  THUD: { baseFreq: 50, type: 'square', dur: 0.30, vol: 0.15, slideDown: true },
  WIND: { baseFreq: 300, type: 'triangle', dur: 0.10, vol: 0.03 },
  RAISE: { baseFreq: 60, type: 'sine', dur: 0.50, vol: 0.05, slideUp: true },
  SPEEDUP_1: { baseFreq: 300, type: 'square', dur: 0.10, vol: 0.05 },
  SPEEDUP_2: { baseFreq: 500, type: 'square', dur: 0.20, vol: 0.05 },
  LAST_1: { freq: 600, type: 'square', dur: 0.10, vol: 0.05 },
  LAST_2: { freq: 880, type: 'square', dur: 0.40, vol: 0.05 },
  WIN_1: { freq: 440, type: 'sine', dur: 0.20, vol: 0.10 },
  WIN_2: { freq: 660, type: 'sine', dur: 0.40, vol: 0.10 }
};

export const SFX_COMPOSITE = {
  SPEEDUP: { first: 'SPEEDUP_1', second: 'SPEEDUP_2', delayMs: 100, freqMult1: 50, freqMult2: 80 },
  LASTONE: { first: 'LAST_1', second: 'LAST_2', delayMs: 100, freq1: 600, freq2: 880 },
  WIN: { first: 'WIN_1', second: 'WIN_2', delayMs: 200, freq1: 440, freq2: 660 }
};

if (typeof window !== 'undefined') {
  window.SFX_DATA = SFX_DATA;
  window.SFX_COMPOSITE = SFX_COMPOSITE;
}