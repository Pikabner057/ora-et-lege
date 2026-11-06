// pron.js: Ecclesiastical (Roman/Italianate) Latin pronunciation engine.
// Plain ES module, no dependencies.
//
// The app has no Latin voice, so it reads Latin with the device's Italian (it-IT) Web Speech voice.
// toItalian() respells a Latin word in Italian spelling so that the Italian letter-to-sound rules give
// Church Latin values. Rules follow the Liber Usualis as summarized by EWTN (research notes:
// research_notes/Ecclesiastical Latin self study/pronunciation_speaking.md). Where sources disagree,
// the Liber Usualis wins: ti + vowel = "tsi" except after s, t, x (not "s, d, t"); mihi/nihil = k.
//
// Known limits (see also the report):
//  - Vowel length is not written, so stress without a hint is a guess: penult if it is a diphthong or a
//    closed syllable, else antepenult, plus a small list of endings whose penult is almost always long
//    (-orum, -arum, -onem, -atus, -emus...) and a few exception words (Maria, alleluia). Always pass the
//    data's stress hint ("Dó-mi-nus") when there is one.
//  - "eu" is a diphthong only word-initially (euge, Eucharistia) and in heu/eheu/seu/neu/ceu;
//    "ui" only in cui/huic. Hiatus "ae" (Israel, Michael) is handled by a short word list.
//  - Consonantal i is detected at word start before a vowel and between vowels (Iesus, eius,
//    alleluia), or from a written j. Compounds like "adiuvo" written with i are read as vowel i.
//  - Prefix boundaries are not known to the syllabifier (ob-la-tus is split o-bla-tus).
//  - The Italian voice's own choices (open/closed e and o, voicing of s between vowels) are not
//    controllable through spelling. None of the respellings have been checked on a real device yet.

const VOWEL_CHARS = "aeiouy";
const isV = (ch) => !!ch && VOWEL_CHARS.includes(ch);

// Consonants that form a cluster with a following l/r ("mute + liquid") and go to the next syllable.
const MUTES = new Set(["b", "c", "d", "g", "p", "t", "f", "k", "ch", "ph", "th"]);
const LIQUIDS = new Set(["l", "r"]);

const EU_WORDS = new Set(["heu", "eheu", "seu", "neu", "ceu"]);
const UI_WORDS = new Set(["cui", "huic"]);
// Words where written "ae"/"oe" are two vowels (hiatus), not a diphthong.
const HIATUS_AE = /^(israel|ismael|michael|raphael|aer|poet|poem|noe$|coerc|coemp|coegi)/;
// mihi, nihil and compounds: h = k (Liber Usualis; older books write michi, nichil).
const H_AS_K = /^(mihi|nihil)/;

// Stressed-syllable index for words the rules get wrong and that are common in prayers.
const STRESS_EXCEPTIONS = {
  maria: 1, mariae: 1, mariam: 1,      // Ma-rí-a (long i)
  alleluia: 2,                          // al-le-lú-ia
};
// Endings whose penult vowel is (almost always) long, so the penult takes the stress.
const LONG_PENULT = /(arum|orum|amus|emus|atis|etis|onem|onis|ones|oni|one|ata|atum|atus|ati|atae|atos|atas|ate|anum|anus|ana|ani|anae|anos|etur|osus|osa|osum|osi|osae|osam|ura|urae|uram)$/;

const GRAVE = { a: "à", e: "è", i: "ì", o: "ò", u: "ù" };

// ---------------------------------------------------------------- normalize

/** Lowercase, strip macrons/accents/diaeresis, æ→ae, œ→oe, j→i. Keeps spaces and punctuation. */
export function normalize(text) {
  return baseForm(text).replace(/j/g, "i");
}

// Like normalize but keeps j, so a written j can be used as a consonant signal.
function baseForm(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/œ/g, "oe");
}

const lettersJ = (word) => baseForm(word).replace(/[^a-z]/g, "");
const letters = (word) => normalize(word).replace(/[^a-z]/g, "");

// ---------------------------------------------------------------- units

