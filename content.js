// Kjører på /user/*/beers: leser siden og sender dataene til bakgrunnen.
(() => {
  const data = DFU.parse.parseBeersPage(document, location.href);
  DFU.api.runtime.sendMessage({ type: 'dfu:page-data', data }).catch(() => {});
})();
