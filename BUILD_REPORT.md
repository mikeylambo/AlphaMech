# BUILD_REPORT.md — BLINKFALL Alpha Run

Companion to `TONIGHT_BUILD_BRIEF.md` and `blinkfall-gdd-v2.2.1.md`.
Maintained throughout the build, not written at the end.

---

## 1. Donor decision table

Substrate: **`koviq4/astra-vs-fable`**, with the OUTNUMBERED prototype as the feel reference.
Where two donors solve the same problem, the better implementation was taken and the decision
recorded here.

| Subsystem | Chosen source | Why |
|---|---|---|
| Project architecture, module layout | **Fable 5.1 (IRONVEIL)** | Modular, `core/Tuning.ts` already centralised, event bus, pooling, streamer. Astra is a flat `src/*.ts` with 30KB single files. |
| Procedural mech geometry (`MechModels`, `MechRig`, `Materials`) | **Fable 5.1** | Genuinely excellent articulated procedural rig — layered armour, pistons, vents, thruster nodes, bake + far LOD. Astra's `models.ts` and the prototype's box mech are both far cruder. Ported and extended. |
| Rig animation | **Rewritten** (`entities/RigDriver.ts`) | Fable's animation lived inside its `PlayerController`. Extracted into a driver both the player and every hostile use, so a hostile's lean and stride read from the same vocabulary the player learns. |
| Feel constants (movement, vitals, vanish, rally, director) | **OUTNUMBERED prototype / ASHFALL profile** | The prototype's `TUNE` block *is* the GDD's §5 table. Copied value for value into `core/Tuning.ts`. |
| Perfect Vanish, Exposed, Rally | **OUTNUMBERED prototype** | Working implementation with the exact GDD constants. Ported, then extended with Reverse Rally, controller prompts and per-domain seeding. |
| Director (arc → tokens, band steering, orbit bias) | **OUTNUMBERED prototype** | The arc computation and token rationing are the prototype's core contribution. Restructured so `tokenCount` is a *derived getter* (see §3). |
| Encirclement HUD / radar | **OUTNUMBERED prototype**, redrawn | Same information model (bearing dots, safe cone, token colour), rebuilt at higher fidelity with windup arcs, Exposed rings and flank thresholds. |
| Particle system (`fx/VFX.ts`) | **Fable 5.1** | Instanced billboard system with stretch-along-velocity. Astra has no equivalent. Ported unchanged. |
| Thruster shader (`fx/Thruster.ts`) | **Fable 5.1** | Ported unchanged. |
| Procedural textures (`core/Textures.ts`) | **Fable 5.1** | Canvas value-noise concrete/panel/rust/asphalt. Ported unchanged. |
| Audio | **Fable 5.1**, extended | Full procedural WebAudio bus with adaptive music. Extended with the GDD §12 requirement: a whole-bus lowpass + pitch drop during bullet time, and percussion drop-out for the FORGE stillness beat. |
| Event bus, object pool, math utilities | **Fable 5.1** | Ported unchanged. |
| Shield shader | **Astra** (concept), reimplemented | Astra's GLSL shield was tied to its skill system. WARDEN's frontal shield is a simpler emissive arc segment with the GDD's break rule; a full shader port was not worth the coupling. |
| World kit, arenas, streamer | **Written for BLINKFALL** | Neither donor builds *encounter volumes joined by connective tissue*. Fable's `Kit.ts` idiom (merge-by-material batches, world-scale UVs) was kept; the layout model is new. |
| Sky and lighting | **Written for BLINKFALL** | Fable's sky is a temperate city. Sector 1 needs rust-and-ember with a visible low sun and a separate key light. |

**Not rebuilt** (taken as-is from a donor): particle system, thruster shader, procedural textures,
mech geometry vocabulary, audio synthesis, pool/bus/math, mech bake + LOD strategy.

---

## 2. Substrate verification and dependency decisions

Per the brief, the donor was booted unchanged before anything was touched.

| Step | Result |
|---|---|
| `Fable 5.1` on pinned versions (three 0.170.0, typescript 5.6, vite 5.4) — `npx tsc --noEmit` | **clean** |
| `Fable 5.1` — `npx vite build` | **clean**, 962 kB bundle |
| Bump three 0.170 → 0.180 in the donor, re-run `tsc --noEmit` | **clean, zero migration errors** |
| Donor on three 0.180 — `npx vite build` | **clean**, 979 kB bundle |

