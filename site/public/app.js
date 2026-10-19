// Town Hall page: renders the board from /api/board and posts voices, fixes and backing.
const $ = (s, el = document) => el.querySelector(s);
const SITE = location.origin + location.pathname;
let siteKey = '';
let widgetId = null;
let busy = false;
const expanded = new Set(); // problems whose full voice list is open
const VOICES_SHOWN = 6;
let active = hashSlug();
const openWho = new Set(); // fixes whose "who can act" is expanded, kept across refreshes
const openConcerns = new Set(); // fixes and plans whose objection list is open, kept across refreshes
const motion = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

// The issue in the URL hash; a malformed hash just means "no choice".
function hashSlug() {
  try {
    return decodeURIComponent(location.hash.slice(1));
  } catch {
    return '';
  }
}

// How much of the top of the window the sticky header and issue row cover.
function stickyOffset() {
  return ($('.nav')?.offsetHeight || 0) + ($('.explore')?.offsetHeight || 0) + 12;
}

// One simple line icon per issue (24x24, stroked).
const ICONS = {
  'jobs-and-layoffs': 'M4 8h16v11H4zM9 8V5h6v3M4 13h16',
  'housing-affordability': 'M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6',
  'evictions': 'M3 11l9-7 9 7M5 10v10h8M16 14l5 5M21 14l-5 5',
  'health-care-costs': 'M12 20s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.5-7 10-7 10zM9 11h6M12 8v6',
  'medical-debt': 'M5 4h10l4 4v12H5zM9 12h6M12 9v6M8 18h8',
  'no-financial-cushion': 'M4 7h14a2 2 0 012 2v9H4zM4 7l10-3 2 3M16 13h2',
  'predatory-finance': 'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7zM12 8v5M12 16h.01',
  'grocery-prices': 'M3 4h3l2 11h11l2-8H7M9 20h.01M18 20h.01',
  'gas-prices': 'M5 20V5a1 1 0 011-1h7a1 1 0 011 1v15M3 20h13M14 9h2l2 2v6a1.5 1.5 0 003 0V8l-3-3M7 8h5',
  'government-fraud': 'M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18',
  'financial-literacy': 'M4 5h7a3 3 0 013 3v12a2 2 0 00-2-2H4zM20 5h-5a3 3 0 00-3 3',
  other: 'M5 12h.01M12 12h.01M19 12h.01',
};
const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;

// What this browser has backed, so buttons show the right state. The server is the real record.
const backed = loadBacked();
function loadBacked() {
  try {
    return new Set(JSON.parse(localStorage.getItem('th_backed') || '[]'));
  } catch {
    return new Set();
  }
}
function saveBacked() {
  try {
    localStorage.setItem('th_backed', JSON.stringify([...backed]));
  } catch {
    /* private mode: the buttons just won't remember */
  }
}

init();

async function init() {
  try {
    ({ turnstileSiteKey: siteKey } = await fetch('/api/config').then((r) => r.json()));
  } catch {
    /* posting will say the check is still loading */
  }
  await refresh(true);
  setInterval(refresh, 60000);
  wireFeedback();
  $('#nav-voice').addEventListener('click', (e) => {
    const box = document.querySelector('.problem:not([hidden]) .voice-form textarea');
    if (!box) return;
    e.preventDefault();
    box.scrollIntoView({ block: 'center', behavior: motion() });
    box.focus({ preventScroll: true });
  });
  window.addEventListener('hashchange', () => {
    const slug = hashSlug();
    if (document.getElementById(slug)?.classList.contains('problem')) show(slug);
  });
}

