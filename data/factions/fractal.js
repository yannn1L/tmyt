/**
 * FRACTAL — Neighbor Mirror synergy faction.
 * Defines its signature neighbor-mirroring tick, scaling mirror defense, and crystal visual in `customAbilities`.
 */

import { CONFIG } from '../../core/config.js';
import { defineFaction } from '../../core/faction-builder.js';

export const fractal = defineFaction({
    id: 12,
    name: 'Fractal',
    key: 'fractal',
    icon: { glyph: '\ue01c', unicode: '🔷', color: '#8844ff' },
    baseStats: { att: 40, res: 60, spr: 70 },
    traits: {
        isHazard: false,
        isBlocker: false,
        freezeImmune: false,
        skipStandardSpread: false
    },
    customAbilities: {
        fractalMirrorTick: {
            hook: 'onTick',
            cost: 4,
            tags: ['fractal', 'mirror'],
            trigger: { type: 'always' },
            data: { mirrorChance: 0.3, mirrorRadius: 1 },
            execute: function(ctx) {
                var ws = ctx.ws, idx = ctx.idx, owner = ctx.owner, fac = ctx.fac;
                if (owner === -1 || !fac || fac.key !== 'fractal') return;

                var curMirror = ctx.actions.getLayer('fractalMirror', idx);
                if (curMirror > 0 && ws._powerTick % 5 !== 0) {
                    return;
                }

                var mirrorChance = (ctx.partData && ctx.partData.mirrorChance !== undefined)
                    ? ctx.partData.mirrorChance : 0.3;
                if (!ctx.actions.rollChance(mirrorChance)) return;

                var mirrorCount = ctx.actions.countAdjacentEnemies(idx, owner);
                ctx.actions.setLayer('fractalMirror', idx, mirrorCount);
                if (mirrorCount > 0) {
                    ctx.actions.spawnParticles(idx, fac.icon.color, 2, 'trail');
                }
            }
        },

        fractalMirrorDefense: {
            hook: 'onDefendCalc',
            cost: 3,
            tags: ['fractal', 'defense', 'mirror'],
            trigger: { type: 'always' },
            data: { baseDefenseBonus: 5, maxBonus: 30 },
            execute: function(ctx) {
                var mirrorCount = ctx.actions.getLayer('fractalMirror', ctx.idx);
                if (mirrorCount <= 0) return ctx.basePower;

                var baseBonus = (ctx.partData && ctx.partData.baseDefenseBonus !== undefined)
                    ? ctx.partData.baseDefenseBonus : 5;
                var maxBonus = (ctx.partData && ctx.partData.maxBonus !== undefined)
                    ? ctx.partData.maxBonus : 30;

                var bonus = Math.min(maxBonus, mirrorCount * baseBonus);
                return ctx.basePower + bonus;
            }
        },

        fractalMirrorVisual: {
            hook: 'onRenderTileLogic',
            cost: 0,
            tags: ['fractal', 'visual'],
            trigger: { type: 'always' },
            execute: function(ctx) {
                var gfx = ctx.gfx, x = ctx.x, y = ctx.y, idx = ctx.idx, ws = ctx.ws;
                var mirrorLayer = ws.layers.fractalMirror;
                if (!mirrorLayer || mirrorLayer[idx] === 0) return;

                var GS = CONFIG.GRID.SIZE;
                var mirrorCount = mirrorLayer[idx];

                var alpha = Math.min(1.0, mirrorCount * 0.2);
                gfx.lineStyle(2, 0x8844ff, alpha);
                gfx.drawRect(x * GS + 1, y * GS + 1, GS - 2, GS - 2);
                gfx.lineStyle(0);

                if (mirrorCount >= 2) {
                    var cx = x * GS + GS * 0.5;
                    var cy = y * GS + GS * 0.5;
                    gfx.beginFill(0xcc88ff, alpha);
                    gfx.moveTo(cx, cy - 3);
                    gfx.lineTo(cx + 3, cy);
                    gfx.lineTo(cx, cy + 3);
                    gfx.lineTo(cx - 3, cy);
                    gfx.lineTo(cx, cy - 3);
                    gfx.endFill();
                }
            }
        }
    },
    params: {
        extraLayers: ['fractalMirror'],
        vfx: {
            cMirror: 0x8844ff,
            cEdge: 0xcc88ff
        }
    },
    maxBudget: 12,
    rarity: 'epic',
    descShort: 'Neighbor Mirror',
    descLong: 'Copies abilities from adjacent territories. Chaotic synergy.'
});
