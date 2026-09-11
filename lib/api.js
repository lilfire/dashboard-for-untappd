// Felles tilgang til utvidelses-API-et: Firefox har `browser`, Chrome har `chrome`.
// Begge returnerer promises i Manifest V3.
(function (root) {
  root.DFU = root.DFU || {};
  root.DFU.api = root.browser ?? root.chrome;
})(globalThis);
