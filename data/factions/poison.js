/**
 * POISON — Stacking DoT & Debuff faction.
 * Uses reusable Stack Apply, Stack Decay Damage Tick, Stack Power Penalty, and Droplet Overlay abilities.
 */

import { defineFaction } from '../../core/faction-builder.js';

export const poison = defineFaction({
    id: 7,
    name: 'Poison',
    key: 'poison',
    icon: { glyph: '\ue017', unicode: '☠️', color: '#a020f0' },
    baseStats: { att: 50, res: 40, spr: 50 },
    traits: {
        isHazard: true,
        isBlocker: false,
        freezeImmune: false,
        skipStandardSpread: false
    },
    ability: {
        onBeforeAttack: ['stackLayerOnBeforeAttack'],
        onTick: ['stackDecayDamageTick'],
        onPowerCalc: ['stackPowerPenalty'],
        onRenderVFX: ['dropletOverlayVisual']
    },
    partData: {
        stackLayerOnBeforeAttack: {
            layerKey: 'poison',
            stackPerHit: 8,
            maxStack: 999
        },
        stackDecayDamageTick: {
            layerKey: 'poison',
            tickDecay: 5,
            color: '#a020f0'
        },
        stackPowerPenalty: {
            layerKey: 'poison',
            powerPenalty: 0.2
        },
        dropletOverlayVisual: {
            layerKey: 'poison'
        }
    },
    params: {
        isHazard: true,
        layerMax: 100,
        decay: 2,
        vfx: { cBase: 0xa020f0, cDrop: 0x6600cc }
    },
    maxBudget: 15,
    rarity: 'starter',
    descShort: 'Stacking DoT',
    descLong: 'Each hit stacks poison. Poison deals damage over time and weakens enemies.'
});
