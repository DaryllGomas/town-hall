// Town Hall page: renders the board from /api/board and posts voices, fixes and backing.
const $ = (s, el = document) => el.querySelector(s);
const SITE = location.origin + location.pathname;
let siteKey = '';
let widgetId = null;
let busy = false;

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
  await refresh();
  setInterval(refresh, 60000);
}

async function refresh() {
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

  const open = new Set([...document.querySelectorAll('.compose:not([hidden])')].map((f) => f.closest('.problem').id + f.className));
  const drafts = {};
  for (const f of document.querySelectorAll('.compose')) {
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
    $('.p-count', el).textContent = p.people
      ? `${fmt(p.people)} ${p.people === 1 ? 'person' : 'people'} spoke up or backed something here`
      : 'Be the first to speak up here';

    const voices = $('.voices', el);
    if (!p.voices.length) voices.append(li('empty', 'Nothing yet. What are you struggling with?'));
    for (const v of p.voices) voices.append(voiceItem(v));
    if (p.voiceCount > p.voices.length) voices.append(li('more-note', `+ ${fmt(p.voiceCount - p.voices.length)} more`));

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
  if (v.source === 'chat') meta.append(tag('From a live chat'));
  meta.append(backButton('voice', v, 'Me too'));
  el.append(meta);
  return el;
}

function ideaItem(i, p) {
  const el = document.createElement('li');
  el.className = 'idea';
  const h = document.createElement('h4');
  h.textContent = i.title;
  const body = document.createElement('p');
  body.textContent = i.body;
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.append(backButton('idea', i, 'I back this'));
  meta.append(tag(i.source === 'ai' ? 'AI draft' : i.source === 'repo' ? 'Researched fix' : 'From a person', i.source));
  const share = document.createElement('a');
  share.className = 'share';
  share.target = '_blank';
  share.rel = 'noopener';
  const who = i.n === 1 ? '1 person believes' : `${fmt(i.n)} people believe`;
  const text = `${who} this should happen on ${p.title.toLowerCase()}: "${i.title}"\n\nWhat's hurting, and what should happen. Add your voice:`;
  share.href = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(`${SITE}#${p.slug}`)}`;
  share.textContent = 'Megaphone it';
  meta.append(share);
  el.append(h, body, meta);
  return el;
}

function backButton(kind, item, label) {
  const b = document.createElement('button');
  const key = `${kind}:${item.id}`;
  const on = backed.has(key);
  b.type = 'button';
  b.className = `back${on ? ' on' : ''}`;
  b.setAttribute('aria-pressed', on);
  b.innerHTML = `<span></span><b></b>`;
  b.firstChild.textContent = on ? `${label} ✓` : label;
  b.lastChild.textContent = fmt(item.n);
  b.addEventListener('click', async () => {
    const undo = backed.has(key);
    const ok = await send('/api/back', { kind, id: item.id, undo }, b);
    if (!ok) return;
    undo ? backed.delete(key) : backed.add(key);
    saveBacked();
    item.n += undo ? -1 : 1;
    const fresh = backButton(kind, item, label);
    b.replaceWith(fresh);
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
      if (out.merged) toast('Someone already said that, so we counted you with them.');
      else if (out.pending) toast("Thanks! It'll show once it's been reviewed.");
      else toast(out.problem !== slug ? 'Posted. It fit better under another problem, so it went there.' : 'Posted. It shows within a minute.');
      setTimeout(refresh, 31000); // the board is cached for 30 seconds
    });
  }
}

// One human check per write: Turnstile tokens are single-use.
async function send(url, payload, button) {
  if (busy) return null;
  busy = true;
  if (button) button.disabled = true;
  try {
    const token = await humanCheck();
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, token }),
    });
    const out = await r.json().catch(() => ({}));
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

function humanCheck() {
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
