/**
 * BASTION — Fortification shield faction.
 * Uses reusable Layer Buildup, Flat Layer Defense Bonus, and Shield Border Visual.
 */

import { defineFaction } from '../../core/faction-builder.js';

export const bastion = defineFaction({
    id: 3,
    name: 'Bastion',
    key: 'bastion',
    icon: { glyph: '\ue013', unicode: '🏰', color: '#8b4513' },
    baseStats: { att: 40, res: 80, spr: 20 },
    traits: {
        isHazard: false,
        isBlocker: true,
        freezeImmune: false,
        skipStandardSpread: false
    },
    ability: {
        onTick: ['layerBuildupTick'],
        onDefendCalc: ['layerFlatDefenseBonus'],
        onRenderTileLogic: ['shieldBorderTileVisual']
    },
    partData: {
        layerBuildupTick: {
            layerKey: 'bastion',
            ownerKey: 'bastion',
            buildRate: 15,
            maxShield: 100
        },
        layerFlatDefenseBonus: {
            layerKey: 'bastion',
            defMultiplier: 1.0
        },
        shieldBorderTileVisual: {
            layerKey: 'bastion'
        }
    },
    params: {
        vfx: { cBase: 0x8b4513, cLine: 0xffaa00 }
    },
    maxBudget: 10,
    rarity: 'starter',
    descShort: 'Fortification',
    descLong: 'Generates hard-light shields. Shield adds to defense.'
});
