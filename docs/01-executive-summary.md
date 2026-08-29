# 01 — Executive Summary

> **STATUS TERKINI:** Rencana rilis diubah dari *open beta publik* menjadi
> **closed beta 1 grup** (30 member, maks 6 player aktif per case, 1 session aktif
> per grup). Lihat 02-product-scope.md (2.0) untuk detail scope dan 09-free-tier.md
> untuk implikasi biaya. Seluruh isi dokumen di bawah ini tetap berlaku sebagai
> visi produk jangka panjang; closed beta adalah tahap pertama menuju visi tersebut.

## Konsep

**Detective Telegram** adalah game investigasi multiplayer yang hidup di dalam grup Telegram. Satu grup berperan sebagai sebuah detective agency yang menyelesaikan kasus fiksi bersama.

Pilar pengalaman:

1. **Visual mystery** — crime scene image dan visual evidence.
2. **Social investigation** — pemain berdiskusi dan saling membangun teori.
3. **Deterministic mystery** — setiap kasus punya satu sumber kebenaran yang konsisten.
4. **AI-generated content** — kasus, dialog, clue wording, dan visual dapat dibuat melalui AI.
5. **Replayability** — banyak kasus, difficulty, seasons, leaderboard, dan community content.

## Problem yang ingin diselesaikan

Sebagian besar bot game Telegram bersifat command-centric dan cepat kehilangan perhatian. Produk ini mencoba membuat bot menjadi **social activity**: satu tindakan pemain memicu percakapan dan partisipasi pemain lain.

## Target pengguna

### Primary

- Grup teman 5–100+ anggota.
- Komunitas gaming.
- Komunitas Discord/Telegram yang menyukai puzzle, mystery, murder mystery, atau social games.
- Pengguna yang menikmati Criminal Case, puzzle games, escape rooms, atau party games.

### Secondary

- Creator komunitas yang ingin menyediakan aktivitas rutin di grup.
- Admin grup yang membutuhkan interactive engagement.

## Product thesis

> Jika sebuah kasus membutuhkan diskusi manusia untuk dipecahkan, maka Telegram adalah medium yang natural untuk game tersebut.

## Nilai pembeda

- Tidak membutuhkan aplikasi terpisah untuk gameplay inti.
- Gambar bukan sekadar dekorasi; gambar mengandung petunjuk.
- AI memperbanyak variasi konten tanpa membuat game engine bergantung pada AI runtime.
- Progress dapat bersifat personal dan grup.
- Case format dapat dikembangkan menjadi platform creator-generated content.

## Batasan penting

Produk tidak boleh membangun gameplay yang hanya bergantung pada AI chat bebas. Semua fakta penting harus berasal dari case state yang immutable/versioned.

## Outcome beta yang diharapkan

Open beta dianggap layak apabila:

- onboarding grup mudah;
- satu kasus dapat diselesaikan tanpa penjelasan manual dari developer;
- pemain memahami apa yang harus dilakukan hanya dari bot UX;
- kasus tidak kontradiktif;
- gambar memiliki clue yang benar-benar relevan;
- grup menghasilkan diskusi alami;
- backend dapat mempertahankan state dengan biaya rendah;
- moderation dan abuse controls cukup untuk penggunaan publik.
