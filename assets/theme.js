/* Runs in <head>, before the page is drawn, so a saved light or dark choice never flashes the wrong colours.
   With no saved choice the page follows the system setting. Loaded by the kit page and its 404 page.
   The survey site always follows the system setting and does not read this choice. */
(function () {
  try {
    var t = localStorage.getItem('njit-sponsor-theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage blocked: follow the system */ }
})();
