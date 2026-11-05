/**
 * CUBE — 2x2 Monolith Sky-Drop faction.
 * Defines its signature 2x2 formation detector and corner bracket visuals via `customAbilities`.
 */

import { CONFIG, Utils } from '../../core/config.js';
import { VFX } from '../../core/vfx.js';
import { defineFaction } from '../../core/faction-builder.js';

export const cube = defineFaction({
    id: 4,
    name: 'Cube',
    key: 'cube',
    icon: { glyph: '\ue014', unicode: '⬛', color: '#00ffcc' },
    baseStats: { att: 60, res: 40, spr: 50 },
    hazardMultipliers: {
        poison: 0.8
    },
    traits: {
        isHazard: false,
        isBlocker: false,
        freezeImmune: false,
        skipStandardSpread: false
    },
    customAbilities: {
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
                    cx = nx + (pat[offset + 2] + pat[offset + 6]) * 0.5;
                    cy = ny + (pat[offset + 4] + pat[offset + 7]) * 0.5;
                }

                if (!formed) return false;

                ctx.actions.clearArea(Math.round(cx), Math.round(cy), 1, owner);

                var cw = CONFIG.GRID.CELL_W || CONFIG.GRID.SIZE;
                var ch = CONFIG.GRID.CELL_H || CONFIG.GRID.SIZE;
                var visualX = Math.round(cx * cw + cw * 0.5);
                var visualY = Math.round(cy * ch + ch * 0.5);
                ctx.actions.sound('thud');
                ctx.actions.shake(CONFIG.VFX.SHAKE.THUD);
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
                gfx.lineStyle(1, shockC, 0.3 + 0.2 * (Utils.fastSin((frame * 6) & 511) + 1) * 0.5);
                gfx.moveTo(x * GS + 2, y * GS + 6); gfx.lineTo(x * GS + 2, y * GS + 2); gfx.lineTo(x * GS + 6, y * GS + 2);
                gfx.moveTo(x * GS + GS - 2, y * GS + 6); gfx.lineTo(x * GS + GS - 2, y * GS + 2); gfx.lineTo(x * GS + GS - 6, y * GS + 2);
                gfx.moveTo(x * GS + 2, y * GS + GS - 6); gfx.lineTo(x * GS + 2, y * GS + GS - 2); gfx.lineTo(x * GS + 6, y * GS + GS - 2);
                gfx.moveTo(x * GS + GS - 2, y * GS + GS - 6); gfx.lineTo(x * GS + GS - 2, y * GS + GS - 2); gfx.lineTo(x * GS + GS - 6, y * GS + GS - 2);
                gfx.lineStyle(0);
            }
        }
    },
    params: {
        vfx: { shockC: '#00ffcc' }
    },
    maxBudget: 10,
    rarity: 'starter',
    descShort: '2x2 Sky Drop',
    descLong: '2x2 formation drops a monolith, causing 3x3 shockwave.'
});
