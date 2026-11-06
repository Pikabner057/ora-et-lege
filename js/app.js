import * as S from "./store.js";
import { newCard, review, preview } from "./fsrs.js";
import * as P from "./pron.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const main = () => $("#main");
const DATA = { prayers: [], vocab: {}, sounds: [] };
const MAX_REVIEWS = 60, BACKLOG = 40;

// ---------- glosses: Spanish or English first ----------
const lang = () => S.get().settings.gloss || "es";
const other = () => (lang() === "es" ? "en" : "es");
const g2 = obj => obj ? `<span class="g1">${esc(obj[lang()])}</span><span class="g2">${esc(obj[other()])}</span>` : "";

// ---------- speech (phone's Italian voice reading an Italian respelling) ----------
let voice = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices().filter(v => /^it/i.test(v.lang));
  voice = vs.find(v => /luca|alice|federica|paola|elsa|diego/i.test(v.name)) || vs[0] || null;
}
if ("speechSynthesis" in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }

function say(text, tokens) {
  if (!("speechSynthesis" in window)) return toast("This browser can't speak. Try Safari or Edge.");
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(P.speakable(text, tokens));
  u.lang = "it-IT";
  if (voice) u.voice = voice;
  u.rate = S.get().settings.rate || 0.85;
  speechSynthesis.speak(u);
}

// ---------- small UI helpers ----------
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), 3200);
}

function stressHtml(stress) {
  if (!stress) return "";
  return esc(stress).replace(/([áéíóúý])/gi, '<b class="acc">$1</b>');
}

function speakBtn(label = "Hear") {
  return `<button class="btn-hear" type="button" aria-label="${esc(label)}">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none"/></svg>
    <span>${esc(label)}</span></button>`;
}

// ---------- word sheet ----------
function openWord(tok) {
  const v = DATA.vocab[tok.lemma] || {};
  const tips = P.spanishTips(tok.w);
  $("#sheet-body").innerHTML = `
    <p class="sheet-word">${esc(tok.w)}</p>
    <p class="sheet-stress">${stressHtml(tok.stress)} <span class="ipa">/${esc(P.toIPA(tok.w, tok.stress))}/</span></p>
    <div class="sheet-row">${speakBtn("Hear word")}</div>
    <dl>
      <dt>Meaning</dt><dd>${g2(tok.gloss)}</dd>
      <dt>Grammar</dt><dd>${g2(tok.parse)}</dd>
      ${v.dict ? `<dt>Dictionary</dt><dd class="la">${esc(v.dict)}${v.cognate_es ? ` <span class="cog">≈ ${esc(v.cognate_es)}</span>` : ""}</dd>` : ""}
      ${v.trap ? `<dt>Watch out</dt><dd>${esc(v.trap)}</dd>` : ""}
      ${tips.length ? `<dt>Sound</dt><dd><ul class="tips">${tips.map(t => `<li>${g2(t)}</li>`).join("")}</ul></dd>` : ""}
    </dl>`;
  $(".btn-hear", $("#sheet-body")).onclick = () => say(tok.w, [tok]);
  $("#sheet").showModal();
}

// ---------- cards ----------
const prayer = id => DATA.prayers.find(p => p.id === id);
const lineKey = (pid, i) => `${pid}:${i}`;

function allLines() {
  const out = [];
  for (const p of DATA.prayers) p.lines.forEach((l, i) => out.push({ p, l, i }));
  return out;
}

function nextLine() {
  return allLines().find(({ p, i }) => !S.get().learned[lineKey(p.id, i)]);
}

function dueCards(now = Date.now()) {
  return Object.entries(S.get().cards).filter(([, c]) => c.due <= now).sort((a, b) => a[1].due - b[1].due).map(([id]) => id);
}

// Learning a line: mark it, add cards for its new words (both directions) and a cloze for the line.
function learnLine(p, i) {
  const st = S.get(), now = Date.now();
  const key = lineKey(p.id, i);
  if (st.learned[key]) return 0;
  st.learned[key] = now;
  let added = 0;
  for (const t of p.lines[i].tokens) {
    if (!DATA.vocab[t.lemma] || st.cards[`v:${t.lemma}:r`]) continue;
    st.cards[`v:${t.lemma}:r`] = newCard(now);
    st.cards[`v:${t.lemma}:p`] = newCard(now + 1);
    added++;
  }
  if (p.lines[i].tokens.length > 1) st.cards[`c:${key}`] = newCard(now + 2);
  S.day().newWords += added;
  S.save();
  return added;
}