// One issue at a time, chosen by its tab (and the URL hash, so links to an issue work).
function show(slug, focusTab = false) {
  active = slug;
  for (const p of document.querySelectorAll('#board .problem')) p.hidden = p.id !== slug;
  for (const t of document.querySelectorAll('#tabs .tab')) {
    const on = t.dataset.slug === slug;
    t.setAttribute('aria-selected', on);
    t.tabIndex = on ? 0 : -1;
    if (on && focusTab) t.focus();
    // Keep the selected tab visible inside the scrolling tab row (without moving the page).
    if (on) {
      const row = t.parentElement;
      const left = t.offsetLeft - row.offsetLeft;
      if (left < row.scrollLeft || left + t.offsetWidth > row.scrollLeft + row.clientWidth) {
        row.scrollTo({ left: Math.max(0, left - 16), behavior: motion() });
      }
    }
  }
}

// The board redraws every minute, but never while someone is typing or has a form open,
// so focus, caret and drafts stay put.
async function refresh(force = false) {
  const el = document.activeElement;
  // Never redraw under someone: not while focus is anywhere in the board, typing or not.
  const typing = el && el !== document.body && el.closest && el.closest('#board');
  const drafting = [...document.querySelectorAll('#board .compose input:not(.hp), #board .compose textarea')].some((f) => f.value.trim());
  if (!force && (typing || drafting || document.querySelector('#board .idea-form:not([hidden]), #board .objection-form:not([hidden])'))) return;
  try {
    const data = await fetch('/api/board').then((r) => r.json());
    render(data);
  } catch {
    if (!$('.problem')) $('#board').innerHTML = '<p class="loading">Couldn\'t load the board. Refresh to try again.</p>';
  }
}

