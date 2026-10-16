// Mover Check — engine. Talks only to /api/chat. Renders everything with textContent.
(function () {
  'use strict';

  const SILENCE_MS = 10000; // the mic turns off after this much silence
  const STORE_KEY = 'mover-check-chat-v1';
  const PROJECT = 'Mover Check';
  const FILE_PREFIX = 'mover-check-plan';
  const BOT_NAME = 'Mover Check';
  const SLOW_NOTE_MS = 8000;
  const LATE_NOTE_MS = 30000;

  const $ = (id) => document.getElementById(id);
  const log = $('log');
  const input = $('chat-input');
  const sendBtn = $('send-btn');
  const micBtn = $('mic-btn');
  const voiceStatus = $('voice-status');
  const voiceError = $('voice-error');
  const downloadBtn = $('download-btn');
  const resetBtn = $('reset-btn');
  const fullBtn = $('full-btn');
  const chatCard = $('chat-card');
  const countChip = $('count-chip');

  let state = { messages: [], matches: [], selected: null };
  let busy = false;

  // ---------- storage ----------
  function load() {
    try {
      const raw = sessionStorage.getItem(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.messages)) state = { messages: parsed.messages, matches: parsed.matches || [], selected: parsed.selected || null };
      }
    } catch (e) { /* storage unavailable: start fresh */ }
  }
  function save() {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  // ---------- MATCH lines ----------
  function splitReply(text) {
    const visible = [];
    const matches = [];
    for (const line of String(text).split(/\r?\n/)) {
      if (/^\s*MATCH:/i.test(line)) {
        try {
          const obj = JSON.parse(line.replace(/^\s*MATCH:\s*/i, ''));
          if (obj && typeof obj.title === 'string') {
            const score = Math.max(0, Math.min(100, Math.round(Number(obj.score) || 0)));
            const details = {};
            if (obj.details && typeof obj.details === 'object') {
              for (const [k, v] of Object.entries(obj.details)) if (typeof v === 'string' || typeof v === 'number') details[String(k)] = String(v);
            }
            matches.push({ id: String(obj.id || obj.title).slice(0, 80), title: obj.title.slice(0, 140), score, why: String(obj.why || '').slice(0, 400), details });
          }
        } catch (e) { /* malformed MATCH line: dropped from view either way */ }
        continue;
      }
      visible.push(line);
    }
    matches.sort((a, b) => b.score - a.score);
    return { text: visible.join('\n').replace(/\n{3,}/g, '\n\n').trim(), matches };
  }

  // ---------- rendering ----------
  const URL_RE = /(https:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?])/g;
  function appendRich(el, text) {
    const paras = text.split(/\n{2,}/);
    paras.forEach((para) => {
      const p = document.createElement('p');
      let last = 0;
      para.replace(URL_RE, (url, _m, offset) => {
        if (offset > last) p.appendChild(document.createTextNode(para.slice(last, offset)));
        const a = document.createElement('a');
        a.href = url;
        a.textContent = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        p.appendChild(a);
        last = offset + url.length;
        return url;
      });
      if (last < para.length) p.appendChild(document.createTextNode(para.slice(last)));
      el.appendChild(p);
    });
  }

  function bubble(role, text) {
    const div = document.createElement('div');
    div.className = `msg ${role === 'user' ? 'user' : 'bot'}`;
    if (role === 'user') {
      const p = document.createElement('p');
      p.textContent = text;
      div.appendChild(p);
    } else {
      appendRich(div, text);
    }
    return div;
  }

  function renderLog() {
    log.querySelectorAll('.msg:not(.intro)').forEach((n) => n.remove());
    for (const m of state.messages) log.appendChild(bubble(m.role, m.role === 'assistant' ? splitReply(m.content).text : m.content));
    log.scrollTop = state.messages.length ? log.scrollHeight : 0;
  }

  function renderCount() {
    const n = state.messages.length;
    countChip.textContent = n === 0 ? 'No messages yet' : `${n} message${n === 1 ? '' : 's'}`;
  }

  function renderDownload() {
    downloadBtn.disabled = !state.messages.some((m) => m.role === 'assistant');
  }

  function renderMatches() {
    const list = $('short-list');
    list.textContent = '';
    const top = state.matches[0];
    $('match-kind').textContent = top ? (top.details.Type || 'Your best option') : 'Your best option';
    $('match-name').textContent = top ? top.title : 'Waiting for your first question';
    $('fit-value').textContent = top ? `${top.score}%` : '—';
    $('match-why').textContent = top ? (top.why || 'This option fits what you described best.') : 'Your strongest option will appear here once Mover Check has enough to recommend.';
    $('gauge-num').textContent = top ? String(top.score) : '—';
    $('gauge-fill').setAttribute('stroke-dasharray', `${top ? top.score : 0} 100`);
    $('gauge').setAttribute('aria-label', top ? `Top fit score: ${top.score} out of 100` : 'Top fit score: not yet scored');
    $('short-note').textContent = state.matches.length
      ? `Ranked by fit. Select an option to see its details.`
      : 'Options are ranked by how well they fit what you\u2019ve told Mover Check.';
    if (!state.matches.length) {
      const li = document.createElement('li');
      li.className = 'short-empty';
      li.textContent = 'No options yet.';
      list.appendChild(li);
    }
    if (state.matches.length && !state.matches.some((m) => m.id === state.selected)) state.selected = state.matches[0].id;
    state.matches.forEach((m) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-pressed', m.id === state.selected ? 'true' : 'false');
      const name = document.createElement('span');
      name.textContent = m.title;
      const score = document.createElement('span');
      score.className = 'score';
      score.textContent = String(m.score);
      b.append(name, score);
      b.addEventListener('click', () => { state.selected = m.id; save(); renderMatches(); });
      li.appendChild(b);
      list.appendChild(li);
    });
    renderDetails();
  }

  function renderDetails() {
    const fields = $('fields');
    const link = $('guide-link');
    const next = $('next-step');
    fields.textContent = '';
    const m = state.matches.find((x) => x.id === state.selected);
    if (!m) {
      const d = document.createElement('div');
      d.className = 'field-empty';
      d.textContent = 'Pick an option from the shortlist to see deadlines, costs and who to contact.';
      fields.appendChild(d);
      link.hidden = true;
      next.textContent = 'Your next step will appear here.';
      return;
    }
    const title = document.createElement('div');
    const tdt = document.createElement('dt'); tdt.textContent = 'Option';
    const tdd = document.createElement('dd'); tdd.textContent = m.title;
    title.append(tdt, tdd);
    fields.appendChild(title);
    for (const [k, v] of Object.entries(m.details)) {
      if (k === 'Guide' || k === 'Next step') continue;
      const row = document.createElement('div');
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      row.append(dt, dd);
      fields.appendChild(row);
    }
    const guideId = (m.details.Guide || '').replace(/[^a-z0-9-]/gi, '');
    link.hidden = !guideId;
    if (guideId) link.href = `/guide#${guideId}`;
    next.textContent = m.details['Next step'] || 'Ask Mover Check what to do first for this option.';
  }

  function renderAll() {
    renderLog();
    renderCount();
    renderDownload();
    renderMatches();
  }

  // ---------- input box ----------
  function autoGrow() {
    input.style.height = 'auto';
    const max = parseFloat(getComputedStyle(input).maxHeight) || 144;
    const needed = input.scrollHeight + 2;
    input.style.height = `${Math.min(needed, max)}px`;
    input.style.overflowY = needed > max ? 'auto' : 'hidden';
  }

  // ---------- thinking indicator ----------
  function showThinking() {
    const div = document.createElement('div');
    div.className = 'msg bot thinking';
    const dots = document.createElement('span');
    dots.className = 'dots';
    dots.setAttribute('aria-hidden', 'true');
    dots.append(document.createElement('span'), document.createElement('span'), document.createElement('span'));
    const sr = document.createElement('span');
    sr.className = 'visually-hidden';
    sr.textContent = 'Mover Check is working on your answer.';
    const note = document.createElement('p');
    note.className = 'wait-note';
    note.hidden = true;
    div.append(dots, sr, note);
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    const t1 = setTimeout(() => { note.textContent = 'Still working. Live searches can take up to a minute.'; note.hidden = false; log.scrollTop = log.scrollHeight; }, SLOW_NOTE_MS);
    const t2 = setTimeout(() => { note.textContent = 'Almost there. Checking the details of your move.'; note.hidden = false; }, LATE_NOTE_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); div.remove(); };
  }

  function setBusy(on) {
    busy = on;
    sendBtn.disabled = on;
    sendBtn.setAttribute('aria-busy', on ? 'true' : 'false');
  }

  function showError(text) {
    const div = document.createElement('div');
    div.className = 'msg error';
    div.setAttribute('role', 'alert');
    const p = document.createElement('p');
    p.textContent = text;
    div.appendChild(p);
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  // ---------- sending ----------
  function localZone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; }
  }

  async function send() {
    if (busy) return;
    stopListening(false);
    const text = input.value.trim();
    if (!text) { input.focus(); return; }
    log.querySelectorAll('.msg.error').forEach((n) => n.remove());
    state.messages.push({ role: 'user', content: text });
    save();
    input.value = '';
    autoGrow();
    log.appendChild(bubble('user', text));
    renderCount();
    setBusy(true);
    const hide = showThinking();
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: state.messages.slice(-30), timeZone: localZone() }),
      });
      let data = null;
      try { data = await res.json(); } catch (e) { data = null; }
      hide();
      if (!res.ok || !data || typeof data.reply !== 'string') {
        showError((data && typeof data.error === 'string' && data.error) || 'Mover Check could not answer right now. Please try again.');
        return;
      }
      state.messages.push({ role: 'assistant', content: data.reply });
      const parts = splitReply(data.reply);
      if (parts.matches.length) { state.matches = parts.matches; state.selected = parts.matches[0].id; }
      save();
      log.appendChild(bubble('assistant', parts.text || 'Here is what I found.'));
      log.scrollTop = log.scrollHeight;
      renderCount();
      renderDownload();
      renderMatches();
    } catch (e) {
      hide();
      showError('The connection dropped before Mover Check answered. Check your internet and press Send again.');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    stopListening(false);
    state = { messages: [], matches: [], selected: null };
    try { sessionStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
    log.querySelectorAll('.msg:not(.intro)').forEach((n) => n.remove());
    input.value = '';
    autoGrow();
    renderAll();
    input.focus();
  }

  // ---------- full page ----------
  let placeholder = null;
  function setFull(on) {
    if (on === chatCard.classList.contains('is-full')) return;
    if (on) {
      placeholder = document.createElement('div');
      placeholder.className = 'card chat-card chat-placeholder';
      placeholder.setAttribute('aria-hidden', 'true');
      placeholder.style.height = `${chatCard.offsetHeight}px`;
      chatCard.after(placeholder);
      chatCard.classList.add('is-full');
      document.body.classList.add('chat-full');
      fullBtn.setAttribute('aria-pressed', 'true');
      fullBtn.textContent = 'Exit full page';
      input.focus();
    } else {
      chatCard.classList.remove('is-full');
      document.body.classList.remove('chat-full');
      if (placeholder) { placeholder.remove(); placeholder = null; }
      fullBtn.setAttribute('aria-pressed', 'false');
      fullBtn.textContent = 'Full page';
      fullBtn.focus();
    }
    log.scrollTop = log.scrollHeight;
  }

  // ---------- download ----------
  function stamp(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function download() {
    if (downloadBtn.disabled) return;
    const now = new Date();
    const L = [];
    L.push(`${PROJECT} — plan saved ${now.toLocaleString()}`);
    L.push('');
    L.push('Prices, deadlines and facts were checked during the conversation. Confirm them with the official source before you act. This is general information, not legal advice.');
    L.push('');
    L.push('RANKED OPTIONS');
    if (!state.matches.length) L.push('No options were ranked in this conversation.');
    state.matches.forEach((m, i) => {
      L.push('');
      L.push(`${i + 1}. ${m.title} (fit ${m.score}/100)`);
      if (m.why) L.push(`   Why: ${m.why}`);
      for (const [k, v] of Object.entries(m.details)) if (k !== 'Guide') L.push(`   ${k}: ${v}`);
    });
    const lastBot = [...state.messages].reverse().find((m) => m.role === 'assistant');
    L.push('');
    L.push('LATEST PLAN');
    L.push(lastBot ? splitReply(lastBot.content).text : '');
    L.push('');
    L.push('FULL CONVERSATION');
    for (const m of state.messages) {
      L.push('');
      L.push(`${m.role === 'user' ? 'You' : BOT_NAME}:`);
      L.push(m.role === 'assistant' ? splitReply(m.content).text : m.content);
    }
    const body = '\uFEFF' + L.join('\n').replace(/\r?\n/g, '\r\n') + '\r\n';
    const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${FILE_PREFIX}-${stamp(now)}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- voice input ----------
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const isAndroid = /Android/i.test(navigator.userAgent);
  let rec = null;
  let listening = false;
  let baseText = '';
  let finalText = '';
  let lastSpeech = 0;
  let silenceTimer = null;

  function composeText(interim) {
    const spoken = `${finalText}${interim ? ` ${interim}` : ''}`.replace(/\s+/g, ' ').trim();
    const sep = baseText && spoken && !/\s$/.test(baseText) ? ' ' : '';
    input.value = `${baseText}${sep}${spoken}`;
    autoGrow();
  }

  function armSilence() {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => stopListening(false), SILENCE_MS);
  }

  function showVoiceError(text) {
    voiceError.textContent = text;
    voiceError.hidden = false;
  }

  function newSession() {
    const r = new Recognition();
    r.lang = document.documentElement.lang || 'en-US';
    r.interimResults = true;
    r.continuous = !isAndroid;
    r.maxAlternatives = 1;
    r.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const res = event.results[i];
        if (res.isFinal) finalText = `${finalText} ${res[0].transcript}`.trim();
        else interim += res[0].transcript;
      }
      lastSpeech = Date.now();
      armSilence();
      composeText(interim.trim());
    };
    r.onerror = (event) => {
      const code = event.error;
      if (code === 'no-speech' || code === 'aborted') return; // silence: the timer handles it
      const messages = {
        'not-allowed': 'The microphone is blocked. Allow microphone access for this site in your browser settings, then tap the mic again.',
        'service-not-allowed': 'The microphone is blocked. Allow microphone access for this site in your browser settings, then tap the mic again.',
        'audio-capture': 'No microphone was found. Connect one or check your device settings, then tap the mic again.',
        network: 'Voice input lost its connection. Check your internet, then tap the mic again.',
      };
      stopListening(false);
      showVoiceError(messages[code] || 'Voice input could not start. Tap the mic to try again, or type instead.');
    };
    r.onend = () => {
      if (!listening) return;
      if (Date.now() - lastSpeech < SILENCE_MS) {
        composeText('');
        try { rec = newSession(); rec.start(); } catch (e) { stopListening(false); showVoiceError('Voice input could not start. Tap the mic to try again, or type instead.'); }
      } else {
        stopListening(false);
      }
    };
    return r;
  }

  function startListening() {
    voiceError.hidden = true;
    baseText = input.value.replace(/\s+$/, input.value ? ' ' : '');
    if (baseText && !/\s$/.test(baseText)) baseText += ' ';
    finalText = '';
    lastSpeech = Date.now();
    listening = true;
    try {
      rec = newSession();
      rec.start();
    } catch (e) {
      listening = false;
      showVoiceError('Voice input could not start. Tap the mic to try again, or type instead.');
      return;
    }
    armSilence();
    micBtn.setAttribute('aria-pressed', 'true');
    micBtn.setAttribute('aria-label', 'Stop voice input');
    voiceStatus.hidden = false;
  }

  function stopListening() {
    if (!listening) return;
    listening = false;
    clearTimeout(silenceTimer);
    composeText('');
    if (rec) { try { rec.abort(); } catch (e) { /* ignore */ } rec = null; }
    micBtn.setAttribute('aria-pressed', 'false');
    micBtn.setAttribute('aria-label', 'Start voice input');
    voiceStatus.hidden = true;
  }

  if (Recognition) {
    micBtn.hidden = false;
    micBtn.addEventListener('click', () => (listening ? stopListening(false) : startListening()));
  }

  // ---------- wiring ----------
  sendBtn.addEventListener('click', send);
  input.addEventListener('input', autoGrow);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  });
  resetBtn.addEventListener('click', reset);
  downloadBtn.addEventListener('click', download);
  fullBtn.addEventListener('click', () => setFull(!chatCard.classList.contains('is-full')));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && chatCard.classList.contains('is-full')) setFull(false);
  });

  load();
  renderAll();
  autoGrow();
})();
