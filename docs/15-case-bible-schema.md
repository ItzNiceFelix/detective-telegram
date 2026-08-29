# 15 — Case Bible Schema & Content Contract

## 15.1 Status

**LOCKED BASELINE** — kontrak domain untuk `CaseVersion`, generator AI, validator, game engine, dan runtime content.

Prinsip utama:

> **Case Bible adalah source of truth untuk satu CaseVersion immutable.**

AI boleh menghasilkan atau merender konten, tetapi setelah CaseVersion dipublish, engine hanya mempercayai data terstruktur yang sudah tervalidasi.

## 15.2 Domain hierarchy

```text
Case
  └── CaseVersion (immutable playable snapshot)
        ├── Metadata
        ├── Victim
        ├── Suspects
        ├── Locations / Scenes
        ├── Inspectable Objects
        ├── Visual Clues
        ├── Evidence
        ├── Statements / Claims
        ├── Contradictions
        ├── Timeline Events
        ├── Causal Graph
        ├── Proof Graph
        ├── Interrogation Graph
        ├── Solution
        ├── Scoring
        └── Media Assets
```

`CaseSession` menyimpan progress terhadap snapshot tersebut, bukan menyalin atau mengubah truth.

## 15.3 Canonical TypeScript shape

Contoh canonical shape; implementasi dapat memecahnya menjadi beberapa schema file/collection selama semantik tidak berubah.

```ts
type CaseVersion = {
  caseId: string;
  versionId: string;
  schemaVersion: number;
  contentHash: string;

  metadata: {
    title: string;
    premise: string;
    genre: string;
    starRating: 1 | 2 | 3 | 4 | 5;
    starScoreBreakdown: Record<string, number>;
    tags: string[];
  };

  victim: Victim;
  suspects: Suspect[];
  locations: Location[];
  scenes: Scene[];
  objects: InspectableObject[];
  visualClues: VisualClue[];
  evidence: Evidence[];
  statements: Statement[];
  contradictions: Contradiction[];
  timeline: TimelineEvent[];
  causalRelations: CausalRelation[];
  proofNodes: ProofNode[];
  proofEdges: ProofEdge[];
  interrogationGraph: InterrogationGraph;
  solution: Solution;
  scoring: ScoringRules;
  media: MediaManifest;
  safety: SafetyMetadata;
};
```

## 15.4 Inspectable Object

Object adalah target yang dapat diperiksa dan tidak wajib menghasilkan evidence.

```ts
type InspectableObject = {
  objectId: string;
  sceneId: string;
  name: string;
  visibility: "OBVIOUS" | "NOTICEABLE" | "SUBTLE" | "HIDDEN";
  interaction: "INSPECT" | "INTERACT";
  discoveryRules: Rule[];
  observationId?: string;
};
```

## 15.5 Visual Clue

Visual clue adalah informasi yang sengaja ditanamkan dalam asset visual.

```ts
type VisualClue = {
  clueId: string;
  sceneId: string;
  objectId: string;
  salience: "OBVIOUS" | "NOTICEABLE" | "SUBTLE" | "EXPERT";
  requiredForSolution: boolean;
  assetRegion?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};
```

`assetRegion` membantu human/automated QA dan tidak boleh dianggap sebagai gameplay truth sendiri.

## 15.6 Evidence

```ts
type Evidence = {
  evidenceId: string;
  source: "VISUAL" | "DOCUMENT" | "DIGITAL" | "TESTIMONIAL" | "TIMELINE" | "FORENSIC" | "ENVIRONMENT";
  truthStatus: "TRUE" | "FALSE" | "PARTIAL" | "AMBIGUOUS";
  relevance: "DIRECT" | "SUPPORTING" | "CONTEXTUAL" | "RED_HERRING" | "IRRELEVANT";
  fact?: Fact;
  discoveryRules: Rule[];
  inspectObjectId?: string;
  relatedSuspects?: string[];
  relatedStatements?: string[];
  relatedTimelineEvents?: string[];
};
```

Red herring ditentukan oleh `relevance`, bukan oleh `truthStatus`.

## 15.7 Observation

Observation merepresentasikan apa yang dapat diamati pemain secara langsung.

```ts
type Observation = {
  observationId: string;
  text: string;
  evidenceIds: string[];
};
```

Observation tidak boleh memasukkan inference tersembunyi sebagai fakta observasional.

## 15.8 Statement, Claim, Contradiction

```ts
type Statement = {
  statementId: string;
  suspectId: string;
  text: string;
  claim: Claim;
  dialogueNodeId: string;
};

type Contradiction = {
  contradictionId: string;
  statementId: string;
  evidenceId: string;
  severity: "MINOR" | "SIGNIFICANT" | "CRITICAL";
  unlocksConfrontation?: string;
};
```