function render({ problems, totals }) {
  $('#s-voices').textContent = fmt(totals.voices);
  $('#s-ideas').textContent = fmt(totals.ideas);
  $('#s-backs').textContent = fmt(totals.backs);

  // Forms are told apart by problem and class, plus data-key for the many objection forms on one issue.
  const formId = (f) => f.closest('.problem').id + f.className + (f.dataset.key || '');
  const open = new Set([...document.querySelectorAll('#board .compose:not([hidden])')].map(formId));
  const drafts = {};
  for (const f of document.querySelectorAll('#board .compose')) drafts[formId(f)] = Object.fromEntries(new FormData(f));

  const board = $('#board');
  board.textContent = '';
  const tabs = $('#tabs');
  tabs.textContent = '';
  if (!problems.some((p) => p.slug === active)) active = problems[0]?.slug || '';
  for (const p of problems) {
    const el = $('#tpl-problem').content.firstElementChild.cloneNode(true);
    el.id = p.slug;
    $('.p-title', el).textContent = p.title;
    const parts = [];
    if (p.voiceCount) parts.push(`${fmt(p.voiceCount)} ${p.voiceCount === 1 ? 'voice' : 'voices'}`);
    if (p.people) parts.push(`${fmt(p.people)} ${p.people === 1 ? 'person' : 'people'} here on the site`);
    $('.p-count', el).textContent = parts.join(' · ') || 'Be the first to speak up here';

    // Top layer: what the issue is, and the plan for leaders and systems.
    if (p.issue) $('.p-issue', el).textContent = p.issue;
    else $('.p-issue-card', el).remove();
    const plan = p.plan || {};
    if (plan.goal || (plan.steps || []).length) {
      $('.plan-goal', el).textContent = plan.goal || '';
      const ol = $('.plan-steps', el);
      for (const st of plan.steps || []) {
        const item = document.createElement('li');
        if (st.who) {
          const who = document.createElement('b');
          who.textContent = st.who;
          item.append(who, ' ');
        }
        item.append(st.text);
        if (st.evidence) {
          const a = document.createElement('a');
          a.href = st.evidence;
          a.target = '_blank';
          a.rel = 'noopener';
          a.className = 'evidence';
          a.textContent = 'Evidence';
          a.setAttribute('aria-label', `Evidence for: ${st.who || 'this step'}`);
          item.append(' ', a);
        }
        ol.append(item);
      }
      $('.plan-note', el).textContent = plan.note || '';
      const target = `plan:${p.slug}`;
      const ask = askButton('Disagree with this plan? Say why', `Disagree with the plan for: ${p.title}`);
      const parts = objectionParts(target, 'plan', ask, p.planObjections, p.planObjectionCount);
      $('.p-plan', el).append(ask, parts.form, ...parts.concerns);
    } else {
      $('.p-plan', el).remove();
    }

    const voices = $('.voices', el);
    if (!p.voices.length) voices.append(li('empty', 'Nothing yet. What are you struggling with?'));
    const showAll = expanded.has(p.slug);
    p.voices.forEach((v, i) => {
      const item = voiceItem(v);
      if (i >= VOICES_SHOWN && !showAll) item.hidden = true;
      voices.append(item);
    });
    const hiddenCount = p.voices.length - VOICES_SHOWN;
    if (hiddenCount > 0) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'more-voices';
      more.setAttribute('aria-expanded', showAll);
      more.textContent = showAll ? 'Show fewer' : `Show ${fmt(hiddenCount)} more`;
      more.addEventListener('click', () => {
        const now = !expanded.has(p.slug);
        now ? expanded.add(p.slug) : expanded.delete(p.slug);
        voices.querySelectorAll('.voice').forEach((v, i) => { if (i >= VOICES_SHOWN) v.hidden = !now; });
        more.setAttribute('aria-expanded', now);
        more.textContent = now ? 'Show fewer' : `Show ${fmt(hiddenCount)} more`;
      });
      voices.after(more);
    }
    if (p.voiceCount > p.voices.length) voices.append(li('more-note', `+ ${fmt(p.voiceCount - p.voices.length)} more in the full record`));

    const ideas = $('.ideas', el);
    if (!p.ideas.length) ideas.append(li('empty', 'No fixes yet. What should happen?'));
    p.ideas.forEach((i, n) => {
      const item = ideaItem(i, p);
      if (n === 0 && i.n > 0) item.classList.add('top'); // the most-backed fix gets the light
      ideas.append(item);
    });

    wireForms(el, p.slug);
    for (const f of el.querySelectorAll('.compose')) {
      const id = p.slug + f.className + (f.dataset.key || '');
      if (open.has(id)) f.hidden = false;
      for (const [k, v] of Object.entries(drafts[id] || {})) if (f.elements[k]) f.elements[k].value = v;
    }
    el.setAttribute('aria-labelledby', `tab-${p.slug}`);
    board.append(el);

    const t = document.createElement('button');
    t.type = 'button';
    t.className = 'tab';
    t.id = `tab-${p.slug}`;
    t.dataset.slug = p.slug;
    t.setAttribute('role', 'tab');
    t.setAttribute('aria-controls', p.slug);
    t.innerHTML = svg(ICONS[p.slug] || ICONS.other) + '<span class="t"></span><span class="n"></span>';
    $('.t', t).textContent = p.title;
    $('.n', t).textContent = `${fmt(p.voiceCount)} ${p.voiceCount === 1 ? 'voice' : 'voices'}`;
    t.addEventListener('click', () => {
      show(p.slug);
      history.replaceState(null, '', `#${p.slug}`);
      const top = $('#board').getBoundingClientRect().top + window.scrollY - stickyOffset();
      if (window.scrollY > top) window.scrollTo({ top, behavior: motion() });
    });
    // Arrow keys move between tabs (the standard tab pattern).
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const all = [...tabs.children];
      const next = all[(all.indexOf(t) + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length];
      show(next.dataset.slug, true);
      history.replaceState(null, '', `#${next.dataset.slug}`);
    });
    tabs.append(t);
  }
  show(active);
}

function voiceItem(v) {
  const el = document.createElement('li');
  el.className = 'voice';
  const q = document.createElement('q');
  q.textContent = v.text;
  el.append(q);
  const meta = document.createElement('div');
  meta.className = 'meta';
  const from = { chat: 'From a live chat', post: 'From a public post', x: 'From X', bluesky: 'From Bluesky', reddit: 'From Reddit' }[v.source];
  if (from) meta.append(tag(from));
  meta.append(backButton('voice', v, 'Me too', v.text));
  el.append(meta);
  return el;
}

