/**
 * GLITCH — Diagonal Anomaly Spread faction.
 * Defines its signature diagonal spread + orthogonal shift anomaly and RGB glitch visual in `customAbilities`.
 */

import { CONFIG, Utils } from '../../core/config.js';
import { defineFaction } from '../../core/faction-builder.js';

export const glitch = defineFaction({
    id: 5,
    name: 'Glitch',
    key: 'glitch',
    icon: { glyph: '\ue015', unicode: '👾', color: '#ff00ff' },
    baseStats: { att: 60, res: 40, spr: 60 },
    traits: {
        isHazard: false,
        isBlocker: false,
        freezeImmune: false,
        skipStandardSpread: true
    },
    customAbilities: {
        glitchDiagSpread: {
            hook: 'onTick',
            cost: 4,
            tags: ['glitch', 'spread', 'diagonal'],
            trigger: { type: 'chance', value: 0.7 },
            data: { anomalyChance: 0.03 },
            execute: function(ctx) {
                var ws = ctx.ws, idx = ctx.idx, owner = ctx.owner, fac = ctx.fac;
                if (owner === -1 || !fac || fac.key !== 'glitch') return;

                var anomalyChance = (ctx.partData && ctx.partData.anomalyChance !== undefined)
                    ? ctx.partData.anomalyChance : 0.01;
                var isAnomaly = ctx.actions.rollChance(anomalyChance);
                var nIdx = isAnomaly
                    ? ctx.actions.randomNeighbor(idx)
                    : ctx.actions.randomDiagNeighbor(idx);
                if (nIdx === -1) return;

                var targetOwner = ws.grid[nIdx];
                if (targetOwner === owner) return;
                if (targetOwner === -1 && ws.capturedThisTick[nIdx]) return;

                var myP = ctx.actions.calcAttackPower(owner, idx);
                var enP = targetOwner === -1 ? 0 : ctx.actions.calcDefensePower(targetOwner, nIdx);
                if (myP <= enP) return;

                if (ctx.actions.captureCell(nIdx, owner)) {
                    ctx.actions.spawnParticles(nIdx, fac.icon.color, 3, 'normal');
                    if (isAnomaly) {
                        ctx.actions.spawnText(nIdx, 'SHIFT', CONFIG.VFX.COLORS.GLITCH, false);
                    }
                    ctx.actions.sound('glitch');
                }
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
        }
    },
    params: {
        vfx: { c1: 0xff00ff, c2: 0x00ffff, rate: 0.1, off: 4 }
    },
    maxBudget: 10,
    rarity: 'starter',
    descShort: 'Diag. Spread',
    descLong: 'Spreads DIAGONALLY. Chance to shift orthogonally (anomaly).'
});
