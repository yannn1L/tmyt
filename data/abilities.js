/**
 * ABILITY PARTS — Pure data. Building blocks untuk faction abilities.
 * 
 * FIX v3 (Combo D):
 *   - sickeningAutoCapture dipindah dari onPowerCalc → onBeforeAttack
 *   - sickeningAutoCapture pakai trigger 'always' + cek layer di execute
 *   - poisonDamageTick decay lebih agresif (tickDecay default 5, bukan 3)
 *   - Semua visual parts null-safe
 */
'use strict';

var ABILITY_PARTS = {

    /* ==================================================================== */
    /* INFERNO PARTS — Fire spread & DoT                                    */
    /* ==================================================================== */

    infernoBurnTick: {
        hook: 'onTick',
        cost: 3,
        tags: ['inferno', 'dot', 'spread'],
        trigger: { type: 'chance', value: 0.5 },
        execute: function(ctx) {
            var ws = ctx.ws, idx = ctx.idx, owner = ctx.owner, fac = ctx.fac;
            if (ws.layers.inferno[idx] === 0) return;

            if (owner !== -1 && (!fac || fac.key !== 'inferno')) {
                ws.nextGrid[idx] = -1;
            }

            var spreadChance = (ctx.partData && ctx.partData.spreadChance !== undefined)
                ? ctx.partData.spreadChance : 0.5;
            if (Utils.fastRNG() >= spreadChance) return;

            var diminishRate = (ctx.partData && ctx.partData.diminishRate !== undefined)
                ? ctx.partData.diminishRate : 15;

            var di = Utils.getRandomDirIdx();
            var nx = (idx % CONFIG.GRID.COLS) + CONFIG.DIR_X[di];
            var ny = ((idx / CONFIG.GRID.COLS) | 0) + CONFIG.DIR_Y[di];
            if (nx < 0 || nx >= CONFIG.GRID.COLS || ny < 0 || ny >= CONFIG.GRID.ROWS) return;

            var nIdx = ny * CONFIG.GRID.COLS + nx;
            var spreadVal = ws.layers.inferno[idx] - diminishRate;
            if (spreadVal > ws.layers.inferno[nIdx]) ws.layers.inferno[nIdx] = spreadVal;
        }
    },

    infernoIgnite: {
        hook: 'onAttackSuccess',
        cost: 3,
        tags: ['inferno', 'ignite'],
        trigger: { type: 'chance', value: 0.8 },
        execute: function(ctx) {
            var ws = ctx.ws, nIdx = ctx.nIdx, nx = ctx.nx, ny = ctx.ny, fac = ctx.fac;
            var layerMax = (fac.params && fac.params.layerMax) || 100;
            ws.layers.inferno[nIdx] = layerMax;
            ws.playSound('burn');
            VFX.spawn(nx * CONFIG.GRID.SIZE + 8, ny * CONFIG.GRID.SIZE, CONFIG.VFX.COLORS.PARTICLE_FIRE, 8, 'fire');
            VFX.spawn(nx * CONFIG.GRID.SIZE + 8, ny * CONFIG.GRID.SIZE - 4, CONFIG.VFX.COLORS.TEXT_FIRE, 1, 'text', 'BURN!');
        }
    },

    infernoFireVisual: {
        hook: 'onRenderVFX',
        cost: 0,
        tags: ['inferno', 'visual'],
        trigger: { type: 'always' },
        execute: function(ctx) {
            var gfx = ctx.gfx, x = ctx.x, y = ctx.y, idx = ctx.idx, frame = ctx.frame, fac = ctx.fac;
            var vfx = (fac.params && fac.params.vfx) || {};
            var c1 = vfx.c1 !== undefined ? vfx.c1 : 0xff2a2a;
            var c2 = vfx.c2 !== undefined ? vfx.c2 : 0xff8800;
            var c3 = vfx.c3 !== undefined ? vfx.c3 : 0xffcc00;
            var spd1 = vfx.spd1 !== undefined ? vfx.spd1 : 15;
            var spd2 = vfx.spd2 !== undefined ? vfx.spd2 : 20;
            var spd3 = vfx.spd3 !== undefined ? vfx.spd3 : 10;
            var sz1 = vfx.sz1 !== undefined ? vfx.sz1 : 0.5;
            var sz2 = vfx.sz2 !== undefined ? vfx.sz2 : 0.6;
            var sz3 = vfx.sz3 !== undefined ? vfx.sz3 : 0.4;
            var GS = CONFIG.GRID.SIZE;
            var f1 = Math.abs(Utils.fastSin((frame * spd1 + idx) % 512)) * (GS * sz1);
            var f2 = Math.abs(Utils.fastSin((frame * spd2 + idx * 2) % 512)) * (GS * sz2);
            var f3 = Math.abs(Utils.fastSin((frame * spd3 + idx * 3) % 512)) * (GS * sz3);
            gfx.beginFill(c1); gfx.drawRect(x * GS + 2, y * GS + GS - f1, 4, f1); gfx.endFill();
            gfx.beginFill(c2); gfx.drawRect(x * GS + 6, y * GS + GS - f2, 4, f2); gfx.endFill();
            gfx.beginFill(c3); gfx.drawRect(x * GS + 10, y * GS + GS - f3, 4, f3); gfx.endFill();
        }
    },

    /* ==================================================================== */
    /* ICES PARTS                                                           */
    /* ==================================================================== */

    icesFrostNova: {
        hook: 'onAttackSuccess',
        cost: 4,
        tags: ['ices', 'freeze', 'aoe'],
        trigger: { type: 'chance', value: 0.5 },
        execute: function(ctx) {
            var ws = ctx.ws, nIdx = ctx.nIdx, nx = ctx.nx, ny = ctx.ny, fac = ctx.fac;
            var layerMax = (fac.params && fac.params.layerMax) || 100;
            ws.layers.ices[nIdx] = layerMax;

            var base = nIdx * 4;
            var neigh = CONFIG.NEIGHBOR_IDX;
            for (var d = 0; d < 4; d++) {
                var nnn = neigh[base + d];
                if (nnn !== -1) ws.layers.ices[nnn] = layerMax;
            }

            ws.playSound('freeze');
            var px = nx * CONFIG.GRID.SIZE + 8;
            var py = ny * CONFIG.GRID.SIZE + 8;
            var shockC = (fac.params && fac.params.vfx && fac.params.vfx.shockC) || '#00ffff';
            VFX.spawnShockwave(px, py, shockC, 40, 3, 2);
            VFX.spawn(px, py, CONFIG.VFX.COLORS.PARTICLE_ICE, 4, 'ice');
            VFX.spawn(px, py - 4, CONFIG.VFX.COLORS.TEXT_ICE, 1, 'text', 'NOVA!');
        }
    },

    icesColdAura: {
        hook: 'onDefendCalc',
        cost: 3,
        tags: ['ices', 'defense', 'aura'],
        trigger: { type: 'always' },
        execute: function(ctx) {
            var ws = ctx.ws, idx = ctx.idx, basePower = ctx.basePower, facId = ctx.facId;
            var bonus = (ctx.partData && ctx.partData.allyDefBonus !== undefined)
                ? ctx.partData.allyDefBonus : 10;
            var allies = 0;
            var base = idx * 4;
            var neigh = CONFIG.NEIGHBOR_IDX;
            for (var d = 0; d < 4; d++) {
                var n = neigh[base + d];
                if (n !== -1 && ws.grid[n] === facId) allies++;
            }
            return basePower + allies * bonus;
        }
    },

    icesFrostVisual: {
        hook: 'onRenderVFX',
        cost: 0,
        tags: ['ices', 'visual'],
        trigger: { type: 'always' },
        execute: function(ctx) {
            var gfx = ctx.gfx, x = ctx.x, y = ctx.y, idx = ctx.idx, fac = ctx.fac;
            var vfx = (fac.params && fac.params.vfx) || {};
            var cFill = vfx.cFill !== undefined ? vfx.cFill : 0x00ffff;
            var aFill = vfx.aFill !== undefined ? vfx.aFill : 300;
            var GS = CONFIG.GRID.SIZE;
            gfx.beginFill(cFill, WorldState.layers.ices[idx] / aFill);
            gfx.drawRect(x * GS, y * GS, GS, GS);
            gfx.endFill();
        }
    },

    /* ==================================================================== */
    /* MECHA PARTS                                                          */
    /* ==================================================================== */

    mechaPhalanxDef: {
        hook: 'onDefendCalc',
        cost: 5,
        tags: ['mecha', 'defense', 'formation'],
        trigger: { type: 'always' },
        execute: function(ctx) {
            var ws = ctx.ws, idx = ctx.idx, basePower = ctx.basePower, facId = ctx.facId;
            var bonus = (ctx.partData && ctx.partData.allyDefBonus !== undefined)
                ? ctx.partData.allyDefBonus : 10;
            var allies = 0;
            var base = idx * 4;
            var neigh = CONFIG.NEIGHBOR_IDX;
            for (var d = 0; d < 4; d++) {
                var n = neigh[base + d];
                if (n !== -1 && ws.grid[n] === facId) allies++;
            }
            return basePower + allies * bonus;
        }
    },

    mechaGridVisual: {
        hook: 'onRenderTileLogic',
        cost: 0,
        tags: ['mecha', 'visual'],
        trigger: { type: 'always' },
        execute: function(ctx) {
            var gfx = ctx.gfx, x = ctx.x, y = ctx.y, frame = ctx.frame, fac = ctx.fac;
            var vfx = (fac.params && fac.params.vfx) || {};
            var cOut = vfx.cOut !== undefined ? vfx.cOut : 0x00ffff;
            var spd = vfx.spd !== undefined ? vfx.spd : 5;
            var aBase = vfx.aBase !== undefined ? vfx.aBase : 0.3;
            var aRnd = vfx.aRnd !== undefined ? vfx.aRnd : 0.5;
            var pad = vfx.pad !== undefined ? vfx.pad : 2;
            var GS = CONFIG.GRID.SIZE;
            var pulse = (Utils.fastSin((frame * spd) % 512) + 1) / 2;
            gfx.beginFill(cOut, aBase + pulse * aRnd);
            gfx.drawRect(x * GS + pad, y * GS + pad, GS - (pad * 2), GS - (pad * 2));
            gfx.endFill();
        }
    },

    /* ==================================================================== */
    /* BASTION PARTS                                                        */
    /* ==================================================================== */

    bastionShieldBuild: {
        hook: 'onTick',
        cost: 3,
        tags: ['bastion', 'shield', 'buildup'],
        trigger: { type: 'always' },
        execute: function(ctx) {
            var ws = ctx.ws, idx = ctx.idx, owner = ctx.owner, fac = ctx.fac;
            if (owner === -1 || !fac || fac.key !== 'bastion') {
                ws.layers.bastion[idx] = 0;
                return;
            }
            var buildRate = (ctx.partData && ctx.partData.buildRate !== undefined)
                ? ctx.partData.buildRate : 15;
            var maxShield = (ctx.partData && ctx.partData.maxShield !== undefined)
                ? ctx.partData.maxShield : 100;
            var shield = ws.layers.bastion[idx] + buildRate;
            ws.layers.bastion[idx] = shield > maxShield ? maxShield : shield;
        }
    },

    bastionShieldDef: {
        hook: 'onDefendCalc',
        cost: 4,
        tags: ['bastion', 'defense', 'shield'],
        trigger: { type: 'always' },
        execute: function(ctx) {
            var ws = ctx.ws, idx = ctx.idx, basePower = ctx.basePower;
            return basePower + ws.layers.bastion[idx];
        }
    },

    bastionShieldVisual: {
        hook: 'onRenderTileLogic',
        cost: 0,
        tags: ['bastion', 'visual'],
        trigger: { type: 'always' },
        execute: function(ctx) {
            var gfx = ctx.gfx, x = ctx.x, y = ctx.y, idx = ctx.idx, fac = ctx.fac;
            var vfx = (fac.params && fac.params.vfx) || {};
            var cBase = vfx.cBase !== undefined ? vfx.cBase : 0x8b4513;
            var cLine = vfx.cLine !== undefined ? vfx.cLine : 0xffaa00;
            var GS = CONFIG.GRID.SIZE;
            var shieldPower = WorldState.layers.bastion[idx];
            if (shieldPower <= 0) return;
            gfx.beginFill(cBase, shieldPower / 100);
            gfx.drawRect(x * GS + 1, y * GS + 1, GS - 2, GS - 2);
            gfx.endFill();
            gfx.lineStyle(1, cLine, (shieldPower / 100) * 0.8);
            gfx.drawRect(x * GS, y * GS, GS, GS);
            gfx.lineStyle(0);
        }
    },

    /* ==================================================================== */
    /* CUBE PARTS                                                           */
    /* ==================================================================== */

    cubeFormationDetect: {
        hook: 'onAttackSuccess',
        cost: 5,
        tags: ['cube', 'formation', 'burst'],
        trigger: { type: 'always' },
        execute: function(ctx) {
            var ws = ctx.ws, nIdx = ctx.nIdx, nx = ctx.nx, ny = ctx.ny, fac = ctx.fac;
            var owner = ws.nextGrid[nIdx];
            var pat = CONFIG.SQUARE_PATTERNS_FLAT;
            var formed = false;
            var cx = 0, cy = 0;
            var cols = CONFIG.GRID.COLS;
            var rows = CONFIG.GRID.ROWS;

            for (var c = 0; c < 4 && !formed; c++) {
                var offset = c * 8;
                var valid = true;
                for (var p = 0; p < 8; p += 2) {
                    var px = nx + pat[offset + p];
                    var py = ny + pat[offset + p + 1];
                    if (px < 0 || px >= cols || py < 0 || py >= rows) { valid = false; break; }
                    if (ws.nextGrid[py * cols + px] !== owner) { valid = false; break; }
                }
                if (!valid) continue;
                formed = true;
                cx = nx + (pat[offset + 2] + pat[offset + 6]) / 2;
                cy = ny + (pat[offset + 4] + pat[offset + 7]) / 2;
            }

            if (!formed) return false;

            var originX = Math.round(cx);
            var originY = Math.round(cy);
            for (var dx = -1; dx <= 1; dx++) {
                var ddx = originX + dx;
                if (ddx < 0 || ddx >= cols) continue;
                for (var dy = -1; dy <= 1; dy++) {
                    var ddy = originY + dy;
                    if (ddy < 0 || ddy >= rows) continue;
                    var dIdx = ddy * cols + ddx;
                    if (ws.grid[dIdx] === owner || ws.grid[dIdx] === -1) continue;
                    if (ws.capturedThisTick[dIdx]) continue;   // ← FIX: skip kalau sudah di-capture
                    ws.nextGrid[dIdx] = -1;
                }
            }

            var visualX = Math.round(cx * CONFIG.GRID.SIZE + 8);
            var visualY = Math.round(cy * CONFIG.GRID.SIZE + 8);
            ws.playSound('thud');
            ws.requestShake(CONFIG.VFX.SHAKE.THUD);
            var shockC = (fac.params && fac.params.vfx && fac.params.vfx.shockC) || '#00ffcc';
            VFX.spawnShockwave(visualX, visualY, shockC, 80, 6, 4);
            VFX.spawn(visualX, visualY, CONFIG.VFX.COLORS.SQUARE, 1, 'textCrit', 'CUBE!');
            VFX.spawn(visualX, visualY, CONFIG.VFX.COLORS.SQUARE, 1, 'fall');
            return true;
        }
    },

    cubeCornerMark: {
        hook: 'onRenderTileLogic',
        cost: 0,
        tags: ['cube', 'visual'],
        trigger: { type: 'always' },
        execute: function(ctx) {
            var gfx = ctx.gfx, x = ctx.x, y = ctx.y, frame = ctx.frame, fac = ctx.fac;
            var vfx = (fac.params && fac.params.vfx) || {};
            var shockC = vfx.shockC || '#00ffcc';
            var GS = CONFIG.GRID.SIZE;
            gfx.lineStyle(1, shockC, 0.3 + 0.2 * (Utils.fastSin((frame * 6) % 512) + 1) / 2);
            gfx.moveTo(x * GS + 2, y * GS + 6); gfx.lineTo(x * GS + 2, y * GS + 2); gfx.lineTo(x * GS + 6, y * GS + 2);
            gfx.moveTo(x * GS + GS - 2, y * GS + 6); gfx.lineTo(x * GS + GS - 2, y * GS + 2); gfx.lineTo(x * GS + GS - 6, y * GS + 2);
            gfx.moveTo(x * GS + 2, y * GS + GS - 6); gfx.lineTo(x * GS + 2, y * GS + GS - 2); gfx.lineTo(x * GS + 6, y * GS + GS - 2);
            gfx.moveTo(x * GS + GS - 2, y * GS + GS - 6); gfx.lineTo(x * GS + GS - 2, y * GS + GS - 2); gfx.lineTo(x * GS + GS - 6, y * GS + GS - 2);
            gfx.lineStyle(0);
        }
    },

    /* ==================================================================== */
    /* GLITCH PARTS                                                         */
    /* ==================================================================== */

    glitchDiagSpread: {
        hook: 'onTick',
        cost: 4,
        tags: ['glitch', 'spread', 'diagonal'],
        trigger: { type: 'chance', value: 0.4 },
        execute: function(ctx) {
            var ws = ctx.ws, idx = ctx.idx, owner = ctx.owner, fac = ctx.fac;
            if (owner === -1 || !fac || fac.key !== 'glitch') return;

            var anomalyChance = (ctx.partData && ctx.partData.anomalyChance !== undefined)
                ? ctx.partData.anomalyChance : 0.01;
            var isAnomaly = Utils.fastRNG() < anomalyChance;
            var di = (Utils.fastRNG() * 4) | 0;
            var dx = isAnomaly ? CONFIG.DIR_X[di] : CONFIG.DIAG_X[di];
            var dy = isAnomaly ? CONFIG.DIR_Y[di] : CONFIG.DIAG_Y[di];

            var x = idx % CONFIG.GRID.COLS;
            var y = (idx / CONFIG.GRID.COLS) | 0;
            var nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= CONFIG.GRID.COLS || ny < 0 || ny >= CONFIG.GRID.ROWS) return;

            var nIdx = ny * CONFIG.GRID.COLS + nx;
            var targetOwner = ws.grid[nIdx];
            if (targetOwner === owner) return;
            if (targetOwner === -1 && ws.capturedThisTick[nIdx]) return;   // ← FIX

            var myP = ws.calcPower(owner, idx, false, ws._bufAtk).power;
            var enP = targetOwner === -1 ? 0 : ws.calcPower(targetOwner, nIdx, true, ws._bufDef).power;
            if (myP <= enP) return;

            ws.nextGrid[nIdx] = owner;
            ws.capturedThisTick[nIdx] = 1;   // ← mark
            VFX.spawn(nx * CONFIG.GRID.SIZE + 8, ny * CONFIG.GRID.SIZE + 8, fac.icon.color, 3, 'normal');
            if (isAnomaly) VFX.spawn(nx * CONFIG.GRID.SIZE + 8, ny * CONFIG.GRID.SIZE - 4, CONFIG.VFX.COLORS.GLITCH, 1, 'text', 'SHIFT');
            ws.playSound('glitch');
            ws.changes++;
        }
    },

    glitchPixelVisual: {
        hook: 'onRenderTileLogic',
        cost: 0,
        tags: ['glitch', 'visual'],
        trigger: { type: 'always' },
        execute: function(ctx) {
            var gfx = ctx.gfx, x = ctx.x, y = ctx.y, fac = ctx.fac;
            var vfx = (fac.params && fac.params.vfx) || {};
            var c1 = vfx.c1 !== undefined ? vfx.c1 : 0xff00ff;
            var c2 = vfx.c2 !== undefined ? vfx.c2 : 0x00ffff;
            var rate = vfx.rate !== undefined ? vfx.rate : 0.1;
            var off = vfx.off !== undefined ? vfx.off : 4;
            if (Utils.fastRNG() >= rate) return;
            var GS = CONFIG.GRID.SIZE;
            gfx.beginFill(c1, 0.4);
            gfx.drawRect(x * GS + Utils.fastRNG() * off, y * GS, GS, GS); gfx.endFill();
            gfx.beginFill(c2, 0.4);
            gfx.drawRect(x * GS - Utils.fastRNG() * off, y * GS, GS, GS); gfx.endFill();
        }
    },

    /* ==================================================================== */
    /* SICKENING PARTS — FIX v3                                             */
    /* ==================================================================== */

    sickeningContagion: {
        hook: 'onTick',
        cost: 3,
        tags: ['sickening', 'contagion', 'spread'],
        trigger: { type: 'chance', value: 0.2 },
        execute: function(ctx) {
            var ws = ctx.ws, idx = ctx.idx;
            if (ws.layers.sickening[idx] === 0) return;

            var diminishRate = (ctx.partData && ctx.partData.diminishRate !== undefined)
                ? ctx.partData.diminishRate : 10;

            var di = Utils.getRandomDirIdx();
            var x = idx % CONFIG.GRID.COLS;
            var y = (idx / CONFIG.GRID.COLS) | 0;
            var nx = x + CONFIG.DIR_X[di];
            var ny = y + CONFIG.DIR_Y[di];
            if (nx < 0 || nx >= CONFIG.GRID.COLS || ny < 0 || ny >= CONFIG.GRID.ROWS) return;

            var nIdx = ny * CONFIG.GRID.COLS + nx;
            var val = ws.layers.sickening[idx] - diminishRate;
            if (val > ws.layers.sickening[nIdx]) ws.layers.sickening[nIdx] = val;
        }
    },

    sickeningWeakness: {
        hook: 'onBeforeAttack',
        cost: 3,
        tags: ['sickening', 'debuff'],
        trigger: { type: 'chance', value: 0.4 },
        execute: function(ctx) {
            var ws = ctx.ws, nIdx = ctx.nIdx, fac = ctx.fac;
            var layerMax = (fac.params && fac.params.layerMax) || 100;
            ws.layers.sickening[nIdx] = layerMax;
        }
    },

    /**
     * SICKENING AUTO-CAPTURE — FIX v3
     * 
     * Sebelumnya: onPowerCalc, return Infinity → poisoning cache.
     * Sekarang: onBeforeAttack, capture langsung target yang punya sickening layer.
     * 
     * Logika:
     *   - Cek target tile punya sickening layer > 0
     *   - Cek target bukan self, bukan kosong
     *   - Cek belum di-capture tick ini
     *   - Roll autoCap chance
     *   - Capture langsung (tanpa power calc)
     */
    sickeningAutoCapture: {
        hook: 'onBeforeAttack',
        cost: 4,
        tags: ['sickening', 'auto-capture'],
        trigger: { type: 'always' },
        execute: function(ctx) {
            var ws = ctx.ws, nIdx = ctx.nIdx, owner = ctx.owner;

            // Guard: target punya sickening layer
            if (ws.layers.sickening[nIdx] <= 0) return;

            var targetOwner = ws.grid[nIdx];
            // Guard: enemy (bukan self, bukan empty)
            if (targetOwner === owner || targetOwner === -1) return;

            // Guard: belum di-capture tick ini
            if (ws.capturedThisTick[nIdx]) return;

            // Roll
            var autoCap = (ctx.partData && ctx.partData.autoCap !== undefined)
                ? ctx.partData.autoCap : 0.2;
            if (Utils.fastRNG() >= autoCap) return;

            // Execute capture
            ws.nextGrid[nIdx] = owner;
            ws.capturedThisTick[nIdx] = 1;
            ws.changes++;

            var nx = nIdx % CONFIG.GRID.COLS;
            var ny = (nIdx / CONFIG.GRID.COLS) | 0;
            VFX.spawn(nx * CONFIG.GRID.SIZE + 8, ny * CONFIG.GRID.SIZE + 8, '#a3cc29', 4, 'normal');
            VFX.spawn(nx * CONFIG.GRID.SIZE + 8, ny * CONFIG.GRID.SIZE - 4, '#a3cc29', 1, 'text', 'AUTO!');
            ws.playSound('capture');
        }
    },

    sickeningPukeVisual: {
        hook: 'onRenderVFX',
        cost: 0,
        tags: ['sickening', 'visual'],
        trigger: { type: 'always' },
        execute: function(ctx) {
            var gfx = ctx.gfx, x = ctx.x, y = ctx.y, idx = ctx.idx, fac = ctx.fac;
            var vfx = (fac.params && fac.params.vfx) || {};
            var cBase = vfx.cBase !== undefined ? vfx.cBase : 0xa3cc29;
            var cBub = vfx.cBub !== undefined ? vfx.cBub : 0x66ff00;
            var bubSz = vfx.bubSz !== undefined ? vfx.bubSz : 3;
            var GS = CONFIG.GRID.SIZE;
            gfx.beginFill(cBase, WorldState.layers.sickening[idx] / 250);
            gfx.drawRect(x * GS, y * GS, GS, GS); gfx.endFill();
            if (Utils.fastRNG() < 0.2) {
                gfx.beginFill(cBub, 0.6);
                gfx.drawCircle(
                    x * GS + 2 + Utils.fastRNG() * (GS - 4),
                    y * GS + 2 + Utils.fastRNG() * (GS - 4),
                    bubSz * Utils.fastRNG()
                );
                gfx.endFill();
            }
        }
    },

    /* ==================================================================== */
    /* POISON PARTS — FIX v3 (decay lebih agresif)                          */
    /* ==================================================================== */

    poisonStackApply: {
        hook: 'onBeforeAttack',
        cost: 3,
        tags: ['poison', 'stack', 'dot'],
        trigger: { type: 'chance', value: 0.7 },
        execute: function(ctx) {
            var ws = ctx.ws, nIdx = ctx.nIdx;
            var stackPerHit = (ctx.partData && ctx.partData.stackPerHit !== undefined)
                ? ctx.partData.stackPerHit : 8;
            var maxStack = (ctx.partData && ctx.partData.maxStack !== undefined)
                ? ctx.partData.maxStack : 100;
            var current = ws.layers.poison[nIdx];
            ws.layers.poison[nIdx] = Math.min(maxStack, current + stackPerHit);
        }
    },

    poisonDamageTick: {
        hook: 'onTick',
        cost: 4,
        tags: ['poison', 'damage'],
        trigger: { type: 'layer', key: 'poison' },
        execute: function(ctx) {
            var ws = ctx.ws, idx = ctx.idx;
            if (ws.layers.poison[idx] <= 0) return;

            // FIX: tickDecay default 5 (lebih agresif dari 3)
            var tickDecay = (ctx.partData && ctx.partData.tickDecay !== undefined)
                ? ctx.partData.tickDecay : 5;
            var v = ws.layers.poison[idx] - tickDecay;
            ws.layers.poison[idx] = v & ~(v >> 31);

            if (ws.layers.poison[idx] % 20 === 0 && ws.layers.poison[idx] > 0) {
                var x = idx % CONFIG.GRID.COLS;
                var y = (idx / CONFIG.GRID.COLS) | 0;
                VFX.spawn(x * CONFIG.GRID.SIZE + 8, y * CONFIG.GRID.SIZE, '#a020f0', 3, 'normal');
            }
        }
    },

    poisonPenalty: {
        hook: 'onPowerCalc',
        cost: 3,
        tags: ['poison', 'debuff'],
        trigger: { type: 'layer', key: 'poison' },
        execute: function(ctx) {
            var ws = ctx.ws, idx = ctx.idx, basePower = ctx.basePower;
            var powerPenalty = (ctx.partData && ctx.partData.powerPenalty !== undefined)
                ? ctx.partData.powerPenalty : 0.6;
            var stacks = ws.layers.poison[idx];
            var mult = 1.0 - Math.min(0.5, stacks / 200);
            return basePower * mult * powerPenalty;
        }
    },

    poisonLiquidVisual: {
        hook: 'onRenderVFX',
        cost: 0,
        tags: ['poison', 'visual'],
        trigger: { type: 'always' },
        execute: function(ctx) {
            var gfx = ctx.gfx, x = ctx.x, y = ctx.y, idx = ctx.idx, frame = ctx.frame, fac = ctx.fac;
            var vfx = (fac.params && fac.params.vfx) || {};
            var cBase = vfx.cBase !== undefined ? vfx.cBase : 0xa020f0;
            var cDrop = vfx.cDrop !== undefined ? vfx.cDrop : 0x6600cc;
            var GS = CONFIG.GRID.SIZE;
            var layer = WorldState.layers.poison[idx];
            gfx.beginFill(cBase, layer / 300);
            gfx.drawRect(x * GS, y * GS, GS, GS); gfx.endFill();
            gfx.beginFill(cDrop);
            for (var i = 0; i < 3; i++) {
                var px = x * GS + 3 + ((frame * (0.3 + i * 0.2) + idx * 7) % (GS - 6));
                var py = y * GS + GS - ((frame * 0.8 + i * 4 + idx) % GS);
                gfx.drawRect(px, py, 2, 3);
            }
            gfx.endFill();
        }
    },

    /* ==================================================================== */
    /* BOMBER PARTS                                                         */
    /* ==================================================================== */

    bomberDetonate: {
        hook: 'onDefendFail',
        cost: 5,
        tags: ['bomber', 'martyrdom', 'aoe'],
        trigger: { type: 'chance', value: 1.0 },
        execute: function(ctx) {
            var ws = ctx.ws, nIdx = ctx.nIdx, targetOwner = ctx.targetOwner;
            var x = nIdx % CONFIG.GRID.COLS;
            var y = (nIdx / CONFIG.GRID.COLS) | 0;
            var cols = CONFIG.GRID.COLS;
            var rows = CONFIG.GRID.ROWS;

            for (var dx = -1; dx <= 1; dx++) {
                var ddx = x + dx;
                if (ddx < 0 || ddx >= cols) continue;
                for (var dy = -1; dy <= 1; dy++) {
                    var ddy = y + dy;
                    if (ddy < 0 || ddy >= rows) continue;
                    var explIdx = ddy * cols + ddx;
                    if (ws.grid[explIdx] === targetOwner) continue;
                    if (ws.capturedThisTick[explIdx]) continue;   // ← FIX
                    ws.nextGrid[explIdx] = -1;
                    if (ws.layers.nature) ws.layers.nature[explIdx] = 0;
                }
            }

            var shockC = (ctx.partData && ctx.partData.shockC) || '#ff5500';
            var rMax = (ctx.partData && ctx.partData.rMax !== undefined) ? ctx.partData.rMax : 60;
            var spd = (ctx.partData && ctx.partData.spd !== undefined) ? ctx.partData.spd : 5;
            var w = (ctx.partData && ctx.partData.w !== undefined) ? ctx.partData.w : 4;
            var px = x * CONFIG.GRID.SIZE + 8;
            var py = y * CONFIG.GRID.SIZE + 8;
            VFX.spawnShockwave(px, py, shockC, rMax, spd, w);
            VFX.spawn(px, py - 4, CONFIG.VFX.COLORS.BOMB, 1, 'text', 'BOOM!');
            ws.playSound('bomb');
            ws.requestShake(CONFIG.VFX.SHAKE.BOMB);
        }
    },

    /* ==================================================================== */
    /* NATURE PARTS                                                         */
    /* ==================================================================== */

    natureGrowRoots: {
        hook: 'onTick',
        cost: 3,
        tags: ['nature', 'grow'],
        trigger: { type: 'always' },
        execute: function(ctx) {
            var ws = ctx.ws, idx = ctx.idx, owner = ctx.owner, fac = ctx.fac;

            if (owner === -1 || !fac || fac.key !== 'nature') {
                if (ws.layers.nature[idx] !== 0) ws.layers.nature[idx] = 0;
                return;
            }

            var layerMax = (ctx.partData && ctx.partData.layerMax !== undefined)
                ? ctx.partData.layerMax : 100;
            var rate = (ctx.partData && ctx.partData.rate !== undefined)
                ? ctx.partData.rate : 10;
            var layer = ws.layers.nature[idx];
            if (layer < layerMax) {
                var newLayer = layer + rate;
                ws.layers.nature[idx] = newLayer > layerMax ? layerMax : newLayer;
            }
        }
    },

    natureRootDefense: {
        hook: 'onDefendCalc',
        cost: 4,
        tags: ['nature', 'defense'],
        trigger: { type: 'always' },
        execute: function(ctx) {
            var ws = ctx.ws, idx = ctx.idx, basePower = ctx.basePower;
            var defMultiplier = (ctx.partData && ctx.partData.defMultiplier !== undefined)
                ? ctx.partData.defMultiplier : 0.4;
            var layer = ws.layers.nature[idx];
            if (layer <= 0) return basePower;
            return basePower + layer * defMultiplier;
        }
    },

    natureSporeBurst: {
        hook: 'onTick',
        cost: 4,
        tags: ['nature', 'spore', 'teleport'],
        trigger: { type: 'threshold', key: 'nature', value: 100 },
        execute: function(ctx) {
            var ws = ctx.ws, idx = ctx.idx, owner = ctx.owner, fac = ctx.fac;
            var sporeChance = (ctx.partData && ctx.partData.sporeChance !== undefined)
                ? ctx.partData.sporeChance : 0.05;
            if (Utils.fastRNG() >= sporeChance) return;

            var dirs2 = CONFIG.DIRS_2;
            var tIdx = (Utils.fastRNG() * 4) | 0;
            var nnx = (idx % CONFIG.GRID.COLS) + dirs2[tIdx][0];
            var nny = ((idx / CONFIG.GRID.COLS) | 0) + dirs2[tIdx][1];
            if (nnx < 0 || nnx >= CONFIG.GRID.COLS || nny < 0 || nny >= CONFIG.GRID.ROWS) return;

            var jumpIdx = nny * CONFIG.GRID.COLS + nnx;
            if (ws.grid[jumpIdx] === owner) return;
            if (ws.capturedThisTick[jumpIdx]) return;   // ← FIX

            ws.nextGrid[jumpIdx] = owner;
            ws.capturedThisTick[jumpIdx] = 1;   // ← mark
            VFX.spawn(nnx * CONFIG.GRID.SIZE + 8, nny * CONFIG.GRID.SIZE + 8, fac.icon.color, 3, 'normal');
            ws.changes++;
        }
    },

    natureRootReset: {
        hook: 'onDefendFail',
        cost: 2,
        tags: ['nature', 'reset'],
        trigger: { type: 'always' },
        execute: function(ctx) {
            var ws = ctx.ws, idx = ctx.idx;
            ws.layers.nature[idx] = 0;
        }
    },

    natureRootVisual: {
        hook: 'onRenderVFX',
        cost: 0,
        tags: ['nature', 'visual'],
        trigger: { type: 'always' },
        execute: function(ctx) {
            var gfx = ctx.gfx, x = ctx.x, y = ctx.y, idx = ctx.idx, fac = ctx.fac;
            var vfx = (fac.params && fac.params.vfx) || {};
            var cRoot = vfx.cRoot !== undefined ? vfx.cRoot : 0xa0703a;
            var w = vfx.w !== undefined ? vfx.w : 3;
            var alpha = vfx.alpha !== undefined ? vfx.alpha : 1.0;

            var g = WorldState.layers.nature[idx];
            if (g <= 0) return;

            var t = g / 100;
            if (t > 1) t = 1;

            var GS = CONFIG.GRID.SIZE;
            var cx = x * GS + GS / 2;
            var cy = y * GS + GS / 2;
            var half = GS / 2;

            gfx.lineStyle(w, cRoot, alpha);
            if (t > 0.1) { gfx.moveTo(cx, cy); gfx.lineTo(cx, cy - half * t); }
            if (t > 0.3) { gfx.moveTo(cx, cy); gfx.lineTo(cx + half * t, cy); }
            if (t > 0.5) { gfx.moveTo(cx, cy); gfx.lineTo(cx, cy + half * t); }
            if (t > 0.7) { gfx.moveTo(cx, cy); gfx.lineTo(cx - half * t, cy); }
            if (t > 0.9) {
                gfx.moveTo(cx, cy); gfx.lineTo(cx + half * 0.7, cy - half * 0.7);
                gfx.moveTo(cx, cy); gfx.lineTo(cx - half * 0.7, cy + half * 0.7);
            }
            gfx.lineStyle(0);

            gfx.beginFill(cRoot, 0.6);
            gfx.drawCircle(cx, cy, 2 + t * 2);
            gfx.endFill();
        }
    },