function ideaItem(i, p) {
  const el = document.createElement('li');
  el.className = `idea ${i.source}`;
  const kicker = document.createElement('p');
  kicker.className = 'kicker';
  const d = i.detail || {};
  kicker.textContent = i.source === 'ai' ? 'AI draft' : i.source === 'repo'
    ? `Researched fix · ${d.type === 'idea' ? 'New idea' : 'Works today'}` : 'From a person';
  const h = document.createElement('h4');
  h.textContent = i.title;
  const body = document.createElement('p');
  body.className = 'idea-body';
  body.textContent = i.body;
  el.append(kicker, h, body);

  // Researched fixes say exactly who can act.
  const who = d.who || {};
  if (who.government || who.means || who.you) {
    const dl = document.createElement('dl');
    dl.className = 'who';
    for (const [k, label] of [['government', 'Government'], ['means', 'People and companies with means'], ['you', 'You, this week']]) {
      if (!who[k]) continue;
      const pair = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = who[k];
      pair.append(dt, dd);
      dl.append(pair);
    }
    el.append(dl);
    // Long "who can act" text shows its first lines; the rest is one tap away.
    const more = document.createElement('button');
    const wasOpen = openWho.has(i.id);
    if (wasOpen) dl.classList.add('open');
    more.type = 'button';
    more.className = 'who-toggle';
    more.textContent = wasOpen ? 'Show less' : 'Read all of who can act';
    more.setAttribute('aria-expanded', wasOpen);
    more.setAttribute('aria-label', `Who can act on: ${i.title}`);
    more.addEventListener('click', () => {
      const open = dl.classList.toggle('open');
      open ? openWho.add(i.id) : openWho.delete(i.id);
      more.setAttribute('aria-expanded', open);
      more.textContent = open ? 'Show less' : 'Read all of who can act';
    });
    el.append(more);
  }
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.append(backButton('idea', i, 'I back this', i.title));
  const ask = askButton('Why not?', `Why not: ${i.title}`);
  meta.append(ask);
  if (d.url) {
    const a = document.createElement('a');
    a.className = 'research';
    a.href = d.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = d.sources ? `Read the research (${d.sources} sources)` : 'Read the research';
    meta.append(a);
  }
  const share = document.createElement('a');
  share.className = 'share';
  share.target = '_blank';
  share.rel = 'noopener';
  share.href = shareUrl(i, p);
  share.setAttribute('aria-label', `Share on X: ${i.title}`);
  share.innerHTML = svg('M3 11v2a1 1 0 001 1h2l5 4V6L6 10H4a1 1 0 00-1 1zM15 9a4 4 0 010 6M18 6a8 8 0 010 12') + 'Megaphone it';
  // Built again at the moment of sharing, so the count matches what's on screen.
  share.addEventListener('click', () => { share.href = shareUrl(i, p); });
  meta.append(share);
  el.append(meta);
  const parts = objectionParts(`idea:${i.id}`, 'fix', ask, i.objections, i.objectionCount);
  el.append(parts.form, ...parts.concerns);
  return el;
}

// The small text button that opens an objection form.
function askButton(text, label) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'why-not';
  b.textContent = text;
  b.setAttribute('aria-label', label);
  return b;
}

