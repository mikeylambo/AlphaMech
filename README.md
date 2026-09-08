# BLINKFALL

**A high-speed mech action roguelite about becoming impossible to surround.**

Sector 01 · EXTERIOR · Alpha Run. TypeScript + Three.js + Vite. No authored meshes, no asset
downloads, no `Math.random()` in the simulation.

```sh
npm install
npm run dev        # http://localhost:5180
```

`npm run build` type-checks and bundles. `npm run verify` type-checks only.

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
SECTOR = CHAIN A → FORGE → CHAIN B → FORGE → SEVERANCE → RESULTS
CHAIN  = 2–3 encounter states + connective tissue
```

The whole sector is generated in one pass at run start and laid end to end along a descending
corridor, so no transition anywhere has anything left to load. You leave an encounter by
launching out of it.

**Tonight's chain pool:** OPENING GAMBIT · INTERCEPT · PRESSURE COOKER · LONG WAY DOWN α.
The seed plays two, obeying Chain Law 2 (a chain's dominant stress must differ from the
previous chain's).

---

## Architecture

```
src/
  core/       RNG (per-domain streams) · Tuning · Input · MathUtil · Textures · Pool · Events
  frame/      Vitals · Vanish (in Player) · Rally · Lock · CameraRig · Ordnance · Player
  director/   Director · PilotModel · Encounters · Chains
  enemies/    Archetypes · Enemy · Severance
  build/      Reactors · Upgrades · Weapons · Disciplines · RunState
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

Scripted verification lives in `tools/`. See `BUILD_REPORT.md` §8.

---

## Documents

- `blinkfall-gdd-v2.2.1.md` — the design document. The destination.
- `TONIGHT_BUILD_BRIEF.md` — the Alpha Run scope.
- `BUILD_REPORT.md` — donor decisions, assumptions, checkpoint results, scope table.
