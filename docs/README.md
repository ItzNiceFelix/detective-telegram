# Detective Telegram — Documentation

Dokumentasi resmi dan specification proyek Detective Telegram.

## Source of Truth

Prioritas specification:

1. `26-coding-baseline.md`
   Primary implementation contract.

2. `27-final-audit.md`
   Final consistency audit.

3. `19-decision-log.md`
   Locked architectural and product decisions.

4. Domain-specific contracts dan specification lainnya.

5. Supporting documentation.

Jika terjadi konflik antar dokumen, gunakan dokumen dengan prioritas lebih tinggi.

## Status Dokumen

### LOCKED

Keputusan final. Tidak boleh diubah tanpa product atau architecture change yang disengaja.

### PROVISIONAL

Dapat berubah tanpa mengubah fondasi arsitektur.

### OPEN

Belum diputuskan.

## Coding Convention

Implementation harus mengikuti:

`.github/copilot-instructions.md`

Source code internal menggunakan Bahasa Indonesia untuk:

* nama fungsi
* nama variabel
* nama class
* nama service
* nama repository
* komentar

Istilah teknis, library, framework, protocol, dan API eksternal tetap menggunakan nama aslinya.

## Architecture Principle

Detective Telegram menggunakan modular monolith/serverless architecture.

Canonical game truth berasal dari Game Engine dan CaseVersion.

AI bukan source of truth untuk gameplay.

Semua implementation harus mempertahankan locked contract dalam dokumentasi.