// "Why not?" for a fix or a plan: the form the ask button opens, and the list of concerns already raised
// (a toggle plus the list). `what` is 'fix' or 'plan'.
function objectionParts(target, what, ask, list = [], count = 0) {
  const form = document.createElement('form');
  form.className = 'compose objection-form';
  form.dataset.key = target;
  form.hidden = true;
  form.innerHTML = `<label><span></span><textarea name="text" rows="3" minlength="15" maxlength="600" required></textarea></label>
    <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
    <div class="row"><button class="btn accent small" type="submit">Post</button><button class="btn ghost small cancel" type="button">Cancel</button></div>`;
  $('span', form).textContent = `What's wrong with this ${what}, or what would make it better?`;
  ask.addEventListener('click', () => {
    form.hidden = false;
    $('textarea', form).focus();
  });
  $('.cancel', form).addEventListener('click', () => {
    form.hidden = true;
    form.reset();
    ask.focus();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const out = await send('/api/objection', { target, ...Object.fromEntries(new FormData(form)) }, $('button[type=submit]', form));
    if (!out) return;
    form.reset();
    form.hidden = true;
    if (out.id && out.backed !== false) {
      backed.add(`objection:${out.id}`); // posting counts as agreeing with it
      saveBacked();
    }
    ask.focus();
    if (out.merged) toast('Someone raised that already, so we counted you with them.');
    else if (out.pending) toast("Thanks! It'll show once it's been reviewed.");
    else toast('Posted. It shows within a minute.');
    setTimeout(() => refresh(true), 31000); // the board is cached for 30 seconds
  });

  const concerns = [];
  if (count > 0) {
    const wasOpen = openConcerns.has(target);
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'why-not concern-toggle';
    toggle.textContent = `${fmt(count)} ${count === 1 ? 'concern' : 'concerns'}`;
    toggle.setAttribute('aria-expanded', wasOpen);
    const ul = document.createElement('ul');
    ul.className = 'concerns';
    ul.hidden = !wasOpen;
    for (const o of list) {
      const item = document.createElement('li');
      const q = document.createElement('p');
      q.textContent = o.text;
      item.append(q, backButton('objection', o, 'Agree', o.text));
      ul.append(item);
    }
    if (count > list.length) ul.append(li('more-note', `+ ${fmt(count - list.length)} more in the full record`));
    toggle.addEventListener('click', () => {
      const now = ul.hidden;
      ul.hidden = !now;
      now ? openConcerns.add(target) : openConcerns.delete(target);
      toggle.setAttribute('aria-expanded', now);
    });
    concerns.push(toggle, ul);
  }
  return { form, concerns };
}

