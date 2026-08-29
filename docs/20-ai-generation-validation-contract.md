# 20 — AI Generation & Validation Contract

## 20.1 Status

**LOCKED BASELINE** — contract for offline/batch case generation, visual generation, validation, publishing, and bounded runtime AI.

Core rule:

> **AI may propose or render content. The validated CaseVersion and Game Engine are authoritative.**

AI generation is treated as an untrusted build step. A case is not playable merely because an LLM returned valid JSON; it is playable only after deterministic validation and publish approval.

## 20.2 Responsibilities

### Case Generator
Produces a candidate structured `CaseBible` from a seed.

### Narrative Renderer
Turns approved semantic content into human-readable briefing, descriptions, statements, reveals, and dialogue.

### Visual Planner
Converts case truth/evidence requirements into explicit visual requirements.

### Image Generator
Produces media from the approved visual plan.

### Runtime Assistant
Helps players reason only from information they are already allowed to know.

None of these components may directly mutate live `CaseSession` truth.

## 20.3 Canonical pipeline

```text
Seed
  -> Truth Builder
  -> Timeline / Causality
  -> Evidence Plan
  -> Proof Graph
  -> Statement / Dialogue Graph
  -> Narrative Rendering
  -> Visual Plan
  -> Image Generation
  -> Asset QA
  -> Structural Validation
  -> Referential Validation
  -> Logic Validation
  -> Solvability Validation
  -> Uniqueness Validation
  -> Safety Validation
  -> Publish
```

A failed stage blocks publication.

## 20.4 Generation artifacts

Generation should produce auditable artifacts, not only a final case file:

```text
GenerationRun
├── seed
├── generatorVersion
├── promptVersions
├── model/provider metadata
├── candidate CaseBible
├── validation results
├── generated assets
├── asset metadata
└── publish decision
```

Generation artifacts are build-time records. Only the approved immutable snapshot becomes `CaseVersion`.

## 20.5 Case seed

A seed should constrain theme and desired experience without specifying prose.

Example:

```json
{
  "genre": "locked_room",
  "setting": "hotel",
  "difficulty": "DETECTIVE",
  "suspectCount": 4,
  "sceneCount": 3,
  "mustUseMechanics": ["timeline_contradiction", "visual_clue"]
}
```

## 20.6 Truth-first generation

Generation must construct canonical truth before narrative or visual output:

```text
Seed
  -> Canonical Solution
  -> Causal / Timeline Model
  -> Evidence / Proof Model
  -> Dialogue Semantics
  -> Narrative
  -> Visuals
```

The reverse direction is prohibited.

## 20.7 Canonical truth requirements

Every generated case must define at least:

- exactly one culprit for v1;
- one canonical method;
- one canonical motive;
- a valid timeline;
- enough opportunity/access facts;
- a canonical causal chain;
- a discoverable proof path;
- explicit key evidence;
- explicit red herrings, if any;
- a final reveal.

## 20.8 Proof-driven generation

The generator must explicitly specify:

```text
required solution facts
required evidence
supporting evidence
allowed inference paths
```

The validator must be able to answer:

> "How can a player prove the canonical solution using only information the game can reveal?"

A case without a machine-verifiable answer fails validation.

## 20.9 Dialogue generation contract

AI receives approved semantic inputs:

```json
{
  "suspectId": "S03",
  "intent": "CONFRONT_CCTV",
  "canonicalClaims": ["..."],
  "behavior": "DEFENSIVE",
  "outcome": "CHANGES_STORY",
  "unlocks": ["D07"]
}
```

The renderer may change wording, rhythm, tone, and emotional presentation.

It may not:

- invent a fact;
- change a timestamp;
- change a suspect relation;
- add an evidence item;
- change truth status;
- add an unlock;
- remove an unlock;
- reveal canonical solution unless the engine explicitly instructs a reveal.

## 20.10 Visual Plan contract

Every playable visual asset must have a structured plan before generation.

```ts
type VisualPlan = {
  sceneId: string;
  purpose: "CRIME_SCENE" | "LOCATION" | "PORTRAIT" | "EVIDENCE_CLOSEUP" | "REVEAL";
  requiredClues: VisualRequirement[];
  forbiddenClues: VisualRequirement[];
  inspectableObjects: string[];
  compositionNotes?: string[];
};
```

Every `requiredClue` must map to a canonical clue/evidence/object.

## 20.11 Visual generation invariants

Generated images must not:

- introduce a new suspect;
- introduce a new weapon that could be mistaken as causal evidence unless defined;
- change clothing/identity in a way that breaks a clue;
- remove a required clue;
- contain readable text that contradicts the case;
- place an actor/object in an impossible location for the canonical scene.

Images are presentation assets, not sources of canonical truth.

## 20.12 Asset QA

