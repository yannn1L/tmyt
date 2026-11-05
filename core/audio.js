/**
 * AUDIO SERVICE — Safe, robust Web Audio wrapper.
 * ES module with zero-allocation composite playback.
 */

import { SFX_DATA } from '../data/sfx-data.js';
import { CONFIG, Utils } from './config.js';

export const AudioService = {
  ctx: null,
  _disabled: false,
  muted: false,

  setMuted: function(muted) {
    this.muted = !!muted;
  },

  init: function() {
    if (this._disabled || typeof window === 'undefined') return;
    try {
      if (!this.ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { this._disabled = true; return; }
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) {
      this._disabled = true;
      console.warn('[Audio] Init failed, disabling:', e.message);
    }
  },

  play: function(cfg, dynamicFreq) {
    if (!this.ctx || !cfg || this._disabled || this.muted) return;
    if (dynamicFreq === undefined) dynamicFreq = 0;
    try {
      var now = this.ctx.currentTime;
      var osc = this.ctx.createOscillator();
      var gain = this.ctx.createGain();

      osc.type = cfg.type;
      var baseFreq = cfg.freq || (cfg.baseFreq + dynamicFreq);
      osc.frequency.setValueAtTime(baseFreq, now);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(cfg.vol, now + 0.01);

      if (cfg.slideDown) osc.frequency.exponentialRampToValueAtTime(10, now + cfg.dur);
      if (cfg.slideUp) osc.frequency.exponentialRampToValueAtTime(baseFreq * 4, now + cfg.dur);

      gain.gain.exponentialRampToValueAtTime(0.001, now + cfg.dur);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + cfg.dur);
    } catch (e) { /* silent */ }
  },

  playComposite: function(comp) {
    if (!comp || this._disabled) return;
    var first = SFX_DATA[comp.first];
    var second = SFX_DATA[comp.second];
    if (comp.freq1 !== undefined) first.freq = comp.freq1;
    if (comp.freq2 !== undefined) second.freq = comp.freq2;
    this.play(first, 0);
    setTimeout(function() {
      AudioService.play(second, 0);
    }, comp.delayMs || 100);
  },

  sfx: {
    start: function() { AudioService.play(SFX_DATA.START); },
    crit: function() { AudioService.play(SFX_DATA.CRIT); },
    click: function() { AudioService.play(SFX_DATA.CLICK); },
    spread: function() { AudioService.play(SFX_DATA.SPREAD, Utils.fastRNG() * SFX_DATA.SPREAD.rndFreq); },
    capture: function() { AudioService.play(SFX_DATA.CAPTURE, Utils.fastRNG() * SFX_DATA.CAPTURE.rndFreq); },
    burn: function() { AudioService.play(SFX_DATA.BURN, Utils.fastRNG() * SFX_DATA.BURN.rndFreq); },
    freeze: function() { AudioService.play(SFX_DATA.FREEZE, Utils.fastRNG() * SFX_DATA.FREEZE.rndFreq); },
    block: function() { AudioService.play(SFX_DATA.BLOCK); },
    zap: function() { AudioService.play(SFX_DATA.ZAP); },
    chime: function() { AudioService.play(SFX_DATA.CHIME); },
    void: function() { AudioService.play(SFX_DATA.VOID); },
    snipe: function() { AudioService.play(SFX_DATA.SNIPE); },
    bomb: function() { AudioService.play(SFX_DATA.BOMB); },
    tock: function() { AudioService.play(SFX_DATA.TOCK); },
    glitch: function() { AudioService.play(SFX_DATA.GLITCH, Utils.fastRNG() * SFX_DATA.GLITCH.rndFreq); },
    thud: function() { AudioService.play(SFX_DATA.THUD); },
    wind: function() { AudioService.play(SFX_DATA.WIND); },
    raise: function() { AudioService.play(SFX_DATA.RAISE); },
    speedup: function(lvl) {
      var comp = CONFIG.SFX_COMPOSITE.SPEEDUP;
      AudioService.play(SFX_DATA[comp.first], lvl * comp.freqMult1);
      setTimeout(function() {
        AudioService.play(SFX_DATA[comp.second], lvl * comp.freqMult2);
      }, comp.delayMs);
    },
    lastone: function() { AudioService.playComposite(CONFIG.SFX_COMPOSITE.LASTONE); },
    win: function() { AudioService.playComposite(CONFIG.SFX_COMPOSITE.WIN); }
  }
};

if (typeof window !== 'undefined') {
  window.AudioService = AudioService;
}