**Dependencies changed from the donor's pinned versions, and why:**

| Package | Donor | BLINKFALL | Reason |
|---|---|---|---|
| `three` | ^0.170.0 | **0.180.0** (exact) | The brief sanctions r170 → r180 *if the migration is clean*. It was verified clean on the donor before the bump, and r180 is the version the sibling donor (Astra) already ships, so it is a proven configuration in this codebase family. Pinned exactly rather than caret-ranged. |
| `@types/three` | ^0.170.0 | **0.180.0** (exact) | Must match `three`. |
| `typescript` | ^5.6.0 | ^5.6.0 | **Unchanged.** No reason to churn. |
| `vite` | ^5.4.0 | ^5.4.0 | **Unchanged.** No reason to churn. |
| `@fontsource/barlow-condensed`, `@fontsource/ibm-plex-mono` | (Astra) ^5.3.0 | ^5.3.0 | Taken from the Astra donor. Bundled locally — no runtime network access. |

No other dependencies were added. There are no runtime asset downloads and no authored meshes.

---

## 3. The sovereign arc rule — how it is enforced

Non-negotiable #1 says the encirclement arc **exclusively** determines simultaneous attack
tokens. This is enforced structurally rather than by convention:

```ts
// director/Director.ts
export function arcTokens(arcDeg: number, sector: number): TokenDerivation { … }

private _arc = 0;
get tokenCount()  { return arcTokens(this._arc, this.sector).count; }
get tokenSource() { return arcTokens(this._arc, this.sector).source; }
```

`tokenCount` is a **getter over a pure function of the arc**. There is no setter and no backing
field, so no other system — pressure model, pilot model, boss script, upgrade, difficulty — is
even *able* to write it. `tokenSource` returns the derivation as a string, so the rule is
provable at runtime:

```
> __state().director.tokenSource
"encirclement-arc(237.3°) > 235° -> 2"
"encirclement-arc(115.0°) <= 235° -> 1"
"encirclement-arc(271.3°) > 235° -> 2"
```

`__proof().sovereignArc` returns the same derivation plus the writer list.

The pressure model's five outputs (`bearing`, `archetype`, `sequencing`, `reinforcementTiming`,
`bandPressure`) are declared in one interface and consumed in exactly three places: spawn
bearing, archetype weighting, and *which* candidate receives a token — never how many.
`SEQUENCED` mode delays when a holder opens; it never removes a token.

---

## 4. Assumptions recorded under the Autonomy Rule

Resolution order used throughout: GDD → brief → donor behaviour.

1. **Sector geometry model.** The GDD says encounters are combat states joined by connective
   tissue with no fade to menu, but does not specify a spatial layout. Assumed: the whole sector
   is one continuous corridor along +Z, descending in Y, with encounter volumes, connective
   tissue and both FORGE bays generated **once at run start**. A closed gate at a volume's exit
   opens when its encounter resolves. This is what makes "no loading break" structural rather
   than hidden: there is nothing to load at a transition.