// Split a word into units: vowel nuclei (V: single vowels or diphthongs) and consonant units
// (C: single letters, or qu, gu (after n, before a vowel), ch, ph, th, rh, and consonantal i "J").
// Each unit: { k: "V"|"C", key, t (text, j→i), s (start index in the letter string) }.
function toUnits(w) {
  const whole = w.replace(/j/g, "i");
  const out = [];
  let i = 0;
  while (i < w.length) {
    const c = w[i], n = w[i + 1], n2 = w[i + 2];
    if (c === "j") { out.push({ k: "C", key: "J", t: "i", s: i }); i++; continue; }
    if (isV(c)) {
      // Consonantal i: word-initial or between vowels, before a vowel (Iesus, eius, alleluia).
      if (c === "i" && isV(n)) {
        const prev = out[out.length - 1];
        if (i === 0 || (prev && prev.k === "V")) { out.push({ k: "C", key: "J", t: "i", s: i }); i++; continue; }
      }
      const pair = c + (n || "");
      let diph = false;
      if ((pair === "ae" || pair === "oe") && !HIATUS_AE.test(whole)) diph = true;
      else if (pair === "au") diph = true;
      else if (pair === "eu" && (i === 0 || EU_WORDS.has(whole))) diph = true;
      else if (pair === "ui" && UI_WORDS.has(whole)) diph = true;
      if (diph) { out.push({ k: "V", key: pair, t: pair, s: i }); i += 2; continue; }
      out.push({ k: "V", key: c, t: c, s: i }); i++; continue;
    }
    if (c === "q" && n === "u") { out.push({ k: "C", key: "qu", t: "qu", s: i }); i += 2; continue; }
    if (c === "g" && n === "u" && isV(n2) && w[i - 1] === "n") { out.push({ k: "C", key: "gu", t: "gu", s: i }); i += 2; continue; }
    if ("cptr".includes(c) && n === "h") { out.push({ k: "C", key: c + "h", t: c + "h", s: i }); i += 2; continue; }
    out.push({ k: "C", key: c, t: c, s: i }); i++;
  }
  return out;
}

// Group units into syllables (arrays of units).
// One consonant between vowels → next syllable (Dó-mi-nus, di-xit).
// Two or more → the last goes to the next syllable (sanc-tus, ag-nus, sus-ci-pi-at, ex-cel-sis),
// except mute + liquid, which both go to the next one (Pa-tri, ven-tris, Chris-te is s|t).
function syllabifyUnits(us) {
  const vIdx = [];
  us.forEach((u, i) => { if (u.k === "V") vIdx.push(i); });
  if (!vIdx.length) return us.length ? [us] : [];
  const sylls = [];
  let start = 0;
  for (let j = 0; j < vIdx.length; j++) {
    const v = vIdx[j], next = vIdx[j + 1];
    if (next === undefined) { sylls.push(us.slice(start)); break; }
    const cons = us.slice(v + 1, next);
    const n = cons.length;
    let coda = 0;
    if (n >= 2) {
      const a = cons[n - 2].key, b = cons[n - 1].key;
      const muteLiquid = MUTES.has(a) && LIQUIDS.has(b) && !((a === "t" || a === "d") && b === "l");
      coda = muteLiquid ? n - 2 : n - 1;
    }
    sylls.push(us.slice(start, v + 1 + coda));
    start = v + 1 + coda;
  }
  return sylls;
}

const sylText = (syl) => syl.map((u) => u.t).join("");
const nucleus = (syl) => syl.find((u) => u.k === "V");

function isHeavy(sylls, k) {
  const syl = sylls[k];
  const nu = nucleus(syl);
  if (nu && nu.key.length === 2) return true;            // diphthong
  if (syl[syl.length - 1].k === "C") return true;        // closed syllable
  const nx = sylls[k + 1];
  if (nx && nx[0].key === "x") return true;              // x = ks closes the syllable before it
  return false;
}

