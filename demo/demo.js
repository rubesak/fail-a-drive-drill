// Demo only: theme switch and an event log. Not needed to use the component.
(() => {
  const buttons = document.querySelectorAll('[data-set-theme]');
  buttons.forEach((b) => b.addEventListener('click', () => {
    const t = b.dataset.setTheme;
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    // The component follows the system by default; data-theme on .fad forces a theme.
    document.querySelectorAll('.fad').forEach((el) => {
      if (t === 'auto') el.removeAttribute('data-theme'); else el.setAttribute('data-theme', t);
    });
    buttons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));

  const log = document.querySelector('[data-log]');
  const add = (text) => {
    const li = document.createElement('li');
    li.textContent = `${new Date().toLocaleTimeString()}  ${text}`;
    log.prepend(li);
    while (log.children.length > 8) log.lastElementChild.remove();
  };
  document.addEventListener('faildrive:status', (e) => add(`status: ${e.detail.status}${e.detail.failed.length ? ` (failed: ${e.detail.failed.join(', ')})` : ''}`));
  document.addEventListener('faildrive:rebuild', (e) => add(`rebuild started for drive ${e.detail.drives.join(', ')}`));
})();
