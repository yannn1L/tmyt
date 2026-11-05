/**
 * VFX — Pooled particles, shockwaves, lasers.
 * Optimized: active-index ring buffers (zero idle pool iteration), text style caching, and Node-safe headless fallback.
 */

import { CONFIG, Utils } from './config.js';

var _textStyleCache = Object.create(null);
var _hexColorCache = Object.create(null);

function _stringToHex(colorStr) {
    if (typeof colorStr === 'number') return colorStr;
    var cached = _hexColorCache[colorStr];
    if (cached !== undefined) return cached;
    var hex = 0xffffff;
    if (typeof PIXI !== 'undefined' && PIXI.utils && PIXI.utils.string2hex) {
        hex = PIXI.utils.string2hex(colorStr);
    } else if (typeof colorStr === 'string' && colorStr.charCodeAt(0) === 35) {
        hex = parseInt(colorStr.slice(1), 16) || 0xffffff;
    }
    _hexColorCache[colorStr] = hex;
    return hex;
}

function _getTextStyle(colorHex, isCrit) {
    var key = colorHex + (isCrit ? '_c' : '_n');
    if (!_textStyleCache[key]) {
        _textStyleCache[key] = new PIXI.TextStyle({
            fontFamily: '"Press Start 2P", monospace',
            fontSize: CONFIG.VFX.TEXT_FONT_SIZE,
            fill: colorHex,
            stroke: 0x000000,
            strokeThickness: CONFIG.VFX.TEXT_STROKE_THICKNESS
        });
    }
    return _textStyleCache[key];
}

export var PixiParticle = function(vfxContainer) {
    this.active = false;
    this._poolIdx = -1;

    this.sprite = new PIXI.Sprite(PIXI.Texture.WHITE);
    this.sprite.visible = false;
    vfxContainer.addChild(this.sprite);

    this.textObj = new PIXI.Text('', _getTextStyle(0xffffff, false));
    this.textObj.anchor.set(0.5);
    this.textObj.visible = false;
    vfxContainer.addChild(this.textObj);

    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.life = 1; this.maxLife = 1;
    this.type = 'normal'; this.colorHex = 0xffffff;
    this.groundY = 0;
    this._lastStyleKey = '';
};

PixiParticle.prototype.spawn = function(x, y, colorStr, type, text) {
    if (type === undefined) type = 'normal';
    if (text === undefined) text = '';

    var colorHex = _stringToHex(colorStr);
    this.colorHex = colorHex;
    this.type = type;
    this.sprite.visible = false;
    this.textObj.visible = false;

    var pCfg = CONFIG.VFX.PHYSICS[type] || CONFIG.VFX.PHYSICS.normal;

    if (type === 'text' || type === 'textCrit') {
        var isCrit = (type === 'textCrit');
        this.x = Math.max(CONFIG.VFX.BOUNDS_PADDING_MIN, Math.min(CONFIG.LAYOUT.CANVAS_SIZE - CONFIG.VFX.BOUNDS_PADDING_MIN, x));
        this.y = Math.max(CONFIG.VFX.BOUNDS_PADDING_MIN, Math.min(CONFIG.LAYOUT.CANVAS_SIZE - CONFIG.VFX.BOUNDS_PADDING_MAX, y));
        this.vx = (Utils.fastRNG() - 0.5) * pCfg.speedX;
        this.vy = pCfg.speedY;

        var styleKey = colorHex + (isCrit ? '_c' : '_n');
        if (this._lastStyleKey !== styleKey) {
            this.textObj.style = _getTextStyle(colorHex, isCrit);
            this._lastStyleKey = styleKey;
        }

        this.textObj.text = text;
        this.textObj.x = this.x;
        this.textObj.y = this.y;
        this.textObj.alpha = 1.0;
        this.textObj.scale.set(isCrit ? 1.5 : 1);
        this.textObj.visible = true;
    } else if (type === 'fall') {
        this.x = x;
        this.y = y - pCfg.groundYOffset;
        this.vx = 0;
        this.vy = pCfg.vy;
        this.sprite.tint = colorHex;
        this.sprite.width = CONFIG.GRID.CELL_W || CONFIG.GRID.SIZE;
        this.sprite.height = CONFIG.GRID.CELL_H || CONFIG.GRID.SIZE;
        this.sprite.visible = true;
        this.groundY = y;
    } else {
        this.x = x; this.y = y;
        if (type === 'fire') {
            this.vx = (Utils.fastRNG() - 0.5) * pCfg.speedX;
            this.vy = pCfg.speedYBase - (Utils.fastRNG() * Math.abs(pCfg.speedYRnd));
        } else {
            this.vx = (Utils.fastRNG() - 0.5) * pCfg.speedRnd;
            this.vy = (Utils.fastRNG() - 0.5) * pCfg.speedRnd;
        }
        this.sprite.tint = colorHex;
        this.sprite.x = this.x;
        this.sprite.y = this.y;
        this.sprite.visible = true;
        this.sprite.width = CONFIG.VFX.SPRITE_BASE_SIZE;
        this.sprite.height = CONFIG.VFX.SPRITE_BASE_SIZE;
    }
    this.life = 1.0;
    this.maxLife = 1.0;
    this.active = true;
};

