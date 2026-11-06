# Church Latin trainer: plan (2026-11-05)

**Goal:** a phone-first web app that keeps AMT's 25-minute daily Church Latin habit, from the report
`~/spark/reports/Ecclesiastical Latin self study.md`. Start with v0.1 and get it onto his iPhone fast.

**Decisions already made by AMT:** all four goals (pray/Mass, read Bible/Church texts, speak, balanced);
20–30 min/day; Spanish + English glosses; learns by doing/visualizing. Nothing paid or installed without his OK.

**Decisions I made (from the report):**
- Installable web app (PWA): plain HTML/CSS/JS, no build step, works offline, same URL on iPhone/desktop/laptop.
- Own small FSRS-5 scheduler in JS (public formulas, default weights): no npm dependency.
- Audio v0.1: the phone's own Italian voice reading an Italian-style respelling of the Latin
  (Church Latin uses Italian letter values). Desktop-made audio (Piper) comes in v0.3.
- Progress on the device (localStorage) + JSON export/import. Gist sync later.
- Original EN/ES translations written for the app (literal, so the Latin is visible through them).

## v0.1 scope
1. **Sounds**: pronunciation rules as tap-to-hear cards, with the Spanish-speaker traps (c/g, sc, gn, ti, z, j, v, double consonants).
2. **Prayers**: Signum Crucis, Gloria Patri, Ave Maria, Pater Noster, Kyrie, Sanctus, Agnus Dei,
   Dominus vobiscum responses. Reader: tap a word → meaning (EN/ES) + grammar; hear line; hide words to recite.
3. **Review (FSRS)**: words from the prayers (both directions) + line cloze; 5–8 new a day; pause new if backlog.
4. **Today**: one button runs the session: review → new prayer line → read → produce (unscramble / dictation / shadow by recording).
5. **Progress**: streak (lenient), words known, export/import.

## Files (`~/spark/projects/church-latin/app/`)
- `index.html`, `css/app.css`, `js/app.js` (UI + session), `js/fsrs.js`, `js/pron.js`, `js/store.js`
- `data/prayers.json`, `data/vocab.json`, `data/sounds.json`
- `manifest.webmanifest`, `sw.js`, `icons/`

## Tasks and checks
| # | Task | Who | Check |
|---|---|---|---|
| 1 | Prayer + vocab data (tokens, lemma, EN/ES gloss, parse, stress) | agent A | JSON validates; I spot-check every prayer's grammar |
| 2 | Pronunciation engine + sound cards data | agent B | node test file, 60+ words incl. trap cases, all pass |
| 3 | FSRS-5 module | me | node test against known interval behaviour |
| 4 | App shell, reader, review, today flow, PWA | me | headless Edge at iPhone size: screenshots of every screen, offline reload |
| 5 | Hosting (needs AMT) | me | opens on iPhone, installs to Home Screen, works offline |

## Open questions for AMT
- Hosting: new public GitHub repo + GitHub Pages (recommended; the app has no secrets, progress stays on the phone).