// Parse a stress hint like "Dó-mi-nus" / "cáe-lum" / "Dóminus".
// Returns { letters, offset (letter index of the accented vowel or -1), accSyl, nSyl }.
function parseHint(hint) {
  const d = String(hint).normalize("NFD");
  let lt = "", offset = -1, syl = 0, accSyl = -1, lastStart = -1;
  for (const ch of d) {
    if (ch === "́" || ch === "̀") {
      if (offset < 0 && lastStart >= 0) { offset = lastStart; accSyl = syl; }
      continue;
    }
    if (/[̀-ͯ]/.test(ch)) continue;
    if (ch === "-" || ch === "·" || ch === "‧") { syl++; continue; }
    let c = ch.toLowerCase();
    if (c === "æ") c = "ae"; else if (c === "œ") c = "oe"; else if (c === "j") c = "i";
    if (!/^[a-z]+$/.test(c)) continue;
    lastStart = lt.length;
    lt += c;
  }
  return { letters: lt, offset, accSyl, nSyl: syl + 1 };
}

function ruleStress(sylls, whole) {
  const n = sylls.length;
  if (n <= 2) return 0;
  if (Object.prototype.hasOwnProperty.call(STRESS_EXCEPTIONS, whole)) return Math.min(STRESS_EXCEPTIONS[whole], n - 1);
  if (LONG_PENULT.test(whole)) return n - 2;
  return isHeavy(sylls, n - 2) ? n - 2 : n - 3;
}

function analyze(word, stressHint) {
  const w = lettersJ(word);
  const whole = w.replace(/j/g, "i");
  const units = toUnits(w);
  const sylls = syllabifyUnits(units);
  let stress = 0;
  if (sylls.length) {
    stress = -1;
    if (stressHint) {
      const h = parseHint(stressHint);
      if (h.offset >= 0) {
        if (h.letters === whole) {
          stress = sylls.findIndex((syl) => {
            const a = syl[0].s, last = syl[syl.length - 1];
            return h.offset >= a && h.offset < last.s + last.t.length;
          });
        } else {
          stress = Math.min(h.accSyl, sylls.length - 1); // spelling differs: trust the hint's syllable number
        }
      }
    }
    if (stress < 0) stress = ruleStress(sylls, whole);
  }
  return { w, whole, units, sylls, stress };
}

// ---------------------------------------------------------------- public API: structure

/** Syllables of a word (normalized, lowercase). Consonantal i is shown as "i". */
export function syllabify(word) {
  return syllabifyUnits(toUnits(lettersJ(word))).map(sylText);
}

/**
 * Index of the stressed syllable. Uses the data's hint ("Dó-mi-nus": acute on the stressed vowel)
 * when given; otherwise the rules (1–2 syllables: first; 3+: penult if heavy, else antepenult).
 * Limit: without macrons a long open penult (indúcas, miserére) cannot be detected, apart from
 * the endings list and exceptions above.
 */
export function stressIndex(word, stressHint) {
  return analyze(word, stressHint).stress;
}

// ---------------------------------------------------------------- helpers for letter values

const isFrontV = (u) => !!u && u.k === "V" && (u.key[0] === "e" || u.key[0] === "i" || u.key[0] === "y" || u.key === "ae" || u.key === "oe");

// ti + vowel → "tsi", unless after s, t, x (Liber Usualis) or word-initial (the rule needs a preceding letter).
function isAssibilatedT(us, i) {
  const q = us[i + 1], r = us[i + 2], p = us[i - 1];
  return us[i].key === "t" && q && q.key === "i" && r && r.k === "V" && i > 0 && !(p && ["s", "t", "x"].includes(p.key));
}

// ---------------------------------------------------------------- toItalian

/**
 * Italian spelling for an it-IT TTS voice. opts.accent: "auto" (default), "all", "none".
 * auto marks the stressed vowel with a grave accent when the stress is not on the penult, or when
 * the stressed syllable is followed by a vowel (hiatus, e.g. Dèi, fìat, Marìa), so the voice does not
 * merge the vowels into one syllable. "all" marks every word of 2+ syllables (use if a voice
 * guesses stress badly); "none" never marks.
 */