PixiParticle.prototype.update = function() {
    if (!this.active) return false;

    if (this.type === 'fall') {
        var pCfgF = CONFIG.VFX.PHYSICS.fall;
        if (this.y < this.groundY) {
            this.y += this.vy;
        } else {
            this.y = this.groundY;
            this.life -= pCfgF.lifeDecay;
            this.sprite.width += 3;
            this.sprite.height -= 1.5;
        }
        this.sprite.x = this.x;
        this.sprite.y = this.y;
        this.sprite.alpha = this.life;
        if (this.life <= 0) {
            this.active = false;
            this.sprite.visible = false;
            return false;
        }
        return true;
    }

    this.x += this.vx;
    this.y += this.vy;

    var pCfg = CONFIG.VFX.PHYSICS[this.type] || CONFIG.VFX.PHYSICS.normal;
    if (pCfg.drag) { this.vx *= pCfg.drag; this.vy *= pCfg.drag; }
    if (pCfg.dragX) this.vx *= pCfg.dragX;
    if (pCfg.dragY) this.vy *= pCfg.dragY;

    this.life -= pCfg.lifeDecay;

    if (this.life <= 0) {
        this.active = false;
        this.sprite.visible = false;
        this.textObj.visible = false;
        return false;
    }

    if (this.type === 'text' || this.type === 'textCrit') {
        this.textObj.x = Math.round(this.x);
        this.textObj.y = Math.round(this.y);
        var progress = 1 - (this.life / this.maxLife);
        var scale = this.type === 'textCrit' ? 1.5 : 1;
        if (progress < CONFIG.VFX.BOUNCE_PHASE_EARLY) {
            scale *= progress * CONFIG.VFX.BOUNCE_PHASE_EARLY_MULT;
        } else {
            scale *= 1 + Math.sin((progress - CONFIG.VFX.BOUNCE_PHASE_EARLY) * Math.PI * CONFIG.VFX.BOUNCE_PHASE_LATE_SPEED) * CONFIG.VFX.BOUNCE_PHASE_LATE_AMP * (1 - progress);
        }
        this.textObj.scale.set(scale);
        this.textObj.alpha = this.life < CONFIG.VFX.TEXT_ALPHA_THRESHOLD
            ? this.life * CONFIG.VFX.TEXT_ALPHA_MULT : 1.0;
    } else {
        this.sprite.x = Math.round(this.x);
        this.sprite.y = Math.round(this.y);
        this.sprite.alpha = this.life;
        var size = Math.max(1, (this.life * CONFIG.VFX.SPRITE_SIZE_MAX) | 0);
        this.sprite.width = size;
        this.sprite.height = size;
    }
    return true;
};

export var PixiShockwave = function(vfxContainer) {
    this.active = false;
    this._poolIdx = -1;
    this.graphics = new PIXI.Graphics();
    this.graphics.visible = false;
    vfxContainer.addChild(this.graphics);
    this.x = 0; this.y = 0;
    this.currentRadius = 0;
    this.maxRadius = 0;
    this.speed = 0;
    this.width = 1;
    this.colorHex = 0xffffff;
};

PixiShockwave.prototype.spawn = function(x, y, colorStr, maxRadius, speed, width, startRadius) {
    if (startRadius === undefined) startRadius = 1;
    this.x = x; this.y = y;
    this.colorHex = _stringToHex(colorStr);
    this.maxRadius = maxRadius;
    this.speed = speed;
    this.width = width;
    this.currentRadius = startRadius;
    this.active = true;
    this.graphics.visible = true;
};

PixiShockwave.prototype.update = function() {
    if (!this.active) return false;
    this.currentRadius += this.speed;
    if ((this.speed > 0 && this.currentRadius > this.maxRadius) ||
        (this.speed < 0 && this.currentRadius < 1)) {
        this.active = false;
        this.graphics.visible = false;
        return false;
    }

    var alpha = this.speed > 0 ? 1.0 - (this.currentRadius / this.maxRadius) : (this.currentRadius / this.maxRadius);
    this.graphics.clear();
    this.graphics.lineStyle(this.width, this.colorHex, alpha);
    this.graphics.drawCircle(this.x, this.y, this.currentRadius);
    return true;
};

