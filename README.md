# BLINKFALL

**A high-speed mech action roguelite about becoming impossible to surround.**

Sector 01 EXTERIOR → Sector 02 MANUFACTURE · **v0.3 — Sector 2**. TypeScript + Three.js + Vite.
No authored meshes, no asset downloads, no `Math.random()` in the simulation.

```sh
npm install
npm run dev        # http://localhost:5180
```

`npm run build` type-checks and bundles. `npm run verify` type-checks only.
`npm run profile` builds, serves and measures the frame budget on this machine — run it with
`-- --headful` on the hardware you actually ship to.
`npm run gates` runs the whole verification suite against a dev server (see **Verification**).

---

## The three laws

**LAW I** — Being outnumbered is the fantasy, not the failure state.
**LAW II** — Rotation is the load-bearing skill.
**LAW III** — Upgrades rewrite piloting, not merely stats.

Aggression is a rationed resource. The **encirclement arc** — the minimal arc containing every
hostile bearing around you — is the *only* thing that decides how many of them may attack at
once. Keep the formation in front of you and exactly one of them can open. Let them wrap past
235° and a second token is released. Control the formation, and you control aggression.

```
> __state().director.tokenSource
"encirclement-arc(237.3°) > 235° -> 2"
```

---

## The ten FALLs

Difficulty is a ladder of ten tiers, and it is measured rather than asserted. A tier may only
move Director and encounter pressure: token cooldown, forward bias, arena ceiling, sequencing,
spawn spread, reinforcement pacing, wave bonus, elite eligibility, corrupted offer fraction,
geometry pressure.

**No FALL tier touches damage, structure, or the arc thresholds.** The arc rule is byte-identical
at FALL I and FALL X — 145° and 235°, 9000 structure, at every tier. This is provable at runtime:

```
> __fallProof().damageLevers      // []
> __fallProof().structureLevers   // []
> __fallProof().tiers.map(t => t.arcThresholds)   // identical, ten times over
```

Clear a tier to unlock the next. Elites appear from FALL VII and are **behavioural only** —
`anchor` holds cohesion, `relentless` recovers faster, `screened` refuses frontal damage,
`vectored` orbits wider, `phased` reads tightest. None of them has a single extra hit point.
From FALL VIII the FORGE begins offering **corrupted** upgrades: a much larger version of the
effect, bought with a permanent downside. At FALL X every card is corrupted.

---

## Accessibility

Every assist is in the pause menu, in the settings screen, and on the results card — recorded in
`RunState.assists{}` whether or not any of them is on.

| Assist | Range | Default |
|---|---|---|
| Vanish window | 0.30 · 0.38 · 0.46 · 0.55 s | 0.30 |
| Bullet time duration | 0.6× – 2.0× | 1.0× |
| Telegraph intensity | 0 – 100% | 100% |
| High-contrast telegraphs | on · off | off |
| Camera shake | 0 – 100% | 100% |
| FX intensity | 0 – 100%, independent of telegraphs | 100% |
| Look sensitivity · FOV | sliders | — |
| Input remapping | all 11 actions, keyboard · mouse · pad | — |
| Assault Boost · Hard lock | hold or toggle | hold |

---

## Controls

| Action | Keyboard / Mouse | Gamepad |
|---|---|---|
| Boost skate | W A S D | Left stick |
| Camera · aim | Mouse | Right stick |
| **Quick Boost · Perfect Vanish** | Shift | RB |
| Assault boost | E | L3 |
| Vertical thrust | Space | A |
| Descend | C · Ctrl | B |
| Hard lock | Q · MMB | R3 |
| Cycle target | Wheel · ← → | D-pad ← → |
| Rifle | LMB | RT |
| Energy blade | RMB · F | X |
| Missile rack | 1 | LB |
| Pile driver | 2 | Y |
| Rally prompt | W A S D | D-pad · left stick |
| Pause | Esc | Start |
| Live tuning panel | P | — |
| Profiling overlay | O | — |

Every screen — title, reactor select, FORGE, results, pause — is fully navigable on a gamepad.

---

## The vanish

Quick-boost with an attack's remaining windup at or under **0.30s** and you get a Perfect Vanish:
time drops to **0.13×** for **0.85s**, you blink **17m** to the attacker's flank, the attack is
cancelled, the attacker is **Exposed for 1.5s at 2.4× impact**, and the camera hard-locks onto
them. It costs **18 EN** instead of the normal 20, with a **0.18s** cooldown.

