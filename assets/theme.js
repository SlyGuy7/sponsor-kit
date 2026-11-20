/* Runs in <head>, before the page is drawn, so a saved light or dark choice never flashes the wrong colours.
   With no saved choice the page follows the system setting. */
(function () {
  try {
    var t = localStorage.getItem('sponsor-kit-theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage blocked: follow the system */ }
})();