// ============================================================
// MULTI PARTS
// ============================================================

multiAssignAbility: {
    hook: 'onTick',
    cost: 3,
    tags: ['multi', 'soul', 'assign'],
    trigger: { type: 'always' },
    execute: function(ctx) {
        var ws = ctx.ws, idx = ctx.idx, owner = ctx.owner, fac = ctx.fac;
        if (owner === -1 || !fac || fac.key !== 'multi') return;
        
        var soulLayer = ws.layers.multiSoul;
        if (!soulLayer) return;
        
        // Skip kalau sudah punya soul
        if (soulLayer[idx] > 0) return;
        
        var assignChance = (ctx.partData && ctx.partData.assignChance !== undefined)
            ? ctx.partData.assignChance : 0.5;
        if (Utils.fastRNG() >= assignChance) return;
        
        // Assign random soul (store ID + 1, 0 = no soul)
        var pool = (ctx.partData && ctx.partData.abilityPool) || [];
        if (pool.length === 0) return;
        
        var soulIdx = (Utils.fastRNG() * pool.length) | 0;
        // Simpan sebagai index + 1 (biar 0 = no soul)
        soulLayer[idx] = soulIdx + 1;
        
        // VFX
        VFX.spawn(
            Utils.getX(idx) * CONFIG.GRID.SIZE + 8,
            Utils.getY(idx) * CONFIG.GRID.SIZE + 8,
            fac.icon.color, 3, 'normal'
        );
        ws.playSound('chime');
    }
},