function canLearnMore() {
  const st = S.get();
  return S.day().newWords < st.settings.newPerDay && dueCards().length < BACKLOG;
}

// ---------- answer checking ----------
const norm = s => P.normalize(String(s)).replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
const firstForm = dict => (dict || "").split(/[ ,]/)[0];

// ---------- review session ----------
function cardView(id, onDone) {
  const st = S.get(), card = st.cards[id];
  const [kind, a, b] = id.split(":");
  const box = document.createElement("div");
  box.className = "card";
  const gradeRow = (suggest) => {
    const labels = preview(card);
    return `<div class="grades" role="group" aria-label="How well did you know it?">
      ${["Again", "Hard", "Good", "Easy"].map((n, k) => `<button type="button" class="grade g${k + 1}${suggest === k + 1 ? " is-suggested" : ""}" data-g="${k + 1}">${n}<small>${labels[k]}</small></button>`).join("")}
    </div>`;
  };
  const finish = g => {
    st.cards[id] = review(card, g);
    st.log.push([id, Date.now(), g]);
    S.day().reviews++;
    S.save();
    onDone(g);
  };
  const wireGrades = () => $$(".grade", box).forEach(btn => (btn.onclick = () => finish(+btn.dataset.g)));

  if (kind === "v") {
    const v = DATA.vocab[a];
    if (!v) { onDone(0); return box; }
    if (b === "r") {
      box.innerHTML = `<p class="card-kind">What does it mean?</p>
        <p class="card-la">${esc(v.dict.replace(/\s*\([^)]*\)/g, "").replace(/\s*\/\s*$/, ""))}</p><p class="card-stress">${stressHtml(v.stress)}</p>
        <div class="card-actions">${speakBtn()}<button type="button" class="btn primary show">Show answer</button></div>
        <div class="answer" hidden><p class="card-gloss">${g2(v.gloss)}</p>${gradeRow()}</div>`;
      $(".btn-hear", box).onclick = () => say(firstForm(v.dict), [{ w: firstForm(v.dict), stress: v.stress }]);
      $(".show", box).onclick = () => { $(".answer", box).hidden = false; $(".show", box).hidden = true; wireGrades(); };
    } else {
      box.innerHTML = `<p class="card-kind">Write it in Latin</p>
        <p class="card-gloss big">${g2(v.gloss)}</p>
        <form class="type-form"><input class="type-in" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Latin word" placeholder="Latin word">
        <button class="btn primary">Check</button></form>
        <div class="answer" hidden></div>`;
      const t0 = Date.now();
      $(".type-form", box).onsubmit = e => {
        e.preventDefault();
        const got = norm($(".type-in", box).value), want = norm(firstForm(v.dict));
        const ok = got === want, slow = Date.now() - t0 > 15000;
        const ans = $(".answer", box);
        ans.hidden = false;
        ans.innerHTML = `<p class="${ok ? "ok" : "bad"}">${ok ? "Right" : "Not quite"}: <span class="la">${esc(v.dict)}</span></p>${gradeRow(ok ? (slow ? 2 : 3) : 1)}`;
        $(".type-form", box).hidden = true;
        say(firstForm(v.dict), [{ w: firstForm(v.dict), stress: v.stress }]);
        wireGrades();
      };
      setTimeout(() => $(".type-in", box)?.focus(), 50);
    }
  } else if (kind === "c") {
    const p = prayer(a), line = p?.lines[+b];
    if (!line) { onDone(0); return box; }
    const cand = line.tokens.map((t, k) => k).filter(k => line.tokens[k].w.length > 2);
    const hole = cand[(card.reps * 3 + +b) % cand.length] ?? 0;
    const right = line.tokens[hole].w;
    const pool = [...new Set(p.lines.flatMap(l => l.tokens.map(t => t.w)).concat(allLines().flatMap(x => x.l.tokens.map(t => t.w))))]
      .filter(w => norm(w) !== norm(right) && w.length > 2);
    const pick = pool.sort((x, y) => Math.abs(x.length - right.length) - Math.abs(y.length - right.length) || Math.random() - 0.5).slice(0, 8).sort(() => Math.random() - 0.5).slice(0, 3);
    const opts = [right, ...pick].sort(() => Math.random() - 0.5);
    box.innerHTML = `<p class="card-kind">${esc(p.title.la)}: fill the gap</p>
      <p class="card-line">${line.tokens.map((t, k) => k === hole ? '<span class="gap">_____</span>' : esc(t.w)).join(" ")}</p>
      <p class="card-sub">${esc(line[lang()])}</p>
      <div class="tiles">${opts.map(o => `<button type="button" class="tile la">${esc(o)}</button>`).join("")}</div>
      <div class="answer" hidden></div>`;
    $$(".tile", box).forEach(btn => (btn.onclick = () => {
      const ok = btn.textContent === right;
      $$(".tile", box).forEach(x => { x.disabled = true; if (x.textContent === right) x.classList.add("is-right"); });
      if (!ok) btn.classList.add("is-wrong");
      $(".gap", box).textContent = right;
      say(line.la, line.tokens);
      const ans = $(".answer", box);
      ans.hidden = false;
      ans.innerHTML = gradeRow(ok ? 3 : 1);
      wireGrades();
    }));
  }
  return box;
}

