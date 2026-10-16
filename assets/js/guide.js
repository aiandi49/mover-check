// Renders the guide from /data/gub.json using textContent only.
(function () {
  'use strict';
  const GROUPS = {
    booking: ['before booking', 'real case'],
    signed: ['after signing', 'real case'],
    day: ['moving day'],
    money: ['money back', 'real case'],
  };
  const grid = document.getElementById('topic-grid');
  const entriesEl = document.getElementById('entries');
  const countEl = document.getElementById('filter-count');

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function isUrl(v) { return /^https:\/\/[^\s]+$/.test(v); }

  function link(url, label) {
    const a = el('a', '', label || url);
    a.href = url;
    a.rel = 'noopener noreferrer';
    return a;
  }

  function groupsFor(entry) {
    return Object.keys(GROUPS).filter((g) => entry.tags.some((t) => GROUPS[g].includes(t)));
  }

  function renderEntry(e) {
    const art = el('article', 'entry');
    art.id = e.id;
    art.dataset.groups = groupsFor(e).join(' ');
    art.setAttribute('aria-labelledby', `${e.id}-title`);

    const head = el('header', 'entry-head');
    const h = el('h2', '', e.title);
    h.id = `${e.id}-title`;
    const tags = el('ul', 'tags');
    tags.setAttribute('aria-label', 'Topics');
    e.tags.slice(0, 5).forEach((t) => tags.appendChild(el('li', '', t)));
    head.append(h, el('p', 'summary', e.summary), tags);

    const body = el('div', 'entry-body');
    let list = null;
    e.body.forEach((para) => {
      if (para.startsWith('- ')) {
        if (!list) { list = el('ul'); body.appendChild(list); }
        list.appendChild(el('li', '', para.slice(2)));
      } else {
        list = null;
        body.appendChild(el('p', '', para));
      }
    });

    const side = el('aside', 'entry-side');
    side.setAttribute('aria-label', `Key facts: ${e.title}`);
    const facts = el('dl', 'facts');
    const sources = [];
    Object.entries(e.details || {}).forEach(([k, v]) => {
      if (k === 'Source') { sources.push(v); return; }
      const row = el('div');
      const dt = el('dt', '', k);
      const dd = el('dd');
      if (isUrl(v)) dd.appendChild(link(v)); else dd.textContent = v;
      row.append(dt, dd);
      facts.appendChild(row);
    });
    if (e.details && e.details.Deadline) side.appendChild(el('p', 'deadline-note', `Deadline: ${e.details.Deadline}`));
    side.appendChild(facts);

    const foot = el('footer', 'entry-foot');
    const ask = link('/', 'Ask Mover Check about this');
    ask.removeAttribute('rel');
    foot.appendChild(ask);
    sources.forEach((s) => foot.appendChild(link(s, 'Official source')));

    art.append(head, body, side, foot);
    return art;
  }

  function renderTopic(e) {
    const li = el('li');
    li.dataset.groups = groupsFor(e).join(' ');
    const a = el('a');
    a.href = `#${e.id}`;
    a.append(el('strong', '', e.title), el('span', '', e.summary));
    li.appendChild(a);
    return li;
  }

  function applyFilter(group) {
    let shown = 0;
    document.querySelectorAll('[data-filter]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.filter === group ? 'true' : 'false'));
    document.querySelectorAll('#topic-grid li, .entry').forEach((n) => {
      const match = group === 'all' || n.dataset.groups.split(' ').includes(group);
      n.hidden = !match;
      if (match && n.tagName === 'LI') shown += 1;
    });
    countEl.textContent = `Showing ${shown} topic${shown === 1 ? '' : 's'}`;
  }

  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-filter]');
    if (b) applyFilter(b.dataset.filter);
  });

  fetch('/data/gub.json', { headers: { Accept: 'application/json' } })
    .then((r) => { if (!r.ok) throw new Error('load'); return r.json(); })
    .then((data) => {
      document.getElementById('loading').remove();
      if (data.disclaimer) document.getElementById('disclaimer').textContent = data.disclaimer;
      data.entries.forEach((e) => { grid.appendChild(renderTopic(e)); entriesEl.appendChild(renderEntry(e)); });
      applyFilter('all');
      if (location.hash) {
        const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
        if (target) target.scrollIntoView();
      }
    })
    .catch(() => {
      document.getElementById('loading').textContent = 'The guide could not load. Refresh the page to try again.';
    });
})();