multiRandomAbility: {
    hook: 'onAttackSuccess',
    cost: 4,
    tags: ['multi', 'assign', 'capture'],
    trigger: { type: 'always' },
    execute: function(ctx) {
        var ws = ctx.ws, nIdx = ctx.nIdx, nx = ctx.nx, ny = ctx.ny, fac = ctx.fac;
        var soulLayer = ws.layers.multiSoul;
        if (!soulLayer) return;
        
        // Force assign saat capture
        var pool = (ctx.partData && ctx.partData.abilityPool) || [];
        if (pool.length === 0) return;
        
        var soulIdx = (Utils.fastRNG() * pool.length) | 0;
        soulLayer[nIdx] = soulIdx + 1;
        
        // VFX flash
        VFX.spawn(nx * CONFIG.GRID.SIZE + 8, ny * CONFIG.GRID.SIZE + 8, fac.icon.color, 5, 'normal');
        VFX.spawn(nx * CONFIG.GRID.SIZE + 8, ny * CONFIG.GRID.SIZE - 4, fac.icon.color, 1, 'text', 'SOUL!');
        ws.playSound('chime');
    }
},

multiSoulDefense: {
    hook: 'onDefendCalc',
    cost: 3,
    tags: ['multi', 'defense'],
    trigger: { type: 'always' },
    execute: function(ctx) {
        var ws = ctx.ws, idx = ctx.idx, basePower = ctx.basePower;
        var soulLayer = ws.layers.multiSoul;
        if (!soulLayer || soulLayer[idx] === 0) return basePower;
        
        var bonus = (ctx.partData && ctx.partData.baseDefenseBonus !== undefined)
            ? ctx.partData.baseDefenseBonus : 15;
        return basePower + bonus;
    }
},