function runReview(container, ids, onEnd) {
  let i = 0, right = 0;
  const step = () => {
    if (i >= ids.length) return onEnd({ done: i, right });
    container.innerHTML = `<p class="progress-line">${i + 1} / ${ids.length}</p>`;
    container.append(cardView(ids[i], g => { if (g > 1) right++; i++; step(); }));
  };
  step();
}

// ---------- prayer reader ----------
// Each word becomes a button; punctuation from the printed line stays between them.
function lineTokensHtml(l) {
  let pos = 0, out = "";
  l.tokens.forEach((t, k) => {
    const at = l.la.indexOf(t.w, pos);
    const gapText = at >= 0 ? l.la.slice(pos, at) : " ";
    out += gapText.trim() ? `<span class="punct">${esc(gapText.trim())}</span> ` : " ";
    out += `<button type="button" class="tok" data-k="${k}"><span class="w">${esc(t.w)}</span><span class="ig">${esc(t.gloss[lang()])}</span></button>`;
    if (at >= 0) pos = at + t.w.length;
  });
  const tail = l.la.slice(pos).trim();
  return out + (tail ? `<span class="punct">${esc(tail)}</span>` : "");
}
function readerHtml(p, opts = {}) {
  return `<div class="reader" data-hide="${opts.hide || 0}">
    ${p.lines.map((l, i) => `
      <div class="rline${l.speaker ? " has-speaker" : ""}" data-i="${i}">
        ${l.speaker ? `<span class="speaker" aria-label="${l.speaker === "V" ? "Priest" : "People"}">${l.speaker === "V" ? "℣" : "℟"}</span>` : ""}
        <p class="la-line">${lineTokensHtml(l)}</p>
        <p class="tr-line">${esc(l[lang()])}</p>
        <button type="button" class="line-hear" aria-label="Hear this line"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none"/></svg></button>
      </div>`).join("")}
  </div>`;
}

function wireReader(root, p) {
  $$(".rline", root).forEach(row => {
    const l = p.lines[+row.dataset.i];
    $$(".tok", row).forEach(b => (b.onclick = () => {
      if (b.classList.contains("is-hidden")) { b.classList.remove("is-hidden"); return; }
      openWord(l.tokens[+b.dataset.k]);
    }));
    $(".line-hear", row).onclick = () => say(l.la, l.tokens);
  });
}

function applyHide(root, level) {
  // 0 none, 1 every third word, 2 every other word, 3 all words
  $$(".rline", root).forEach(row => $$(".tok", row).forEach((b, k) => {
    const hide = level === 3 || (level === 2 && k % 2 === 1) || (level === 1 && k % 3 === 2);
    b.classList.toggle("is-hidden", hide);
  }));
}

