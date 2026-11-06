// Tests for app/js/pron.js. Run: node --test /home/pkn/spark/projects/church-latin/test/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as P from "../app/js/pron.js";

const SOUNDS = JSON.parse(readFileSync(fileURLToPath(new URL("../app/data/sounds.json", import.meta.url)), "utf8"));

// [word, stress hint or null, expected Italian respelling (accent mode "auto")]
const ITALIAN = [
  // Ave Maria
  ["Ave", "Á-ve", "Ave"],
  ["Maria", "Ma-rí-a", "Marìa"],
  ["gratia", "grá-ti-a", "gràzia"],          // ti + vowel → zi (Italian z = ts)
  ["plena", null, "plena"],
  ["Dominus", "Dó-mi-nus", "Dòminus"],
  ["tecum", null, "tecum"],
  ["benedicta", null, "benedicta"],
  ["mulieribus", null, "mulièribus"],
  ["fructus", null, "fructus"],
  ["ventris", null, "ventris"],
  ["Iesus", "Ié-sus", "Iesus"],              // Italian ie = /je/
  ["Sancta", null, "Sancta"],
  ["Dei", "Dé-i", "Dèi"],                    // hiatus marked so the voice keeps two syllables
  ["ora", null, "ora"],
  ["peccatoribus", null, "peccatòribus"],
  ["nunc", null, "nunc"],
  ["hora", null, "ora"],                     // h silent
  ["mortis", null, "mortis"],
  // Pater Noster
  ["caelis", null, "celis"],                 // ae → e
  ["sanctificetur", null, "sanctificetur"],  // -etur: long penult
  ["nomen", null, "nomen"],
  ["adveniat", null, "advèniat"],
  ["regnum", null, "regnum"],                // gn kept (Italian gn = ñ)
  ["fiat", null, "fìat"],
  ["voluntas", null, "voluntas"],
  ["sicut", null, "sicut"],
  ["terra", null, "terra"],
  ["panem", null, "panem"],
  ["quotidianum", null, "quotidianum"],      // ti before consonant: no z
  ["hodie", null, "òdie"],
  ["dimitte", null, "dimitte"],
  ["debita", null, "dèbita"],
  ["debitoribus", null, "debitòribus"],
  ["inducas", "in-dú-cas", "inducas"],
  ["tentationem", null, "tentazionem"],
  ["libera", null, "lìbera"],
  ["malo", null, "malo"],
  // Gloria Patri
  ["Gloria", null, "Glòria"],
  ["Patri", null, "Patri"],
  ["Filio", null, "Fìlio"],
  ["Spiritui", null, "Spirìtui"],
  ["principio", null, "princìpio"],
  ["saecula", null, "sècula"],
  ["saeculorum", null, "seculorum"],
  // Kyrie, Sanctus, Agnus Dei
  ["Kyrie", null, "Chìrie"],                 // k + front vowel → ch; y → i
  ["eleison", null, "elèison"],
  ["Christe", null, "Criste"],               // ch before consonant → c
  ["Sanctus", null, "Sanctus"],
  ["Sabaoth", "Sá-ba-oth", "Sàbaot"],        // th → t
  ["excelsis", null, "ecscelsis"],           // xc + e = k + sh
  ["Hosanna", null, "Osanna"],
  ["Benedictus", null, "Benedictus"],
  ["venit", null, "venit"],
  ["Agnus", null, "Agnus"],
  ["tollis", null, "tollis"],
  ["peccata", null, "peccata"],
  ["mundi", null, "mundi"],
  ["miserere", "mi-se-ré-re", "miserere"],
  ["dona", null, "dona"],
  ["pacem", null, "pacem"],
  // Mass dialogue and others
  ["nihil", null, "nichil"],                 // h = k
  ["mihi", null, "michi"],
  ["ecce", null, "ecce"],                    // Italian cce = t-ch already
  ["suscipiat", null, "suscìpiat"],          // Italian sci = sh already
  ["coelum", null, "celum"],
  ["exsultate", null, "ecsultate"],          // exs: s absorbed into x
  ["gratias", null, "gràzias"],
  ["agamus", null, "agamus"],
  ["dignum", null, "dignum"],
  ["iustum", null, "iustum"],
  ["cum", null, "cum"],
  ["spiritu", null, "spìritu"],
  ["tuo", null, "tùo"],
  ["vobiscum", null, "vobiscum"],
  ["sursum", null, "sursum"],
  ["corda", null, "corda"],
  ["habemus", null, "abemus"],
  ["Ioannes", null, "Ioannes"],
  ["zelus", null, "dzelus"],                 // z → dz
  ["gaudium", null, "gàudium"],
  // extra trap cases
  ["hostia", null, "òstia"],                 // ti after s stays ti
  ["laetitia", "lae-tí-ti-a", "letìzia"],
  ["Lucia", "Lu-cí-a", "Lucìa"],             // stressed ci + vowel forces the accent
  ["faciam", null, "fàciiam"],               // unstressed ci + vowel: ii keeps the i audible
  ["negligentia", null, "neghligènzia"],     // gli → ghli (avoid Italian /ʎ/)
  ["Cherubim", "Ché-ru-bim", "Chèrubim"],    // ch before e stays ch (= k)
  ["Prophetas", "Pro-phé-tas", "Profetas"],  // ph → f
  ["Jesu", "Jé-su", "Iesu"],                 // j → i
  ["cælórum", null, "celorum"],              // æ and accents in the input
  ["alleluia", null, "alleluia"],
  ["sanguis", null, "sanguis"],
  ["dixit", null, "dicsit"],
  ["Israel", null, "Ìsrael"],                // hiatus ae
];