export function toItalian(word, stressHint, opts = {}) {
  const mode = opts.accent || "auto";
  const { whole, units: us, sylls, stress } = analyze(word, stressHint);
  if (!us.length) return String(word ?? "");
  const n = sylls.length;
  const stressedNu = n ? nucleus(sylls[stress]) : null;

  let mark = false;
  if (mode === "all") mark = n >= 2;
  else if (mode === "auto" && n >= 2) {
    if (stress !== n - 2) mark = true;
    const nx = sylls[stress + 1];
    if (nx && nx[0].k === "V") mark = true;
  }

  let out = "";
  let skipS = false;
  for (let i = 0; i < us.length; i++) {
    const u = us[i], p = us[i - 1], q = us[i + 1];
    if (u.k === "V") {
      // ae/oe = e (caeli → celi, coelum → celum); y = i (Kyrie → Chirie); au/eu/ui stay.
      let v = u.key === "ae" || u.key === "oe" ? "e" : u.key === "y" ? "i" : u.key;
      const stressed = u === stressedNu;
      // ci/gi + vowel: Italian treats that i as a silent spelling letter (cia = "cha"), but in
      // Latin it is a full vowel (fá-ci-am, spe-ci-ó-sa). Unstressed: write "ii" so one i survives
      // (best guess, untested on devices). Stressed: force the accent (Lucìa).
      const softBefore = v === "i" && p && (p.key === "c" || p.key === "g") && q && q.k === "V";
      if (stressed && (mark || (softBefore && mode !== "none"))) v = GRAVE[v[0]] + v.slice(1);
      else if (softBefore) v = "ii";
      out += v;
      continue;
    }
    switch (u.key) {
      case "J": out += "i"; break;                        // Iesus: Italian "ie" = /je/
      case "ch": out += isFrontV(q) ? "ch" : "c"; break;  // ch = k always: Christe → Criste, Cherubim stays
      case "k": out += isFrontV(q) ? "ch" : "c"; break;   // Kyrie → Chirie (Italian has no k)
      case "ph": out += "f"; break;
      case "th": out += "t"; break;                       // Sabaoth → Sabaot
      case "rh": out += "r"; break;
      case "h": out += H_AS_K.test(whole) ? "ch" : ""; break; // silent; mihi → michi, nihil → nichil
      case "x":
        // x = ks → "cs". Before c + e/i the Italian "sce/sci" gives the Liber's "ksh":
        // excelsis → ecscelsis = /ek'ʃelsis/. In "exs" the s is already inside the x: exsultate → ecsultate.
        out += "cs";
        if (q && q.key === "s") skipS = true;
        break;
      case "s": if (skipS) { skipS = false; break; } out += "s"; break;
      case "z": out += "dz"; break;                       // Liber: z = dz (Italian z can be ts or dz)
      case "t": out += isAssibilatedT(us, i) ? "z" : "t"; break; // gratia → grazia (Italian z = ts)
      case "g":
        // Italian "gli" = /ʎ/; Latin gl+i is g + l (negligentia), so write "gh".
        out += q && q.key === "l" && us[i + 2] && us[i + 2].key === "i" ? "gh" : "g";
        break;
      // c, g before e/i are already /tʃ/, /dʒ/ in Italian; sc+e/i = /ʃ/; gn = /ɲɲ/; qu, gu = kw, gw;
      // double consonants are long in Italian too: all copied as they are.
      default: out += u.key;
    }
  }
  const raw = String(word ?? "").trim();
  if (raw && raw[0] !== raw[0].toLowerCase()) out = out[0].toUpperCase() + out.slice(1);
  return out;
}

// ---------------------------------------------------------------- toIPA

const VELAR_NEXT = (us, i) => {
  const q = us[i + 1];
  if (!q) return false;
  if (["qu", "gu", "k", "ch", "x"].includes(q.key)) return true;
  if (q.key === "c" || q.key === "g") return !isFrontV(us[i + 2]) && !(q.key === "g" && us[i + 2] && us[i + 2].key === "n");
  return false;
};