export var PixiLaser = function(vfxContainer) {
    this.active = false;
    this._poolIdx = -1;
    this.graphics = new PIXI.Graphics();
    this.graphics.visible = false;
    vfxContainer.addChild(this.graphics);
    this.sx = 0; this.sy = 0; this.ex = 0; this.ey = 0;
    this.colorHex = 0xffffff;
    this.width = 1;
    this.duration = 0;
    this.maxDuration = 1;
    this.zigzag = false;
};

PixiLaser.prototype.spawn = function(sx, sy, ex, ey, colorStr, width, duration, zigzag) {
    if (zigzag === undefined) zigzag = false;
    this.sx = sx; this.sy = sy; this.ex = ex; this.ey = ey;
    this.colorHex = _stringToHex(colorStr);
    this.width = width;
    this.duration = duration;
    this.maxDuration = duration;
    this.zigzag = zigzag;
    this.active = true;
    this.graphics.visible = true;
};

PixiLaser.prototype.update = function() {
    if (!this.active) return false;
    this.duration--;
    if (this.duration <= 0) {
        this.active = false;
        this.graphics.visible = false;
        return false;
    }

    var alpha = this.duration / this.maxDuration;
    this.graphics.clear();
    this.graphics.lineStyle(this.width, this.colorHex, alpha);

    if (this.zigzag) {
        this.graphics.moveTo(this.sx, this.sy);
        var steps = 5;
        for (var i = 1; i <= steps; i++) {
            var tx = this.sx + (this.ex - this.sx) * (i / steps) + (Utils.fastRNG() - 0.5) * 15;
            var ty = this.sy + (this.ey - this.sy) * (i / steps) + (Utils.fastRNG() - 0.5) * 15;
            if (i === steps) { tx = this.ex; ty = this.ey; }
            this.graphics.lineTo(tx, ty);
        }
    } else {
        this.graphics.moveTo(this.sx, this.sy);
        this.graphics.lineTo(this.ex, this.ey);
    }
    return true;
};

