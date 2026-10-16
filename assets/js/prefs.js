// Text size (sm|md|lg|xl) and theme (light|dark) on <html>, saved in localStorage.
(function () {
  const root = document.documentElement;
  const SIZES = ['sm', 'md', 'lg', 'xl'];
  const SIZE_NAMES = { sm: 'Small', md: 'Medium', lg: 'Large', xl: 'Extra large' };

  function save(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* storage blocked: choice lasts for this page only */ }
  }

  function syncSize() {
    const current = root.getAttribute('data-font-size') || 'sm';
    document.querySelectorAll('[data-size-option]').forEach((btn) => {
      const on = btn.getAttribute('data-size-option') === current;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      const name = SIZE_NAMES[btn.getAttribute('data-size-option')];
      btn.setAttribute('aria-label', on ? `Text size: ${name} (selected)` : `Text size: ${name}`);
    });
  }

  function syncTheme() {
    const theme = root.getAttribute('data-theme') || 'light';
    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      const dark = theme === 'dark';
      btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
      btn.setAttribute('aria-label', dark ? 'Dark theme on. Switch to light theme' : 'Light theme on. Switch to dark theme');
      const label = btn.querySelector('[data-theme-label]');
      if (label) label.textContent = dark ? 'Dark' : 'Light';
    });
  }

  document.addEventListener('click', (event) => {
    const sizeBtn = event.target.closest('[data-size-option]');
    if (sizeBtn) {
      const size = sizeBtn.getAttribute('data-size-option');
      if (SIZES.includes(size)) {
        root.setAttribute('data-font-size', size);
        save('pref-font-size', size);
        syncSize();
      }
      return;
    }
    const themeBtn = event.target.closest('[data-theme-toggle]');
    if (themeBtn) {
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      save('pref-theme', next);
      syncTheme();
    }
  });

  syncSize();
  syncTheme();
})();
