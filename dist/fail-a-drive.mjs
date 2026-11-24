/*! fail-a-drive v1.0.0 | MIT License */

const DEFAULTS = {
  drives: 24,         // drives in the array (6 to 48)
  rows: 6,            // strips shown per drive
  stripe: 12,         // stripe width used to place parity strips
  rebuildMs: 7000,    // time to rebuild one drive with all drives working
  spareSlower: 4,     // how much slower the "one hot spare" bar is (illustration only)
  detectMs: 2400,     // pause between a failure and the start of the rebuild
  holdMs: 4200,       // pause between "rebuild done" and the copyback
  copybackMs: 3600,   // time to copy data back to the replacement drive
  theme: 'auto',      // 'auto' | 'light' | 'dark'
  title: 'Fail a drive and see what the storage does.',
  headingLevel: 2,    // 2..6, or 0 for no heading (an aria-label is used instead)
  animate: true,      // background I/O and power-on effects (always off with reduced motion)
  strings: {},        // override any text, see STRINGS
};

const STRINGS = {
  spec: (n) => `${n} drives, distributed RAID 6`,
  legend: { data: 'data', parity: 'parity', spare: 'rebuild space', rebuilt: 'rebuilt data' },
  steps: ['Healthy', 'Drive failed', 'Rebuild', 'Drive replaced'],
  failButton: 'Fail a random drive',
  restoreButton: 'Restore from backup',
  hint: 'or click any drive',
  meterProtection: 'Protection',
  meterRebuild: 'Rebuild, all drives',
  meterGhost: 'Same rebuild, one hot spare',
  ghostNote: '(illustration)',
  protection: (left) => (left === 2 ? '2 drives can fail' : left === 1 ? '1 more drive can fail' : 'none, next failure loses data'),
  protectionLost: 'none, data lost',
  state: {
    online: 'Online',
    degraded: (d) => `Degraded \u00b7 drive ${d} failed`,
    critical: (d) => `Critical \u00b7 drive ${d} failed, no protection`,
    rebuilding: (pct) => `Rebuilding ${pct}%`,
    criticalRebuilding: (pct) => `Critical \u00b7 rebuilding ${pct}%`,
    protected: (list) => `Protected \u00b7 replace drive${list.length > 1 ? 's' : ''} ${list.join(', ')}`,
    copyback: (pct) => `Copyback ${pct}%`,
    offline: 'Offline \u00b7 data lost',
  },
  // **text** is shown in bold. Everything else is plain text.
  story: {
    idle: (n) => `One pool of ${n} drives with distributed RAID 6. Every drive holds data, parity and a small part of free rebuild space. **Fail a drive** and see why it does not become an outage.`,
    failed: (d) => `**Drive ${d} failed.** No data is lost. The pool calculates every missing block from data and parity on the other drives. Protection drops from two drives to one.`,
    rebuild: (others) => `**Rebuild.** All ${others} remaining drives read and write at the same time, into their own rebuild space. With one hot spare, that single drive would take every write, so it would take much longer. **Try to fail a second drive now.**`,
    second: (d) => `**Drive ${d} failed during the rebuild.** RAID 6 still has all the data, but there is no protection left. One more failure now means data loss. This is why a short rebuild matters.`,
    rebuilt: () => `**Rebuild done.** The pool is fully protected again, before anybody touched the hardware. The failed drive can be replaced in normal working hours.`,
    copyback: () => `**New drive in.** Data is copied back to it and the rebuild space is free again for the next failure.`,
    online: () => `**Back to normal.** Users did not notice anything. Good design turns one failed drive into a boring event, not an outage. Fail a drive again, or try two.`,
    offline: () => `**Third drive failed before the rebuild finished.** The pool is offline and the data has to come back from backup. Big outages usually look like this: not one failure, but a few small ones at the wrong time.`,
    restored: () => `**Restored from backup.** The pool is healthy again, but in real life this is hours of downtime and some lost writes. Now try to keep it online.`,
  },
};

