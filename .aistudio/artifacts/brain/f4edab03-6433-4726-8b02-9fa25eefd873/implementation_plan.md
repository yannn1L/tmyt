# Dev Mode, Custom Faction Loader & Arena Grid Customizer

This upgrade introduces a dedicated **Dev Mode** tab to the Editor Scene, allowing players and developers to dynamically load custom factions via JavaScript `defineFaction` code, toggle a real-time debugging inspection HUD for the live battle simulation (tracking FPS, particle pools, tick rates, and active layers), and customize the arena's grid dimensions (columns and rows) with presets and sliders while preserving the fixed 320×320 visual arena container.

### User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural decisions were confirmed during interactive clarification and govern this implementation:

- **Confirmed Decision 1 — JavaScript `defineFaction` Code Loader**: The Dev Mode code editor supports full JavaScript `defineFaction` code, enabling players to define custom stats, traits, hazard modifiers, reusable base ability tags, and bespoke inline `customAbilities` with full `ctx.actions` toolkit access.
- **Confirmed Decision 2 — Quick Presets & Sliders for Arena Dimensions**: Grid columns and rows can be adjusted via quick presets (`10×10`, `16×16`, `20×20 Default`, `32×32`, `40×40`) as well as interactive column/row sliders (range 8 to 40). Spatial lookup tables (`CELL_X`, `CELL_Y`, `NEIGHBOR_IDX`, `DIAG_NEIGHBOR_IDX`, `JUMP2_NEIGHBOR_IDX`), `WorldState` grid layers, and PixiJS sprite meshes reconfigure automatically while the outer visual arena canvas remains locked at 320×320 pixels.
- **Confirmed Decision 3 — Conditional Debugging Inspection HUD**: When Debugging Mode is enabled in the Editor Scene's Dev tab, a high-contrast retro pixel HUD overlay renders over the live simulation canvas displaying real-time metrics: FPS, frame delta, engine tick rate, active particles / pool capacity, live shockwaves/lasers, dirty tile queue count, and active status layers. When disabled, the battle simulation remains clean and cinematic.

---

### 1. Overview & Core Concept

- **What It Does**:
  1. **Dev Tab Navigation**: Adds a top-level tab switcher in the Editor Scene (`[ROSTER]` and `[DEV MODE]`), keeping the clean class selector on the primary view while housing developer tools in a dedicated panel.
  2. **Custom Faction Code Loader**: A monospaced pixel code editor with sample code pre-loaded, live syntax validation, and an error notification banner. Clicking `[LOAD FACTION]` compiles the code, registers the faction in `FACTIONS` and `FACTIONS_BY_KEY`, updates color tables, and adds the new unit directly into the class selection grid.
  3. **Arena Grid Customizer**: Columns and rows can be modified dynamically. The game engine scales cell dimensions (`cellW = 320 / cols`, `cellH = 320 / rows`) so territories fit perfectly within the 320×320 arena, whether simulating a compact 10×10 skirmish or an intense 40×40 massive grid battle.
  4. **Live Debugging HUD**: A toggleable simulation overlay presenting live engine telemetry (FPS, tick time, active/pooled particles, shockwaves, active layers, and territory counts).