// ---------- produce tasks ----------
function unscramble(container, p, i, onEnd) {
  const line = p.lines[i];
  const words = line.tokens.map(t => t.w);
  let order = words.map((w, k) => k).sort(() => Math.random() - 0.5);
  if (order.every((v, k) => v === k) && words.length > 1) order.reverse();
  const built = [];
  container.innerHTML = `<p class="card-kind">Put the words in order</p>
    <p class="card-sub">${esc(line[lang()])}</p>
    <p class="built la" aria-live="polite"></p>
    <div class="tiles">${order.map(k => `<button type="button" class="tile la" data-k="${k}">${esc(words[k])}</button>`).join("")}</div>
    <div class="card-actions"><button type="button" class="btn undo">Undo</button></div>`;
  const render = () => ($(".built", container).textContent = built.map(k => words[k]).join(" "));
  $$(".tile", container).forEach(b => (b.onclick = () => {
    built.push(+b.dataset.k); b.disabled = true; render();
    if (built.length === words.length) {
      const ok = built.every((k, n) => norm(words[k]) === norm(words[n]));
      $(".built", container).classList.add(ok ? "ok" : "bad");
      if (!ok) $(".built", container).insertAdjacentHTML("afterend", `<p class="la ok">${esc(line.la)}</p>`);
      say(line.la, line.tokens);
      container.insertAdjacentHTML("beforeend", `<button type="button" class="btn primary next">Continue</button>`);
      $(".next", container).onclick = () => onEnd(ok);
    }
  }));
  $(".undo", container).onclick = () => {
    const k = built.pop();
    if (k === undefined) return;
    $(`.tile[data-k="${k}"]`, container).disabled = false; render();
  };
}

function dictation(container, p, i, onEnd) {
  const line = p.lines[i];
  container.innerHTML = `<p class="card-kind">Listen and write what you hear</p>
    <div class="card-actions">${speakBtn("Play")}</div>
    <form class="type-form"><textarea class="type-in" rows="3" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="What you heard"></textarea>
    <button class="btn primary">Check</button></form><div class="answer"></div>`;
  $(".btn-hear", container).onclick = () => say(line.la, line.tokens);
  setTimeout(() => say(line.la, line.tokens), 300);
  $(".type-form", container).onsubmit = e => {
    e.preventDefault();
    const got = norm($(".type-in", container).value).split(" ");
    const diff = line.tokens.map((t, k) => `<span class="${norm(t.w) === (got[k] || "") ? "ok" : "bad"}">${esc(t.w)}</span>`).join(" ");
    const right = line.tokens.filter((t, k) => norm(t.w) === (got[k] || "")).length;
    $(".answer", container).innerHTML = `<p class="la diff">${diff}</p><p>${right} of ${line.tokens.length} words right.</p>
      <button type="button" class="btn primary next">Continue</button>`;
    $(".next", container).onclick = () => onEnd(right === line.tokens.length);
  };
}

async function shadow(container, p, i, onEnd) {
  const line = p.lines[i];
  container.innerHTML = `<p class="card-kind">Shadow: listen, then say it yourself</p>
    <p class="card-line la">${esc(line.la)}</p>
    <div class="card-actions">${speakBtn("Model")}
      <button type="button" class="btn rec">Record</button>
      <button type="button" class="btn mine" disabled>My voice</button></div>
    <p class="card-sub">Play the model, record yourself, then compare. Repeat 3 times.</p>
    <button type="button" class="btn primary next">Done</button>`;
  $(".btn-hear", container).onclick = () => say(line.la, line.tokens);
  $(".next", container).onclick = () => onEnd(true);
  const rec = $(".rec", container), mine = $(".mine", container);
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    rec.disabled = true; rec.textContent = "No recorder here";
    return;
  }
  let mr = null, url = null;
  rec.onclick = async () => {
    if (mr && mr.state === "recording") { mr.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      mr = new MediaRecorder(stream);
      mr.ondataavailable = e => chunks.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        if (url) URL.revokeObjectURL(url);
        url = URL.createObjectURL(new Blob(chunks, { type: mr.mimeType }));
        mine.disabled = false; rec.textContent = "Record again"; rec.classList.remove("is-on");
      };
      mr.start(); rec.textContent = "Stop"; rec.classList.add("is-on");
    } catch (e) { toast("Microphone blocked. Allow it in Settings to record."); }
  };
  mine.onclick = () => url && new Audio(url).play();
}

