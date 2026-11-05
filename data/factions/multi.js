/**
 * MULTI — Chaotic Echo Soul Roulette faction.
 * Defines its signature soul roulette assignment, capture assignment, defense, and badge renderer in `customAbilities`.
 */

import { CONFIG } from '../../core/config.js';
import { defineFaction } from '../../core/faction-builder.js';

const MULTI_ABILITY_POOL = [
    'bastionShieldBuild',
    'natureGrowRoots',
    'infernoBurnTick',
    'sickeningContagion',
    'glitchDiagSpread',
    'poisonDamageTick',
    'mechaPhalanxDef',
    'icesColdAura'
];

export const multi = defineFaction({
    id: 10,
    name: 'Multi',
    key: 'multi',
    icon: { glyph: '\ue01a', unicode: '🎭', color: '#ff69b4' },
    baseStats: { att: 50, res: 50, spr: 50 },
    traits: {
        isHazard: false,
        isBlocker: false,
        freezeImmune: false,
        skipStandardSpread: false
    },
    customAbilities: {
        multiAssignAbility: {
            hook: 'onTick',
            cost: 3,
            tags: ['multi', 'soul', 'assign'],
            trigger: { type: 'always' },
            data: {
                abilityPool: MULTI_ABILITY_POOL,
                assignChance: 0.5
            },
            execute: function(ctx) {
                var idx = ctx.idx, owner = ctx.owner, fac = ctx.fac;
                if (owner === -1 || !fac || fac.key !== 'multi') return;

                if (ctx.actions.getLayer('multiSoul', idx) > 0) return;

                var assignChance = (ctx.partData && ctx.partData.assignChance !== undefined)
                    ? ctx.partData.assignChance : 0.5;
                if (!ctx.actions.rollChance(assignChance)) return;

                var pool = (ctx.partData && ctx.partData.abilityPool) || MULTI_ABILITY_POOL;
                if (pool.length === 0) return;

                var soulIdx = ctx.actions.randomInt(pool.length);
                ctx.actions.setLayer('multiSoul', idx, soulIdx + 1);
                ctx.actions.spawnParticles(idx, fac.icon.color, 3, 'normal');
                ctx.actions.sound('chime');
            }
        },

        multiRandomAbility: {
            hook: 'onAttackSuccess',
            cost: 4,
            tags: ['multi', 'assign', 'capture'],
            trigger: { type: 'always' },
            data: {
                forceAssignOnCapture: true,
                abilityPool: MULTI_ABILITY_POOL
            },
            execute: function(ctx) {
                var nIdx = ctx.nIdx, fac = ctx.fac;
                var pool = (ctx.partData && ctx.partData.abilityPool) || MULTI_ABILITY_POOL;
                if (pool.length === 0) return;

                var soulIdx = ctx.actions.randomInt(pool.length);
                ctx.actions.setLayer('multiSoul', nIdx, soulIdx + 1);
                ctx.actions.spawnParticles(nIdx, fac.icon.color, 5, 'normal');
                ctx.actions.spawnText(nIdx, 'SOUL!', fac.icon.color, false);
                ctx.actions.sound('chime');
            }
        },

        multiSoulDefense: {
            hook: 'onDefendCalc',
            cost: 3,
            tags: ['multi', 'defense'],
            trigger: { type: 'always' },
            data: {
                baseDefenseBonus: 15
            },
            execute: function(ctx) {
                if (ctx.actions.getLayer('multiSoul', ctx.idx) <= 0) return ctx.basePower;
                var bonus = (ctx.partData && ctx.partData.baseDefenseBonus !== undefined)
                    ? ctx.partData.baseDefenseBonus : 15;
                return ctx.basePower + bonus;
            }
        },

        multiAbilityBadge: {
            hook: 'onRenderTileLogic',
            cost: 0,
            tags: ['multi', 'visual'],
            trigger: { type: 'always' },
            execute: function(ctx) {
                var gfx = ctx.gfx, x = ctx.x, y = ctx.y, idx = ctx.idx, fac = ctx.fac, ws = ctx.ws;
                var soulLayer = ws.layers.multiSoul;
                if (!soulLayer) return;

                var soulIdx = soulLayer[idx];
                if (soulIdx === 0) return;

                var pool = (fac.partData && fac.partData.multiAssignAbility &&
                            fac.partData.multiAssignAbility.abilityPool) || MULTI_ABILITY_POOL;
                var abilityKey = pool[soulIdx - 1];
                if (!abilityKey) return;

                var GS = CONFIG.GRID.SIZE;
                gfx.beginFill(0xffffff, 0.9);
                gfx.drawCircle(x * GS + GS - 3, y * GS + 3, 2);
                gfx.endFill();

                gfx.lineStyle(1, 0xffffff, 0.4);
                gfx.drawRect(x * GS + 1, y * GS + 1, GS - 2, GS - 2);
                gfx.lineStyle(0);
            }
        }
    },
    params: {
        extraLayers: ['multiSoul'],
        vfx: {
            cBadge: 0xff69b4,
            cGlow: 0xffb6c1
        }
    },
    maxBudget: 12,
    rarity: 'epic',
    descShort: 'Chaotic Echo',
    descLong: 'Each territory has a random ability from all known territories.'
});