Asset QA may be human, automated, or hybrid.

Minimum QA checks:

- asset exists and is retrievable;
- dimensions/format are valid;
- required visual clues are present or explicitly marked for manual confirmation;
- forbidden elements are absent;
- asset references map to valid case entities;
- no duplicate asset accidentally represents two incompatible scenes.

`assetRegion` is an audit aid, not authoritative gameplay truth.

## 20.13 Runtime AI context boundary

Runtime AI may receive only:

- the immutable CaseVersion facts permitted for the task;
- shared discovered evidence;
- shared statements/timeline knowledge;
- current interrogation semantic packet;
- current player/session context required for the requested response.

It must not receive hidden solution data when that data is not needed.

## 20.14 Runtime assistant outputs

The assistant may:

- summarize known facts;
- explain contradictions;
- connect known evidence;
- provide bounded hints;
- explain already-known suspect statements.

The assistant must not:

- create new evidence;
- create new suspects;
- alter score/progress;
- assert hidden facts as known facts;
- bypass unlock conditions;
- decide an accusation for the player;
- reveal hidden solution unless explicitly allowed by game rules.

## 20.15 AI output schema enforcement

AI calls that are expected to produce structured content must use strict schemas.

Validation order:

```text
parse
 -> schema validation
 -> semantic validation
 -> domain validation
```

Invalid output is rejected, not repaired silently in production.

## 20.16 Validator layers

### Structural

- valid schema;
- required fields present;
- enum values valid;
- IDs unique.

### Referential

- every relation points to an existing entity;
- every dialogue unlock points to a valid node;
- every visual clue points to a valid scene/object/evidence relationship.

### Temporal

- event ordering is coherent;
- ranges are not impossible;
- travel/access constraints are satisfied.

### Causal

- required dependencies are resolvable;
- no illegal dependency cycles;
- culprit can perform the canonical method.

### Evidence

- required evidence is discoverable;
- inspection rules can be satisfied;
- red herrings do not accidentally become mandatory proof.

### Solvability

- at least one valid proof path exists;
- no player action can permanently destroy all solution paths;
- all mandatory nodes can be reached under legal play.

### Uniqueness

- exactly one canonical culprit/solution for v1;
- alternate suspects cannot satisfy the complete proof requirements.

### Dialogue

- every required semantic response has a reachable node;
- no node references unreachable or undefined state;
- response semantics remain consistent with canonical truth.

### Safety

- generated content is within configured fiction/safety bounds;
- no real-person accusation framing;
- no disallowed graphic content policy violation;
- community-created content is subject to the same gate.

## 20.17 Solver validation

A generated case should be tested with a deterministic or bounded **solver agent** operating only on discoverable information.

The solver's job is not to play perfectly; it is to verify:

```text
Can solution be reached?
Is solution unique?
Are critical facts discoverable?
Are there contradictory dead ends?
```

A solver failure blocks publication unless explicitly waived by an administrator during internal testing.

## 20.18 Publish gate

A `CaseVersion` may be published only when all mandatory validators return PASS:

```text
Schema            PASS
References        PASS
Timeline          PASS
Causality         PASS
Evidence          PASS
Dialogue          PASS
Visual assets     PASS
Solvability       PASS
Uniqueness        PASS
Safety            PASS
```

The resulting `CaseVersion` is immutable.

## 20.19 Regeneration policy

If a generation stage fails:

- regenerate the failed artifact when safe;
- re-run all downstream validators;
- do not patch published truth silently.

Example:

```text
Evidence Plan changed
  -> Dialogue regenerated
  -> Visual Plan regenerated
  -> Images regenerated
  -> Full validation rerun
```

## 20.20 Versioning

Every generation dependency is versioned:

```text
case_schema_v1
truth_generator_v1
narrative_renderer_v1
visual_plan_v1
scene_prompt_v1
interrogation_renderer_v1
validator_v1
```

A published `CaseVersion` records these versions for reproducibility.

## 20.21 Runtime fallback

If AI runtime fails:

```text
AI renderer unavailable
   -> deterministic fallback response
   -> gameplay continues
```

AI availability is never a prerequisite for persistence or state transitions.

## 20.22 Cost boundary

Open beta should prefer:

```text
pre-generated / batch-generated case assets
```

over per-player real-time image generation.

Runtime text AI should be bounded by:

- strict context size;
- rate limits;
- per-session call budgets;
- fallback responses;
- caching where safe.

## 20.23 Authority map

```text
CaseVersion        = canonical case truth
GameEngine         = runtime state authority
Validator          = publish authority
AI Generator       = candidate producer
AI Renderer        = presentation producer
Image Generator    = asset producer
Runtime Assistant  = bounded reasoning aid
```

No AI component has direct write access to authoritative live game state.