multiAbilityBadge: {
    hook: 'onRenderTileLogic',
    cost: 0,
    tags: ['multi', 'visual'],
    trigger: { type: 'always' },
    execute: function(ctx) {
        var gfx = ctx.gfx, x = ctx.x, y = ctx.y, idx = ctx.idx, fac = ctx.fac;
        var ws = WorldState;
        var soulLayer = ws.layers.multiSoul;
        if (!soulLayer) return;
        
        var soulIdx = soulLayer[idx];
        if (soulIdx === 0) return;
        
        // Warna badge berdasarkan soul
        var pool = (fac.partData && fac.partData.multiAssignAbility && 
                    fac.partData.multiAssignAbility.abilityPool) || [];
        var abilityKey = pool[soulIdx - 1];
        if (!abilityKey) return;
        
        // Warna random per soul (deterministic)
        var hue = (soulIdx * 37) % 360;
        var GS = CONFIG.GRID.SIZE;
        
        // Dot badge kecil di pojok
        gfx.beginFill(0xffffff, 0.9);
        gfx.drawCircle(x * GS + GS - 3, y * GS + 3, 2);
        gfx.endFill();
        
        // Border berwarna
        gfx.lineStyle(1, 0xffffff, 0.4);
        gfx.drawRect(x * GS + 1, y * GS + 1, GS - 2, GS - 2);
        gfx.lineStyle(0);
    }
},

