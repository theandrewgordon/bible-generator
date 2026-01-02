// static/darkmode.js
(function () {
  const KEY = "theme"; // 'dark' | 'light' | 'system' (null => system)

  const prefersDark = () =>
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  const getStored = () => localStorage.getItem(KEY);

  const effective = () => {
    const s = getStored();
    if (s === "dark" || s === "light") return s;
    return prefersDark() ? "dark" : "light";
  };

  function apply(theme) {
    const body = document.body;
    const html = document.documentElement;
    const isDark = theme === "dark";

    // Avoid extra work if nothing changed
    const currentlyDark = body.classList.contains("dark");
    if (isDark === currentlyDark) {
      updateButtonUI(isDark);
      setDataTheme(isDark ? "dark" : "light");
      return;
    }

    // Toggle the class
    if (isDark) body.classList.add("dark");
    else body.classList.remove("dark");

    // Optional: expose to CSS if you ever want [data-theme] targeting
    setDataTheme(isDark ? "dark" : "light");

    // Sync button label/state
    updateButtonUI(isDark);
  }

  function setDataTheme(val) {
    const html = document.documentElement;
    if (html) html.setAttribute("data-theme", val);
  }

  function updateButtonUI(isDark) {
    const buttons = document.querySelectorAll(".theme-toggle");
    if (!buttons.length) return;

    buttons.forEach((btn) => {
      const icon = btn.querySelector('[aria-hidden="true"]');
      if (icon) {
        icon.textContent = isDark ? "☀️" : "🌙";
      } else {
        btn.textContent = isDark ? "☀️" : "🌙";
      }

      btn.setAttribute("aria-pressed", String(isDark));
      btn.title = isDark ? "Toggle light mode" : "Toggle dark mode";
      btn.setAttribute("aria-label", btn.title);
    });
  }

  function init() {
    apply(effective());
  }

  function onClick() {
    const next = effective() === "dark" ? "light" : "dark";
    localStorage.setItem(KEY, next);
    apply(next);
  }

  function onSystemChange() {
    const s = getStored();
    if (!s || s === "system") apply(effective());
  }

  document.addEventListener("DOMContentLoaded", () => {
    init();
    document.querySelectorAll(".theme-toggle").forEach((btn) => {
      btn.addEventListener("click", onClick);
    });
  });

  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener?.("change", onSystemChange);
    mq.addListener?.(onSystemChange); // Safari <14
  }

  // Public helper to force a mode or defer to system
  window.setTheme = (mode /* 'dark'|'light'|'system' */) => {
    if (mode === "system") localStorage.setItem(KEY, "system");
    else localStorage.setItem(KEY, mode);
    apply(effective());
  };
})();