let uid = 0;

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
function merge(base, extra) {
  const out = { ...base };
  for (const [k, v] of Object.entries(extra || {})) out[k] = isObj(v) && isObj(base[k]) ? merge(base[k], v) : v;
  return out;
}
const call = (v, ...args) => (typeof v === 'function' ? v(...args) : v);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c);
  return el;
}

/** Writes text into el; **bold** becomes <b>. Uses text nodes only. */
function rich(el, text) {
  const parts = String(text).split('**');
  el.replaceChildren(...parts.map((p, i) => (i % 2 ? h('b', null, p) : document.createTextNode(p))));
}

/** Reads options from data-* attributes (data-drives, data-rebuild-ms, data-theme, ...). */
function optionsFromData(el) {
  const out = {};
  const num = ['drives', 'rows', 'stripe', 'rebuildMs', 'spareSlower', 'detectMs', 'holdMs', 'copybackMs', 'headingLevel'];
  for (const k of num) if (el.dataset[k] != null && el.dataset[k] !== '') out[k] = Number(el.dataset[k]);
  if (el.dataset.theme) out.theme = el.dataset.theme;
  if (el.dataset.title != null) out.title = el.dataset.title;
  if (el.dataset.animate != null) out.animate = el.dataset.animate !== 'false';
  return out;
}

/**
 * Renders the drill into `target` (an element or a selector) and starts it.
 * Returns a controller: { fail(index), failRandom(), reset(), destroy(), root }.
 */
