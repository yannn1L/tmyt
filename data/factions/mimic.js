/**
 * MIMIC — Adaptive Thief faction.
 * Defines its signature ability theft, neighbor adaptation propagation, adaptive defense, and indicator in `customAbilities`.
 */

import { CONFIG, Utils } from '../../core/config.js';
import { defineFaction } from '../../core/faction-builder.js';

const MIMIC_STEALABLE_POOL = [
    'bastionShieldBuild',
    'natureGrowRoots',
    'infernoBurnTick',
    'icesFrostNova',
    'poisonStackApply',
    'glitchDiagSpread'
];

export const mimic = defineFaction({
    id: 11,
    name: 'Mimic',
    key: 'mimic',
    icon: { glyph: '\ue01b', unicode: '🦎', color: '#00ddcc' },
    baseStats: { att: 50, res: 50, spr: 50 },
    traits: {
        isHazard: false,
        isBlocker: false,
        freezeImmune: false,
        skipStandardSpread: false
    },
    customAbilities: {
        mimicAdaptTick: {
            hook: 'onTick',
            cost: 3,
            tags: ['mimic', 'adapt'],
            trigger: { type: 'always' },
            data: { adaptCooldown: 5 },
            execute: function(ctx) {
                var ws = ctx.ws, idx = ctx.idx, owner = ctx.owner, fac = ctx.fac;
                if (owner === -1 || !fac || fac.key !== 'mimic') return;

                var stolenVal = ctx.actions.getLayer('mimicStolen', idx);
                if (stolenVal <= 0) return;

                ctx.actions.forEachNeighbor(idx, function(n) {
                    if (ws.grid[n] === owner && ctx.actions.getLayer('mimicStolen', n) === 0) {
                        ctx.actions.setLayer('mimicStolen', n, stolenVal);
                    }
                });
            }
        },

        mimicStealAbility: {
            hook: 'onAttackSuccess',
            cost: 4,
            tags: ['mimic', 'steal'],
            trigger: { type: 'always' },
            data: {
                stealablePool: MIMIC_STEALABLE_POOL,
                stealChance: 0.4
            },
            execute: function(ctx) {
                var ws = ctx.ws, idx = ctx.idx, nIdx = ctx.nIdx, fac = ctx.fac;
                var stolenFrom = ws.factions[ctx.targetOwner];
                if (!stolenFrom) return;

                var stealChance = (ctx.partData && ctx.partData.stealChance !== undefined)
                    ? ctx.partData.stealChance : 0.4;
                if (!ctx.actions.rollChance(stealChance)) return;

                var pool = (ctx.partData && ctx.partData.stealablePool) || MIMIC_STEALABLE_POOL;
                if (pool.length === 0) return;

                var stolenIdx = ctx.actions.randomInt(pool.length);
                ctx.actions.setLayer('mimicStolen', idx, stolenIdx + 1);

                ctx.actions.spawnParticles(nIdx, fac.icon.color, 5, 'normal');
                ctx.actions.spawnText(idx, 'STEAL!', fac.icon.color, false);
                ctx.actions.sound('glitch');
            }
        },

        mimicAdaptiveDefense: {
            hook: 'onDefendCalc',
            cost: 3,
            tags: ['mimic', 'defense'],
            trigger: { type: 'always' },
            data: { baseDefenseBonus: 10 },
            execute: function(ctx) {
                if (ctx.actions.getLayer('mimicStolen', ctx.idx) <= 0) return ctx.basePower;
                var bonus = (ctx.partData && ctx.partData.baseDefenseBonus !== undefined)
                    ? ctx.partData.baseDefenseBonus : 10;
                return ctx.basePower + bonus;
            }
        },

        mimicAbilityIndicator: {
            hook: 'onRenderTileLogic',
            cost: 0,
            tags: ['mimic', 'visual'],
            trigger: { type: 'always' },
            execute: function(ctx) {
                var gfx = ctx.gfx, x = ctx.x, y = ctx.y, idx = ctx.idx, ws = ctx.ws;
                var soulLayer = ws.layers.mimicStolen;
                if (!soulLayer || soulLayer[idx] === 0) return;

                var GS = CONFIG.GRID.SIZE;
                var half = GS * 0.5;
                gfx.beginFill(0x00ddcc, 0.3);
                gfx.drawCircle(x * GS + half, y * GS + half, half - 2);
                gfx.endFill();

                var pulse = (Utils.fastSin((ctx.frame * 8) & 511) + 1) * 0.5;
                gfx.lineStyle(1, 0x66ffee, 0.3 + pulse * 0.5);
                gfx.drawRect(x * GS + 1, y * GS + 1, GS - 2, GS - 2);
                gfx.lineStyle(0);
            }
        }
    },
    params: {
        extraLayers: ['mimicStolen'],
        vfx: {
            cGlow: 0x00ddcc,
            cTrace: 0x66ffee
        }
    },
    maxBudget: 12,
    rarity: 'epic',
    descShort: 'Adaptive Thief',
    descLong: 'Steals abilities from defeated enemies. Adapts to any strategy.'
});