function unitIPA(us, i, whole) {
  const u = us[i], p = us[i - 1], q = us[i + 1], r = us[i + 2];
  if (u.k === "V") {
    return { a: "a", e: "e", i: "i", o: "o", u: "u", y: "i", ae: "e", oe: "e", au: "au̯", eu: "eu̯", ui: "ui̯" }[u.key];
  }
  switch (u.key) {
    case "c":
      if (isFrontV(q)) {
        if (p && p.key === "s") return "ʃ";              // sc + e/i = sh
        if (p && p.key === "x") return "ʃ";              // xc + e/i = k + sh
        return "tʃ";
      }
      if (q && q.key === "c" && isFrontV(r)) return "t"; // ecce = et-tʃe
      return "k";
    case "g":
      if (q && q.key === "n") return "ɲ";                // gn = ɲɲ
      if (isFrontV(q)) return "dʒ";
      if (q && q.key === "g" && isFrontV(r)) return "d"; // gg + e/i = ddʒ
      return "ɡ";
    case "n":
      if (p && p.key === "g") return "ɲ";
      return VELAR_NEXT(us, i) ? "ŋ" : "n";
    case "s":
      if (q && q.key === "c" && isFrontV(r)) return "";  // the s merges into the ʃ of sc
      return "s";
    case "x":
      // exs: the s is already in the x, so x = k here (exsultate = ek.sul.ta.te)
      if (q && q.key === "s") return "k";
      if (q && q.key === "c" && isFrontV(r)) return "k";
      return "ks";
    case "t": return isAssibilatedT(us, i) ? "ts" : "t";
    case "h": return H_AS_K.test(whole) ? "k" : "";
    case "ch": case "k": return "k";
    case "ph": return "f";
    case "th": return "t";
    case "rh": return "r";
    case "qu": return "kw";
    case "gu": return "ɡw";
    case "J": return "j";
    case "z": return "dz";
    default: return u.key;
  }
}

/**
 * Broad IPA for display (no slashes), Ecclesiastical values, syllables joined with ".",
 * "ˈ" before the stressed syllable. e and o are written plain (open/closed not distinguished).
 */
export function toIPA(word, stressHint) {
  const { whole, units: us, sylls, stress } = analyze(word, stressHint);
  if (!us.length) return "";
  const map = new Map();
  us.forEach((u, i) => map.set(u, unitIPA(us, i, whole)));
  const parts = sylls.map((syl) => syl.map((u) => map.get(u)).join(""));
  // x as onset (di-xit): put the k in the previous syllable → dik.sit
  for (let k = 1; k < sylls.length; k++) {
    if (sylls[k][0].key === "x" && parts[k].startsWith("ks")) { parts[k - 1] += "k"; parts[k] = parts[k].slice(1); }
  }
  return parts.map((s, k) => (k === stress && parts.length > 1 ? "ˈ" : "") + s).join(".");
}

// ---------------------------------------------------------------- speakable

/**
 * Respell a whole line for the Italian voice, keeping spaces and punctuation (pauses).
 * tokens (optional): [{ w, stress }] in text order; each word uses its token's stress hint.
 */
export function speakable(text, tokens, opts) {
  let ti = 0;
  return String(text ?? "").replace(/[\p{L}\p{M}]+/gu, (m) => {
    let hint;
    if (Array.isArray(tokens)) {
      const key = letters(m);
      for (let k = ti; k < Math.min(tokens.length, ti + 4); k++) {
        const t = tokens[k];
        if (t && letters(t.w || "") === key) { hint = t.stress; ti = k + 1; break; }
      }
    }
    return toItalian(m, hint, opts);
  });
}

// ---------------------------------------------------------------- spanishTips

