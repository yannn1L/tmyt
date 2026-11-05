/**
 * RENDERER — Pixi app, texture baking, per-frame render.
 * 
 * FIX v4:
 *   - freezeOverlay / unfreezeOverlay (cegah VFX hilang saat win)
 *   - Overlay skip render saat frozen
 *   - Robust null-safe reads untuk compiled hooks
 */
'use strict';

var Renderer = {
    app: null,
    gridContainer: null,
    gridSprites: [],
    overlayGraphics: null,
    bakedTextures: {},
    frameCount: 0,
    shakeTime: 0,
    isRendering: false,
    fullRedraw: true,
    crtFilter: null,

    sumX: new Int32Array(FACTION_COUNT),
    sumY: new Int32Array(FACTION_COUNT),
    count: new Int32Array(FACTION_COUNT),
    centroids: null,
    dirtyCells: new Uint8Array(CONFIG.GRID.TOTAL),
    animTimers: new Float32Array(CONFIG.GRID.TOTAL),

    _overlayFrameSkip: 0,
    _overlayFrozen: false,

    init: function() {
        this.centroids = new Array(FACTION_COUNT);
        for (var i = 0; i < FACTION_COUNT; i++) {
            this.centroids[i] = { x: 0, y: 0, active: false, emote: '', obj: null, _emoteSet: false };
        }

        this.app = new PIXI.Application({
            width: CONFIG.LAYOUT.CANVAS_SIZE,
            height: CONFIG.LAYOUT.CANVAS_SIZE,
            backgroundAlpha: 0,
            resolution: 1,
            antialias: false,
            powerPreference: 'high-performance'
        });
        PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;
        PIXI.settings.RENDER_OPTIONS = PIXI.settings.RENDER_OPTIONS || {};
        PIXI.settings.GC_MODE = PIXI.GC_MODES.AUTO;
        PIXI.settings.GC_MAX_IDLE = 120;

        document.getElementById(CONFIG.UI.PIXI_CONTAINER).appendChild(this.app.view);

        this.gridContainer = new PIXI.Container();
        this.app.stage.addChild(this.gridContainer);

        var half = CONFIG.GRID.HALF_SIZE;
        for (var s = 0; s < CONFIG.GRID.TOTAL; s++) {
            var spr = new PIXI.Sprite(PIXI.Texture.EMPTY);
            spr.anchor.set(0.5);
            spr.x = Utils.getX(s) * CONFIG.GRID.SIZE + half;
            spr.y = Utils.getY(s) * CONFIG.GRID.SIZE + half;
            this.gridContainer.addChild(spr);
            this.gridSprites[s] = spr;
        }

        this.overlayGraphics = new PIXI.Graphics();
        this.app.stage.addChild(this.overlayGraphics);

        var cStyle = new PIXI.TextStyle({
            fontFamily: 'sans-serif',
            fontSize: 22,
            fill: '#ffffff',
            dropShadow: true,
            dropShadowColor: '#000000',
            dropShadowAlpha: 0.6,
            dropShadowBlur: 0,
            dropShadowDistance: 2,
            dropShadowAngle: Math.PI / 2
        });
        for (var t = 0; t < FACTION_COUNT; t++) {
            var text = new PIXI.Text('', cStyle);
            text.anchor.set(0.5);
            text.visible = false;
            this.app.stage.addChild(text);
            this.centroids[t].obj = text;
        }

        VFX.init(this.app.stage);

        if (CONFIG.CRT.ENABLED) {
            var uniforms = {
                uTime: 0.0,
                uScanline: CONFIG.CRT.SCANLINE_INTENSITY,
                uVignette: CONFIG.CRT.VIGNETTE,
                uAberration: CONFIG.CRT.CHROMATIC_ABERRATION,
                uNoise: CONFIG.CRT.NOISE
            };
            this.crtFilter = new PIXI.Filter(null, CONFIG.CRT.FRAG_SHADER, uniforms);
            this.app.stage.filters = [this.crtFilter];
        }

        var self = this;
        this.app.ticker.add(function() { self.render(); });
        this.app.ticker.maxFPS = 60;
    },

    /**
     * Freeze overlay — saat win, VFX overlay (mecha/bastion/nature)
     * tidak di-clear, sehingga tetap terlihat.
     */
    freezeOverlay: function() {
        this._overlayFrozen = true;
    },

    /**
     * Unfreeze overlay — saat battle baru mulai.
     */
    unfreezeOverlay: function() {
        this._overlayFrozen = false;
        this._overlayFrameSkip = 0;
    },

    reset: function() {
        for (var i = 0; i < this.centroids.length; i++) {
            var c = this.centroids[i];
            c.active = false;
            c._emoteSet = false;
            if (c.obj) c.obj.visible = false;
        }
        if (this.overlayGraphics) this.overlayGraphics.clear();
        this.shakeTime = 0;
        this.app.stage.x = 0;
        this.app.stage.y = 0;
        this.dirtyCells.fill(0);
        this.animTimers.fill(0);
        for (var j = 0; j < CONFIG.GRID.TOTAL; j++) {
            if (WorldState.grid[j] !== -1) this.animTimers[j] = CONFIG.VFX.BOUNCE.DURATION;
        }
        this.fullRedraw = true;
        this._overlayFrameSkip = 0;
        this._overlayFrozen = false;
        if (this.crtFilter) this.crtFilter.uniforms.uTime = 0;
    },

    bakeAssets: async function() {
        for (var oldId in this.bakedTextures) {
            if (this.bakedTextures.hasOwnProperty(oldId)) {
                var oldArr = this.bakedTextures[oldId];
                for (var om = 0; om < oldArr.length; om++) {
                    if (oldArr[om] && oldArr[om].destroy) oldArr[om].destroy(true);
                }
            }
        }
        this.bakedTextures = {};

        var fillBar = document.getElementById(CONFIG.UI.LOADING_FILL);
        var totalBakes = FACTION_COUNT * 16;
        var progress = 0;
        var yieldEvery = CONFIG.ANIMATION.LOADING_YIELD_EVERY;

        for (var fIdx = 0; fIdx < FACTION_COUNT; fIdx++) {
            var fac = FACTIONS[fIdx];
            this.bakedTextures[fac.id] = [];
            for (var mask = 0; mask < 16; mask++) {
                var cvs = document.createElement('canvas');
                cvs.width = CONFIG.GRID.SIZE;
                cvs.height = CONFIG.GRID.SIZE;
                var c = cvs.getContext('2d');
                c.fillStyle = fac.icon.color;
                var q = CONFIG.GRID.SIZE / 4;
                c.fillRect(q, q, q * 2, q * 2);
                if (mask & 1) c.fillRect(q, 0, q * 2, q);
                if (mask & 2) c.fillRect(q * 3, q, q, q * 2);
                if (mask & 4) c.fillRect(q, q * 3, q * 2, q);
                if (mask & 8) c.fillRect(0, q, q, q * 2);

                this.bakedTextures[fac.id][mask] = PIXI.Texture.from(cvs);
                progress++;
                fillBar.style.width = ((progress / totalBakes) * 100) + '%';
                if (mask % yieldEvery === 0) await new Promise(function(r) { setTimeout(r, 0); });
            }
        }
    },

    updateTileTexture: function(idx) {
        var owner = WorldState.grid[idx];
        if (owner === -1) {
            this.gridSprites[idx].texture = PIXI.Texture.EMPTY;
            return;
        }
        var x = Utils.getX(idx), y = Utils.getY(idx);
        var mask = 0;
        if (y > 0 && WorldState.grid[idx - CONFIG.GRID.COLS] === owner) mask |= 1;
        if (x < CONFIG.GRID.COLS - 1 && WorldState.grid[idx + 1] === owner) mask |= 2;
        if (y < CONFIG.GRID.ROWS - 1 && WorldState.grid[idx + CONFIG.GRID.COLS] === owner) mask |= 4;
        if (x > 0 && WorldState.grid[idx - 1] === owner) mask |= 8;
        this.gridSprites[idx].texture = this.bakedTextures[owner][mask];
    },

    render: function() {
        if (!this.isRendering) return;
        this.frameCount++;

        if (this.crtFilter) this.crtFilter.uniforms.uTime += CONFIG.CRT.TIME_INCREMENT;

        var reqShake = WorldState.consumeShake();
        if (reqShake > this.shakeTime) this.shakeTime = reqShake;

        if (this.shakeTime > 0) {
            this.app.stage.x = Math.round((Utils.fastRNG() - 0.5) * this.shakeTime);
            this.app.stage.y = Math.round((Utils.fastRNG() - 0.5) * this.shakeTime);
            this.shakeTime--;
        } else {
            this.app.stage.x = 0;
            this.app.stage.y = 0;
        }

        // Tile texture updates
        if (this.fullRedraw) {
            for (var i = 0; i < CONFIG.GRID.TOTAL; i++) {
                this.updateTileTexture(i);
                this.gridSprites[i].tint = 0xFFFFFF;
            }
            this.fullRedraw = false;
        } else {
            for (var k = 0; k < CONFIG.GRID.TOTAL; k++) {
                if (this.dirtyCells[k]) {
                    this.updateTileTexture(k);
                    if (WorldState.grid[k] !== -1) this.animTimers[k] = CONFIG.VFX.BOUNCE.DURATION;
                    this.dirtyCells[k] = 0;
                }
            }
        }

        // Bounce animation
        var bnc = CONFIG.VFX.BOUNCE;
        for (var b = 0; b < CONFIG.GRID.TOTAL; b++) {
            if (this.animTimers[b] > 0) {
                this.animTimers[b] -= bnc.DECAY;
                if (this.animTimers[b] <= 0) {
                    this.gridSprites[b].scale.set(1);
                    this.animTimers[b] = 0;
                } else {
                    var p = 1.0 - this.animTimers[b];
                    var s = 1 + Math.sin(p * Math.PI * bnc.ELASTICITY) * bnc.MULTIPLIER * (1 - p);
                    this.gridSprites[b].scale.set(s);
                }
            }
        }

        // Overlay — FIX: skip update kalau frozen
        if (!this._overlayFrozen) {
            this._overlayFrameSkip = (this._overlayFrameSkip + 1) % 2;
            if (this._overlayFrameSkip === 0 || this.fullRedraw) {
                this._renderOverlay();
            }
        }

        // Centroids (emote)
        for (var ci = 0; ci < FACTION_COUNT; ci++) {
            var c = this.centroids[ci];
            if (c.active) {
                if (!c._emoteSet) {
                    c.obj.text = c.emote;
                    c._emoteSet = true;
                }
                var floatY = Math.round(Utils.fastSin((this.frameCount * 8) % 512) * 3);
                c.obj.x = c.x;
                c.obj.y = c.y + floatY;
                c.obj.visible = true;
            } else {
                c.obj.visible = false;
            }
        }

        VFX.updateAndDraw();
    },

    _renderOverlay: function() {
        this.overlayGraphics.clear();
        var frame = this.frameCount;
        var activeVfxKeys = CONFIG.ACTIVE_VFX_KEYS;
        var activeTileKeys = CONFIG.ACTIVE_TILE_KEYS;
        var hooksMap = CONFIG.ACTIVE_HOOKS;

        // Tile logic (per owned cell)
        if (activeTileKeys.length > 0) {
            for (var idx = 0; idx < CONFIG.GRID.TOTAL; idx++) {
                var owner = WorldState.grid[idx];
                if (owner === -1) continue;
                var fac = WorldState.factions[owner];
                var compiled = fac._compiled;
                if (!compiled || !compiled.onRenderTileLogic) continue;
                if (activeTileKeys.indexOf(fac.key) !== -1) {
                    compiled.onRenderTileLogic(
                        this.overlayGraphics,
                        Utils.getX(idx), Utils.getY(idx), idx, 0, frame, fac
                    );
                }
            }
        }

        // Hazard VFX (per active faction)
        for (var vk = 0; vk < activeVfxKeys.length; vk++) {
            var vKey = activeVfxKeys[vk];
            var facV = FACTIONS_BY_KEY[vKey];
            var compiledV = hooksMap[vKey];
            if (!compiledV || !compiledV.onRenderVFX) continue;

            var hasExtra = facV.params && facV.params.extraLayers && facV.params.extraLayers.length > 0;
            var mainLayer = WorldState.layers[vKey];
            if (!mainLayer) continue;

            for (var idx2 = 0; idx2 < CONFIG.GRID.TOTAL; idx2++) {
                var isActive = mainLayer[idx2] > 0;
                if (!isActive && hasExtra) {
                    for (var el = 0; el < facV.params.extraLayers.length; el++) {
                        var arr = WorldState.layers[facV.params.extraLayers[el]];
                        if (arr && arr[idx2] > 0) { isActive = true; break; }
                    }
                }
                if (isActive) {
                    compiledV.onRenderVFX(
                        this.overlayGraphics,
                        Utils.getX(idx2), Utils.getY(idx2), idx2, frame, facV
                    );
                }
            }
        }
    }
};