for (const [w, hint, want] of ITALIAN) {
  test(`toItalian ${w}${hint ? ` [${hint}]` : ""} → ${want}`, () => {
    assert.equal(P.toItalian(w, hint ?? undefined), want);
  });
}

// [word, syllables, stressed index without a hint]
const SYLLABLES = [
  ["gratia", "gra-ti-a", 0],
  ["Dominus", "do-mi-nus", 0],
  ["benedicta", "be-ne-dic-ta", 2],
  ["mulieribus", "mu-li-e-ri-bus", 2],
  ["ventris", "ven-tris", 0],          // tr: mute + liquid
  ["Patri", "pa-tri", 0],
  ["Iesus", "ie-sus", 0],
  ["Dei", "de-i", 0],
  ["peccatoribus", "pec-ca-to-ri-bus", 2],
  ["sanctificetur", "sanc-ti-fi-ce-tur", 3],
  ["adveniat", "ad-ve-ni-at", 1],
  ["quotidianum", "quo-ti-di-a-num", 3],
  ["tentationem", "ten-ta-ti-o-nem", 3],
  ["saeculorum", "sae-cu-lo-rum", 2],
  ["caelum", "cae-lum", 0],
  ["Kyrie", "ky-ri-e", 0],
  ["eleison", "e-le-i-son", 1],
  ["Christe", "chris-te", 0],
  ["Sabaoth", "sa-ba-oth", 0],
  ["excelsis", "ex-cel-sis", 1],
  ["Hosanna", "ho-san-na", 1],
  ["Agnus", "ag-nus", 0],
  ["suscipiat", "sus-ci-pi-at", 1],
  ["exsultate", "ex-sul-ta-te", 2],
  ["Spiritui", "spi-ri-tu-i", 1],
  ["principio", "prin-ci-pi-o", 1],
  ["sanguis", "san-guis", 0],          // gu before a vowel after n = one consonant
  ["Ioannes", "io-an-nes", 1],         // initial i before vowel = consonant
  ["eius", "e-ius", 0],
  ["alleluia", "al-le-lu-ia", 2],
  ["cui", "cui", 0],                   // ui diphthong
  ["huic", "huic", 0],
  ["euge", "eu-ge", 0],                // initial eu diphthong
  ["Deus", "de-us", 0],                // eu not a diphthong here
  ["gaudium", "gau-di-um", 0],
  ["nihil", "ni-hil", 0],
  ["vobiscum", "vo-bis-cum", 1],
  ["habemus", "ha-be-mus", 1],
  ["Maria", "ma-ri-a", 1],
];

for (const [w, syl, st] of SYLLABLES) {
  test(`syllabify/stress ${w} → ${syl} (${st})`, () => {
    assert.equal(P.syllabify(w).join("-"), syl);
    assert.equal(P.stressIndex(w), st);
  });
}

test("stress hint overrides the rules", () => {
  assert.equal(P.stressIndex("inducas"), 0);               // rules can't see the long u
  assert.equal(P.stressIndex("inducas", "in-dú-cas"), 1);
  assert.equal(P.stressIndex("miserere", "mi-se-ré-re"), 2);
  assert.equal(P.stressIndex("Dominus", "Dóminus"), 0);     // unhyphenated hint
  assert.equal(P.stressIndex("Agnus", "A-gnus"), 0);        // different syllable split, same letters
  assert.equal(P.stressIndex("descendit", "de-scén-dit"), 1);
  assert.equal(P.stressIndex("caelum", "cǽ-lum"), 0);       // accent on æ
  assert.equal(P.stressIndex("Dominus", "do-mi-nus"), 0);   // hint without accent → rules
});

test("normalize", () => {
  assert.equal(P.normalize("Ǽterna Cælórum, Jesu!"), "aeterna caelorum, iesu!");
  assert.equal(P.normalize("Dóminus vobíscum"), "dominus vobiscum");
  assert.equal(P.normalize("cœli rēgnum"), "coeli regnum");
});

test("toItalian accent modes", () => {
  assert.equal(P.toItalian("Dominus", "Dó-mi-nus", { accent: "none" }), "Dominus");
  assert.equal(P.toItalian("tecum", null, { accent: "all" }), "tècum");
  assert.equal(P.toItalian("cum", null, { accent: "all" }), "cum");
});

