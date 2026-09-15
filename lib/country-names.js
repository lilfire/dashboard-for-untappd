// Oversetter Untappd-landnavn (engelsk, fra landvelgeren) til valgt språk, for visning og søk under «Land».
// Engelsk navn → ISO-regionkode finnes via Intl.DisplayNames, og koden gir navnet på andre språk.
(function (root) {
  const fold = s => String(s).normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase().trim();

  // Samme land skrives ulikt hos Untappd og i Intl («The Gambia», «St. Martin», «Wallis & Futuna»).
  const key = s => fold(s).replace(/’/g, "'").replace(/&/g, 'and').replace(/^st\.? /, 'saint ').replace(/^the /, '').replace(/\s+/g, ' ');

  // Untappd-varianter som Intl ikke kjenner igjen.
  const ALIASES = {
    'Czech Republic': 'CZ', 'Russian Federation': 'RU', Macedonia: 'MK', Korea: 'KR', 'Republic of Korea': 'KR',
    Turkey: 'TR', USA: 'US', 'United States of America': 'US', Burma: 'MM', 'DR Congo': 'CD',
    'Democratic Republic of the Congo': 'CD', Congo: 'CG', 'Republic of the Congo': 'CG', 'East Timor': 'TL',
    'Viet Nam': 'VN', 'Palestinian Territory': 'PS', 'Palestinian Territories': 'PS', Macau: 'MO', Bonaire: 'BQ',
    'US Virgin Islands': 'VI', 'Ivory Coast': 'CI', Swaziland: 'SZ', 'Cape Verde': 'CV', 'Cabo Verde': 'CV',
    'Saint Vincent and the Grenadines': 'VC',
  };

  // Delland uten egen ISO-kode.
  const SUBREGIONS = {
    England: { nb: 'England' }, Scotland: { nb: 'Skottland' }, Wales: { nb: 'Wales' }, 'Northern Ireland': { nb: 'Nord-Irland' },
  };

  // Untappd kan gi flere navn i ett, f.eks. «China / People's Republic of China».
  const variants = name => [name, ...String(name).split('/').map(s => s.trim()).filter(Boolean)];

  let codes = null;
  function codeOf(name) {
    if (!codes) {
      codes = new Map();
      for (const style of ['long', 'short']) {
        const en = new Intl.DisplayNames(['en'], { type: 'region', style, fallback: 'none' });
        for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
          const code = String.fromCharCode(a, b);
          let label;
          try { label = en.of(code); } catch { continue; }
          if (label && label !== code && !codes.has(key(label))) codes.set(key(label), code);
        }
      }
      for (const [alias, code] of Object.entries(ALIASES)) codes.set(key(alias), code);
    }
    return variants(name).map(v => codes.get(key(v))).find(Boolean);
  }

  const displays = new Map();
  const display = locale => {
    if (!displays.has(locale)) displays.set(locale, new Intl.DisplayNames([locale], { type: 'region', style: 'short', fallback: 'none' }));
    return displays.get(locale);
  };

  const subregion = name => Object.entries(SUBREGIONS).find(([en]) => variants(name).some(v => key(en) === key(v)))?.[1];

  // Engelsk beholder Untappds egne navn; ukjente land vises som de kom.
  function localName(name, locale) {
    if (!name || !locale || /^en\b/i.test(locale)) return name;
    const lang = locale.split('-')[0].toLowerCase();
    const sub = subregion(name);
    if (sub) return sub[lang] ?? name;
    const code = codeOf(name);
    if (!code) return name;
    try { return display(locale).of(code) ?? name; } catch { return name; }
  }

  const api = { localName, regionCode: name => codeOf(name ?? '') ?? null };
  root.DFU = root.DFU || {};
  root.DFU.countryNames = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
