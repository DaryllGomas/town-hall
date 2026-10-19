// Run on an X search page (x.com/search?...&f=live) in a logged-in browser.
// Scrolls a few screens and returns the posts as JSON lines for scripts/collect.py ingest.
// Keep it gentle: a few searches a day, a few screens each, read-only.
(async (screens = 6) => {
  const seen = new Map();
  for (let i = 0; i < screens; i++) {
    for (const art of document.querySelectorAll('article')) {
      const text = art.querySelector('[data-testid="tweetText"]')?.innerText?.trim();
      const url = [...art.querySelectorAll('a[href*="/status/"]')].map((a) => a.href).find((h) => /\/status\/\d+$/.test(h));
      if (text && url && !seen.has(url)) seen.set(url, text);
    }
    window.scrollBy(0, window.innerHeight * 2);
    await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1000));
  }
  const q = new URLSearchParams(location.search).get('q');
  return [...seen].map(([url, text]) => JSON.stringify({ source: 'x', text, url, query: q })).join('\n');
})();