/**
 * ============================================================
 * RETRO BACKGROUND — Pre-rendered emoji + 30fps throttle
 * ============================================================
 */
var RetroBackground = {
    canvas: null,
    ctx: null,
    rafId: 0,
    running: false,
    _w: 0,
    _h: 0,
    _emojiCache: {},
    _particles: [],
    _time: 0,
    _lastDraw: 0,
    _frameInterval: 1000 / 30,
    _resizeHandler: null,

    start: function() {
        if (!CONFIG.BACKGROUND.ENABLED || this.running) return;
        this.running = true;
        this._time = 0;
        this._lastDraw = 0;

        var cfg = CONFIG.BACKGROUND;

        // Pre-render emoji
        var EMOJI_PRECISION = 128;
        for (var f = 0; f < FACTIONS.length; f++) {
            var em = FACTIONS[f].icon.unicode;
            if (!em || this._emojiCache[em]) continue;
            var ec = document.createElement('canvas');
            ec.width = EMOJI_PRECISION;
            ec.height = EMOJI_PRECISION;
            var ecx = ec.getContext('2d');
            ecx.font = (EMOJI_PRECISION * 0.7) + 'px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
            ecx.textAlign = 'center';
            ecx.textBaseline = 'middle';
            ecx.fillText(em, EMOJI_PRECISION / 2, EMOJI_PRECISION / 2);
            this._emojiCache[em] = ec;
        }

        var c = document.createElement('canvas');
        c.style.position = 'fixed';
        c.style.top = '0';
        c.style.left = '0';
        c.style.width = '100vw';
        c.style.height = '100vh';
        c.style.zIndex = '-1';
        c.style.pointerEvents = 'none';
        document.body.appendChild(c);
        this.canvas = c;
        this.ctx = c.getContext('2d', { alpha: true });

        this._w = c.width = window.innerWidth;
        this._h = c.height = window.innerHeight;

        var self = this;
        var resizeTimer = 0;
        this._resizeHandler = function() {
            if (resizeTimer) clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function() {
                if (!self.canvas) return;
                self._w = self.canvas.width = window.innerWidth;
                self._h = self.canvas.height = window.innerHeight;
            }, 150);
        };
        window.addEventListener('resize', this._resizeHandler);

        var emojis = [];
        for (var k = 0; k < FACTIONS.length; k++) {
            if (FACTIONS[k].icon.unicode) emojis.push(FACTIONS[k].icon.unicode);
        }

        this._particles = new Array(cfg.PARTICLE_COUNT);
        for (var i = 0; i < cfg.PARTICLE_COUNT; i++) {
            this._particles[i] = {
                x: Math.random() * this._w,
                y: Math.random() * this._h,
                vx: (Math.random() - 0.5) * cfg.PARTICLE_VELOCITY,
                vy: (Math.random() - 0.5) * cfg.PARTICLE_VELOCITY,
                emote: emojis[(Math.random() * emojis.length) | 0],
                size: cfg.PARTICLE_SIZE_MIN + Math.random() * (cfg.PARTICLE_SIZE_MAX - cfg.PARTICLE_SIZE_MIN),
                phase: Math.random() * Math.PI * 2
            };
        }

        this._rafId = requestAnimationFrame(function(now) { self._draw(now); });
    },

    _draw: function(now) {
        if (!this.running) return;
        var self = this;
        this._rafId = requestAnimationFrame(function(n) { self._draw(n); });

        if (now - this._lastDraw < this._frameInterval) return;
        this._lastDraw = now;

        var cfg = CONFIG.BACKGROUND;
        var ctx = this.ctx;
        var w = this._w, h = this._h;
        if (w === 0 || h === 0) return;

        this._time++;
        ctx.clearRect(0, 0, w, h);

        var offsetX = (this._time * cfg.GRID_SPEED) % cfg.GRID_SIZE;
        var offsetY = (this._time * cfg.GRID_SPEED) % cfg.GRID_SIZE;
        var hue = (this._time * cfg.HUE_SPEED) % 360;

        ctx.strokeStyle = 'hsla(' + hue + ', 100%, 50%, ' + cfg.GRID_ALPHA + ')';
        ctx.lineWidth = cfg.GRID_LINE_WIDTH;
        ctx.beginPath();
        for (var x = offsetX; x < w; x += cfg.GRID_SIZE) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
        for (var y = offsetY; y < h; y += cfg.GRID_SIZE) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
        ctx.stroke();

        ctx.globalAlpha = cfg.PARTICLE_ALPHA;
        var pad = cfg.BOUNDS_PADDING;
        var particles = this._particles;
        for (var p = 0; p < particles.length; p++) {
            var pt = particles[p];
            pt.x += pt.vx;
            pt.y += pt.vy;
            if (pt.x < -pad) pt.x = w + pad;
            if (pt.x > w + pad) pt.x = -pad;
            if (pt.y < -pad) pt.y = h + pad;
            if (pt.y > h + pad) pt.y = -pad;

            var drawY = pt.y + Math.sin(this._time * cfg.PARTICLE_BOB_SPEED + pt.phase) * cfg.PARTICLE_BOB_AMP;
            var img = this._emojiCache[pt.emote];
            if (img) {
                var half = pt.size * 0.5;
                ctx.drawImage(img, pt.x - half, drawY - half, pt.size, pt.size);
            }
        }
        ctx.globalAlpha = 1.0;
    },

    stop: function() {
        this.running = false;
        if (this._rafId) cancelAnimationFrame(this._rafId);
        if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
        this.canvas = null;
        this.ctx = null;
    }
};

var initRetroBackground = function() {
    RetroBackground.start();
};

if (typeof window !== 'undefined') {
    window.Renderer = Renderer;
    window.initRetroBackground = initRetroBackground;
    window.RetroBackground = RetroBackground;
}