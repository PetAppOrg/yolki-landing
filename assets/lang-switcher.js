// Navegação entre PT (/) e EN (/en/).
// Intercepta cliques em `button[data-lang]` em capture:true, antes dos handlers
// locais de cada página, e redireciona preservando rota/search/hash.
(function () {
  const html = document.documentElement;
  const currentLang = (html.lang || "pt").toLowerCase().startsWith("en") ? "en" : "pt";

  function targetPath(targetLang) {
    const { pathname, search, hash } = window.location;
    let p;
    if (targetLang === "en") {
      p = "/en" + (pathname === "/" ? "/" : pathname);
    } else {
      p = pathname.replace(/^\/en(\/|$)/, "/") || "/";
    }
    return p + search + hash;
  }

  document.addEventListener(
    "click",
    (e) => {
      const btn = e.target.closest("button[data-lang]");
      if (!btn) return;
      const target = btn.dataset.lang;
      if (!target || target === currentLang) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      try {
        localStorage.setItem("yolki_lang", target);
      } catch (_) {}
      window.location.href = targetPath(target);
    },
    true,
  );
})();
