# 07 — Telegram UX & Mini App

## 7.1 Native chat first

Gameplay inti harus dapat selesai tanpa Mini App.

Contoh main menu:

```text
🕵️ DETECTIVE AGENCY

[ 🔎 Investigate ]
[ 👥 Suspects ]
[ 🧪 Evidence ]
[ 🕰️ Timeline ]
[ 💡 Hint ]
[ ⚖️ Accuse ]
```

## 7.2 Deep links

Deep link dipakai untuk:

- install/add bot;
- join case;
- open case;
- open Mini App context.

## 7.3 Message principles

Pesan harus:

- mudah dipindai;
- tidak terlalu panjang;
- menyediakan next action;
- tidak membuat pemain harus menghafal command.

Command tetap tersedia sebagai power-user interface.

## 7.4 Image message

Struktur ideal:

```text
[Crime Scene Image]

🚨 CASE #001
Blackwood Hotel — Room 407

Find what doesn't belong here.

[ 🔍 Inspect ] [ 👥 Suspects ]
[ 🧪 Evidence ] [ 🕰️ Timeline ]
```

## 7.5 Mini App

Mini App berfungsi sebagai:

- detective board;
- evidence relation graph;
- timeline visualization;
- profile;
- case archive;
- leaderboard.

Mini App bukan requirement untuk gameplay dasar.

## 7.6 Failure UX

Jika image gagal:

- fallback ke scene description;
- clue tetap dapat diinspeksi;
- kasus tidak stuck.

Jika AI assistant gagal:

- game tetap dapat dimainkan;
- assistant cukup mengembalikan unavailable state.
