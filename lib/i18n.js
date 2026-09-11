// Enkel oversettelse (norsk bokmål / engelsk). Egen ordbok i stedet for _locales, fordi Chrome og
// Firefox bruker ulike koder for norsk, og fordi brukeren skal kunne velge språk selv.
(function (root) {
  const dict = {
    nb: {
      notAffiliated: 'Ikke tilknyttet Untappd.',
      footer: 'Ikke tilknyttet Untappd. Dataene hentes fra untappd.com med din innlogging og lagres bare i denne nettleseren.',
      refresh: 'Oppdater',
      refreshing: 'Oppdaterer …',
      settings: 'Innstillinger',
      neverUpdated: 'Ikke hentet ennå',
      updated: 'Oppdatert {0}',
      via_direct: 'direkte',
      via_tab: 'via fane',
      via_visit: 'ved besøk',
      loadingFirst: 'Henter ølhistorikken din fra Untappd …',

      err_loggedOut: 'Du er ikke logget inn på Untappd i denne nettleseren.',
      err_loggedOutAction: 'Logg inn på Untappd',
      err_challenge: 'Untappd ba om en sjekk. Fullfør den i fanen som åpnet seg, og trykk Oppdater.',
      err_noData: 'Fant ikke ølhistorikken på siden. Untappd kan ha endret siden sin.',
      err_timeout: 'Untappd svarte ikke i tide. Fanen er vist, prøv Oppdater når den har lastet.',
      err_network: 'Fikk ikke kontakt med Untappd ({0}).',
      err_noUser: 'Fant ikke hvem som er innlogget. Logg inn på Untappd, eller skriv brukernavnet i innstillingene.',
      err_permission: 'Utvidelsen mangler tilgang til untappd.com.',
      err_permissionAction: 'Gi tilgang',
      err_stale: 'Viser lagrede data fra {0}.',

      kpi_total: 'Innsjekkinger',
      kpi_unique: 'Unike øl',
      kpi_breweries: 'Bryggerier',
      kpi_countries: 'Land',
      kpi_styles: 'Stiler',
      kpi_badges: 'Merker',
      kpi_friends: 'Venner',

      change_title: 'Siste endring',
      change_since: 'siden {0}',
      change_none: 'Ingen endringer registrert ennå. Når du har sjekket inn nye øl, vises endringene her etter neste oppdatering.',
      change_unique: '+{0} unike øl',
      change_newBreweries: 'Nye bryggerier',
      change_moreBeers: 'Flere øl fra',
      change_newCountries: 'Nye land',
      change_newStyles: 'Nye stiler',

      tab_breweries: 'Bryggerier',
      tab_countries: 'Land',
      tab_styles: 'Stiler',
      tab_recent: 'Siste øl',
      tab_trend: 'Utvikling',
      tab_compare: 'Sammenlign',

      search_breweries: 'Søk etter bryggeri …',
      search_countries: 'Søk etter land …',
      search_styles: 'Søk etter stil …',
      sort_countDesc: 'Flest øl først',
      sort_countAsc: 'Færrest øl først',
      sort_nameAsc: 'Navn A–Å',
      sort_nameDesc: 'Navn Å–A',
      reset: 'Nullstill',
      col_rank: 'Plass',
      col_brewery: 'Bryggeri',
      col_beers: 'Antall øl',
      col_country: 'Land',
      col_share: 'Andel',
      col_family: 'Stilfamilie',
      col_style: 'Stil',
      col_beer: 'Øl',
      col_rating: 'Din / global',
      col_abv: 'Alkohol',
      col_date: 'Sist drukket',
      showing: 'Viser {0} av {1}',
      totalBeers: '{0} øl',
      emptySearch: 'Ingen treff. Prøv et kortere søk eller trykk Nullstill.',
      badge_new: 'ny',
      bucket_one: '1 øl',
      bucket_range: '{0}–{1} øl',
      bucket_plus: '{0}+ øl',
      bucket_unit: 'bryggerier',
      bucket_share: '{0} øl · {1} %',
      dist_title: 'Fordeling',
      dist_hint: 'Stripen viser andelen av alle ølene. Klikk en gruppe for å filtrere.',
      styles_in: '{0} stiler',
      families_count: '{0} stilfamilier',
      notRated: 'ikke rangert',
      recent_hint: 'De 25 unike ølene du sist har drukket. Klikk på et øl for å åpne det på Untappd.',
      untappdCounts: 'Antall er unike øl, ikke innsjekkinger.',

      trend_empty: 'Kurven fylles ut etter hvert som du oppdaterer dashbordet, med én verdi per dag. Kom tilbake i morgen.',
      trend_hint: 'Én verdi per dag du har oppdatert dashbordet.',

      compare_hint: 'Sammenlign med en venn hvis ølhistorikk du har tilgang til på Untappd.',
      compare_placeholder: 'Brukernavn på Untappd',
      compare_run: 'Sammenlign',
      compare_loading: 'Henter {0} …',
      compare_notFound: 'Fant ikke ølhistorikken til {0}. Sjekk brukernavnet, eller om profilen er privat.',
      compare_both: 'Begge',
      compare_onlyMe: 'Bare du',
      compare_onlyThem: 'Bare {0}',
      compare_summary: '{0} felles · {1} bare du · {2} bare {3}',
      compare_you: 'Du',

      settings_title: 'Innstillinger',
      settings_username: 'Brukernavn på Untappd',
      settings_usernameHint: 'La stå tomt for å bruke den som er innlogget på Untappd i denne nettleseren.',
      settings_stale: 'Oppdater automatisk når dataene er eldre enn (timer)',
      settings_language: 'Språk',
      lang_auto: 'Automatisk',
      settings_save: 'Lagre',
      settings_saved: 'Lagret.',
      settings_reset: 'Slett alle lagrede data',
      settings_resetConfirm: 'Slette alle lagrede data? Historikken for «siste endring» og kurven går tapt.',
      settings_resetDone: 'Alle lagrede data er slettet.',
      settings_back: 'Til dashbordet',
    },
    en: {
      notAffiliated: 'Not affiliated with Untappd.',
      footer: 'Not affiliated with Untappd. Data is fetched from untappd.com with your own login and stored only in this browser.',
      refresh: 'Refresh',
      refreshing: 'Refreshing …',
      settings: 'Settings',
      neverUpdated: 'Not fetched yet',
      updated: 'Updated {0}',
      via_direct: 'direct',
      via_tab: 'via tab',
      via_visit: 'on visit',
      loadingFirst: 'Fetching your beer history from Untappd …',

      err_loggedOut: 'You are not logged in to Untappd in this browser.',
      err_loggedOutAction: 'Log in to Untappd',
      err_challenge: 'Untappd asked for a check. Complete it in the tab that opened, then press Refresh.',
      err_noData: 'Could not find the beer history on the page. Untappd may have changed its page.',
      err_timeout: 'Untappd did not respond in time. The tab is shown; press Refresh once it has loaded.',
      err_network: 'Could not reach Untappd ({0}).',
      err_noUser: 'Could not tell who is logged in. Log in to Untappd, or enter your username in Settings.',
      err_permission: 'The extension does not have access to untappd.com.',
      err_permissionAction: 'Grant access',
      err_stale: 'Showing saved data from {0}.',

      kpi_total: 'Check-ins',
      kpi_unique: 'Unique beers',
      kpi_breweries: 'Breweries',
      kpi_countries: 'Countries',
      kpi_styles: 'Styles',
      kpi_badges: 'Badges',
      kpi_friends: 'Friends',

      change_title: 'Latest change',
      change_since: 'since {0}',
      change_none: 'No changes recorded yet. After you check in new beers, the changes show up here on the next refresh.',
      change_unique: '+{0} unique beers',
      change_newBreweries: 'New breweries',
      change_moreBeers: 'More beers from',
      change_newCountries: 'New countries',
      change_newStyles: 'New styles',

      tab_breweries: 'Breweries',
      tab_countries: 'Countries',
      tab_styles: 'Styles',
      tab_recent: 'Recent beers',
      tab_trend: 'Over time',
      tab_compare: 'Compare',

      search_breweries: 'Search breweries …',
      search_countries: 'Search countries …',
      search_styles: 'Search styles …',
      sort_countDesc: 'Most beers first',
      sort_countAsc: 'Fewest beers first',
      sort_nameAsc: 'Name A–Z',
      sort_nameDesc: 'Name Z–A',
      reset: 'Reset',
      col_rank: 'Rank',
      col_brewery: 'Brewery',
      col_beers: 'Beers',
      col_country: 'Country',
      col_share: 'Share',
      col_family: 'Style family',
      col_style: 'Style',
      col_beer: 'Beer',
      col_rating: 'Yours / global',
      col_abv: 'ABV',
      col_date: 'Last had',
      showing: 'Showing {0} of {1}',
      totalBeers: '{0} beers',
      emptySearch: 'No matches. Try a shorter search or press Reset.',
      badge_new: 'new',
      bucket_one: '1 beer',
      bucket_range: '{0}–{1} beers',
      bucket_plus: '{0}+ beers',
      bucket_unit: 'breweries',
      bucket_share: '{0} beers · {1} %',
      dist_title: 'Distribution',
      dist_hint: 'The strip shows the share of all beers. Click a group to filter.',
      styles_in: '{0} styles',
      families_count: '{0} style families',
      notRated: 'not rated',
      recent_hint: 'The 25 unique beers you had most recently. Click a beer to open it on Untappd.',
      untappdCounts: 'Counts are unique beers, not check-ins.',

      trend_empty: 'The chart fills in as you refresh the dashboard, one value per day. Come back tomorrow.',
      trend_hint: 'One value per day you refreshed the dashboard.',

      compare_hint: 'Compare with a friend whose beer history you can see on Untappd.',
      compare_placeholder: 'Untappd username',
      compare_run: 'Compare',
      compare_loading: 'Fetching {0} …',
      compare_notFound: "Could not find {0}'s beer history. Check the username, or whether the profile is private.",
      compare_both: 'Both',
      compare_onlyMe: 'Only you',
      compare_onlyThem: 'Only {0}',
      compare_summary: '{0} shared · {1} only you · {2} only {3}',
      compare_you: 'You',

      settings_title: 'Settings',
      settings_username: 'Untappd username',
      settings_usernameHint: 'Leave empty to use whoever is logged in to Untappd in this browser.',
      settings_stale: 'Refresh automatically when data is older than (hours)',
      settings_language: 'Language',
      lang_auto: 'Automatic',
      settings_save: 'Save',
      settings_saved: 'Saved.',
      settings_reset: 'Delete all saved data',
      settings_resetConfirm: 'Delete all saved data? The history for "latest change" and the chart will be lost.',
      settings_resetDone: 'All saved data has been deleted.',
      settings_back: 'Back to dashboard',
    },
  };

  const detect = () => (/^(nb|nn|no)\b/i.test(navigator.language || '') ? 'nb' : 'en');
  let lang = detect();

  function setLanguage(choice) {
    lang = choice === 'nb' || choice === 'en' ? choice : detect();
    document.documentElement.lang = lang;
  }

  const locale = () => (lang === 'nb' ? 'nb-NO' : 'en-GB');

  function t(key, ...args) {
    const s = dict[lang][key] ?? dict.en[key] ?? key;
    return s.replace(/\{(\d)\}/g, (_, i) => String(args[i] ?? ''));
  }

  // Oversetter elementer merket med data-i18n, data-i18n-placeholder og data-i18n-aria-label.
  function apply(scope = document) {
    for (const el of scope.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const el of scope.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
    for (const el of scope.querySelectorAll('[data-i18n-aria-label]')) el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
  }

  const number = n => new Intl.NumberFormat(locale()).format(n);
  const date = (d, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => new Intl.DateTimeFormat(locale(), opts).format(new Date(d));

  function relative(ts) {
    const diff = (ts - Date.now()) / 1000;
    const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
    const units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]];
    for (const [unit, secs] of units) if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
    return rtf.format(0, 'minute');
  }

  root.DFU = root.DFU || {};
  root.DFU.i18n = { t, apply, setLanguage, locale, number, date, relative, get lang() { return lang; } };
})(globalThis);