// ============================================================
// MIMIC PARTS
// ============================================================

mimicStealAbility: {
    hook: 'onAttackSuccess',
    cost: 4,
    tags: ['mimic', 'steal'],
    trigger: { type: 'always' },
    execute: function(ctx) {
        var ws = ctx.ws, idx = ctx.idx, nIdx = ctx.nIdx, nx = ctx.nx, ny = ctx.ny, fac = ctx.fac;
        var soulLayer = ws.layers.mimicStolen;
        if (!soulLayer) return;
        
        var targetOwner = ws.grid[nIdx];  // Sebelum capture
        // Karena onAttackSuccess dipanggil setelah nextGrid di-set,
        // kita perlu targetOwner dari sebelum — passed via ctx
        var stolenFrom = ws.factions[ctx.targetOwner];
        if (!stolenFrom) return;
        
        var stealChance = (ctx.partData && ctx.partData.stealChance !== undefined)
            ? ctx.partData.stealChance : 0.4;
        if (Utils.fastRNG() >= stealChance) return;
        
        // Cari ability dari faction yang dicuri
        var pool = (ctx.partData && ctx.partData.stealablePool) || [];
        // Pilih 1 ability faction target yang ada di pool
        // Simplify: pilih random dari pool
        if (pool.length === 0) return;
        
        var stolenIdx = (Utils.fastRNG() * pool.length) | 0;
        soulLayer[idx] = stolenIdx + 1;   // Store di attacker cell
        
        VFX.spawn(nx * CONFIG.GRID.SIZE + 8, ny * CONFIG.GRID.SIZE, fac.icon.color, 5, 'normal');
        VFX.spawn(idx % CONFIG.GRID.COLS * CONFIG.GRID.SIZE + 8,
                  (idx / CONFIG.GRID.COLS | 0) * CONFIG.GRID.SIZE - 4,
                  fac.icon.color, 1, 'text', 'STEAL!');
        ws.playSound('glitch');
    }
},