export function mount(target, options = {}) {
  const host = typeof target === 'string' ? document.querySelector(target) : target;
  if (!host) throw new Error('fail-a-drive: target element not found');
  if (host.__failADrive) host.__failADrive.destroy();

  const o = merge(DEFAULTS, { ...optionsFromData(host), ...options });
  const S = merge(STRINGS, o.strings);
  const n = clamp(Math.round(o.drives) || 24, 6, 48);
  const rows = clamp(Math.round(o.rows) || 6, 3, 12);
  const stripe = Math.max(4, Math.round(o.stripe) || 12);
  const others = n - 1;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const id = `fad-${++uid}`;

  /* ---------- Markup ---------- */
  const headingLevel = clamp(Math.round(o.headingLevel), 0, 6);
  const heading = headingLevel >= 2 && o.title ? h(`h${headingLevel}`, { class: 'fad-title', id: `${id}-title` }, o.title) : null;
  const stateText = h('span', null, call(S.state.online));
  const state = h('span', { class: 'fad-state', 'aria-hidden': 'true' },
    h('span', { class: 'fad-led' }), stateText, h('span', { class: 'fad-spec' }, `, ${call(S.spec, n)}`));

  const disks = [];
  for (let i = 0; i < n; i++) {
    const spareRow = (i * 5) % rows;
    const strips = [];
    for (let r = 0; r < rows; r++) {
      const parity = (i + 2 * r) % stripe < 2;
      strips.push(h('span', { class: `fad-blk${r === spareRow ? ' is-spare' : parity ? ' is-parity' : ''}` }));
    }
    const disk = h('span', { class: 'fad-disk', 'data-disk': i },
      h('span', { class: 'fad-leds' }, h('i', { class: 'fad-act' }), h('i', { class: 'fad-flt' })),
      h('span', { class: 'fad-strips' }, strips),
      h('span', { class: 'fad-grip' }),
      h('span', { class: 'fad-label' }, String(i)));
    disk.style.setProperty('--fad-d', String(i));
    disks.push(disk);
  }
  const bays = h('div', { class: 'fad-bays' }, disks);
  bays.style.setProperty('--fad-cols', String(n));
  bays.style.setProperty('--fad-cols-sm', String(Math.ceil(n / 2)));
  const ear = () => h('span', { class: 'fad-ear' }, h('i'), h('i'));

  const steps = S.steps.map((t, i) => h('li', { 'data-step': i }, t));
  const story = h('p', { class: 'fad-story', 'aria-live': 'polite' });
  const failBtn = h('button', { type: 'button', class: 'fad-btn' }, S.failButton);
  const restoreBtn = h('button', { type: 'button', class: 'fad-btn fad-btn-primary', hidden: true }, S.restoreButton);
  const pips = [h('i'), h('i')];
  const prot = h('span', null, call(S.protection, 2));
  const bar = h('span');
  const ghost = h('span');
  const key = (cls, t) => h('span', { class: 'fad-key' }, h('i', { class: cls }), t);

  const root = h('figure', {
    class: 'fad',
    'data-status': 'online',
    'data-theme': o.theme === 'light' || o.theme === 'dark' ? o.theme : null,
    'aria-labelledby': heading ? heading.id : null,
    'aria-label': heading ? null : (o.title || 'Drive failure drill'),
  },
  h('header', { class: 'fad-head' }, heading, state),
  h('div', { class: 'fad-chassis', 'aria-hidden': 'true' }, ear(), bays, ear()),
  h('p', { class: 'fad-legend', 'aria-hidden': 'true' },
    key('fad-k-data', S.legend.data), key('fad-k-parity', S.legend.parity),
    key('fad-k-spare', S.legend.spare), key('fad-k-rebuilt', S.legend.rebuilt)),
  h('div', { class: 'fad-panel' },
    h('ol', { class: 'fad-steps', 'aria-hidden': 'true' }, steps),
    h('div', { class: 'fad-text' }, story,
      h('div', { class: 'fad-actions' }, failBtn, restoreBtn, h('span', { class: 'fad-hint' }, S.hint))),
    h('dl', { class: 'fad-meters', 'aria-hidden': 'true' },
      h('div', { class: 'fad-meter' }, h('dt', null, S.meterProtection),
        h('dd', null, h('span', { class: 'fad-pips' }, pips), ' ', prot)),
      h('div', { class: 'fad-meter' }, h('dt', null, S.meterRebuild),
        h('dd', null, h('span', { class: 'fad-bar' }, bar))),
      h('div', { class: 'fad-meter fad-meter-ghost' }, h('dt', null, `${S.meterGhost} `, h('small', null, S.ghostNote)),
        h('dd', null, h('span', { class: 'fad-bar' }, ghost))))));

  const fallback = [...host.childNodes];
  host.replaceChildren(root);

  /* ---------- State ---------- */
  let phase = 'healthy';   // healthy | degraded | rebuild | rebuilt | copyback | offline
  let pending = [];        // failed drives whose data is not rebuilt yet
  let failed = [];         // failed drives not replaced yet
  let progress = 0, ghostP = 0, loop = 0, run = 0, alive = true;
  const timers = new Set();
  const cleanups = [];

  const sleep = (ms) => new Promise((resolve) => {
    const t = setTimeout(() => { timers.delete(t); resolve(); }, ms);
    timers.add(t);
  });
  const emit = (name, detail) => root.dispatchEvent(new CustomEvent(`faildrive:${name}`, { bubbles: true, detail }));
  const say = (text) => rich(story, text);
  const setBar = (el, k) => { el.style.transform = `scaleX(${clamp(k, 0, 1)})`; };
  const setFill = (k) => root.style.setProperty('--fad-fill', String(clamp(k, 0, 1)));
  const setState = (status, text) => {
    const changed = root.dataset.status !== status;
    root.dataset.status = status;
    stateText.textContent = text;
    if (changed) emit('status', { status, failed: failed.map((d) => Number(d.dataset.disk)) });
  };
  const setStep = (i) => steps.forEach((s, k) => {
    s.classList.toggle('is-now', k === i);
    s.classList.toggle('is-done', k < i);
  });
  const setProt = () => {
    const left = Math.max(0, 2 - pending.length);
    pips.forEach((p, i) => p.classList.toggle('is-off', i >= left));
    prot.textContent = call(S.protection, left);
    root.classList.toggle('is-critical', left === 0);
  };
  const label = (d) => d.dataset.disk;

  function fail(disk) {
    if (!alive || !disk || disk.classList.contains('is-failed') || phase === 'copyback' || phase === 'offline') return;
    disk.classList.add('is-failed');
    pending.push(disk); failed.push(disk);
    setProt();
    if (pending.length > 2) return offline();
    if (pending.length === 1) {
      // First failure, or a new one after the pool was protected again.
      if (phase === 'rebuilt') { progress = 0; ghostP = 0; setBar(bar, 0); setBar(ghost, 0); }
      phase = 'degraded';
      setState('degraded', call(S.state.degraded, label(disk)));
      setStep(1); say(call(S.story.failed, label(disk)));
      const my = ++run;
      sleep(o.detectMs).then(() => { if (my === run && phase === 'degraded') rebuild(); });
    } else {
      // Second failure: no protection left, and the rebuild has twice the work.
      setState('critical', call(S.state.critical, label(disk)));
      say(call(S.story.second, label(disk)));
      progress /= 2; ghostP /= 2; setBar(bar, progress); setBar(ghost, ghostP);
      if (phase !== 'rebuild') {
        const my = ++run;
        sleep(o.detectMs).then(() => { if (my === run && phase === 'degraded') rebuild(); });
      }
    }
  }

  function rebuild() {
    phase = 'rebuild';
    setStep(2);
    if (pending.length === 1) say(call(S.story.rebuild, others));
    root.classList.add('is-rebuilding');
    const keepFill = failed.length > pending.length;   // rebuild space already holds earlier data
    emit('rebuild', { drives: pending.map((d) => Number(d.dataset.disk)) });
    let last = performance.now();
    const tick = (now) => {
      if (!alive || phase !== 'rebuild') return;
      const dt = Math.min(now - last, 100); last = now;
      const work = o.rebuildMs * pending.length;
      progress += dt / work; ghostP += dt / (work * o.spareSlower);
      setBar(bar, progress); setBar(ghost, ghostP);
      if (!keepFill) setFill(progress);
      const pct = Math.min(100, Math.round(progress * 100));
      if (pending.length > 1) setState('critical', call(S.state.criticalRebuilding, pct));
      else setState('rebuilding', call(S.state.rebuilding, pct));
      if (progress >= 1) return rebuilt();
      loop = requestAnimationFrame(tick);
    };
    loop = requestAnimationFrame(tick);
  }

  async function rebuilt() {
    phase = 'rebuilt';
    root.classList.remove('is-rebuilding');
    pending.forEach((d) => d.classList.add('is-rebuilt'));
    pending = []; setProt(); setFill(1);
    setState('protected', call(S.state.protected, failed.map(label)));
    say(call(S.story.rebuilt));
    const my = ++run;
    await sleep(o.holdMs);
    if (my !== run || phase !== 'rebuilt') return;
    copyback();
  }

  async function copyback() {
    phase = 'copyback';
    setStep(3); say(call(S.story.copyback));
    root.classList.add('is-busy');
    failed.forEach((d) => d.classList.replace('is-failed', 'is-replaced'));
    const blocks = failed.flatMap((d) => [...d.querySelectorAll('.fad-blk')]);
    setBar(bar, 0); setBar(ghost, 0);
    const my = ++run;
    for (let i = 0; i < blocks.length; i++) {
      await sleep(Math.max(250, o.copybackMs / blocks.length));
      if (my !== run) return;
      blocks[i].classList.add('is-restored');
      const k = (i + 1) / blocks.length;
      setBar(bar, k); setFill(1 - k);
      setState('copyback', call(S.state.copyback, Math.round(k * 100)));
    }
    await sleep(500);
    if (my !== run) return;
    healthy(call(S.story.online));
  }

  function healthy(text) {
    cancelAnimationFrame(loop); run++;
    phase = 'healthy'; pending = []; failed = []; progress = 0; ghostP = 0;
    disks.forEach((d) => d.classList.remove('is-failed', 'is-rebuilt', 'is-replaced'));
    root.querySelectorAll('.fad-blk.is-restored').forEach((b) => b.classList.remove('is-restored'));
    root.classList.remove('is-rebuilding', 'is-busy', 'is-offline', 'is-critical');
    setFill(0); setBar(bar, 0); setBar(ghost, 0); setProt();
    setState('online', call(S.state.online)); setStep(0); say(text);
    failBtn.hidden = false; restoreBtn.hidden = true;
  }

  function offline() {
    cancelAnimationFrame(loop); run++;
    phase = 'offline';
    root.classList.remove('is-rebuilding');
    root.classList.add('is-offline');
    setState('offline', call(S.state.offline));
    say(call(S.story.offline));
    prot.textContent = call(S.protectionLost);
    const hadFocus = document.activeElement === failBtn;
    failBtn.hidden = true; restoreBtn.hidden = false;
    if (hadFocus) restoreBtn.focus({ preventScroll: true });
  }

  const failRandom = () => {
    const ok = disks.filter((d) => !d.classList.contains('is-failed') && !d.classList.contains('is-replaced'));
    fail(ok[Math.floor(Math.random() * ok.length)]);
  };
  const on = (el, type, fn) => { el.addEventListener(type, fn); cleanups.push(() => el.removeEventListener(type, fn)); };

  on(failBtn, 'click', failRandom);
  on(restoreBtn, 'click', () => {
    const hadFocus = document.activeElement === restoreBtn;
    healthy(call(S.story.restored));
    if (hadFocus) failBtn.focus({ preventScroll: true });
  });
  on(bays, 'click', (e) => fail(e.target.closest('.fad-disk')));
  root.classList.add('is-live');
  setProt(); setStep(0); say(call(S.story.idle, n));

  /* ---------- Optional motion: background I/O and power-on ---------- */
  if (o.animate && !reduceMotion) {
    let visible = true;
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
      io.observe(root);
      cleanups.push(() => io.disconnect());
    }
    const iv = setInterval(() => {
      if (!visible || document.hidden || phase === 'offline') return;
      for (let k = 0; k < 2; k++) {
        const d = disks[Math.floor(Math.random() * disks.length)];
        if (d.classList.contains('is-failed') || d.classList.contains('is-replaced')) continue;
        const data = [...d.querySelectorAll('.fad-blk:not(.is-parity):not(.is-spare)')];
        const b = data[Math.floor(Math.random() * data.length)];
        if (!b) continue;
        b.classList.add('is-io'); d.classList.add('is-act');
        const t = setTimeout(() => { timers.delete(t); b.classList.remove('is-io'); d.classList.remove('is-act'); }, 140);
        timers.add(t);
      }
    }, 220);
    cleanups.push(() => clearInterval(iv));

    root.querySelectorAll('.fad-strips').forEach((s) => {
      [...s.children].forEach((b, r) => b.style.setProperty('--fad-r', String(r)));
    });
    root.classList.add('is-booting');
    sleep(350).then(() => {
      if (!alive) return;
      root.classList.replace('is-booting', 'is-booted');
      sleep(600 + n * 35 + 400).then(() => root.classList.remove('is-booted'));
    });
  }

  const controller = {
    root,
    /** Fails the drive with this index (0-based). */
    fail: (i) => fail(disks[i]),
    failRandom,
    /** Back to a healthy array, as after a restore. */
    reset: () => healthy(call(S.story.idle, n)),
    /** Stops all timers and puts the original content of the host back. */
    destroy() {
      if (!alive) return;
      alive = false; run++;
      cancelAnimationFrame(loop);
      timers.forEach(clearTimeout); timers.clear();
      cleanups.forEach((fn) => fn());
      host.replaceChildren(...fallback);
      delete host.__failADrive;
    },
  };
  host.__failADrive = controller;
  return controller;
}

/** Mounts every element matching `selector` that is not mounted yet. */
export function autoInit(selector = '[data-fail-a-drive]') {
  return [...document.querySelectorAll(selector)].filter((el) => !el.__failADrive).map((el) => mount(el));
}

export const defaults = DEFAULTS;
export const strings = STRINGS;
