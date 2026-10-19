// Town Hall page: renders the board from /api/board and posts voices, fixes and backing.
const $ = (s, el = document) => el.querySelector(s);
const SITE = location.origin + location.pathname;
let siteKey = '';
let widgetId = null;
let busy = false;
const expanded = new Set(); // problems whose full voice list is open
const VOICES_SHOWN = 6;

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
}

// The board redraws every minute, but never while someone is typing or has a form open,
// so focus, caret and drafts stay put.
async function refresh(force = false) {
  const active = document.activeElement;
  const typing = active && active.closest && active.closest('#board') && /INPUT|TEXTAREA/.test(active.tagName);
  if (!force && (typing || document.querySelector('#board .compose:not([hidden])'))) return;
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

  const open = new Set([...document.querySelectorAll('#board .compose:not([hidden])')].map((f) => f.closest('.problem').id + f.className));
  const drafts = {};
  for (const f of document.querySelectorAll('#board .compose')) {
    const id = f.closest('.problem').id + f.className;
    drafts[id] = Object.fromEntries(new FormData(f));
  }

  const board = $('#board');
  board.textContent = '';
  const jump = $('#jump');
  jump.textContent = '';
  for (const p of problems) {
    const el = $('#tpl-problem').content.firstElementChild.cloneNode(true);
    el.id = p.slug;
    $('.p-title', el).textContent = p.title;
    const parts = [];
    if (p.voiceCount) parts.push(`${fmt(p.voiceCount)} ${p.voiceCount === 1 ? 'voice' : 'voices'}`);
    if (p.people) parts.push(`${fmt(p.people)} ${p.people === 1 ? 'person' : 'people'} here on the site`);
    $('.p-count', el).textContent = parts.join(' · ') || 'Be the first to speak up here';

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
    for (const i of p.ideas) ideas.append(ideaItem(i, p));

    wireForms(el, p.slug);
    for (const f of el.querySelectorAll('.compose')) {
      const id = p.slug + f.className;
      if (open.has(id)) f.hidden = false;
      for (const [k, v] of Object.entries(drafts[id] || {})) if (f.elements[k]) f.elements[k].value = v;
    }
    board.append(el);

    const a = document.createElement('a');
    a.href = `#${p.slug}`;
    a.textContent = p.title;
    jump.append(a);
  }
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
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = who[k];
      dl.append(dt, dd);
    }
    el.append(dl);
  }
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.append(backButton('idea', i, 'I back this', i.title));
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
  share.textContent = 'Megaphone it';
  // Built again at the moment of sharing, so the count matches what's on screen.
  share.addEventListener('click', () => { share.href = shareUrl(i, p); });
  meta.append(share);
  el.append(meta);
  return el;
}

function shareUrl(i, p) {
  const who = i.n === 1 ? '1 person believes' : `${fmt(i.n)} people believe`;
  const text = `${who} this should happen on ${p.title.toLowerCase()}: "${i.title}"\n\nWhat's hurting, and what should happen. Add your voice:`;
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
    toast(undo ? 'Taken back.' : kind === 'idea' ? 'Backed. Share it so more people see it.' : "Counted. You're not alone.");
  });
  return b;
}

function wireForms(el, slug) {
  for (const [btn, sel, url] of [['.add-voice', '.voice-form', '/api/voice'], ['.add-idea', '.idea-form', '/api/idea']]) {
    const form = $(sel, el);
    $(btn, el).addEventListener('click', () => {
      form.hidden = false;
      form.querySelector('textarea, input').focus();
    });
    $('.cancel', form).addEventListener('click', () => {
      form.hidden = true;
      form.reset();
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(form));
      const out = await send(url, { problem: slug, ...f }, $('button[type=submit]', form));
      if (!out) return;
      form.reset();
      form.hidden = true;
      if (out.id && out.backed !== false) {
        backed.add(`${url === '/api/voice' ? 'voice' : 'idea'}:${out.id}`); // posting counts as backing it
        saveBacked();
      }
      $(btn, el).focus();
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