// ---------- screens ----------
function viewToday() {
  const st = S.get(), due = dueCards();
  const nl = nextLine();
  const learnedCount = Object.keys(st.learned).length, total = allLines().length;
  const d = S.day();
  main().innerHTML = `
    <section class="hero">
      <p class="hero-date">${new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</p>
      <h1>Hodie</h1>
      <p class="hero-sub">About 25 minutes. Four steps, in order.</p>
    </section>
    <ol class="steps">
      <li><span class="step-name">Review</span><span class="step-info">${due.length ? `${Math.min(due.length, MAX_REVIEWS)} cards due` : "Nothing due"}</span></li>
      <li><span class="step-name">Learn a line</span><span class="step-info">${nl ? `${esc(nl.p.title.la)}, line ${nl.i + 1}` : "All prayers learned"}</span></li>
      <li><span class="step-name">Read</span><span class="step-info">${nl ? esc(nl.p.title.la) : "Any prayer"}</span></li>
      <li><span class="step-name">Speak or write</span><span class="step-info">${["Unscramble", "Dictation", "Shadowing"][new Date().getDay() % 3]}</span></li>
    </ol>
    <button type="button" class="btn primary big start">${d.done ? "Do another round" : "Start today's session"}</button>
    <p class="stats"><span><b>${S.streak()}</b> day streak</span><span><b>${learnedCount}</b> / ${total} lines</span><span><b>${d.reviews}</b> reviews today</span></p>`;
  $(".start").onclick = runSession;
}

function runSession() {
  const box = main();
  const steps = ["review", "learn", "read", "produce", "end"];
  let s = 0, summary = { reviewed: 0, learned: null };
  const header = name => `<div class="session-bar"><button type="button" class="btn quit" aria-label="Stop session">✕</button>
    <ol class="dots">${steps.slice(0, 4).map((x, k) => `<li class="${k < s ? "done" : k === s ? "now" : ""}"></li>`).join("")}</ol>
    <span class="session-step">${name}</span></div><div class="session-body"></div>`;
  const next = () => { s++; go(); };
  const go = () => {
    const step = steps[s];
    if (step === "review") {
      const ids = dueCards().slice(0, MAX_REVIEWS);
      if (!ids.length) return next();
      box.innerHTML = header("Review");
      wireQuit();
      runReview($(".session-body"), ids, r => { summary.reviewed = r.done; next(); });
    } else if (step === "learn") {
      const nl = nextLine();
      if (!nl || !canLearnMore()) return next();
      box.innerHTML = header("Learn a line");
      wireQuit();
      const body = $(".session-body");
      body.innerHTML = `<p class="card-kind">${esc(nl.p.title.la)} · line ${nl.i + 1} of ${nl.p.lines.length}</p>
        ${readerHtml({ ...nl.p, lines: [nl.l] })}
        <p class="card-sub">Tap each word. Hear the line until you can say it with the voice.</p>
        <button type="button" class="btn primary big got">I've got this line</button>`;
      $(".reader", body).classList.add("show-gloss");
      wireReader(body, { ...nl.p, lines: [nl.l] });
      say(nl.l.la, nl.l.tokens);
      $(".got", body).onclick = () => { summary.learned = nl; learnLine(nl.p, nl.i); next(); };
    } else if (step === "read") {
      const p = (summary.learned || nextLine() || allLines()[0]).p;
      box.innerHTML = header("Read");
      wireQuit();
      const body = $(".session-body");
      body.innerHTML = `<p class="card-kind">${esc(p.title.la)}: read it through, tapping any word you don't know</p>
        ${readerHtml(p)}<button type="button" class="btn primary big next">Next</button>`;
      $(".reader", body).classList.add("show-gloss");
      wireReader(body, p);
      $(".next", body).onclick = next;
    } else if (step === "produce") {
      const learned = allLines().filter(({ p, i }) => S.get().learned[lineKey(p.id, i)] && p.lines[i].tokens.length > 2);
      if (!learned.length) return next();
      box.innerHTML = header("Speak or write");
      wireQuit();
      const pick = learned[Math.floor(Math.random() * learned.length)];
      const task = [unscramble, dictation, shadow][new Date().getDay() % 3];
      task($(".session-body"), pick.p, pick.i, next);
    } else {
      S.day().done = true;
      S.save();
      box.innerHTML = `<section class="hero"><h1>Deo gratias</h1>
        <p class="hero-sub">Session done. ${summary.reviewed} reviews${summary.learned ? `, one new line of the ${esc(summary.learned.p.title.la)}` : ""}.</p></section>
        <p class="stats"><span><b>${S.streak()}</b> day streak</span><span><b>${dueCards(Date.now() + 86400000).length}</b> due tomorrow</span></p>
        <a class="btn primary big" href="#/today">Back to today</a>`;
    }
  };
  const wireQuit = () => ($(".quit").onclick = () => { speechSynthesis?.cancel(); route(); });
  go();
}