export const VFX = {
    pool: [],
    shockwavePool: [],
    laserPool: [],
    vfxContainer: null,
    _freeList: [],
    _swFreeList: [],
    _lsFreeList: [],

    // Active-set TypedArrays to avoid iterating 400 idle slots every frame
    _activeParticles: new Uint16Array(CONFIG.VFX.POOL_SIZE),
    _activeParticleCount: 0,
    _activeShockwaves: new Uint16Array(CONFIG.VFX.SHOCKWAVE_POOL),
    _activeShockwaveCount: 0,
    _activeLasers: new Uint16Array(CONFIG.VFX.LASER_POOL),
    _activeLaserCount: 0,

    _activeTextIdx: new Uint16Array(CONFIG.VFX.MAX_TEXT_POPUPS * 2),
    _activeTextCount: 0,

    init: function(appStage) {
        if (typeof PIXI === 'undefined' || !appStage) return;
        this.vfxContainer = new PIXI.Container();
        appStage.addChild(this.vfxContainer);

        this.pool.length = 0;
        this.shockwavePool.length = 0;
        this.laserPool.length = 0;

        for (var i = 0; i < CONFIG.VFX.POOL_SIZE; i++) {
            var p = new PixiParticle(this.vfxContainer);
            p._poolIdx = i;
            this.pool.push(p);
        }
        for (var j = 0; j < CONFIG.VFX.SHOCKWAVE_POOL; j++) {
            var sw = new PixiShockwave(this.vfxContainer);
            sw._poolIdx = j;
            this.shockwavePool.push(sw);
        }
        for (var k = 0; k < CONFIG.VFX.LASER_POOL; k++) {
            var ls = new PixiLaser(this.vfxContainer);
            ls._poolIdx = k;
            this.laserPool.push(ls);
        }

        this._rebuildFreeList();
    },

    _rebuildFreeList: function() {
        this._freeList.length = 0;
        for (var i = this.pool.length - 1; i >= 0; i--) this._freeList.push(i);
        this._swFreeList.length = 0;
        for (var j = this.shockwavePool.length - 1; j >= 0; j--) this._swFreeList.push(j);
        this._lsFreeList.length = 0;
        for (var k = this.laserPool.length - 1; k >= 0; k--) this._lsFreeList.push(k);

        this._activeParticleCount = 0;
        this._activeShockwaveCount = 0;
        this._activeLaserCount = 0;
        this._activeTextCount = 0;
    },

    spawn: function(x, y, color, amount, type, text) {
        if (!this.vfxContainer) return;
        if (amount === undefined) amount = 5;
        if (type === undefined) type = 'normal';
        if (text === undefined) text = '';

        var isText = (type === 'text' || type === 'textCrit');
        if (isText) {
            if (this._activeTextCount >= CONFIG.VFX.MAX_TEXT_POPUPS) {
                var oldestIdx = -1, minLife = 2.0;
                for (var t = 0; t < this._activeTextCount; t++) {
                    var ti = this._activeTextIdx[t];
                    var tp = this.pool[ti];
                    if (tp.active && tp.life < minLife) { minLife = tp.life; oldestIdx = ti; }
                }
                if (oldestIdx !== -1) {
                    this.pool[oldestIdx].spawn(x, y, color, type, text);
                    return;
                }
            }
            amount = 1;
        } else if (type !== 'fall') {
            // Reserve 24 slots for floating combat text & monolith drops
            if (this._freeList.length <= 24) return;
            var activeCount = this._activeParticleCount;
            if (activeCount > 280) {
                amount = 1;
            } else if (activeCount > 180 && amount > 1) {
                amount = Math.max(1, (amount * 0.5) | 0);
            }
        }

        var spawned = 0;
        while (spawned < amount && this._freeList.length > 0) {
            var idx = this._freeList.pop();
            this.pool[idx].spawn(x, y, color, type, text);
            this._activeParticles[this._activeParticleCount++] = idx;
            if (isText && this._activeTextCount < this._activeTextIdx.length) {
                this._activeTextIdx[this._activeTextCount++] = idx;
            }
            spawned++;
        }
    },

    spawnShockwave: function(x, y, color, maxRadius, speed, width, startRadius) {
        if (!this.vfxContainer || this._swFreeList.length === 0) return;
        if (maxRadius === undefined) maxRadius = 80;
        if (speed === undefined) speed = 4;
        if (width === undefined) width = 3;
        if (startRadius === undefined) startRadius = 1;
        var idx = this._swFreeList.pop();
        this.shockwavePool[idx].spawn(x, y, color, maxRadius, speed, width, startRadius);
        this._activeShockwaves[this._activeShockwaveCount++] = idx;
    },

    spawnLaser: function(sx, sy, ex, ey, color, width, dur, zigzag) {
        if (!this.vfxContainer || this._lsFreeList.length === 0) return;
        if (width === undefined) width = 2;
        if (dur === undefined) dur = 10;
        if (zigzag === undefined) zigzag = false;
        var idx = this._lsFreeList.pop();
        this.laserPool[idx].spawn(sx, sy, ex, ey, color, width, dur, zigzag);
        this._activeLasers[this._activeLaserCount++] = idx;
    },

    updateAndDraw: function() {
        // 1. Update only active particles using swap-and-pop
        var pCount = this._activeParticleCount;
        var activeP = this._activeParticles;
        var textDirty = false;
        var i = 0;
        while (i < pCount) {
            var pIdx = activeP[i];
            var p = this.pool[pIdx];
            if (p.update()) {
                i++;
            } else {
                if (p.type === 'text' || p.type === 'textCrit') textDirty = true;
                this._freeList.push(pIdx);
                activeP[i] = activeP[--pCount];
            }
        }
        this._activeParticleCount = pCount;

        if (textDirty) {
            var writeT = 0;
            for (var t = 0; t < this._activeTextCount; t++) {
                var ti = this._activeTextIdx[t];
                if (this.pool[ti].active) {
                    this._activeTextIdx[writeT++] = ti;
                }
            }
            this._activeTextCount = writeT;
        }

        // 2. Update only active shockwaves
        var swCount = this._activeShockwaveCount;
        var activeSW = this._activeShockwaves;
        var j = 0;
        while (j < swCount) {
            var swIdx = activeSW[j];
            if (this.shockwavePool[swIdx].update()) {
                j++;
            } else {
                this._swFreeList.push(swIdx);
                activeSW[j] = activeSW[--swCount];
            }
        }
        this._activeShockwaveCount = swCount;

        // 3. Update only active lasers
        var lsCount = this._activeLaserCount;
        var activeLS = this._activeLasers;
        var k = 0;
        while (k < lsCount) {
            var lsIdx = activeLS[k];
            if (this.laserPool[lsIdx].update()) {
                k++;
            } else {
                this._lsFreeList.push(lsIdx);
                activeLS[k] = activeLS[--lsCount];
            }
        }
        this._activeLaserCount = lsCount;
    },

    reset: function() {
        for (var i = 0; i < this.pool.length; i++) {
            var p = this.pool[i];
            p.active = false;
            p.sprite.visible = false;
            p.textObj.visible = false;
        }
        for (var j = 0; j < this.shockwavePool.length; j++) {
            this.shockwavePool[j].active = false;
            this.shockwavePool[j].graphics.visible = false;
        }
        for (var k = 0; k < this.laserPool.length; k++) {
            this.laserPool[k].active = false;
            this.laserPool[k].graphics.visible = false;
        }
        this._rebuildFreeList();
    }
};

if (typeof window !== 'undefined') {
    window.PixiParticle = PixiParticle;
    window.PixiShockwave = PixiShockwave;
    window.PixiLaser = PixiLaser;
    window.VFX = VFX;
}