55% of Perfect Vanishes escalate into a **Rally** — five directional exchanges on a shrinking
window. SEVERANCE answers with **Counter-Vanish**, which always starts a **Reverse Rally**: same
timing, but now *it* is the aggressor.

---

## Run structure

```
RUN    = SECTOR 01 EXTERIOR → SECTOR 02 MANUFACTURE
SECTOR = CHAIN A → FORGE → CHAIN B → FORGE → BOSS → RESULTS
CHAIN  = 2–3 encounter states + connective tissue
```

A sector is generated incrementally while you play the one before it, and the one behind you is
retired when you leave it. **Never more than two sectors are resident**, and everything that
defines the run — pilot model, build, evolutions, score, and all seven RNG cursors — crosses the
boundary untouched. The light and the score's palette cross-fade at the boundary rather than cut.

Each encounter state has **four configurations** — twenty-eight in all — that change the geometry,
the objective and the failure condition without ever touching the arc rule.

**Each sector offers two bosses of two different classes**, so the exam changes with the seed
rather than only the model.

| Sector | Boss | Class | Damage gate |
|---|---|---|---|
| 01 | SEVERANCE | ACE | none — the whole fight is the read |
| 01 | GRAVEMARK | FORMATION | two RELAYs holding **its** rear arc |
| 02 | CHORUS | FORMATION | the span its three voices subtend from **you** |
| 02 | KILNWORKS | WAR MACHINE | four feed arms, then the pour head's frontal armour |

CHORUS is Law II stated as literally as the game can state it. Its three voices hold bearing
stations 120° apart, and while the arc they subtend *from where you are* is 180° or more the
shared 34,000 pool refuses damage outright. Turning cannot change that number — the arc is
rotation-invariant. Only moving can. Left alone the trio subtends ~240°, which is above the gate
**and** above the 235° token line, so standing still costs you both the damage and a second
attack token.

KILNWORKS is the opposite exam: the boss is a casting line that travels for the entire fight, so
no position is holdable and rotation has to be continuous.

**Chain pools.** Sector 1 plays four authored chains. Sector 2 plays eleven — seven standard, two
rare, one reactor-specific (ANVIL SHIFT, BREAKER only) and one secret (THE CLEAN LINE, reached on
an untouched structure bar). The seed plays two, obeying Chain Law 2.

---

## Sector 2 — MANUFACTURE

The descent is supposed to mean something, so Sector 2 is not Sector 1 with different fog.

- **The look inverts.** No sun disc, a near-black zenith, and the warm bloom coming from *below*
  the horizon, because the brightest thing in a foundry is the floor.
- **The geometry changes kind.** Cooling stacks just outside the play space that read as
  enclosure, a casting channel across the floor, and a roof above the altitude cap.
- **The machines alter the environment.** Conveyor bands carry the pilot **and every hostile
  standing on them** at 17 m/s. Holding a bearing costs continuous thrust — positional pressure
  with no damage value, no structure value and no arc threshold anywhere near it.
- **The roster widens.** SPLITTER, which splits into two bearings when you stagger it, and HOOK,
  the only frame in the game that moves *you*.
- **OBJECTIVE arrives** — the first place in the descent with something worth holding.
- **A second palette for the score**: the same generative music, down a fourth, narrower and
  harder, at 96 bpm instead of 108.

---

## Architecture

```
src/
  core/       RNG (per-domain streams) · Tuning · Input · Settings · MathUtil · Textures · Pool
  frame/      Vitals · Vanish (in Player) · Rally · Lock · CameraRig · Ordnance · Player
  director/   Director · PilotModel · Encounters · Chains · Fall · Variants
              EncounterFields · Transports · Objectives · Onboarding
  enemies/    Archetypes · Enemy · Elites · Boss
              Severance · Gravemark · Chorus · Kilnworks
  narrative/  Comms
  build/      Reactors · Upgrades · Corrupted · Weapons · Disciplines · RunState
  world/      Kit · ChainWorld · Sector
  score/      Metrics
  entities/   MechRig · MechModels · Materials · RigCache · RigDriver
  fx/ ui/ audio/
```

`Vitals` works for any entity, and `Director` stays agnostic about whether the pressured thing is
the player or a static objective — both are requirements of the Frame's second consumer.

---

## Determinism

No `Math.random()` in gameplay simulation. Seven per-domain PRNG streams
(`chains · layout · spawn · ai · rally · boss · offers`), each seeded from
`hash(masterSeed + streamName)`, so a chain's layout is identical whether you perfect-vanished
twelve times or none. Cosmetic particles may use unseeded randomness.