function viewPrayers() {
  const st = S.get();
  main().innerHTML = `<h1 class="page-title">Prayers</h1>
    <ul class="plist">${DATA.prayers.map(p => {
      const n = p.lines.filter((l, i) => st.learned[lineKey(p.id, i)]).length;
      return `<li><a href="#/prayer/${p.id}"><span class="la">${esc(p.title.la)}</span>
        <span class="pmeta">${esc(p.title[lang()])}</span>
        <span class="pbar" style="--f:${n / p.lines.length}" aria-label="${n} of ${p.lines.length} lines learned"></span></a></li>`;
    }).join("")}</ul>`;
}

function viewPrayer(id) {
  const p = prayer(id);
  if (!p) return route("#/prayers");
  main().innerHTML = `<a class="back" href="#/prayers">‹ Prayers</a>
    <h1 class="page-title la">${esc(p.title.la)}</h1>
    <p class="about">${esc(p.about?.[lang()])}</p>
    <div class="reader-tools">
      ${speakBtn("Hear all")}
      <label class="switch"><input type="checkbox" class="gl"> Word meanings</label>
      <label class="hide-ctl">Hide words <input type="range" class="hide" min="0" max="3" value="0" aria-label="How many words to hide"></label>
    </div>
    ${readerHtml(p)}
    ${p.grammar?.length ? `<section class="notes"><h2>Grammar in this prayer</h2><ul>${p.grammar.map(g => `<li>${g2(g)}</li>`).join("")}</ul></section>` : ""}`;
  const root = main();
  wireReader(root, p);
  $(".reader-tools .btn-hear").onclick = () => say(p.lines.map(l => l.la).join(" "), p.lines.flatMap(l => l.tokens));
  $(".gl").onchange = e => $(".reader").classList.toggle("show-gloss", e.target.checked);
  $(".hide").oninput = e => applyHide(root, +e.target.value);
}

function viewSounds() {
  main().innerHTML = `<h1 class="page-title">Sounds</h1>
    <p class="about">Church Latin is read with Italian letter values. Vowels are pure, like Spanish. Tap any word to hear it.</p>
    ${DATA.sounds.map(c => `<details class="sound"><summary><span>${esc(c.title[lang()])}</span></summary>
      <p>${esc(c.rule[lang()])}</p>
      ${c.spanish_trap ? `<p class="trap">${esc(c.spanish_trap[lang()])}</p>` : ""}
      <ul class="ex">${c.examples.map(x => `<li><button type="button" class="exw" data-w="${esc(x.la)}" data-s="${esc(x.stress || "")}"><span class="la">${esc(x.la)}</span>
        <span class="ipa">/${esc(P.toIPA(x.la, x.stress))}/</span><span class="g1">${esc(x.meaning?.[lang()])}</span></button></li>`).join("")}</ul>
      ${c.minimal_pair?.length ? `<p class="pair">Compare: ${c.minimal_pair.map(x => `<button type="button" class="exw la" data-w="${esc(x.la)}" data-s="${esc(x.stress || "")}">${esc(x.la)}</button>`).join(" vs ")}</p>` : ""}
    </details>`).join("")}`;
  $$(".exw").forEach(b => (b.onclick = () => say(b.dataset.w, [{ w: b.dataset.w, stress: b.dataset.s || undefined }])));
}

function viewReview() {
  const ids = dueCards().slice(0, MAX_REVIEWS);
  if (!ids.length) {
    const all = Object.values(S.get().cards);
    const next = all.length ? Math.min(...all.map(c => c.due)) : 0;
    main().innerHTML = `<h1 class="page-title">Review</h1><p class="empty">${all.length
      ? `All caught up. Next card due ${new Date(next).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}.`
      : "No cards yet. Learn your first prayer line from Today and its words appear here."}</p>
      <a class="btn primary" href="#/today">Go to Today</a>`;
    return;
  }
  main().innerHTML = `<h1 class="page-title">Review</h1><div class="session-body"></div>`;
  runReview($(".session-body"), ids, r => {
    main().innerHTML = `<h1 class="page-title">Review</h1><p class="empty">Done: ${r.done} cards, ${r.right} remembered.</p><a class="btn primary" href="#/today">Back to Today</a>`;
  });
}

