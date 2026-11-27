/*! fail-a-drive v1.1.0 | MIT License */
(function () {
  'use strict';

const DEFAULTS = {
  drives: 24,         // drives in the array (6 to 48)
  rows: 6,            // strips shown per drive
  stripe: 12,         // stripe width used to place parity strips
  rebuildMs: 7000,    // time to rebuild one drive with all drives working
  spareSlower: 4,     // how much slower the "one hot spare" bar is (illustration only)
  rebuildAreas: 1,    // distributed spare capacity: spare space for the data of this many failed drives (1 to 4)
  detectMs: 2400,     // pause between a failure and the start of the rebuild
  autoReplace: false, // replace failed drives on their own once nothing more can rebuild (otherwise the visitor does it)
  holdMs: 4200,       // with autoReplace: pause before the failed drives are replaced
  copybackMs: 3600,   // time to copy data back to the replacement drive
  theme: 'auto',      // 'auto' | 'light' | 'dark'
  title: 'Fail a drive and see what the storage does.',
  headingLevel: 2,    // 2..6, or 0 for no heading (an aria-label is used instead)
  animate: true,      // background I/O and power-on effects (always off with reduced motion)
  strings: {},        // override any text, see STRINGS
};

const STRINGS = {
  spec: (n, areas) => `${n} drives, distributed RAID 6, ${areas} rebuild area${areas > 1 ? 's' : ''}`,
  legend: { data: 'data', parity: 'parity', spare: 'rebuild area', rebuilt: 'rebuilt data' },
  steps: ['Healthy', 'Drive failed', 'Rebuild', 'Replace drive'],
  failButton: 'Fail a random drive',
  replaceButton: (count) => `Replace failed drive${count > 1 ? 's' : ''}`,
  restoreButton: 'Restore from backup',
  hint: 'or click any drive',
  meterProtection: 'Protection',
  meterAreas: (areas) => (areas > 1 ? 'Rebuild areas' : 'Rebuild area'),
  meterRebuild: 'Rebuild, all drives',
  meterGhost: 'Same rebuild, one hot spare',
  ghostNote: '(illustration)',
  protection: (left) => (left === 2 ? '2 drives can fail' : left === 1 ? '1 more drive can fail' : 'none, next failure loses data'),
  protectionLost: 'none, data lost',
  // free: free areas, total: all areas, rebuilding: drive being rebuilt or null, used: drives whose data sits in an area
  areas: (free, total, rebuilding, used) => (rebuilding && free === 0 ? `rebuilding drive ${rebuilding}`
    : free === total ? (total === 1 ? 'free' : `${total} of ${total} free`)
    : free === 0 ? `used by drive${used.length > 1 ? 's' : ''} ${used.join(', ')}, none free` : `${free} of ${total} free`),
  areasCopyback: 'copyback',
  state: {
    online: 'Online',
    degraded: (d) => `Degraded \u00b7 drive ${d} failed`,
    critical: () => 'Critical \u00b7 no protection left',
    noArea: () => 'Degraded \u00b7 no rebuild area left',
    rebuilding: (pct) => `Rebuilding ${pct}%`,
    criticalRebuilding: (pct) => `Critical \u00b7 rebuilding ${pct}%`,
    protected: (list) => `Protected \u00b7 replace drive${list.length > 1 ? 's' : ''} ${list.join(', ')}`,
    copyback: (pct, direct) => `${direct ? 'Rebuild + copyback' : 'Copyback'} ${pct}%`,
    offline: 'Offline \u00b7 data lost',
  },
  // **text** is shown in bold. Everything else is plain text.
  story: {
    idle: (n, areas) => `One pool of ${n} drives with distributed RAID 6 and ${areas === 1 ? 'one rebuild area' : `${areas} rebuild areas`}: spare space for the data of ${areas === 1 ? 'one drive' : `${areas} drives`}, spread in small parts over all drives. **Fail a drive** and see why it does not become an outage.`,
    failed: (d) => `**Drive ${d} failed.** No data is lost. The pool calculates every missing block from data and parity on the other drives. Protection drops from two drives to one.`,
    rebuild: (others, d) => `**Rebuild of drive ${d}.** All ${others} remaining drives read and write at the same time, into the rebuild area spread over them. With one hot spare, that single drive would take every write, so it would take much longer. **Try to fail a second drive now.**`,
    second: (d, m, areas) => `**Drive ${d} failed during the rebuild.** RAID 6 still has all the data, but there is no protection left. ${areas === 1 ? `The only rebuild area is taken by drive ${m}, so drive ${d} will not be rebuilt until a drive is replaced.` : `Drive ${d} waits for a free rebuild area.`} One more failure now means data loss.`,
    noArea: (d, used) => `**Drive ${d} failed, and there is no rebuild area left.** The spare space still holds the data of drive ${used.join(', ')}, so drive ${d} cannot be rebuilt. The array stays degraded: one more failure is covered, a second one is not. Only a replaced drive brings protection back.`,
    noAreaCritical: (d) => `**Drive ${d} failed, and there is no rebuild area left.** Two failed drives without rebuilt data: there is no protection left. One more failure now means data loss. Replace the failed drives now.`,
    rebuilt: (used) => `**Rebuild done.** The pool is fully protected again, before anybody touched the hardware. But the rebuild area now holds the data of drive ${used.join(', ')}, so the next failure has nowhere to rebuild. Replace the drive soon, in normal working hours.`,
    waiting: (used, waiting) => `**Drive ${used.join(', ')} is rebuilt, but drive ${waiting.join(', ')} has no rebuild area.** The array stays degraded: one more failure is covered, a second one is not. Waiting does not help here. Only replacing the failed drives brings full protection back.`,
    critical: (waiting) => `**Drives ${waiting.join(', ')} have no rebuilt data** and there is no rebuild area left. No protection: one more failure now means data loss. Replace the failed drives now.`,
    copyback: (count, fromArea, direct) => `**New drive${count > 1 ? 's' : ''} in.** ${fromArea ? 'Data from the rebuild area is copied back, and the rebuild area is free again for the next failure.' : ''}${direct.length ? ` Drive${direct.length > 1 ? 's' : ''} ${direct.join(', ')} had no rebuild area, so ${direct.length > 1 ? 'their' : 'its'} data is rebuilt straight onto the new drive${direct.length > 1 ? 's' : ''}.` : ''}`,
    online: () => `**Back to normal.** Users did not notice anything. Good design turns one failed drive into a boring event, not an outage. Fail a drive again, or try two.`,
    offline: (d) => `**Drive ${d} failed with two failed drives not rebuilt yet.** Some stripes now miss three strips, one more than RAID 6 can recover. The pool is offline and the data has to come back from backup. Big outages usually look like this: not one failure, but a few small ones at the wrong time, with no time or spare space left to fix them.`,
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
  const num = ['drives', 'rows', 'stripe', 'rebuildMs', 'spareSlower', 'rebuildAreas', 'detectMs', 'holdMs', 'copybackMs', 'headingLevel'];
  for (const k of num) if (el.dataset[k] != null && el.dataset[k] !== '') out[k] = Number(el.dataset[k]);
  if (el.dataset.theme) out.theme = el.dataset.theme;
  if (el.dataset.title != null) out.title = el.dataset.title;
  if (el.dataset.animate != null) out.animate = el.dataset.animate !== 'false';
  if (el.dataset.autoReplace != null) out.autoReplace = el.dataset.autoReplace !== 'false';
  return out;
}

/**
 * Renders the drill into `target` (an element or a selector) and starts it.
 * Returns a controller: { fail(index), failRandom(), reset(), destroy(), root }.
 */
function mount(target, options = {}) {
  const host = typeof target === 'string' ? document.querySelector(target) : target;
  if (!host) throw new Error('fail-a-drive: target element not found');
  if (host.__failADrive) host.__failADrive.destroy();

  const o = merge(DEFAULTS, { ...optionsFromData(host), ...options });
  const S = merge(STRINGS, o.strings);
  const n = clamp(Math.round(o.drives) || 24, 6, 48);
  const rows = clamp(Math.round(o.rows) || 6, 3, 12);
  const stripe = Math.max(4, Math.round(o.stripe) || 12);
  const areas = clamp(Math.round(o.rebuildAreas) || 1, 1, 4);
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const id = `fad-${++uid}`;

  /* ---------- Markup ---------- */
  const headingLevel = clamp(Math.round(o.headingLevel), 0, 6);
  const heading = headingLevel >= 2 && o.title ? h(`h${headingLevel}`, { class: 'fad-title', id: `${id}-title` }, o.title) : null;
  const stateText = h('span', null, call(S.state.online));
  const state = h('span', { class: 'fad-state', 'aria-hidden': 'true' },
    h('span', { class: 'fad-led' }), stateText, h('span', { class: 'fad-spec' }, `, ${call(S.spec, n, areas)}`));

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
  const replaceBtn = h('button', { type: 'button', class: 'fad-btn fad-btn-primary fad-btn-replace', hidden: true }, call(S.replaceButton, 1));
  const restoreBtn = h('button', { type: 'button', class: 'fad-btn fad-btn-primary', hidden: true }, S.restoreButton);
  const pips = [h('i'), h('i')];
  const areaPips = Array.from({ length: areas }, () => h('i'));
  const areaText = h('span', null, call(S.areas, areas, areas, null, []));
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
      h('div', { class: 'fad-actions' }, failBtn, replaceBtn, restoreBtn, h('span', { class: 'fad-hint' }, S.hint))),
    h('dl', { class: 'fad-meters', 'aria-hidden': 'true' },
      h('div', { class: 'fad-meter' }, h('dt', null, S.meterProtection),
        h('dd', null, h('span', { class: 'fad-pips' }, pips), ' ', prot)),
      h('div', { class: 'fad-meter fad-meter-areas' }, h('dt', null, call(S.meterAreas, areas)),
        h('dd', null, h('span', { class: 'fad-pips fad-areas' }, areaPips), ' ', areaText)),
      h('div', { class: 'fad-meter' }, h('dt', null, S.meterRebuild),
        h('dd', null, h('span', { class: 'fad-bar' }, bar))),
      h('div', { class: 'fad-meter fad-meter-ghost' }, h('dt', null, `${S.meterGhost} `, h('small', null, S.ghostNote)),
        h('dd', null, h('span', { class: 'fad-bar' }, ghost))))));

  const fallback = [...host.childNodes];
  host.replaceChildren(root);

  /* ---------- State ---------- */
  // Each rebuild area holds the data of one failed drive until that drive is replaced and the data is copied back.
  // With no free area, the next failure is not rebuilt and the array stays degraded.
  let phase = 'healthy';   // healthy | failed | rebuild | settled | copyback | offline
  let failed = [];         // failed drives not replaced yet
  let rebuilt = [];        // failed drives whose data sits in a rebuild area
  let rebuilding = null;   // the drive being rebuilt now
  let queued = null;       // failed drive whose rebuild starts after detectMs
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
  const label = (d) => d.dataset.disk;
  const exposed = () => failed.length - rebuilt.length;   // failed drives without rebuilt data
  const freeAreas = () => areas - rebuilt.length - (rebuilding ? 1 : 0);
  const waiting = () => failed.filter((d) => !rebuilt.includes(d) && d !== rebuilding);

  // Protection, rebuild areas, rebuild space fill, status and the replace button, all from the state above.
  function update() {
    if (phase === 'offline') return;
    const exp = exposed();
    const left = Math.max(0, 2 - exp);
    pips.forEach((p, i) => p.classList.toggle('is-off', i >= left));
    prot.textContent = call(S.protection, left);
    root.classList.toggle('is-critical', left === 0);
    if (phase === 'copyback') return;

    const free = freeAreas();
    areaPips.forEach((p, i) => {
      p.classList.toggle('is-used', i < rebuilt.length);
      p.classList.toggle('is-busy', !!rebuilding && i === rebuilt.length);
    });
    areaText.textContent = call(S.areas, free, areas, rebuilding && label(rebuilding), rebuilt.map(label));
    root.classList.toggle('is-no-area', free === 0 && !rebuilding);
    setFill((rebuilt.length + (rebuilding ? progress : 0)) / areas);

    if (rebuilding) {
      const pct = Math.min(100, Math.round(progress * 100));
      if (exp > 1) setState('critical', call(S.state.criticalRebuilding, pct));
      else setState('rebuilding', call(S.state.rebuilding, pct));
    } else if (exp > 1) setState('critical', call(S.state.critical));
    else if (exp === 1) setState('degraded', queued ? call(S.state.degraded, label(queued)) : call(S.state.noArea));
    else if (failed.length) setState('protected', call(S.state.protected, failed.map(label)));
    else setState('online', call(S.state.online));

    replaceBtn.hidden = !(phase === 'settled' && failed.length) || o.autoReplace;
    replaceBtn.textContent = call(S.replaceButton, failed.length);
  }

  function fail(disk) {
    if (!alive || !disk || disk.classList.contains('is-failed') || disk.classList.contains('is-replaced') || phase === 'copyback' || phase === 'offline') return;
    disk.classList.add('is-failed');
    failed.push(disk);
    if (exposed() > 2) return offline(disk);
    const holder = rebuilding || queued;
    if (holder) {
      // Another failure while a rebuild runs or is about to start.
      say(call(S.story.second, label(disk), label(holder), areas));
    } else if (freeAreas() > 0) {
      // Spare space is free: the rebuild starts after a short pause.
      phase = 'failed'; queued = disk; run++;
      progress = 0; ghostP = 0; setBar(bar, 0); setBar(ghost, 0);
      setStep(1); say(call(S.story.failed, label(disk)));
      const my = run;
      sleep(o.detectMs).then(() => { if (my === run && queued === disk) { queued = null; rebuild(); } });
    } else {
      // Every rebuild area holds data of a drive nobody replaced: nothing to rebuild into.
      say(exposed() > 1 ? call(S.story.noAreaCritical, label(disk)) : call(S.story.noArea, label(disk), rebuilt.map(label)));
      settle(false);
      return;
    }
    update();
  }

  function rebuild() {
    const next = waiting()[0];
    if (!next || freeAreas() <= 0) return settle(true);
    rebuilding = next; phase = 'rebuild';
    progress = 0; ghostP = 0;
    setStep(2);
    if (exposed() < 2) say(call(S.story.rebuild, n - failed.length, label(next)));
    root.classList.add('is-rebuilding');
    emit('rebuild', { drives: [Number(next.dataset.disk)] });
    let last = performance.now();
    const my = run;
    const tick = (now) => {
      if (!alive || my !== run || rebuilding !== next) return;
      const dt = Math.min(now - last, 100); last = now;
      progress += dt / o.rebuildMs; ghostP += dt / (o.rebuildMs * o.spareSlower);
      setBar(bar, progress); setBar(ghost, ghostP);
      update();
      if (progress >= 1) {
        rebuilt.push(next); next.classList.add('is-rebuilt');
        rebuilding = null; progress = 0;
        root.classList.remove('is-rebuilding');
        return waiting().length && freeAreas() > 0 ? rebuild() : settle(true);
      }
      loop = requestAnimationFrame(tick);
    };
    loop = requestAnimationFrame(tick);
  }

  // Nothing more can rebuild on its own: protected with the rebuild area used, or degraded without spare space.
  async function settle(tell) {
    phase = 'settled';
    setStep(3);
    if (tell) {
      const w = waiting().map(label);
      if (!w.length) say(call(S.story.rebuilt, rebuilt.map(label)));
      else if (w.length === 1) say(call(S.story.waiting, rebuilt.map(label), w));
      else say(call(S.story.critical, w));
    }
    update();
    if (!o.autoReplace) return;
    const my = ++run;
    await sleep(o.holdMs);
    if (my === run && phase === 'settled') copyback();
  }

  async function copyback() {
    if (phase !== 'settled' || !failed.length) return;
    phase = 'copyback'; run++;
    replaceBtn.hidden = true;
    const direct = waiting().map(label);
    setStep(3); say(call(S.story.copyback, failed.length, rebuilt.length > 0, direct));
    root.classList.add('is-busy');
    root.classList.remove('is-no-area');
    failed.forEach((d) => d.classList.replace('is-failed', 'is-replaced'));
    const blocks = failed.flatMap((d) => [...d.querySelectorAll('.fad-blk')]);
    const used = rebuilt.length / areas;
    setBar(bar, 0); setBar(ghost, 0);
    areaPips.forEach((p) => p.classList.replace('is-used', 'is-busy'));
    areaText.textContent = call(S.areasCopyback);
    const my = run;
    for (let i = 0; i < blocks.length; i++) {
      await sleep(Math.max(250, o.copybackMs / blocks.length));
      if (my !== run) return;
      blocks[i].classList.add('is-restored');
      const k = (i + 1) / blocks.length;
      setBar(bar, k); setFill(used * (1 - k));
      setState('copyback', call(S.state.copyback, Math.round(k * 100), direct.length > 0));
    }
    await sleep(500);
    if (my !== run) return;
    healthy(call(S.story.online));
  }

  function healthy(text) {
    cancelAnimationFrame(loop); run++;
    phase = 'healthy'; failed = []; rebuilt = []; rebuilding = null; queued = null; progress = 0; ghostP = 0;
    disks.forEach((d) => d.classList.remove('is-failed', 'is-rebuilt', 'is-replaced'));
    root.querySelectorAll('.fad-blk.is-restored').forEach((b) => b.classList.remove('is-restored'));
    areaPips.forEach((p) => p.classList.remove('is-used', 'is-busy'));
    root.classList.remove('is-rebuilding', 'is-busy', 'is-offline', 'is-critical', 'is-no-area');
    setFill(0); setBar(bar, 0); setBar(ghost, 0);
    setStep(0); say(text); update();
    failBtn.hidden = false; restoreBtn.hidden = true;
  }

  function offline(disk) {
    cancelAnimationFrame(loop); run++;
    phase = 'offline'; rebuilding = null; queued = null;
    root.classList.remove('is-rebuilding', 'is-no-area');
    root.classList.add('is-offline', 'is-critical');
    pips.forEach((p) => p.classList.add('is-off'));
    setState('offline', call(S.state.offline));
    say(call(S.story.offline, label(disk)));
    prot.textContent = call(S.protectionLost);
    const hadFocus = document.activeElement === failBtn || document.activeElement === replaceBtn;
    failBtn.hidden = true; replaceBtn.hidden = true; restoreBtn.hidden = false;
    if (hadFocus) restoreBtn.focus({ preventScroll: true });
  }

  const failRandom = () => {
    const ok = disks.filter((d) => !d.classList.contains('is-failed') && !d.classList.contains('is-replaced'));
    fail(ok[Math.floor(Math.random() * ok.length)]);
  };
  const on = (el, type, fn) => { el.addEventListener(type, fn); cleanups.push(() => el.removeEventListener(type, fn)); };

  on(failBtn, 'click', failRandom);
  on(replaceBtn, 'click', () => {
    const hadFocus = document.activeElement === replaceBtn;
    copyback();
    if (hadFocus) failBtn.focus({ preventScroll: true });
  });
  on(restoreBtn, 'click', () => {
    const hadFocus = document.activeElement === restoreBtn;
    healthy(call(S.story.restored));
    if (hadFocus) failBtn.focus({ preventScroll: true });
  });
  on(bays, 'click', (e) => fail(e.target.closest('.fad-disk')));
  root.classList.add('is-live');
  setStep(0); say(call(S.story.idle, n, areas)); update();

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
    /** Replaces every failed drive (copyback, or a direct rebuild for drives without a rebuild area). */
    replace: () => { if (phase === 'settled' && failed.length) copyback(); },
    reset: () => healthy(call(S.story.idle, n, areas)),
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
function autoInit(selector = '[data-fail-a-drive]') {
  return [...document.querySelectorAll(selector)].filter((el) => !el.__failADrive).map((el) => mount(el));
}

const defaults = DEFAULTS;
const strings = STRINGS;

  window.FailADrive = { mount, autoInit, defaults, strings };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => autoInit());
  else autoInit();
})();