mimicAdaptTick: {
    hook: 'onTick',
    cost: 3,
    tags: ['mimic', 'adapt'],
    trigger: { type: 'always' },
    execute: function(ctx) {
        var ws = ctx.ws, idx = ctx.idx, owner = ctx.owner, fac = ctx.fac;
        if (owner === -1 || !fac || fac.key !== 'mimic') return;
        
        // Kalau ada stolen ability, spread ke cell mimic lain
        var soulLayer = ws.layers.mimicStolen;
        if (!soulLayer) return;
        
        // Kalau cell ini punya stolen, dan tetangga mimic tidak punya, copy
        if (soulLayer[idx] > 0) {
            var base = idx * 4;
            var neigh = CONFIG.NEIGHBOR_IDX;
            for (var d = 0; d < 4; d++) {
                var n = neigh[base + d];
                if (n === -1) continue;
                if (ws.grid[n] === owner && soulLayer[n] === 0) {
                    soulLayer[n] = soulLayer[idx];
                }
            }
        }
    }
},

mimicAdaptiveDefense: {
    hook: 'onDefendCalc',
    cost: 3,
    tags: ['mimic', 'defense'],
    trigger: { type: 'always' },
    execute: function(ctx) {
        var ws = ctx.ws, idx = ctx.idx, basePower = ctx.basePower;
        var soulLayer = ws.layers.mimicStolen;
        if (!soulLayer || soulLayer[idx] === 0) return basePower;
        
        var bonus = (ctx.partData && ctx.partData.baseDefenseBonus !== undefined)
            ? ctx.partData.baseDefenseBonus : 10;
        return basePower + bonus;
    }
},