function viewProgress() {
  const st = S.get();
  const words = Object.keys(st.cards).filter(id => id.endsWith(":r"));
  const strong = words.filter(id => st.cards[id].s >= 21).length;
  const lines = Object.keys(st.learned).length;
  const days = Object.values(st.days).filter(d => d.reviews > 0).length;
  main().innerHTML = `<h1 class="page-title">Progress</h1>
    <div class="tiles-stats">
      <div><b>${S.streak()}</b><span>day streak</span></div>
      <div><b>${days}</b><span>days studied</span></div>
      <div><b>${words.length}</b><span>words started</span></div>
      <div><b>${strong}</b><span>words solid (3+ weeks)</span></div>
      <div><b>${lines}/${allLines().length}</b><span>prayer lines</span></div>
      <div><b>${dueCards().length}</b><span>due now</span></div>
    </div>
    <section class="settings"><h2>Settings</h2>
      <label>Meanings first in <select class="s-gloss"><option value="es">Español</option><option value="en">English</option></select></label>
      <label>New words a day <input class="s-new" type="number" min="2" max="20" value="${st.settings.newPerDay}"></label>
      <label>Voice speed <input class="s-rate" type="range" min="0.6" max="1.1" step="0.05" value="${st.settings.rate}"></label>
      <p class="voice-info">${voice ? `Voice: ${esc(voice.name)} (Italian)` : "No Italian voice found. On iPhone: Settings › Accessibility › Spoken Content › Voices › Italian."}</p>
    </section>
    <section class="settings"><h2>Backup</h2>
      <p>Your progress lives only on this device. Save a backup now and then (to iCloud Drive or Files), and load it on another device.</p>
      <div class="card-actions"><button type="button" class="btn exp">Save backup</button>
      <label class="btn imp">Load backup<input type="file" accept="application/json,.json" hidden></label></div>
      <button type="button" class="btn danger rst">Erase all progress</button>
    </section>`;
  $(".s-gloss").value = lang();
  $(".s-gloss").onchange = e => { st.settings.gloss = e.target.value; S.save(); };
  $(".s-new").onchange = e => { st.settings.newPerDay = Math.max(2, Math.min(20, +e.target.value || 6)); S.save(); };
  $(".s-rate").onchange = e => { st.settings.rate = +e.target.value; S.save(); say("Gloria Patri", [{ w: "Gloria", stress: "Gló-ri-a" }, { w: "Patri", stress: "Pá-tri" }]); };
  $(".exp").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([S.exportJSON()], { type: "application/json" }));
    a.download = `church-latin-backup-${S.today()}.json`;
    a.click();
  };
  $(".imp input").onchange = async e => {
    try { S.importJSON(await e.target.files[0].text()); toast("Backup loaded and merged."); viewProgress(); }
    catch (err) { toast(err.message || "That file could not be read."); }
  };
  $(".rst").onclick = () => { if (confirm("Erase all progress on this device? This can't be undone.")) { S.reset(); viewProgress(); } };
}

// ---------- routing ----------
function route(hash) {
  if (hash) { location.hash = hash; return; }
  speechSynthesis?.cancel?.();
  const h = location.hash || "#/today";
  const [, page, arg] = h.split("/");
  $$(".tabbar a").forEach(a => a.setAttribute("aria-current", a.getAttribute("href") === `#/${page}` || (page === "prayer" && a.getAttribute("href") === "#/prayers") ? "page" : "false"));
  ({ today: viewToday, prayers: viewPrayers, prayer: () => viewPrayer(arg), sounds: viewSounds, review: viewReview, progress: viewProgress }[page] || viewToday)();
  window.scrollTo(0, 0);
  $("#main").focus({ preventScroll: true });
}

async function boot() {
  const [prayers, vocab, sounds] = await Promise.all(["prayers", "vocab", "sounds"].map(n => fetch(`data/${n}.json`).then(r => r.json())));
  DATA.prayers = prayers.sort((a, b) => a.order - b.order);
  DATA.vocab = Object.fromEntries(vocab.map(v => [v.lemma, v]));
  DATA.sounds = sounds;
  $("#sheet-close").onclick = () => $("#sheet").close();
  $("#sheet").addEventListener("click", e => { if (e.target.id === "sheet") $("#sheet").close(); });
  window.addEventListener("hashchange", () => route());
  route();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  navigator.storage?.persist?.();
}

boot().catch(e => { main().innerHTML = `<p class="empty">The app could not load its lessons (${esc(e.message)}). Check your connection and reload.</p>`; });