Statement adalah apa yang dikatakan suspect. Canonical timeline/evidence menentukan apakah claim tersebut benar.

## 15.9 Timeline Event

```ts
type TimelineEvent = {
  eventId: string;
  timestamp: {
    precision: "EXACT" | "APPROXIMATE" | "RANGE" | "UNKNOWN";
    start?: string;
    end?: string;
  };
  locationId?: string;
  actorIds: string[];
  action: string;
  truthStatus: "TRUE" | "FALSE" | "PARTIAL" | "UNKNOWN";
  relatedEvidenceIds: string[];
  relatedStatementIds: string[];
};
```

## 15.10 Causal graph

Relations minimum:

```text
CAUSES
REQUIRES
ENABLES
PREVENTS
FOLLOWS
CONTRADICTS
```

Causal graph harus lolos cycle validation untuk dependency yang bersifat causal/proof.

## 15.11 Proof graph

Proof graph mendefinisikan jalur deduksi yang membuat solution dapat ditemukan.

```ts
type ProofNode = {
  nodeId: string;
  kind: "EVIDENCE" | "EVENT" | "INFERENCE" | "STATEMENT" | "SOLUTION_FACT";
};

type ProofEdge = {
  from: string;
  to: string;
  relation: "SUPPORTS" | "CONTRADICTS" | "ESTABLISHES" | "REQUIRES" | "COMBINES_WITH";
  required: boolean;
};
```

Setiap canonical solution harus memiliki minimal satu valid proof path yang discoverable.

## 15.12 Solution

V1 hanya memiliki satu canonical solution.

```ts
type Solution = {
  culpritSuspectId: string;
  motiveId: string;
  methodId: string;
  keyTimelineEventIds: string[];
  keyEvidenceIds: string[];
  escapeMechanismId?: string;
  canonicalReveal: Reveal;
};
```

Alternative valid solutions harus menghasilkan validation failure pada publish pipeline.

## 15.13 Interrogation Graph

Interrogation node mengacu ke semantic facts yang sudah ada.

```ts
type DialogueNode = {
  nodeId: string;
  suspectId: string;
  intents: string[];
  prerequisites: Rule[];
  semanticResponse: SemanticResponse;
  unlocks: string[];
};
```

`semanticResponse` adalah input untuk AI narrative renderer; AI tidak membuat unlock condition baru.

## 15.14 Rules

Rules harus dapat dievaluasi deterministik oleh engine.

Contoh:

```ts
{
  all: [
    { evidenceDiscovered: "E04" },
    { statementKnown: "S02" }
  ]
}
```

Operator minimum:

```text
ALL
ANY
NOT
EVIDENCE_DISCOVERED
EVIDENCE_EXAMINED
STATEMENT_UNLOCKED
LOCATION_VISITED
DIALOGUE_NODE_RESOLVED
```

## 15.15 Immutable boundary

Setelah `CaseVersion` published:

- culprit tidak dapat berubah;
- timeline tidak dapat berubah;
- evidence truth/relevance tidak dapat berubah;
- dialogue unlock graph tidak dapat berubah;
- solution tidak dapat berubah;
- media manifest tidak dapat berubah secara diam-diam.

Perubahan substantif membuat `CaseVersion` baru.

## 15.16 Case generation contract

Urutan canonical:

```text
Seed
  -> Truth
  -> Timeline / Causality
  -> Evidence Plan
  -> Proof Graph
  -> Statements / Interrogation
  -> Narrative
  -> Visual Plan
  -> Assets
  -> Validation
  -> Publish
```

Jangan membangun truth dari narrative atau image.

## 15.17 Publish gates

Case hanya dapat dipublish bila:

```text
structurallyValid = true
referentiallyValid = true
temporallyValid = true
causallyValid = true
actorAccessValid = true
proofPathExists = true
uniqueSolution = true
noSoftlock = true
visualMetadataValid = true
safetyValid = true
```

## 15.18 Locked invariants

**CASE-01** — CaseVersion adalah immutable playable snapshot.

**CASE-02** — CaseSession selalu menunjuk ke satu CaseVersion spesifik.

**CASE-03** — Case Bible adalah canonical truth; AI runtime bukan authority.

**CASE-04** — Observation, Evidence, Inference, Theory, Statement, dan Contradiction adalah konsep yang berbeda.

**CASE-05** — Red herring didefinisikan melalui relevance, bukan fake truth.

**CASE-06** — Setiap case v1 mempunyai tepat satu canonical solution.

**CASE-07** — Setiap solution mempunyai discoverable proof path.

**CASE-08** — Tidak ada legal action yang boleh membuat solution permanently unreachable.

**CASE-09** — Dialogue dan visual asset tidak boleh membuat gameplay fact baru di runtime.

**CASE-10** — Perubahan truth substantif membuat CaseVersion baru, bukan mutasi version lama.