mimicAbilityIndicator: {
    hook: 'onRenderTileLogic',
    cost: 0,
    tags: ['mimic', 'visual'],
    trigger: { type: 'always' },
    execute: function(ctx) {
        var gfx = ctx.gfx, x = ctx.x, y = ctx.y, idx = ctx.idx, fac = ctx.fac;
        var ws = WorldState;
        var soulLayer = ws.layers.mimicStolen;
        if (!soulLayer || soulLayer[idx] === 0) return;
        
        var GS = CONFIG.GRID.SIZE;
        
        // Glow circle untuk mimic yang punya stolen ability
        gfx.beginFill(0x00ddcc, 0.3);
        gfx.drawCircle(x * GS + GS / 2, y * GS + GS / 2, GS / 2 - 2);
        gfx.endFill();
        
        // Pulse outline
        var pulse = (Utils.fastSin((ctx.frame * 8) % 512) + 1) / 2;
        gfx.lineStyle(1, 0x66ffee, 0.3 + pulse * 0.5);
        gfx.drawRect(x * GS + 1, y * GS + 1, GS - 2, GS - 2);
        gfx.lineStyle(0);
    }
},

// ============================================================
// FRACTAL PARTS
// ============================================================

fractalMirrorTick: {
    hook: 'onTick',
    cost: 4,
    tags: ['fractal', 'mirror'],
    trigger: { type: 'always' },
    execute: function(ctx) {
        var ws = ctx.ws, idx = ctx.idx, owner = ctx.owner, fac = ctx.fac;
        if (owner === -1 || !fac || fac.key !== 'fractal') return;
        
        var mirrorLayer = ws.layers.fractalMirror;
        if (!mirrorLayer) return;
        
        // Reset mirror layer setiap N tick untuk re-evaluate
        // (karena tetangga bisa berubah)
        if (mirrorLayer[idx] > 0 && ws._powerTick % 5 !== 0) {
            // Skip re-evaluate sampai 5 tick
            return;
        }
        
        var mirrorChance = (ctx.partData && ctx.partData.mirrorChance !== undefined)
            ? ctx.partData.mirrorChance : 0.3;
        if (Utils.fastRNG() >= mirrorChance) return;
        
        // Cek 4 tetangga — cari yang owned faction lain
        var base = idx * 4;
        var neigh = CONFIG.NEIGHBOR_IDX;
        var mirrorCount = 0;
        
        for (var d = 0; d < 4; d++) {
            var n = neigh[base + d];
            if (n === -1) continue;
            var nOwner = ws.grid[n];
            if (nOwner !== -1 && nOwner !== owner) {
                mirrorCount++;
            }
        }
        
        // Store mirror count sebagai layer value
        mirrorLayer[idx] = mirrorCount;
        
        if (mirrorCount > 0) {
            VFX.spawn(
                Utils.getX(idx) * CONFIG.GRID.SIZE + 8,
                Utils.getY(idx) * CONFIG.GRID.SIZE + 8,
                fac.icon.color, 2, 'trail'
            );
        }
    }
},