- **Target Audience / Persona**: Game creators, modders, and players experimenting with custom faction abilities, stress-testing territory balance, and benchmarking performance across different arena densities.
- **Key Value**: Provides an in-game sandbox for rapid faction prototyping, performance tuning, and custom map size battles without needing code deployments or server restarts.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Editor Tab Switching**: In `#scene-editor`, users toggle between `ROSTER` (the 2-column class list) and `DEV MODE`.
  2. **Arena Size Selection**: Under Dev Mode, users click a preset pill (`10×10 Micro`, `16×16 Retro`, `20×20 Normal`, `32×32 Dense`, `40×40 Epic`) or drag the `Cols` and `Rows` sliders (8–40). A live badge displays `[GRID: 24×24 · 576 CELLS · CELL: 13.3px]`.
  3. **Pasting & Loading Custom Factions**: Users paste a custom `defineFaction({ name: "Solar", ... })` snippet or click `[INSERT TEMPLATE]` to populate a working blueprint. Clicking `[LOAD FACTION]` runs an isolated sandbox evaluation. On success, a neon green banner flashes `FACTION 'SOLAR' LOADED!`, switches to the Roster tab, and pre-selects the newly created faction. If code has syntax errors, a red error box explains the issue cleanly.
  4. **Debugging Simulation**: When `[DEBUG MODE: ON]` is checked, entering the simulation renders a translucent scanline HUD in the upper corner of the arena showing:
     - `FPS: 59.8 | DELTA: 16.7ms | TICK: 150ms (1x)`
     - `PARTICLES: 18/400 | SHOCK: 2/25 | LASERS: 0/20`
     - `GRID: 20x20 (400) | DIRTY QUEUE: 42`
     - `LAYERS: inferno (ON), ices (OFF), nature (ON)`
  5. Users can also press `D` during simulation to toggle debug HUD visibility if debug mode was activated.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Retro terminal / arcade development console styled with the game's signature `#00ffcc` neon cyan borders, `#ffaa00` warning badges, and `Press Start 2P` font.
  - *Color Palette & Mood*: `--bg: #050508`, translucent `--panel: rgba(17, 17, 26, 0.95)`, accent borders `rgba(0, 255, 204, 0.3)`. Code textarea features a dark CRT terminal aesthetic (`#0c0c14`, bright cyan text, custom thin scrollbar).
  - *Layout Math & Containment*: Editor tabs fit within the existing 320px responsive container (`--editor-scale`), ensuring seamless presentation across 1440×900 desktop and 390×844 mobile viewports with zero clipping.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Dynamic Spatial Lookup Table & Buffer Resizing (`CONFIG.setGridDimensions`)**
  - *Chosen Approach*: Implement a centralized `CONFIG.setGridDimensions(cols, rows)` method that recalculates `CONFIG.GRID.COLS`, `ROWS`, `TOTAL`, `CELL_W`, `CELL_H`, `SIZE`, and regenerates `CONFIG.CELL_X`, `CONFIG.CELL_Y`, `CONFIG.NEIGHBOR_IDX`, `CONFIG.DIAG_NEIGHBOR_IDX`, and `CONFIG.JUMP2_NEIGHBOR_IDX`. When grid dimensions change, `WorldState.resize()` and `Renderer.rebuildGrid()` reallocate buffer arrays (`grid`, `nextGrid`, `capturedThisTick`, `layers`, `dirtyCells`, `animTimers`, Pixi sprites) to match `cols * rows`.
  - *Why*: Allows true dynamic arena sizes with full TypedArray $O(1)$ spatial lookup performance and zero-GC speed, regardless of whether the grid is 10×10 (100 cells) or 40×40 (1,600 cells).
  - *Alternatives Considered*: Scaling down a fixed 20×20 grid via CSS zoom was rejected because it does not actually change the number of territory cells or game rules.

- **Decision 2 — Safe Sandbox Evaluation for Custom Faction Code**
  - *Chosen Approach*: Evaluate player-pasted faction code via a scoped sandbox function providing direct arguments: `{ defineFaction, AbilityActions, CONFIG, Utils, VFX, BASE_ABILITIES, ABILITY_PARTS }`. The return value (or the result of `defineFaction(...)`) is passed into `registerFaction()`.
  - *Why*: Gives players limitless freedom to write custom abilities, mathematical modifiers, and particle visuals while catching runtime syntax errors before they touch engine state.
  - *Alternatives Considered*: Restricting users to JSON configs was rejected because JSON cannot express dynamic JavaScript lifecycle callbacks (`execute(ctx)`).

- **Decision 3 — Zero-Overhead Debug Telemetry via Existing Monitors**
  - *Chosen Approach*: Enhance `FPSMonitor` to aggregate real-time metrics (FPS, tick ms, particle pool counts, active layers, and dirty tile count) into an in-canvas HTML/DOM pixel HUD overlay (`#sim-debug-overlay`) inside `#sim-canvas-wrap`.
  - *Why*: Decoupled from the PixiJS render tree; costs near-zero GPU draw calls while providing clear, instantaneous telemetry without obscuring the core battle action.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EDITOR SCENE (scene-editor)                       │
