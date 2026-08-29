# 04 — AI & Case Generation

## 4.1 Principle

AI adalah **content generator dan language/visual assistant**, bukan authoritative game engine.

Source of truth:

```text
Case Bible
   -> Game Rules
   -> Gameplay State
```

AI output tidak boleh secara langsung mengubah truth setelah case dipublish.

## 4.2 Case generation pipeline

```text
Case Seed
   -> Case Bible Generator
   -> Structural Validator
   -> Logic Validator
   -> Narrative Generator
   -> Visual Evidence Planner
   -> Image Prompt Generator
   -> Image Generation
   -> Asset Validator
   -> Case Publish
```

## 4.3 Case Bible

Minimal berisi:

- case id;
- schema version;
- title;
- premise;
- victim;
- suspects;
- culprit;
- motive;
- method;
- timeline;
- locations;
- evidence;
- red herrings;
- reveal;
- scoring rubric.

## 4.4 Consistency validation

Validator memeriksa:

- semua reference valid;
- culprit adalah suspect valid;
- motif terkait suspect;
- timeline dapat terjadi;
- evidence yang dibutuhkan solution benar-benar discoverable;
- clue tidak bertentangan;
- jumlah evidence cukup untuk deduksi;
- red herring tidak menciptakan dua solusi yang sama-sama valid;
- interrogation branch mengarah ke state yang valid;
- semua visual clue memiliki metadata.

## 4.5 Visual generation

Jangan membuat image tanpa visual clue plan.

```text
Scene Spec
  -> Required visible clues
  -> Required irrelevant details
  -> Composition constraints
  -> Prompt
  -> Image
```

Setiap scene memiliki metadata seperti:

```json
{
  "sceneId": "scene_01",
  "visibleClues": ["broken_watch", "wet_footprints"],
  "inspectableObjects": ["clock", "window", "desk"]
}
```

## 4.6 Image strategy

### Pre-generated

Case dibuat dan semua asset diprepare sebelum dimainkan.

### Batch generated

Case diproduksi dalam batch harian/mingguan.

### Real-time

Tidak dianjurkan sebagai default open beta karena cost/latency/availability.

## 4.7 AI Detective Assistant

AI assistant hanya boleh menggunakan:

- known evidence;
- known suspect statements;
- known timeline;
- player-discovered state.

Assistant boleh:

- merangkum;
- menemukan contradiction;
- membantu menghubungkan evidence;
- memberi bounded hint.

Assistant tidak boleh:

- menciptakan suspect baru;
- mengubah culprit;
- mengungkap solution tanpa aturan;
- menyatakan fakta yang tidak ada dalam case state.

## 4.8 Prompt versioning

Semua prompt production harus memiliki version.

Contoh:

```text
case_generator_v1
scene_prompt_v3
interrogation_writer_v2
hint_writer_v1
```

Hal ini memungkinkan kasus direproduksi dan dibandingkan.

## 4.9 Locked AI responsibility boundary

```text
CASE BIBLE / GAME ENGINE = truth
AI = renderer / generator / bounded assistant
```

AI runtime tidak boleh menjadi authority untuk culprit, method, motive, timeline, evidence truth, unlock condition, atau session state.

Untuk interrogation, input AI berbentuk semantic response packet yang sudah ditentukan engine. Untuk hints/assistant, context dibatasi pada player-known state dan canonical facts yang memang boleh diekspos.

Untuk image generation, prompt berasal dari visual clue plan. Required visual clues harus dapat diaudit melalui metadata.

## 4.10 Case generation order (LOCKED)

```text
Seed
 -> Truth
 -> Timeline/Causality
 -> Evidence Plan
 -> Proof Graph
 -> Dialogue Graph
 -> Narrative
 -> Visual Plan
 -> Assets
 -> Validation
 -> Publish
```

Jangan membangun truth dari narrative atau image.