fractalMirrorDefense: {
    hook: 'onDefendCalc',
    cost: 3,
    tags: ['fractal', 'defense', 'mirror'],
    trigger: { type: 'always' },
    execute: function(ctx) {
        var ws = ctx.ws, idx = ctx.idx, basePower = ctx.basePower;
        var mirrorLayer = ws.layers.fractalMirror;
        if (!mirrorLayer || mirrorLayer[idx] === 0) return basePower;
        
        var baseBonus = (ctx.partData && ctx.partData.baseDefenseBonus !== undefined)
            ? ctx.partData.baseDefenseBonus : 5;
        var maxBonus = (ctx.partData && ctx.partData.maxBonus !== undefined)
            ? ctx.partData.maxBonus : 30;
        
        var bonus = Math.min(maxBonus, mirrorLayer[idx] * baseBonus);
        return basePower + bonus;
    }
},

fractalMirrorVisual: {
    hook: 'onRenderTileLogic',
    cost: 0,
    tags: ['fractal', 'visual'],
    trigger: { type: 'always' },
    execute: function(ctx) {
        var gfx = ctx.gfx, x = ctx.x, y = ctx.y, idx = ctx.idx, fac = ctx.fac;
        var ws = WorldState;
        var mirrorLayer = ws.layers.fractalMirror;
        if (!mirrorLayer || mirrorLayer[idx] === 0) return;
        
        var GS = CONFIG.GRID.SIZE;
        var mirrorCount = mirrorLayer[idx];
        
        // Border dengan opasitas sesuai mirror count
        var alpha = Math.min(1.0, mirrorCount * 0.2);
        gfx.lineStyle(2, 0x8844ff, alpha);
        gfx.drawRect(x * GS + 1, y * GS + 1, GS - 2, GS - 2);
        gfx.lineStyle(0);
        
        // Kecil diamond di tengah
        if (mirrorCount >= 2) {
            var cx = x * GS + GS / 2;
            var cy = y * GS + GS / 2;
            gfx.beginFill(0xcc88ff, alpha);
            gfx.moveTo(cx, cy - 3);
            gfx.lineTo(cx + 3, cy);
            gfx.lineTo(cx, cy + 3);
            gfx.lineTo(cx - 3, cy);
            gfx.lineTo(cx, cy - 3);
            gfx.endFill();
        }
    }
},

};

if (typeof window !== 'undefined') window.ABILITY_PARTS = ABILITY_PARTS;