**RETRY SEED** reproduces the identical procedural setup — chain selection, layout, cover
placement, initial spawns, offers and all seven initial stream states. **NEW RUN** takes a fresh
seed.

---

## Runtime inspection

| Call | Returns |
|---|---|
| `__state()` | The full GDD §14 schema: player, hostiles[], director, run, build, score, perf |
| `__proof()` | The sovereign-arc derivation, the run's procedural setup signature, chain laws |
| `__dev` | Verification commands — `stops()`, `skipToLabel()`, `spawn()`, `forceWindup()`, `vanish()`, `rallyAnswer()`, `boss()`, `step()` |
| `__replay({seed, segments})` | Headless fixed-timestep replay with scripted input, returning a trace |
| `__fallProof()` | Per-tier proof that no FALL lever touches damage, structure or the arc thresholds |
| `__dev.lifecycle()` | Resident sector count, geometry residency, and everything carried across a boundary |
| `__dev.profileSample()` · `simCost()` | Frame percentiles, draws, tris, programs, GPU memory · isolated CPU cost |
| `__dev.onboarding()` | The orientation's beat and the token count the player was shown at each one |
| `__dev.stageVariant(id)` | Stage a named configuration **and begin it**, returning the composition staged |
| `__dev.stageBoss(kind)` | Descend to the boss's sector and start the fight |
| `__dev.gotoSector(n)` | Cross to a sector without playing the ones before it |
| `__dev.conveyors()` · `lineOfSight()` · `comms()` · `chainCensus()` | Sector 2's systems, live |

---

## Verification

Scripted verification lives in `tools/`, and every gate writes its evidence to `.artifacts/`.
Start a dev server first, then:

| Tool | What it proves |
|---|---|
| `node tools/v03.mjs` | **v0.3's 68 rows** — every new upgrade, evolution, reactor, archetype, objective, boss, and the sovereign arc against all of it |
| `node tools/ladder.mjs` | The FALL ladder, 50 seeded runs per tier, with the separation gate |
| `node tools/content.mjs` | Every v0.1/v0.2 card still matching the value it prints |
| `node tools/variants.mjs` | All 28 encounter configurations reachable and playable |
| `node tools/loop.mjs` | Determinism: same seed, same setup, same trace, same stream states |
| `node tools/lifecycle.mjs` | Residency never exceeds two, across different sectors |
| `node tools/gravemark.mjs` · `pilot.mjs` · `onboarding.mjs` · `fallcheck.mjs` · `settings.mjs` | The v0.1 and v0.2 gates |

Every row prints the measurement it was decided on, not just a verdict. A row that passes for the
wrong reason is visible in its own evidence — which is how four defects in shipped code were
found during v0.3 (`BUILD_REPORT.md` §28).

---

## Documents

Read in this order. **Precedence: v2.3 patch > v2.2.1 GDD > RC brief > existing implementation.**

- `blinkfall-gdd-v2.2.1.md` — the design specification. What the game *is*.
- `blinkfall-gdd-v2.3-patch.md` — four measurement-forced corrections, applied on top. **Takes
  precedence over v2.2.1 wherever they conflict.** The important one: the encirclement arc is
  `360° − largest bearing gap`, which makes it rotation-invariant. Law II is a positioning
  problem, not a facing problem.
- `blinkfall-1.0-rc-brief.md` — the production plan. What still has to be built, and in what order.
- `TONIGHT_BUILD_BRIEF.md` — the Alpha Run scope.
- `BUILD_REPORT.md` — donor decisions, assumptions, every checkpoint result, and the defects each
  phase's instruments found. v0.3 begins at §23.

### Where the project is

Shipped: **v0.1 Alpha**, **v0.2 Ceiling Pass**, **v0.3 Sector 2**.

Next: **v0.4 — Sector 3** (ANVIL PRIME, COLDIRON, COLOSSUS, JAMMER, DRAGOON, CONTRAIL, REDLINE,
upgrades to 42). Scope and gates in §5 of the RC brief.

Two things still block progress and neither is code:

- **The GPU half of the profiling budget.** `npm run profile -- --headful` on real hardware. This
  container has no GPU, so every render figure so far is a SwiftShader floor.
- **Human playtest.** Every gate cleared so far was cleared by scripted pilots, and those measure
  solvability and separation — not whether it is enjoyable. v0.3's own gate asks two questions no
  harness can answer: *is Sector 2 distinguishable in more than palette*, and *does dialogue at
  the FORGE land or intrude?*