const TIPS = {
  "c-soft": { en: "c before e/i/ae/oe = \"ch\" (caeli = CHE-li), not the Spanish c of \"cielo\".", es: "c ante e/i/ae/oe = \"ch\" (caeli = CHE-li), no como la c española de \"cielo\"." },
  "g-soft": { en: "g before e/i/ae/oe = English \"j\" (/dʒ/), not the Spanish g of \"gente\".", es: "g ante e/i/ae/oe = \"y\" fuerte, como la \"j\" inglesa (/dʒ/), no como la g de \"gente\"." },
  "sc": { en: "sc before e/i = \"sh\" (suscipiat = su-SHI-pi-at).", es: "sc ante e/i = \"sh\" (suscipiat = su-SHI-pi-at), no \"s-s\"." },
  "z": { en: "z = \"dz\" (zelus = DZE-lus), not Spanish /θ/ or /s/.", es: "z = \"dz\" (zelus = DZE-lus), no como la z española." },
  "j": { en: "i/j before a vowel = \"y\" (Iesus = YE-sus), never the Spanish jota.", es: "i/j ante vocal = \"y\" (Iesus = YE-sus), nunca la jota española." },
  "v": { en: "v is a real v (upper teeth on lower lip), different from b.", es: "La v es labiodental (dientes sobre el labio): suena distinta de la b." },
  "double": { en: "Hold double consonants longer (ecce = ET-che, terra = TER-ra).", es: "Las consonantes dobles se alargan (ecce = ET-che, terra = TER-ra)." },
  "ti": { en: "ti + vowel = \"tsi\" (gratia = GRA-tsi-a), not the Spanish \"-cia\".", es: "ti + vocal = \"tsi\" (gratia = GRA-tsi-a), no como \"gracia\"." },
  "gn": { en: "gn = Spanish ñ, held a little (Agnus = AÑ-ñus). Easy for you.", es: "gn = ñ, un poco alargada (Agnus = AÑ-ñus). Fácil para ti." },
  "qu": { en: "qu before e/i: say the u (qui = \"kwi\"), unlike Spanish \"que/qui\".", es: "qu ante e/i: la u se pronuncia (qui = \"kui\"), a diferencia del español." },
  "h": { en: "h is silent, as in Spanish.", es: "La h es muda, como en español." },
  "h-k": { en: "Here h = k: mihi = MI-ki, nihil = NI-kil.", es: "Aquí la h = k: mihi = MI-ki, nihil = NI-kil." },
  "ae": { en: "ae/oe = one sound, e (caelum = CHE-lum), not \"a-e\".", es: "ae/oe = un solo sonido, e (caelum = CHE-lum), no \"a-e\"." },
  "x": { en: "x = \"ks\"; xc before e/i = \"ksh\" (excelsis = ek-SHEL-sis).", es: "x = \"ks\"; xc ante e/i = \"ksh\" (excelsis = ek-SHEL-sis)." },
  "ch": { en: "ch = k (Christe = KRIS-te), never the Spanish ch.", es: "ch = k (Christe = KRIS-te), nunca la ch española." },
};

/** Short EN/ES tips ({id, en, es}) for Spanish-speaker traps in this word. */
export function spanishTips(word) {
  const w = lettersJ(word);
  const whole = w.replace(/j/g, "i");
  const us = toUnits(w);
  const ids = new Set();
  us.forEach((u, i) => {
    const p = us[i - 1], q = us[i + 1];
    if (u.key === "c" && isFrontV(q)) ids.add(p && (p.key === "s" || p.key === "x") ? (p.key === "s" ? "sc" : "x") : "c-soft");
    if (u.key === "g" && isFrontV(q)) ids.add("g-soft");
    if (u.key === "z") ids.add("z");
    if (u.key === "J") ids.add("j");
    if (u.key === "v") ids.add("v");
    if (u.k === "C" && q && q.k === "C" && u.key === q.key && u.key.length === 1) ids.add("double");
    if (isAssibilatedT(us, i)) ids.add("ti");
    if (u.key === "g" && q && q.key === "n") ids.add("gn");
    if (u.key === "qu" && isFrontV(q)) ids.add("qu");
    if (u.key === "h") ids.add(H_AS_K.test(whole) ? "h-k" : "h");
    if (u.key === "ae" || u.key === "oe") ids.add("ae");
    if (u.key === "x") ids.add("x");
    if (u.key === "ch") ids.add("ch");
  });
  return [...ids].map((id) => ({ id, ...TIPS[id] }));
}