2. **Hostile fire travels.** The prototype hitscans every attack. VOLLEY, MORTAR and STRAFE-RUN
   were changed to travelling projectiles so ORBITING INTERCEPTORS ("destroying incoming
   projectiles within 25m") has something to intercept, and so a fast pilot can outrun a volley.
   Damage and impact values are unchanged and are divided across the burst exactly as the GDD's
   per-attack totals (VOLLEY: 210/95 across 3 rounds).
3. **Telegraph commit.** A telegraph tracks the pilot until the last **0.18s** of a windup, then
   locks. The GDD does not state this; without it the ground telegraph is decorative, because
   the attack lands wherever you are. This makes late repositioning a real defence alongside the
   vanish, and makes the decal honest.
4. **PREDATOR READ's "telegraphs appear 0.4s earlier"** is implemented as a lead-in: the hostile
   commits to its attack and shows a faint precursor ring 0.4s before the windup opens. The
   windup itself is unchanged, so the vanish window still measures against the GDD's timings.
5. **Vertical movement holds altitude.** Releasing thrust stops vertical motion rather than
   dropping you (donor behaviour, ASHFALL profile). Gravity applies while staggered. This is
   the prototype's feel and the reason ground-vs-air regen is a real decision.
6. **Reverse Rally's only trigger tonight is Counter-Vanish.** The GDD defines Reverse Rally's
   mechanics and defines Counter-Vanish as starting one; it defines no other trigger. No trigger
   was invented for ordinary hostiles.
7. **CONVERSION counts once per stagger.** "staggerPunishesLanded / staggersCreated" would
   exceed 100% if every rifle round into a broken frame counted. One conversion is credited per
   stagger event.
8. **Encounter clear conditions.** Combat states clear when the hostile list empties after the
   authored wave count. TRAVERSAL, which creates no hostiles, clears when the pilot reaches the
   far end of the volume. Its gate is open from the start.
9. **Sector 1 volume dimensions** (arena radius 330m, corridor 1600m × 300m, shaft radius 250m,
   FORGE bay radius 200m, boss arena radius 380m) are unspecified in the GDD; chosen so a
   62 m/s skate crosses a corridor in ~26s and an assault boost in ~8s.
10. **Cover height is capped at 17m** and the skyline is placed outside every play volume, to
    satisfy §12's rule that nothing occludes the horizon during a fight.
11. **Mech plate materials are baked to vertex colours.** Merging per bone *per material* costs
    ~120 draw calls per machine, which a five-hostile ARENA cannot afford. Opaque plates now
    share one vertex-coloured material (one draw per bone); emissive parts keep their own
    materials so Exposed flares still animate. Measured: **678 → 242 draw calls** in a
    three-hostile ARENA.
12. **Rigs are instanced from cached prototypes.** Building a mech from primitives costs a few
    milliseconds; doing it five times the instant an ARENA opens is a visible hitch at the worst
    possible moment. Every chassis is built once at startup and cloned per spawn, with
    per-instance materials.
13. **The title screen builds its own backdrop world.** `__dev.worldBuilds()` therefore reads 2
    after the first run starts (one backdrop + one sector); *within* a run it is always 1.
14. **Scoring is left exactly as specified**, including that CONTROL scores near 100 in a
    TRAVERSAL (arc is 0 with no hostiles, and the velocity term is satisfied by flying fast).
    The undefined-metric rule covers zero denominators, and CONTROL's denominator is tick count,
    not hostile count. Flagged as a design observation, not changed.

---

## 5. Checkpoint results

Verification is scripted and repeatable: `tools/*.mjs` drive a real browser against the running
build. The verification container renders through **SwiftShader (software WebGL)**, so absolute
frame times there are not representative of GPU hardware; draw call, triangle and entity counts
are.

### Checkpoint A — after Step 1 (substrate)

| Gate | Result |
|---|---|
| Donor decision table exists | **PASS** — §1 |
| Baseline verified before any version bump | **PASS** — §2, donor `tsc` + `vite build` clean on pinned versions first |
| Builds clean | **PASS** — `npm run build` (`tsc --noEmit && vite build`) clean |
| Same seed → identical layout twice | **PASS** — `tools/loop.mjs`: two `__replay` runs on seed `ALPHA1` produce byte-identical `layoutSignature`, `coverSignature`, chain selection and initial stream states |
| 60fps | **NOT MEASURABLE HERE** — software rasteriser only. Budget evidence: 223–242 draw calls, 48–57k triangles, 18–20 shader programs in a five-hostile ARENA, plus dynamic resolution scaling (§7) |

### Checkpoint B — after Step 3 (director + enemies)

| Gate | Result |
|---|---|
| 5-hostile ARENA winnable | **PASS** — `tools/pilot.mjs`, a scripted pilot that reads windups and rotates: `ARENA CLEARED start 5 left 0 hp 9000 PV 22/28 stag 17 conv 16 rank B 71.7` |
| 5-hostile ARENA losable | **PASS** — `tools/arena.mjs`, passive pilot: 9,000 → 0 structure in ~65s, `FRAME LOST` |
| `tokenSource` shows the arc as sole writer | **PASS** — see §3. Observed at both thresholds: `<= 235° -> 1` and `> 235° -> 2` |

### Checkpoint C — after Step 4 (loop closed)

| Gate | Result |
|---|---|
| Menu → fight → results → replay end to end | **PASS** — `tools/full.mjs` walks title → ARENA → vanish → rally → FORGE → LAUNCH → SEVERANCE → results, with RETRY SEED and NEW RUN on screen |
| RETRY SEED reproduces identical procedural setup | **PASS** — `sameSetup: true` across two runs: chain ids, Chain Law 2 record, full layout signature (every volume's kind/state/z/y/cover count), every cover block's position and height, and all seven initial stream states |
| Same recorded inputs → behaviourally equivalent execution | **PASS, and stronger than required** — `sameTrace: true`, *and* all seven PRNG streams finish on identical internal states and identical draw counts. The GDD asks only for behavioural equivalence; this build is bit-identical. Achieved by resetting every field that can influence a later simulation step in `startRun` / `resetForEncounter`, not only the seed |

### Checkpoint D — after Step 7 (chains)

| Gate | Result |
|---|---|
| Full sector runs continuously with no loading break at any transition | **PASS** — the entire sector (CHAIN A → FORGE → CHAIN B → FORGE → SEVERANCE, 15–17 volumes, ~12 km) is generated in a single `world.build()` at run start. `__dev.worldBuilds()` does not increment for the whole run; the streamer only toggles `visible`. |

`tools/continuity.mjs` flies a full corridor → connective tissue → next-volume transition and
times every frame across the crossings:

```
median 109.9ms   p95 181.3ms   max 210.4ms   worst frame at a volume crossing 173.3ms
```

The worst frame at a crossing sits **below** the run's own p95, i.e. crossing a volume boundary
is not distinguishable from ordinary frame-to-frame variance. (Absolute numbers are SwiftShader
software rasterisation; the *relative* result is the evidence.)

### Checkpoint E — after Step 9 (SEVERANCE)

| Gate | Result |
|---|---|
| SEVERANCE beatable | **PASS** — `tools/pilot.mjs`: `SEVERANCE CLEARED start 1 left 0 PV 8/8 rank A 85.5` |
| Phase 1 Counter-Vanish fires on the 2nd Perfect Vanish, reproducibly | **PASS** — `tools/full.mjs`, six consecutive forced Perfect Vanishes through the real `Player.tryVanish` path: |

```
n=1  perfect  rally RALLY    counters 0  vanishes 1
n=2  perfect  rally REVERSE  counters 1  vanishes 2   <- every second successful vanish
n=4  perfect  rally REVERSE  counters 2  vanishes 4   <- and again
```

Counter-Vanish always started a **Reverse Rally**, never a normal one.

### Regression re-runs

All checkpoint gates were re-run after the world-model, lighting, rig-instancing and
vertex-colour-bake changes. `tools/loop.mjs` (A + C), `tools/arena.mjs` and `tools/pilot.mjs`
(B + E), `tools/continuity.mjs` (D) and `tools/full.mjs` (C + E) all pass on the final build,
with `tsc --noEmit` and `vite build` clean and a clean browser console.

---

## 6. §3 scope table

| Scope item | Status | Where |
|---|---|---|
| **Combat foundation** | | |
| Movement, camera, lock-on ported and finalised | **PASS** | `frame/Player.ts`, `frame/CameraRig.ts`, `frame/Lock.ts` |
| Structure / Impact / EN with GDD constants | **PASS** | `frame/Vitals.ts`, `core/Tuning.ts` |
| Quick Boost 20 EN / 0.34s | **PASS** | `T.quickCost` / `T.quickCooldown` |
| Perfect Vanish 0.30s · 0.13× · 0.85s · 17m · 18 EN · 0.18s cd | **PASS** | `Player.tryVanish` |
| Exposed 1.5s · 2.4× impact | **PASS** | `T.exposedDur`, `Vitals.hit` |
| Rally · 5 exchanges · 1.05s · ×0.82 | **PASS** | `frame/Rally.ts` |
| Reverse Rally | **PASS** | `frame/Rally.ts`, driven by Counter-Vanish |
| Rifle 0.10s · 62 · 26 | **PASS** | `Player.fireRifle`; measured 43 shots / 5s, 3,400 damage |
| Blade 17m · 620 · 300 · 0.72s | **PASS** | `Player.blade` |
| Missile Rack 6 · 140 · 90 · 1.8s rack · 0.08s spacing | **PASS** | `Player.weapons` + `Ordnance.spawnMissile` |
| Pile Driver 900 · 520 · 4.0s, air-only | **PASS** | `Player.resolvePileDriver` |
| **Director** | | |
| Sovereign arc rule 145 / 235 / 275 → tokens, with traceability | **PASS** | `director/Director.ts` §3 above |
| Pressure model, five permitted outputs | **PASS** | `Director.updatePressure` |
| Pilot model, persistent, 25% decay per FORGE, 0.70/0.30 blend | **PASS** | `director/PilotModel.ts` |
| Encirclement arc HUD | **PASS** | `ui/HUD.ts` radar |
| **Enemies — all five, weighted attacks** | | |
| LANCER volley 50 / lance 50 | **PASS** | `enemies/Archetypes.ts` |
| BRAWLER lunge 67 / sweep 33 | **PASS** | " |
| SENTRY volley 50 / mortar 50 | **PASS** | " |
| HARRIER strafe-run 50 / mine drop 50 | **PASS** | mine: 0.55s arm · 10m trigger · 8.0s life |
| WARDEN shield advance 50 / quake 50 | **PASS** | advance 22m behind the shield, contact damage along the path |
| **Encounter states — six** | | |
| ARENA · DUEL · STORM · PURSUIT · HUNT · TRAVERSAL | **PASS** | `director/Encounters.ts`; each cleared standalone by `tools/pilot.mjs` |
| **Connective tissue** | | |
| CONDUIT and OPEN FALL, no loading break | **PASS** | Checkpoint D |
| **FORGE** | | |
| Stillness beat: boost in, wind down, locks, percussion drops, interface assembles, LAUNCH, doors | **PASS** | `Game.enterForge` / `updateForge`, `Audio.duckPercussion`, `ui/Screens.showForge` |
| Three upgrade cards (take one) | **PASS** | `RunState.rollOffer` |
| Evolution row: every eligible evolution, one per un-evolved hardpoint, take one | **PASS** | verified: FORGE 1 offers 4, FORGE 2 offers 3, evolved hardpoints leave the pool |
| **Run structure** | | |
| CHAIN A → FORGE → CHAIN B → FORGE → SEVERANCE → RESULTS → REPLAY | **PASS** | `Game.stops` |
| Four authored chains, seed picks two, Chain Law 2 obeyed | **PASS** | `director/Chains.ts`; `__state().run.chainLaw2` records both stresses and `distinct` |
| **Content** | | |
| 12 upgrades, three per verb, all Law III, exact values on every card | **PASS** | `build/Upgrades.ts` |
| 4 weapon evolutions | **PASS** | `build/Weapons.ts` |
| 2 reactors: VECTOR and MIRRORWORK | **PASS** | `build/Reactors.ts` |
| Discipline classifier incl. hybrid path | **PASS** | GHOST / KINETIC / BREAKER all reachable; hybrids named; empty build → UNWRITTEN FRAME |
| **SEVERANCE** | | |
| 22,000 structure, phase 2 at 50% | **PASS** | `enemies/Severance.ts` |
| Counter-Vanish phase 1 every 2nd, phase 2 60% seeded / 4.0s cd | **PASS** | Checkpoint E |
| Counter-Vanish always starts a Reverse Rally | **PASS** | Checkpoint E |
| **Systems** | | |
| Scoring: exact formulas, weights, thresholds, undefined-metric rule | **PASS** | `score/Metrics.ts`; excluded metrics are shown as N/A with weight redistributed |
| Complete menu → run → boss → results → replay loop | **PASS** | Checkpoint C |
| RETRY SEED and NEW RUN | **PASS** | `ui/Screens.showResults` |
| Controller support incl. full menu navigation | **PASS (unverified on hardware)** | `core/Input.ts` + `ui/Dom.ts` `Nav`; every action and every screen is bound on both devices. No gamepad was available in the verification container |
| Live tuning / debug panel bound to `Tuning.ts` | **PASS** | `ui/Debug.ts`, key **P**; edits re-apply derived build modifiers immediately |
| `window.__state()` with the full §14 schema | **PASS** | `Game.state()` — player, hostiles[], director, run, build, score, perf |
| Profiling overlay: frame time, draw calls, entity count, streamer state | **PASS** | `ui/Debug.ts` `Profiler`, key **O** |

**No item is FAIL or BLOCKED.** One item — controller support — is implemented in full but could
not be exercised against physical hardware in this container; it is called out rather than
claimed as measured.

---

## 6b. Content verification — every value, measured

`tools/content.mjs` drives each reactor, upgrade and evolution through the real simulation and
reads back what actually happened. Measured against the GDD:

| Item | GDD | Measured |
|---|---|---|
| VECTOR | 9,000 structure · 18 EN vanish · no clone | `structure 9000 · vanishCost 18 · clone 0` |
| MIRRORWORK | 7,200 · 12 EN · 2.0s clone | `structure 7200 · vanishCost 12 · clone 2 · clonesAfterVanish 1 · enSpent 12` |
| Zero-Point Reactor | ground 43 → 0, air 16 → 129 | `ground 0 · air 129` |
| Rail Core | +0% at 62 → +100% at 200 | 100 damage at rest → `200` at velocity 200 |
| Slipstream | within 8m above 120 velocity → stack, max 3 | first stack acquired at `speed 126`, `max 3` |
| Mirror Chassis | 4.0s clone firing at 60% | `clones 1 · life 4.0 · damageScale 0.6` |
| Vanish Battery | −18 EN → +30 EN | `50 EN before → 80 EN after` |
| Predator Read | telegraph +0.4s early, window 0.30 → 0.22 | `window 0.22 · lead 0.4` (reaching the enemy through `ctx.telegraphLead`) |
| Split Lock | hold 2 locks | `capacity 2 · held 2` |
| Weight of Attention | locked +35% | `locked 135 · unlocked 100` |
| Chain Read | lock nearest within 220m + 1.0s bullet time | victim `#5` killed → lock chains to `#6` |
| Execution Protocol | blade vs staggered +200% | `3,534` damage = 620 × 3 × 1.9 stagger multiplier |
| Cascade Break | 40% of target's Impact Max to every other hostile | `248` = 40% of 620, applied to both others |
| Reactor Bleed | 40 EN core, 8.0s | `cores 1 · energy 40 · life 8` |
| Tether Blade | 15m tether pulls you in at 90 m/s | `120m → 71m` in 0.5s |
| Momentum Railgun | 0.55s charge · 380 dmg · cannot fire below 90 velocity | `chargeAtRest 0 · readyAtRest false · fired at 200 velocity for 380` |
| Orbiting Interceptors | 4 orbit, destroy incoming within 25m | `live 4 · max 4`; hostile VOLLEY/MORTAR/STRAFE fire travels and is intercepted |
| Seismic Driver | landing shockwave 320/260 r28 **in addition to** the direct hit | direct `900`, plus `320` to each of two hostiles in radius |

**One bug found and fixed by this pass:** CHAIN READ never fired, because a killed hostile drops
out of `lock.all` before `onKill` runs, so the "was this target locked?" test always failed.
Lock membership is now read before the hit lands.

---

## 7. Notes on performance work

Three changes were made after profiling, all recorded above as assumptions 11–12:

1. **Vertex-colour plate bake** — 678 → 242 draw calls in a three-hostile ARENA.
2. **Rig instancing from cached prototypes** — spawning five hostiles no longer rebuilds five
   procedural mechs mid-encounter.
3. **Far LOD at 150m** — distant hostiles drop to a merged rest-pose mesh. Threat still reads,
   because §12 puts every telegraph on the ground plane.

Plus **dynamic resolution**: render scale walks between 0.62× and the device ratio based on a
smoothed frame time, so pacing degrades before it stutters.

Measured in a five-hostile ARENA at 1440×810: **223 draw calls · 57k triangles · 20 shader
programs · 5 tracked entities**.

---

## 8. Verification tooling

| Script | What it proves |
|---|---|
| `tools/smoke.mjs` | Boot, deploy, movement, console cleanliness |
| `tools/loop.mjs` | Determinism: identical procedural setup and identical execution trace from identical input (Checkpoints A, C) |
| `tools/arena.mjs` | A five-hostile ARENA is losable; passive play ends in FRAME LOST (Checkpoint B) |
| `tools/pilot.mjs` | A scripted pilot that reads windups clears ARENA, DUEL, STORM, HUNT, PURSUIT and SEVERANCE (Checkpoints B, E) |
| `tools/full.mjs` | Whole loop: vanish, rally win and loss, FORGE offers, LAUNCH, boss, Counter-Vanish sequence, results (Checkpoints C, E) |
| `tools/continuity.mjs` | One world build per run; volume crossings generate no geometry (Checkpoint D) |
| `tools/forge2.mjs` | FORGE 1 offers 4 evolutions, FORGE 2 offers 3; classifier coverage across the pool |
| `tools/dps.mjs` | Hardpoint values match the GDD at the millisecond level |
| `tools/content.mjs` | Every reactor, upgrade and weapon evolution measured against its GDD values (§6b) |
| `tools/gallery.mjs` | Framed captures of every encounter state and the FORGE |
| `tools/shot.mjs` | Framed screenshots of any encounter state |

Run them with the dev server up:

```sh
npm run dev            # terminal 1
node tools/pilot.mjs   # terminal 2
```