function shareUrl(i, p) {
  const lead = i.n === 0 ? 'A fix worth backing' : i.n === 1 ? '1 person believes this should happen' : `${fmt(i.n)} people believe this should happen`;
  const text = `${lead} on ${p.title.toLowerCase()}: "${i.title}"\n\nReal people, real solutions. Add your voice:`;
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(`${SITE}#${p.slug}`)}`;
}

function backButton(kind, item, label, about) {
  const b = document.createElement('button');
  const key = `${kind}:${item.id}`;
  const on = backed.has(key);
  b.type = 'button';
  b.className = `back${on ? ' on' : ''}`;
  b.setAttribute('aria-pressed', on);
  b.setAttribute('aria-label', `${label}, ${fmt(item.n)} so far: ${String(about || '').slice(0, 80)}`);
  b.innerHTML = `<span></span><b></b>`;
  b.firstChild.textContent = on ? `${label} ✓` : label;
  b.lastChild.textContent = fmt(item.n);
  b.addEventListener('click', async () => {
    const undo = backed.has(key);
    const out = await send('/api/back', { kind, id: item.id, undo }, b);
    if (!out) return;
    out.backed ? backed.add(key) : backed.delete(key);
    saveBacked();
    if (typeof out.n === 'number') item.n = out.n; // the server's count, not a guess
    const fresh = backButton(kind, item, label, about);
    b.replaceWith(fresh);
    fresh.focus();
    toast(undo ? 'Taken back.' : kind === 'idea' ? 'Backed. Share it so more people see it.' : kind === 'objection' ? 'Counted. Thanks for weighing in.' : "Counted. You're not alone.");
  });
  return b;
}

function wireForms(el, slug) {
  for (const [btn, sel, url] of [['.add-voice', '.voice-form', '/api/voice'], ['.add-idea', '.idea-form', '/api/idea']]) {
    const form = $(sel, el);
    const opener = $(btn, el); // the voice bar is always open; the fix form opens from "Suggest a fix"
    opener?.addEventListener('click', () => {
      form.hidden = false;
      form.querySelector('textarea, input').focus();
    });
    $('.cancel', form)?.addEventListener('click', () => {
      form.hidden = true;
      form.reset();
      opener?.focus();
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(form));
      const out = await send(url, { problem: slug, ...f }, $('button[type=submit]', form));
      if (!out) return;
      form.reset();
      if (opener) form.hidden = true;
      if (out.id && out.backed !== false) {
        backed.add(`${url === '/api/voice' ? 'voice' : 'idea'}:${out.id}`); // posting counts as backing it
        saveBacked();
      }
      (opener || $('textarea', form)).focus();
      if (out.merged) toast('Someone already said that, so we counted you with them.');
      else if (out.pending) toast("Thanks! It'll show once it's been reviewed.");
      else toast(out.problem !== slug ? 'Posted. It fit better under another problem, so it went there.' : 'Posted. It shows within a minute.');
      setTimeout(() => refresh(true), 31000); // the board is cached for 30 seconds
    });
  }
}

// Writes go out without a check first. A passed check earns a 30-minute pass (a cookie), so the
// server only asks for a new one (needCheck) when the pass is missing or has run out.
async function send(url, payload, button) {
  if (busy) return null;
  busy = true;
  if (button) button.disabled = true;
  try {
    const go = (token) => fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(token ? { ...payload, token } : payload),
    });
    let r = await go();
    let out = await r.json().catch(() => ({}));
    if (r.status === 403 && out.needCheck) {
      r = await go(await humanCheck());
      out = await r.json().catch(() => ({}));
    }
    if (!r.ok) throw new Error(out.error || 'Something went wrong. Try again.');
    return out;
  } catch (err) {
    toast(err.message);
    return null;
  } finally {
    busy = false;
    if (button) button.disabled = false;
  }
}

// One check at a time: starting a new Turnstile run would cancel one in progress.
let checking = Promise.resolve();
function humanCheck() {
  const run = checking.then(runCheck);
  checking = run.catch(() => {});
  return run;
}

function runCheck() {
  return new Promise((resolve, reject) => {
    if (!window.turnstile || !siteKey) return reject(new Error('The human check is still loading. Try again in a second.'));
    let settled = false;
    const done = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      $('#check').hidden = true;
      fn(arg);
    };
    const fail = (msg) => done(reject, new Error(msg));
    const timer = setTimeout(() => fail('The human check timed out. Try again.'), 120000);
    if (widgetId !== null) window.turnstile.remove(widgetId);
    widgetId = window.turnstile.render('#turnstile', {
      sitekey: siteKey,
      action: 'townhall',
      appearance: 'interaction-only',
      execution: 'execute',
      callback: (t) => done(resolve, t),
      'error-callback': () => fail('Human check failed. Refresh and try again.'),
      'expired-callback': () => fail('The human check expired. Try again.'),
      'timeout-callback': () => fail('The human check timed out. Try again.'),
      'unsupported-callback': () => fail("This browser can't run the human check. Try another browser."),
      // Most people pass invisibly. When Cloudflare does need a click, show it front and center.
      'before-interactive-callback': () => { $('#check').hidden = false; },
    });
    window.turnstile.execute(widgetId);
  });
}

function wireFeedback() {
  const form = $('#feedback-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const out = await send('/api/feedback', Object.fromEntries(new FormData(form)), $('button[type=submit]', form));
    if (!out) return;
    form.reset();
    toast('Thank you. Every note gets read.');
  });
}

function li(cls, text) {
  const el = document.createElement('li');
  el.className = cls;
  el.textContent = text;
  return el;
}

function tag(text, kind = '') {
  const s = document.createElement('span');
  s.className = `tag ${kind}`;
  s.textContent = text;
  return s;
}

function fmt(n) {
  return Number(n || 0).toLocaleString('en-US');
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 4200);
}
