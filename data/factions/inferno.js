/**
 * INFERNO — Wildfire hazard faction.
 * Uses reusable base hazard spread & ignition abilities with fire bar visuals.
 */

import { defineFaction } from '../../core/faction-builder.js';

export const inferno = defineFaction({
    id: 0,
    name: 'Inferno',
    key: 'inferno',
    icon: { glyph: '\ue010', unicode: '🔥', color: '#ff2a2a' },
    baseStats: { att: 80, res: 30, spr: 50 },
    traits: {
        isHazard: true,
        isBlocker: false,
        freezeImmune: false,
        skipStandardSpread: false
    },
    ability: {
        onTick: ['hazardBurnSpreadTick'],
        onAttackSuccess: ['hazardIgniteOnAttack'],
        onRenderVFX: ['flameBarsVisual']
    },
    partData: {
        hazardBurnSpreadTick: {
            layerKey: 'inferno',
            immuneFactionKey: 'inferno',
            spreadChance: 1.0,
            diminishRate: 15
        },
        hazardIgniteOnAttack: {
            layerKey: 'inferno',
            text: 'BURN!',
            sound: 'burn',
            particleStyle: 'fire',
            particleCount: 8
        }
    },
    params: {
        isHazard: true,
        layerMax: 100,
        decay: 10,
        vfx: {
            c1: 0xff2a2a, c2: 0xff8800, c3: 0xffcc00,
            spd1: 15, spd2: 20, spd3: 10,
            sz1: 0.5, sz2: 0.6, sz3: 0.4
        }
    },
    maxBudget: 10,
    rarity: 'starter',
    descShort: 'Wildfire spread',
    descLong: 'Attacks ignite enemies. Fire burns over time.'
});
