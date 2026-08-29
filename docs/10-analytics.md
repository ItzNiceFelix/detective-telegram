# 10 — Analytics & Product Metrics

## 10.1 Core funnel

```text
Bot Added
  -> Group Started Case
  -> First Evidence Found
  -> Second Player Participated
  -> Case Completed
  -> Next Case Started
```

## 10.2 Activation

Primary activation signal:

> Grup menyelesaikan minimal satu case bersama-sama.

Secondary:

> Minimal dua pemain berkontribusi pada satu case.

## 10.3 Retention

Track:

- D1 group retention;
- D7 group retention;
- D30 group retention;
- cases/week/group;
- average active detectives/group.

## 10.4 Gameplay metrics

- case completion rate;
- abandon rate;
- average session duration;
- hints per case;
- evidence discovered/case;
- average accusations/case;
- first-try solve rate;
- player contribution distribution.

## 10.5 Content quality metrics

- case rating;
- report rate;
- restart rate;
- contradiction/error reports;
- image clue miss rate;
- hint usage by case.

## 10.6 Technical metrics

- webhook latency;
- Telegram API errors;
- Firestore read/write volume;
- AI request volume;
- image generation success rate;
- case generation rejection rate;
- duplicate update rate.

## 10.7 Privacy principle

Analytics harus sebisa mungkin menyimpan agregat dan event game, bukan isi chat grup.
