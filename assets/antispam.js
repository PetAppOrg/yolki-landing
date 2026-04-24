(function () {
  'use strict';

  const HONEYPOT_NAME = 'website_url';
  const COOLDOWN_MS = 3000;
  const FORM_COOLDOWNS = new WeakMap();

  function injectHoneypot(form) {
    if (form.querySelector('input[name="' + HONEYPOT_NAME + '"]')) return;
    const wrap = document.createElement('div');
    wrap.setAttribute('aria-hidden', 'true');
    wrap.style.cssText = 'position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;';
    const input = document.createElement('input');
    input.type = 'text';
    input.name = HONEYPOT_NAME;
    input.tabIndex = -1;
    input.autocomplete = 'off';
    input.setAttribute('aria-hidden', 'true');
    wrap.appendChild(input);
    form.appendChild(wrap);
  }

  function wireForm(form) {
    injectHoneypot(form);
    form.addEventListener(
      'submit',
      function (e) {
        const hp = form.querySelector('input[name="' + HONEYPOT_NAME + '"]');
        if (hp && hp.value) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
        const now = Date.now();
        const last = FORM_COOLDOWNS.get(form) || 0;
        if (now - last < COOLDOWN_MS) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
        FORM_COOLDOWNS.set(form, now);
      },
      true
    );
  }

  function init() {
    const forms = document.querySelectorAll('form[data-antispam]');
    forms.forEach(wireForm);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
