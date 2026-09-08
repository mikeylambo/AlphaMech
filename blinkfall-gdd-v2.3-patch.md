# BLINKFALL — GDD v2.3 PATCH

Patches `blinkfall-gdd-v2.2.1.md`. Every change here is forced by **measurement**, not by
design preference. Apply on top; the rest of v2.2.1 stands.

---

## Why this patch exists

Two v0.2 harness findings invalidated text in the GDD:

1. The encirclement arc is `360° − largest bearing gap`, which makes it **rotation-invariant**.
   Turning cannot change it. Law II was worded as a facing problem; it is a positioning problem.
2. `forwardBias` is **nearly inert below ~0.35**. Measured: `0.18 → 0.26` moved mean arc
   `81.6° → 81.5°`. `0.36 → 0.48` moved it `100.0° → 114.5°`. Any system tuned inside the dead
   zone does nothing.

Finding 2 breaks FLANK DEBT, which was specced entirely inside the dead zone.

---

## PATCH 1 — Law II

**Replace** the Law II paragraph in §1:

> **LAW II — Rotation is the load-bearing skill.**
> Keeping a formation in front of you, continuously, at speed, while fighting. Every system
> either teaches, tests, or scores it.

**With:**

> **LAW II — Rotation is the load-bearing skill.**
> Keeping the formation collapsed into a narrow angular span **from where you are**, at speed,
> while fighting.
>
> This is a **positioning** problem, not a facing problem. The encirclement arc is
> `360° − largest bearing gap`, measured from the player's position and independent of the
> direction the player is looking. Turning the camera cannot close it. Only moving can — you
> break out of the middle of the formation so the group collapses into a narrow span from your
> new position, then hold that relationship while they work to re-establish the spread.
>
> Every system either teaches, tests, or scores that act.

**Rationale.** The old wording described something the metric does not measure, and it produced
downstream errors: onboarding initially taught "turn to face them," which can never close the
arc, and analysis of the CONTROL metric assumed a corner-turtling exploit that is not reachable.

---

## PATCH 2 — the arc–composition relationship

**Add** to §6.1, after the token table:

> **Composition gates token reachability.** Because the arc is `360° − largest gap`, **two
> hostiles can never exceed 180°** regardless of placement. The 235° threshold requires at least
> three well-spread hostiles; the 275° threshold requires four. An encounter's composition
> ceiling therefore determines how many tokens are *reachable at all*, before any pressure
> behaviour is considered.
>
> This is why composition ceiling, reinforcement pacing and wave count are the levers that
> separate difficulty tiers, and why tiers built on `forwardBias` alone failed to separate.

---

## PATCH 3 — forwardBias, described accurately

**Replace** in §6.1:

> Non-token hostiles orbit their band with an **0.18 forward bias**.

**With:**

> Non-token hostiles orbit their band with an **0.18 forward bias** — a spiral-in ratio applied
> to a normalised steering vector, so it alters bearing but never speed.
>
> **Measured behaviour:** the lever is nearly inert below ~0.35. `0.18 → 0.26` moves mean arc
> `81.6° → 81.5°`; `0.36 → 0.48` moves it `100.0° → 114.5°`. Below the threshold it turns a
> hostile roughly 10–15° off its orbit, which does not survive into the arc measurement.
>
> **Any system that intends to widen the arc via this lever must set it above 0.35 and verify
> the effect on the harness.** Do not tune inside the dead zone.

---

## PATCH 4 — FLANK DEBT replacement

**Replace** the FLANK DEBT row in §8.2's corrupted downside pool:

> | **FLANK DEBT** | non-attacking hostile forward bias **0.18 → 0.34** |

**With:**

> | **FLANK DEBT** | non-attacking hostile forward bias **0.18 → 0.45**, and spawn bearing spread widened one step |

**Acceptance requirement.** FLANK DEBT must be verified on the ladder harness before it is
considered implemented: **mean encirclement arc must rise at least 12° versus the same
composition without it.** If 0.45 does not clear that bar, raise the value or add reinforcement
bearing spread until it does. A corrupted downside that costs the player nothing is worse than
no downside at all — it makes the corrupted upgrade a free strict upgrade and silently breaks
the risk economy.

**Why not just add a token.** Unchanged from v2.1's reasoning: nothing may override the
sovereign arc. FLANK DEBT still makes the formation harder to hold rather than making aggression
unearned — that intent was correct, only the value was wrong.

---

## PATCH 5 — CONTROL metric note

**Replace** in §10, after the formula block:

> CONTROL carries the heaviest weight because rotation is Law II. The velocity term is
> load-bearing — without it, backing into a corner scores 100.

**With:**

> CONTROL carries the heaviest weight because rotation is Law II.
>
> The velocity term is load-bearing for a stronger reason than originally recorded. Since the arc
> is rotation-invariant, **closing it requires movement** — the metric and its weighting describe
> the same act rather than the weighting merely guarding against a stationary exploit. A player
> holding a low arc is, necessarily, a player who repositioned to get it.

---

## PATCH 6 — changelog entry

**Add** to §0:

> ### v2.3 patches
>
> | # | Correction | Source |
> |---|---|---|
> | 13 | Law II described facing; the arc is rotation-invariant and measures positioning | v0.2 onboarding harness |
> | 14 | Arc–composition relationship undocumented — 2 hostiles cannot exceed 180° | v0.2 ladder retune |
> | 15 | `forwardBias` described as generating rotation pressure; it is inert below ~0.35 | v0.2 ladder harness, measured |
> | 16 | FLANK DEBT specced at 0.34, entirely inside the dead zone | follows from 15 |
> | 17 | CONTROL's velocity weighting justified on the wrong grounds | follows from 13 |

---

## Downstream files to check

- **Onboarding script (§3.5, v0.2 brief).** Already corrected in implementation — the lesson is
  *break out of the middle*, not *turn to face them*. The brief's table should be updated to
  match what shipped.
- **README and any in-game tutorial text** describing the arc as a facing mechanic.
- **FALL ladder tier table (§3.1, v0.2 brief).** Tiers II and III were specced on `forwardBias`
  moves inside the dead zone. Supersede with whatever the retune produces, and record the
  measured separation alongside each tier so the table is self-justifying.