const IPA = [
  ["gratia", "grá-ti-a", "ˈɡra.tsi.a"],
  ["caelum", "cáe-lum", "ˈtʃe.lum"],
  ["ecce", null, "ˈet.tʃe"],
  ["excelsis", null, "ek.ˈʃel.sis"],
  ["suscipiat", null, "su.ˈʃi.pi.at"],
  ["Agnus", null, "ˈaɲ.ɲus"],
  ["mihi", null, "ˈmi.ki"],
  ["Iesus", null, "ˈje.sus"],
  ["zelus", null, "ˈdze.lus"],
  ["sanguis", null, "ˈsaŋ.ɡwis"],
  ["exsultate", null, "ek.sul.ˈta.te"],
  ["dixit", null, "ˈdik.sit"],
  ["hostia", null, "ˈos.ti.a"],
  ["Christe", null, "ˈkris.te"],
  ["genitum", "gé-ni-tum", "ˈdʒe.ni.tum"],
];
for (const [w, hint, want] of IPA) {
  test(`toIPA ${w} → ${want}`, () => assert.equal(P.toIPA(w, hint ?? undefined), want));
}

test("speakable keeps punctuation and uses token hints", () => {
  const line = "Ave María, grátia plena, Dóminus tecum.";
  const tokens = [
    { w: "Ave", stress: "Á-ve" }, { w: "María", stress: "Ma-rí-a" }, { w: "grátia", stress: "grá-ti-a" },
    { w: "plena" }, { w: "Dóminus", stress: "Dó-mi-nus" }, { w: "tecum" },
  ];
  assert.equal(P.speakable(line, tokens), "Ave Marìa, gràzia plena, Dòminus tecum.");
  assert.equal(P.speakable("Kyrie, eleison. Christe, eleison."), "Chìrie, elèison. Criste, elèison.");
  assert.equal(P.speakable("Agnus Dei, qui tollis peccata mundi", [{ w: "Agnus" }, { w: "Dei", stress: "Dé-i" }]),
    "Agnus Dèi, qui tollis peccata mundi");
  // token with a different stress than the rules: hint wins
  assert.equal(P.speakable("et ne nos inducas", [{ w: "et" }, { w: "ne" }, { w: "nos" }, { w: "inducas", stress: "in-dú-cas" }]),
    "et ne nos inducas");
});

test("spanishTips flags the traps", () => {
  const ids = (w) => P.spanishTips(w).map((t) => t.id).sort();
  assert.deepEqual(ids("caelum"), ["ae", "c-soft"]);
  assert.deepEqual(ids("gratia"), ["ti"]);
  assert.deepEqual(ids("ecce"), ["c-soft", "double"]);
  assert.deepEqual(ids("suscipiat"), ["sc"]);
  assert.deepEqual(ids("Agnus"), ["gn"]);
  assert.deepEqual(ids("mihi"), ["h-k"]);
  assert.deepEqual(ids("hora"), ["h"]);
  assert.deepEqual(ids("zelus"), ["z"]);
  assert.deepEqual(ids("Iesus"), ["j"]);
  assert.deepEqual(ids("venit"), ["v"]);
  assert.deepEqual(ids("qui"), ["qu"]);
  assert.deepEqual(ids("genitum"), ["g-soft"]);
  assert.deepEqual(ids("excelsis"), ["x"]);
  assert.deepEqual(ids("Christe"), ["ch"]);
  assert.deepEqual(ids("hostia"), ["h"]);          // ti after s: no ti tip
  assert.deepEqual(ids("Dominus"), []);
  for (const t of P.spanishTips("Hosanna")) { assert.ok(t.en && t.es); }
});

test("sounds.json: 12–16 cards, valid shape, hints match the words", () => {
  assert.ok(Array.isArray(SOUNDS) && SOUNDS.length >= 12 && SOUNDS.length <= 16);
  const ids = new Set();
  const letters = (s) => P.normalize(s).replace(/[^a-z]/g, "");
  for (const c of SOUNDS) {
    assert.ok(c.id && !ids.has(c.id), `unique id ${c.id}`); ids.add(c.id);
    for (const k of ["title", "rule"]) assert.ok(c[k].en && c[k].es, `${c.id}.${k}`);
    if (c.spanish_trap !== null) assert.ok(c.spanish_trap.en && c.spanish_trap.es, `${c.id}.spanish_trap`);
    assert.ok(c.examples.length >= 4 && c.examples.length <= 6, `${c.id} examples count`);
    for (const x of [...c.examples, ...(c.minimal_pair || [])]) {
      assert.ok(x.meaning.en && x.meaning.es, `${c.id}/${x.la} meaning`);
      assert.equal(letters(x.stress), letters(x.la), `${c.id}/${x.la} hint letters`);
      assert.match(x.stress.normalize("NFD"), /́/, `${c.id}/${x.la} hint has an accent`);
      assert.ok(P.toItalian(x.la, x.stress).length > 0);
      assert.ok(P.toIPA(x.la, x.stress).length > 0);
    }
  }
  for (const need of ["vowels", "ae-oe", "c", "g", "sc", "gn", "ti", "h", "j-i", "x", "z", "qu-gu", "double", "v-b", "ch-ph-th", "stress"]) {
    assert.ok(ids.has(need), `card ${need}`);
  }
});
