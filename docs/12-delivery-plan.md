# 12 — Delivery Plan

Tujuan roadmap ini bukan memecah arsitektur menjadi MVP yang perlu dirombak kemudian. Semua layer utama dirancang sejak awal; delivery hanya mengaktifkan subset capability secara berurutan.

## Track A — Foundation

- repository structure;
- schema versioning;
- game state machine;
- repositories;
- Telegram adapter;
- event model;
- logging;
- feature flags;
- config management.

## Track B — Static case engine

- briefing;
- scenes;
- evidence;
- suspects;
- interrogation;
- timeline;
- hints;
- accusation;
- scoring;
- resolution.

## Track C — Social layer

- group sessions;
- player participation;
- XP;
- achievements;
- leaderboards;
- agency profile.

## Track D — AI content pipeline

- Case Bible generation;
- validation;
- prompt generation;
- image generation;
- moderation;
- publishing pipeline.

## Track E — Beta UX

- polished inline keyboards;
- fallback UX;
- case archive;
- profile;
- onboarding;
- error recovery.

## Track F — Mini App

- detective board;
- timeline visualization;
- evidence graph;
- profile/leaderboard UI.

## Track G — Community expansion

- creator cases;
- reports;
- case ratings;
- seasons;
- special events.

## Open beta gate

Sebelum public beta, wajib lolos:

- 20+ test cases;
- automated consistency validator;
- no known case-breaking critical bugs;
- duplicate webhook protection;
- AI outage fallback;
- moderation controls;
- usage/cost counters;
- rollback strategy.

## Quality gate untuk case

Setiap generated case harus dapat dijalankan dari awal sampai akhir oleh automated test runner tanpa intervensi manusia untuk state progression. Human review tetap dapat dipakai untuk narrative/image quality.