│                                                                             │
│   ┌───────────────────────────────┐     ┌────────────────────────────────┐  │
│   │        [ROSTER TAB]           │     │          [DEV TAB]             │  │
│   │  • Unit selection grid        │     │  • Arena Presets & Sliders     │  │
│   │  • Class stat cards & badges  │     │  • Debugging Mode Checkbox     │  │
│   │  • INITIALIZE SIMULATION btn  │     │  • Custom Faction Code Editor  │  │
│   └───────────────┬───────────────┘     │  • [LOAD FACTION] & Error Box  │  │
│                   │                     └───────────────┬────────────────┘  │
└───────────────────┼─────────────────────────────────────┼───────────────────┘
                    │                                     │
                    ▼                                     ▼
┌───────────────────────────────────────┐ ┌───────────────────────────────────┐
│         SIMULATION RUNTIME            │ │       FACTION & GRID LOADER       │
│                                       │ │                                   │
│  ┌─────────────────────────────────┐  │ │  • CONFIG.setGridDimensions(c, r) │
│  │ 320x320 PixiJS Arena Container  │  │ │    Recomputes CELL_X, CELL_Y,     │
│  │ • Cell size = 320/cols x 320/rows│  │ │    NEIGHBOR_IDX, buffers         │
│  │ • Rebuilt Sprite Grid           │  │ │  • registerFaction(customFac)     │
│  └─────────────────────────────────┘  │ │    Scoped eval with defineFaction │
│  ┌─────────────────────────────────┐  │ └───────────────────────────────────┘
│  │ #sim-debug-overlay (Conditional)│  │
│  │ • FPS, Frame ms, Tick ms, Speed │  │
│  │ • Active / Pooled Particles     │  │
│  │ • Active Status & Decay Layers  │  │
│  └─────────────────────────────────┘  │
└───────────────────────────────────────┘
```

- **Module Refactoring & Enhancements**:
  1. `/core/config.js`:
     - Add `CONFIG.DEV_MODE = { enabled: false, debugOverlay: false }`.
     - Implement `CONFIG.setGridDimensions(cols, rows)` to update `CONFIG.GRID` and recompute `CELL_X`, `CELL_Y`, `NEIGHBOR_IDX`, `DIAG_NEIGHBOR_IDX`, and `JUMP2_NEIGHBOR_IDX`.
  2. `/core/worldstate.js`:
     - Add `WorldState.resize(cols, rows)` to reallocate `grid`, `nextGrid`, `capturedThisTick`, `layers`, and cache buffers dynamically when grid size changes.
  3. `/core/renderer.js`:
     - Add `Renderer.rebuildGrid()` to clean up previous Pixi sprites, recreate sprites matching `CONFIG.GRID.TOTAL`, calculate cell width and height (`320 / cols`, `320 / rows`), and resize `dirtyCells`, `dirtyQueue`, `animTimers`, and `activeBounceList`.
  4. `/core/engine.js`:
     - Update `Engine.init()` to ensure `indices` and `cellCounts` arrays are sized for dynamic `CONFIG.GRID.TOTAL`.
  5. `/core/faction-builder.js`:
     - Add `evaluateFactionCode(codeString)` with sandbox wrapper, returning a valid faction specification or throwing a readable error.
  6. `/core/main.js` & `/index.html`:
     - Add Editor Scene tab navigation: `#tab-btn-roster` and `#tab-btn-dev`.
     - Build Dev Mode view:
       - Grid size presets (`10x10`, `16x16`, `20x20`, `32x32`, `40x40`) and sliders (`Cols: 8–40`, `Rows: 8–40`).
       - Debugging Mode toggle (`#chk-debug-mode`).
       - Code editor textarea (`#dev-faction-code`), `#btn-load-faction`, `#btn-template-faction`, and `#dev-code-status` alert box.
     - Add `#sim-debug-overlay` inside `#sim-canvas-wrap` updated by `FPSMonitor` on every sample interval when debug mode is enabled.
     - Add keyboard shortcut `D` to toggle debug overlay visibility during active simulation.

- **Verification Strategy**:
  - Run node test suite (`npm test`) with new tests verifying dynamic grid resizing, spatial table recomputation at arbitrary dimensions (e.g. 10x10, 32x32), and sandbox evaluation of custom faction code.
  - Run `compile_applet` and `lint_applet`.
  - Perform browser verification with Playwright testing Dev tab switching, grid dimension sliders, custom faction loading, and verifying that the debug HUD appears cleanly on the simulation canvas when debug mode is enabled.
