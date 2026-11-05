/**
 * MECHA — Phalanx Grid defensive formation faction.
 * Uses reusable Adjacent Ally Defense Aura and Pulsing Grid Tile Visual.
 */

import { defineFaction } from '../../core/faction-builder.js';

export const mecha = defineFaction({
    id: 2,
    name: 'Mecha',
    key: 'mecha',
    icon: { glyph: '\ue012', unicode: '🤖', color: '#aaaaaa' },
    baseStats: { att: 60, res: 60, spr: 30 },
    traits: {
        isHazard: false,
        isBlocker: true,
        freezeImmune: false,
        skipStandardSpread: false
    },
    ability: {
        onDefendCalc: ['adjacentAllyDefenseAura'],
        onRenderTileLogic: ['pulsingGridTileVisual']
    },
    partData: {
        adjacentAllyDefenseAura: {
            allyDefBonus: 10
        }
    },
    params: {
        vfx: { cOut: 0x00ffff, spd: 5, aBase: 0.3, aRnd: 0.5, pad: 2 }
    },
    maxBudget: 10,
    rarity: 'starter',
    descShort: 'Phalanx Grid',
    descLong: 'Gains defensive power for every adjacent Mecha ally.'
});
