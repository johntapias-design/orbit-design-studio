const THEMES = {
  dark: { label: 'Oscuro', description: 'Contraste alto para sesiones largas', icon: 'moon' },
  light: { label: 'Claro', description: 'Superficies luminosas y neutrales', icon: 'sun' },
  system: { label: 'Sistema', description: 'Sigue la preferencia del dispositivo', icon: 'monitor' },
};

function icon(name) {
  const paths = {
    sun: '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"></path>',
    moon: '<path d="M20.5 14.1A8 8 0 0 1 9.9 3.5a8.5 8.5 0 1 0 10.6 10.6Z"></path>',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="2"></rect><path d="M8 20h8M12 16v4"></path>',
    check: '<path d="m5 12 4 4L19 6"></path>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.monitor}</svg>`;
}

function resolvedTheme(window, preference) {
  if (preference !== 'system') return preference;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function createThemeSystem({ window, document, state, announce = () => {} }) {
  const triggers = [...document.querySelectorAll('#theme-toggle,#dashboard-theme-toggle')];
  if (!triggers.length) return { destroy() {}, close() {}, open() {}, sync() {} };
  let activeTrigger = triggers[0];

  const popover = document.createElement('section');
  popover.id = 'theme-menu';
  popover.className = 'theme-menu';
  popover.hidden = true;
  popover.setAttribute('role', 'menu');
  popover.setAttribute('aria-label', 'Tema de la interfaz');
  popover.innerHTML = `
    <header><span>APARIENCIA</span><strong>Tema de Orbit</strong></header>
    <div class="theme-menu-options">
      ${Object.entries(THEMES).map(([value, item]) => `
        <button type="button" role="menuitemradio" data-theme-choice="${value}" aria-checked="false">
          <span class="theme-choice-icon">${icon(item.icon)}</span>
          <span class="theme-choice-copy"><strong>${item.label}</strong><small>${item.description}</small></span>
          <span class="theme-choice-check">${icon('check')}</span>
        </button>`).join('')}
    </div>
    <footer>El tema del editor no modifica el diseño dentro del canvas.</footer>`;
  document.body.appendChild(popover);

  triggers.forEach(trigger => {
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-controls', popover.id);
    trigger.setAttribute('aria-expanded', 'false');
  });

  const disposers = [];
  const listen = (target, type, handler, options) => {
    target?.addEventListener(type, handler, options);
    disposers.push(() => target?.removeEventListener(type, handler, options));
  };

  function sync() {
    const preference = THEMES[state.theme] ? state.theme : 'dark';
    const resolved = resolvedTheme(window, preference);
    const item = THEMES[preference];
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themePreference = preference;
    document.documentElement.style.colorScheme = resolved;
    triggers.forEach(trigger => {
      trigger.innerHTML = icon(item.icon);
      trigger.dataset.themePreference = preference;
      trigger.dataset.themeResolved = resolved;
      trigger.setAttribute('aria-label', `Tema ${item.label}. Abrir selector de tema`);
      trigger.dataset.tooltip = `Tema: ${item.label}`;
    });
    popover.querySelectorAll('[data-theme-choice]').forEach(button => {
      const selected = button.dataset.themeChoice === preference;
      button.setAttribute('aria-checked', String(selected));
      button.classList.toggle('is-selected', selected);
    });
  }

  function position() {
    const rect = activeTrigger.getBoundingClientRect();
    const width = 310;
    const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.right - width));
    popover.style.left = `${left}px`;
    popover.style.top = `${Math.min(window.innerHeight - popover.offsetHeight - 12, rect.bottom + 9)}px`;
  }

  function open(trigger = activeTrigger) {
    if (!popover.hidden) return;
    activeTrigger = trigger;
    popover.hidden = false;
    triggers.forEach(item => item.setAttribute('aria-expanded', String(item === activeTrigger)));
    position();
    const selected = popover.querySelector('.is-selected') || popover.querySelector('button');
    requestAnimationFrame(() => selected?.focus());
  }

  function close({ restoreFocus = false } = {}) {
    if (popover.hidden) return;
    popover.hidden = true;
    triggers.forEach(trigger => trigger.setAttribute('aria-expanded', 'false'));
    if (restoreFocus) activeTrigger.focus();
  }

  function choose(value) {
    if (!THEMES[value]) return;
    state.theme = value;
    sync();
    close({ restoreFocus: true });
    const resolved = resolvedTheme(window, value);
    announce(`Tema ${THEMES[value].label} activado${value === 'system' ? `, actualmente ${resolved === 'light' ? 'claro' : 'oscuro'}` : ''}.`);
  }

  triggers.forEach(trigger => listen(trigger, 'click', event => {
    event.stopPropagation();
    if (popover.hidden) open(trigger);
    else if (activeTrigger === trigger) close({ restoreFocus: true });
    else { activeTrigger = trigger; position(); }
  }));
  listen(popover, 'click', event => {
    const choice = event.target.closest('[data-theme-choice]');
    if (choice) choose(choice.dataset.themeChoice);
  });
  listen(popover, 'keydown', event => {
    const buttons = [...popover.querySelectorAll('[data-theme-choice]')];
    const index = buttons.indexOf(document.activeElement);
    let next = null;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = buttons[(index + 1 + buttons.length) % buttons.length];
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = buttons[(index - 1 + buttons.length) % buttons.length];
    if (event.key === 'Home') next = buttons[0];
    if (event.key === 'End') next = buttons.at(-1);
    if (event.key === 'Escape') { event.preventDefault(); close({ restoreFocus: true }); return; }
    if (next) { event.preventDefault(); next.focus(); }
  });
  listen(document, 'click', event => {
    if (!popover.hidden && !popover.contains(event.target) && !triggers.some(trigger => trigger.contains(event.target))) close();
  });
  listen(window, 'resize', () => { if (!popover.hidden) position(); }, { passive: true });
  const media = window.matchMedia?.('(prefers-color-scheme: light)');
  const onSystemChange = () => { if (state.theme === 'system') sync(); };
  media?.addEventListener?.('change', onSystemChange);
  disposers.push(() => media?.removeEventListener?.('change', onSystemChange));
  disposers.push(subscribe('theme', sync));

  sync();
  return { close, destroy() { close(); disposers.splice(0).forEach(dispose => dispose()); popover.remove(); }, open, sync };
}