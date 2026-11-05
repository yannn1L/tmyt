/**
 * BASE ABILITIES — Reusable, parameterized ECS ability components available to all factions.
 *
 * Any faction can reference these base abilities in `ability: { onTick: [...], ... }`
 * and customize their behavior via `partData`.
 * Faction-unique signature mechanics live in each faction's own `customAbilities` block.
 */

import { CONFIG, Utils } from '../core/config.js';
import { VFX } from '../core/vfx.js';

export const BASE_ABILITIES = {

    /* ==================================================================== */
    /* 1. REUSABLE AURA & FORMATION DEFENSE                                 */
    /* ==================================================================== */

    adjacentAllyDefenseAura: {
        hook: 'onDefendCalc',
        cost: 3,
        tags: ['base', 'defense', 'aura', 'formation'],
        trigger: { type: 'always' },
        data: { allyDefBonus: 10 },
        execute: function(ctx) {
            var bonus = (ctx.partData && ctx.partData.allyDefBonus !== undefined)
                ? ctx.partData.allyDefBonus : 10;
            var allies = ctx.actions.countAdjacentAllies(ctx.idx, ctx.facId);
            return ctx.basePower + allies * bonus;
        }
    },

    /* ==================================================================== */
    /* 2. REUSABLE HAZARD & CONTAGION SPREAD                                */
    /* ==================================================================== */

    hazardBurnSpreadTick: {
        hook: 'onTick',
        cost: 3,
        tags: ['base', 'hazard', 'dot', 'spread'],
        tickLayerKey: 'inferno',
        trigger: { type: 'chance', value: 0.5 },
        data: { spreadChance: 0.5, diminishRate: 15 },
        execute: function(ctx) {
            var ws = ctx.ws, idx = ctx.idx, owner = ctx.owner, fac = ctx.fac;
            var layerKey = (ctx.partData && ctx.partData.layerKey) || 'inferno';
            var immuneKey = (ctx.partData && ctx.partData.immuneFactionKey) || layerKey;
            var layer = ws.layers[layerKey];
            if (!layer) return;

            var currentVal = layer[idx];
            if (currentVal <= 0) return;

            if (owner !== -1 && (!fac || fac.key !== immuneKey)) {
                ws.nextGrid[idx] = -1;
            }

            var spreadChance = (ctx.partData && ctx.partData.spreadChance !== undefined)
                ? ctx.partData.spreadChance : 0.5;
            if (Utils.fastRNG() >= spreadChance) return;

            var diminishRate = (ctx.partData && ctx.partData.diminishRate !== undefined)
                ? ctx.partData.diminishRate : 15;

            ctx.actions.spreadLayerToRandomNeighbor(layerKey, idx, diminishRate);
        }
    },

    hazardIgniteOnAttack: {
        hook: 'onAttackSuccess',
        cost: 3,
        tags: ['base', 'hazard', 'ignite'],
        trigger: { type: 'chance', value: 0.8 },
        data: { text: 'BURN!', sound: 'burn', particleStyle: 'fire', particleCount: 8 },
        execute: function(ctx) {
            var nIdx = ctx.nIdx, nx = ctx.nx, ny = ctx.ny, fac = ctx.fac;
            var pd = ctx.partData || {};
            var layerKey = pd.layerKey || (fac && fac.key) || 'inferno';
            var layerMax = pd.layerMax || (fac && fac.params && fac.params.layerMax) || 100;

            ctx.actions.setLayer(layerKey, nIdx, layerMax);
            ctx.actions.sound(pd.sound || 'burn');

            var cw = CONFIG.GRID.CELL_W || CONFIG.GRID.SIZE;
            var ch = CONFIG.GRID.CELL_H || CONFIG.GRID.SIZE;
            var px = nx * cw + cw * 0.5;
            var py = ny * ch + ch * 0.5;
            var pColor = pd.particleColor || CONFIG.VFX.COLORS.PARTICLE_FIRE;
            var tColor = pd.textColor || CONFIG.VFX.COLORS.TEXT_FIRE;
            VFX.spawn(px, py, pColor, pd.particleCount || 8, pd.particleStyle || 'fire');
            VFX.spawn(px, py - 4, tColor, 1, 'text', pd.text || 'BURN!');
        }
    },

    aoeNovaOnAttack: {
        hook: 'onAttackSuccess',
        cost: 4,
        tags: ['base', 'aoe', 'nova', 'freeze'],
        trigger: { type: 'chance', value: 0.5 },
        data: { text: 'NOVA!', sound: 'freeze', shockRadius: 40 },
        execute: function(ctx) {
            var nIdx = ctx.nIdx, nx = ctx.nx, ny = ctx.ny, fac = ctx.fac;
            var pd = ctx.partData || {};
            var layerKey = pd.layerKey || (fac && fac.key) || 'ices';
            var layerMax = pd.layerMax || (fac && fac.params && fac.params.layerMax) || 100;

            ctx.actions.setLayer(layerKey, nIdx, layerMax);
            ctx.actions.forEachNeighbor(nIdx, function(nnn) {
                ctx.actions.setLayer(layerKey, nnn, layerMax);
            });

            ctx.actions.sound(pd.sound || 'freeze');
            var cw = CONFIG.GRID.CELL_W || CONFIG.GRID.SIZE;
            var ch = CONFIG.GRID.CELL_H || CONFIG.GRID.SIZE;
            var px = nx * cw + cw * 0.5;
            var py = ny * ch + ch * 0.5;
            var shockC = pd.shockC || (fac && fac.params && fac.params.vfx && fac.params.vfx.shockC) || '#00ffff';
            VFX.spawnShockwave(px, py, shockC, pd.shockRadius || 40, 3, 2);
            VFX.spawn(px, py, pd.particleColor || CONFIG.VFX.COLORS.PARTICLE_ICE, 4, pd.particleStyle || 'ice');
            VFX.spawn(px, py - 4, pd.textColor || CONFIG.VFX.COLORS.TEXT_ICE, 1, 'text', pd.text || 'NOVA!');
        }
    },

    contagionSpreadTick: {
        hook: 'onTick',
        cost: 3,
        tags: ['base', 'contagion', 'spread'],
        tickLayerKey: 'sickening',
        trigger: { type: 'chance', value: 0.2 },
        data: { diminishRate: 10 },
        execute: function(ctx) {
            var pd = ctx.partData || {};
            var layerKey = pd.layerKey || 'sickening';
            var diminishRate = pd.diminishRate !== undefined ? pd.diminishRate : 10;
            ctx.actions.spreadLayerToRandomNeighbor(layerKey, ctx.idx, diminishRate);
        }
    },

    applyLayerOnBeforeAttack: {
        hook: 'onBeforeAttack',
        cost: 3,
        tags: ['base', 'debuff', 'layer'],
        trigger: { type: 'chance', value: 0.4 },
        execute: function(ctx) {
            var pd = ctx.partData || {};
            var fac = ctx.fac;
            var layerKey = pd.layerKey || (fac && fac.key) || 'sickening';
            var layerMax = pd.layerMax || (fac && fac.params && fac.params.layerMax) || 100;
            ctx.actions.setLayer(layerKey, ctx.nIdx, layerMax);
        }
    },

    autoCaptureInfectedOnBeforeAttack: {
        hook: 'onBeforeAttack',
        cost: 4,
        tags: ['base', 'auto-capture'],
        trigger: { type: 'always' },
        data: { autoCap: 0.2, text: 'AUTO!', color: '#a3cc29' },
        execute: function(ctx) {
            var ws = ctx.ws, nIdx = ctx.nIdx, owner = ctx.owner;
            var pd = ctx.partData || {};
            var layerKey = pd.layerKey || 'sickening';
            if (ctx.actions.getLayer(layerKey, nIdx) <= 0) return;

            var targetOwner = ws.grid[nIdx];
            if (targetOwner === owner || targetOwner === -1) return;
            if (ws.capturedThisTick[nIdx]) return;

            var autoCap = pd.autoCap !== undefined ? pd.autoCap : 0.2;
            if (!ctx.actions.rollChance(autoCap)) return;

            ctx.actions.captureCell(nIdx, owner);
            var col = pd.color || '#a3cc29';
            ctx.actions.spawnParticles(nIdx, col, 4, 'normal');
            ctx.actions.spawnText(nIdx, pd.text || 'AUTO!', col, false);
            ctx.actions.sound('capture');
        }
    },

    /* ==================================================================== */
    /* 3. REUSABLE STACKING DOT & DEBUFF MECHANICS                          */
    /* ==================================================================== */

    stackLayerOnBeforeAttack: {
        hook: 'onBeforeAttack',
        cost: 3,
        tags: ['base', 'stack', 'dot'],
        trigger: { type: 'chance', value: 0.7 },
        data: { stackPerHit: 8, maxStack: 100 },
        execute: function(ctx) {
            var pd = ctx.partData || {};
            var layerKey = pd.layerKey || 'poison';
            var stackPerHit = pd.stackPerHit !== undefined ? pd.stackPerHit : 8;
            var maxStack = pd.maxStack !== undefined ? pd.maxStack : 100;
            ctx.actions.addLayer(layerKey, ctx.nIdx, stackPerHit, maxStack);
        }
    },

    stackDecayDamageTick: {
        hook: 'onTick',
        cost: 4,
        tags: ['base', 'damage', 'decay'],
        tickLayerKey: 'poison',
        trigger: { type: 'layer', key: 'poison' },
        data: { tickDecay: 5, color: '#a020f0' },
        execute: function(ctx) {
            var pd = ctx.partData || {};
            var layerKey = pd.layerKey || 'poison';
            var cur = ctx.actions.getLayer(layerKey, ctx.idx);
            if (cur <= 0) return;

            var tickDecay = pd.tickDecay !== undefined ? pd.tickDecay : 5;
            var v = cur - tickDecay;
            var nextVal = v & ~(v >> 31);
            ctx.actions.setLayer(layerKey, ctx.idx, nextVal);

            if (nextVal > 0 && nextVal % 20 === 0) {
                var x = CONFIG.CELL_X[ctx.idx];
                var y = CONFIG.CELL_Y[ctx.idx];
                var cw = CONFIG.GRID.CELL_W || CONFIG.GRID.SIZE;
                var ch = CONFIG.GRID.CELL_H || CONFIG.GRID.SIZE;
                VFX.spawn(x * cw + cw * 0.5, y * ch + ch * 0.5, pd.color || '#a020f0', 3, 'normal');
            }
        }
    },

    stackPowerPenalty: {
        hook: 'onPowerCalc',
        cost: 3,
        tags: ['base', 'debuff', 'penalty'],
        trigger: { type: 'layer', key: 'poison' },
        data: { powerPenalty: 0.6 },
        execute: function(ctx) {
            var pd = ctx.partData || {};
            var layerKey = pd.layerKey || 'poison';
            var powerPenalty = pd.powerPenalty !== undefined ? pd.powerPenalty : 0.6;
            var stacks = ctx.actions.getLayer(layerKey, ctx.idx);
            var mult = 1.0 - Math.min(0.5, stacks / 200);
            return ctx.basePower * mult * powerPenalty;
        }
    },

    /* ==================================================================== */
    /* 4. REUSABLE SHIELD, ROOT GROWTH, SPORE & MARTYRDOM                   */
    /* ==================================================================== */

    layerBuildupTick: {
        hook: 'onTick',
        cost: 3,
        tags: ['base', 'shield', 'grow', 'buildup'],
        tickScope: 'owner',
        clearOnOwnerLoss: true,
        trigger: { type: 'always' },
        data: { buildRate: 15, maxShield: 100 },
        execute: function(ctx) {
            var ws = ctx.ws, idx = ctx.idx, owner = ctx.owner, fac = ctx.fac;
            var pd = ctx.partData || {};
            var layerKey = pd.layerKey || (fac && fac.key) || 'bastion';
            var ownerKey = pd.ownerKey || layerKey;
            var layer = ws.layers[layerKey];
            if (!layer) return;

            if (owner === -1 || !fac || fac.key !== ownerKey) {
                if (layer[idx] !== 0) layer[idx] = 0;
                return;
            }

            var rate = pd.rate !== undefined ? pd.rate : (pd.buildRate !== undefined ? pd.buildRate : 15);
            var cap = pd.layerMax !== undefined ? pd.layerMax : (pd.maxShield !== undefined ? pd.maxShield : 100);
            ctx.actions.addLayer(layerKey, idx, rate, cap);
        }
    },

    layerFlatDefenseBonus: {
        hook: 'onDefendCalc',
        cost: 4,
        tags: ['base', 'defense', 'shield'],
        trigger: { type: 'always' },
        data: { defMultiplier: 1.0 },
        execute: function(ctx) {
            var pd = ctx.partData || {};
            var layerKey = pd.layerKey || (ctx.fac && ctx.fac.key) || 'bastion';
            var mult = pd.defMultiplier !== undefined ? pd.defMultiplier : 1.0;
            var val = ctx.actions.getLayer(layerKey, ctx.idx);
            if (val <= 0) return ctx.basePower;
            return ctx.basePower + val * mult;
        }
    },

    layerResetOnDefendFail: {
        hook: 'onDefendFail',
        cost: 2,
        tags: ['base', 'reset'],
        trigger: { type: 'always' },
        execute: function(ctx) {
            var pd = ctx.partData || {};
            var layerKey = pd.layerKey || (ctx.fac && ctx.fac.key) || 'nature';
            var targetCell = ctx.nIdx !== undefined ? ctx.nIdx : ctx.idx;
            if (targetCell !== undefined) {
                ctx.actions.setLayer(layerKey, targetCell, 0);
            }
        }
    },

    sporeJumpSpreadTick: {
        hook: 'onTick',
        cost: 4,
        tags: ['base', 'spore', 'teleport', 'jump'],
        tickScope: 'owner',
        trigger: { type: 'threshold', key: 'nature', value: 100 },
        data: { sporeChance: 0.05 },
        execute: function(ctx) {
            var pd = ctx.partData || {};
            var sporeChance = pd.sporeChance !== undefined ? pd.sporeChance : 0.05;
            if (!ctx.actions.rollChance(sporeChance)) return;

            var jumpIdx = ctx.actions.randomJump2Neighbor(ctx.idx);
            if (jumpIdx === -1) return;

            if (ctx.actions.captureCell(jumpIdx, ctx.owner)) {
                ctx.actions.spawnParticles(jumpIdx, ctx.fac.icon.color, 3, 'normal');
            }
        }
    },

    martyrdomDetonateOnFail: {
        hook: 'onDefendFail',
        cost: 5,
        tags: ['base', 'martyrdom', 'aoe'],
        trigger: { type: 'chance', value: 1.0 },
        data: { radius: 1, shockC: '#ff5500', rMax: 60, spd: 5, w: 4, text: 'BOOM!' },
        execute: function(ctx) {
            var nIdx = ctx.nIdx, targetOwner = ctx.targetOwner;
            var pd = ctx.partData || {};
            var x = CONFIG.CELL_X[nIdx];
            var y = CONFIG.CELL_Y[nIdx];
            var radius = pd.radius !== undefined ? pd.radius : 1;

            ctx.actions.clearArea(x, y, radius, targetOwner, ['nature']);

            var shockC = pd.shockC || '#ff5500';
            var rMax = pd.rMax !== undefined ? pd.rMax : 60;
            var spd = pd.spd !== undefined ? pd.spd : 5;
            var w = pd.w !== undefined ? pd.w : 4;
            var cw = CONFIG.GRID.CELL_W || CONFIG.GRID.SIZE;
            var ch = CONFIG.GRID.CELL_H || CONFIG.GRID.SIZE;
            var px = x * cw + cw * 0.5;
            var py = y * ch + ch * 0.5;
            VFX.spawnShockwave(px, py, shockC, rMax, spd, w);
            VFX.spawn(px, py - 4, CONFIG.VFX.COLORS.BOMB, 1, 'text', pd.text || 'BOOM!');
            ctx.actions.sound('bomb');
            ctx.actions.shake(CONFIG.VFX.SHAKE.BOMB);
        }
    },

    /* ==================================================================== */
    /* 5. REUSABLE VISUAL SHADERS & OVERLAYS                                */
    /* ==================================================================== */

    flameBarsVisual: {
        hook: 'onRenderVFX',
        cost: 0,
        tags: ['base', 'visual', 'fire'],
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
            var f1 = Math.abs(Utils.fastSin((frame * spd1 + idx) & 511)) * (GS * sz1);
            var f2 = Math.abs(Utils.fastSin((frame * spd2 + idx * 2) & 511)) * (GS * sz2);
            var f3 = Math.abs(Utils.fastSin((frame * spd3 + idx * 3) & 511)) * (GS * sz3);
            gfx.beginFill(c1); gfx.drawRect(x * GS + 2, y * GS + GS - f1, 4, f1); gfx.endFill();
            gfx.beginFill(c2); gfx.drawRect(x * GS + 6, y * GS + GS - f2, 4, f2); gfx.endFill();
            gfx.beginFill(c3); gfx.drawRect(x * GS + 10, y * GS + GS - f3, 4, f3); gfx.endFill();
        }
    },

    layerTintOverlayVisual: {
        hook: 'onRenderVFX',
        cost: 0,
        tags: ['base', 'visual', 'tint'],
        trigger: { type: 'always' },
        execute: function(ctx) {
            var gfx = ctx.gfx, x = ctx.x, y = ctx.y, idx = ctx.idx, fac = ctx.fac, ws = ctx.ws;
            var vfx = (fac.params && fac.params.vfx) || {};
            var layerKey = (ctx.partData && ctx.partData.layerKey) || (fac && fac.key) || 'ices';
            var layer = ws.layers[layerKey];
            if (!layer || layer[idx] <= 0) return;
            var cFill = vfx.cFill !== undefined ? vfx.cFill : 0x00ffff;
            var aFill = vfx.aFill !== undefined ? vfx.aFill : 300;
            var GS = CONFIG.GRID.SIZE;
            gfx.beginFill(cFill, layer[idx] / aFill);
            gfx.drawRect(x * GS, y * GS, GS, GS);
            gfx.endFill();
        }
    },

    pulsingGridTileVisual: {
        hook: 'onRenderTileLogic',
        cost: 0,
        tags: ['base', 'visual', 'grid'],
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
            var pulse = (Utils.fastSin((frame * spd) & 511) + 1) * 0.5;
            gfx.beginFill(cOut, aBase + pulse * aRnd);
            gfx.drawRect(x * GS + pad, y * GS + pad, GS - (pad * 2), GS - (pad * 2));
            gfx.endFill();
        }
    },

    shieldBorderTileVisual: {
        hook: 'onRenderTileLogic',
        cost: 0,
        tags: ['base', 'visual', 'shield'],
        trigger: { type: 'always' },
        execute: function(ctx) {
            var gfx = ctx.gfx, x = ctx.x, y = ctx.y, idx = ctx.idx, fac = ctx.fac, ws = ctx.ws;
            var vfx = (fac.params && fac.params.vfx) || {};
            var layerKey = (ctx.partData && ctx.partData.layerKey) || (fac && fac.key) || 'bastion';
            var cBase = vfx.cBase !== undefined ? vfx.cBase : 0x8b4513;
            var cLine = vfx.cLine !== undefined ? vfx.cLine : 0xffaa00;
            var GS = CONFIG.GRID.SIZE;
            var shieldPower = ws.layers[layerKey] ? ws.layers[layerKey][idx] : 0;
            if (shieldPower <= 0) return;
            gfx.beginFill(cBase, shieldPower / 100);
            gfx.drawRect(x * GS + 1, y * GS + 1, GS - 2, GS - 2);
            gfx.endFill();
            gfx.lineStyle(1, cLine, (shieldPower / 100) * 0.8);
            gfx.drawRect(x * GS, y * GS, GS, GS);
            gfx.lineStyle(0);
        }
    },

    bubbleOverlayVisual: {
        hook: 'onRenderVFX',
        cost: 0,
        tags: ['base', 'visual', 'bubbles'],
        trigger: { type: 'always' },
        execute: function(ctx) {
            var gfx = ctx.gfx, x = ctx.x, y = ctx.y, idx = ctx.idx, fac = ctx.fac, ws = ctx.ws;
            var vfx = (fac.params && fac.params.vfx) || {};
            var layerKey = (ctx.partData && ctx.partData.layerKey) || (fac && fac.key) || 'sickening';
            var cBase = vfx.cBase !== undefined ? vfx.cBase : 0xa3cc29;
            var cBub = vfx.cBub !== undefined ? vfx.cBub : 0x66ff00;
            var bubSz = vfx.bubSz !== undefined ? vfx.bubSz : 3;
            var GS = CONFIG.GRID.SIZE;
            var val = ws.layers[layerKey] ? ws.layers[layerKey][idx] : 0;
            if (val <= 0) return;
            gfx.beginFill(cBase, val / 250);
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

    dropletOverlayVisual: {
        hook: 'onRenderVFX',
        cost: 0,
        tags: ['base', 'visual', 'droplets'],
        trigger: { type: 'always' },
        execute: function(ctx) {
            var gfx = ctx.gfx, x = ctx.x, y = ctx.y, idx = ctx.idx, frame = ctx.frame, fac = ctx.fac, ws = ctx.ws;
            var vfx = (fac.params && fac.params.vfx) || {};
            var layerKey = (ctx.partData && ctx.partData.layerKey) || (fac && fac.key) || 'poison';
            var cBase = vfx.cBase !== undefined ? vfx.cBase : 0xa020f0;
            var cDrop = vfx.cDrop !== undefined ? vfx.cDrop : 0x6600cc;
            var GS = CONFIG.GRID.SIZE;
            var val = ws.layers[layerKey] ? ws.layers[layerKey][idx] : 0;
            if (val <= 0) return;
            gfx.beginFill(cBase, val / 300);
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

    branchingRootsVisual: {
        hook: 'onRenderVFX',
        cost: 0,
        tags: ['base', 'visual', 'roots'],
        trigger: { type: 'always' },
        execute: function(ctx) {
            var gfx = ctx.gfx, x = ctx.x, y = ctx.y, idx = ctx.idx, fac = ctx.fac, ws = ctx.ws;
            var vfx = (fac.params && fac.params.vfx) || {};
            var layerKey = (ctx.partData && ctx.partData.layerKey) || (fac && fac.key) || 'nature';
            var cRoot = vfx.cRoot !== undefined ? vfx.cRoot : 0xa0703a;
            var w = vfx.w !== undefined ? vfx.w : 3;
            var alpha = vfx.alpha !== undefined ? vfx.alpha : 1.0;

            var g = ws.layers[layerKey] ? ws.layers[layerKey][idx] : 0;
            if (g <= 0) return;

            var t = g / 100;
            if (t > 1) t = 1;

            var GS = CONFIG.GRID.SIZE;
            var half = GS * 0.5;
            var cx = x * GS + half;
            var cy = y * GS + half;

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
    }
};

/**
 * ABILITY_PARTS — Combines all reusable `BASE_ABILITIES` with semantic aliases
 * so factions can reference either generic reusable names (`adjacentAllyDefenseAura`)
 * or classic part names (`icesColdAura`, `mechaPhalanxDef`, `infernoBurnTick`, etc.).
 */
export const ABILITY_PARTS = Object.assign({}, BASE_ABILITIES, {
    // Inferno aliases
    infernoBurnTick: BASE_ABILITIES.hazardBurnSpreadTick,
    infernoIgnite: BASE_ABILITIES.hazardIgniteOnAttack,
    infernoFireVisual: BASE_ABILITIES.flameBarsVisual,

    // Ices aliases
    icesFrostNova: BASE_ABILITIES.aoeNovaOnAttack,
    icesColdAura: BASE_ABILITIES.adjacentAllyDefenseAura,
    icesFrostVisual: BASE_ABILITIES.layerTintOverlayVisual,

    // Mecha aliases
    mechaPhalanxDef: Object.assign({}, BASE_ABILITIES.adjacentAllyDefenseAura, { cost: 5 }),
    mechaGridVisual: BASE_ABILITIES.pulsingGridTileVisual,

    // Bastion aliases
    bastionShieldBuild: BASE_ABILITIES.layerBuildupTick,
    bastionShieldDef: BASE_ABILITIES.layerFlatDefenseBonus,
    bastionShieldVisual: BASE_ABILITIES.shieldBorderTileVisual,

    // Sickening aliases
    sickeningContagion: BASE_ABILITIES.contagionSpreadTick,
    sickeningWeakness: BASE_ABILITIES.applyLayerOnBeforeAttack,
    sickeningAutoCapture: BASE_ABILITIES.autoCaptureInfectedOnBeforeAttack,
    sickeningPukeVisual: BASE_ABILITIES.bubbleOverlayVisual,

    // Poison aliases
    poisonStackApply: BASE_ABILITIES.stackLayerOnBeforeAttack,
    poisonDamageTick: BASE_ABILITIES.stackDecayDamageTick,
    poisonPenalty: BASE_ABILITIES.stackPowerPenalty,
    poisonLiquidVisual: BASE_ABILITIES.dropletOverlayVisual,

    // Bomber aliases
    bomberDetonate: BASE_ABILITIES.martyrdomDetonateOnFail,

    // Nature aliases
    natureGrowRoots: Object.assign({}, BASE_ABILITIES.layerBuildupTick, {
        data: { layerKey: 'nature', ownerKey: 'nature', layerMax: 100, rate: 10 }
    }),
    natureRootDefense: Object.assign({}, BASE_ABILITIES.layerFlatDefenseBonus, {
        data: { layerKey: 'nature', defMultiplier: 0.6 }
    }),
    natureSporeBurst: BASE_ABILITIES.sporeJumpSpreadTick,
    natureRootReset: Object.assign({}, BASE_ABILITIES.layerResetOnDefendFail, {
        data: { layerKey: 'nature' }
    }),
    natureRootVisual: BASE_ABILITIES.branchingRootsVisual
});

if (typeof window !== 'undefined') {
    window.BASE_ABILITIES = BASE_ABILITIES;
    window.ABILITY_PARTS = ABILITY_PARTS;
}