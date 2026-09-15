# Plan: Dashboard for Untappd

Nettleserutvidelse for Firefox og Chrome som gir hver bruker sitt eget Untappd-dashbord,
basert på brukerens egen innlogging. Ingen server, ingen sporing, data forlater aldri nettleseren.

## Beslutninger

| Tema | Valg |
|---|---|
| Navn | **Dashboard for Untappd**. Ingen Untappd-logo. Teksten «Ikke tilknyttet Untappd» vises i utvidelsen og i README |
| Nettlesere | Firefox først, Chrome rett etter. Samme kode |
| Distribusjon | Firefox: «unlisted» på AMO (signert av Mozilla), `.xpi` på GitHub Releases med `update_url` for automatiske oppdateringer. Chrome: upakket eller Chrome Nettmarked, avgjøres senere |
| Språk | Norsk bokmål og engelsk (`_locales`), valgt etter nettleserens språk |
| Prosjektmappe | `c:\git\dashboard-for-untappd` |
| Verktøy | Node 25, npm 11, git 2.53 (installert). `web-ext` til kjøring, sjekk, pakking og signering |

## Datakilde

Én visning av `https://untappd.com/user/<brukernavn>/beers` (ferdig fra serveren) inneholder:

- `select#brewery_picker`: bryggerier. `value` = bryggeri-ID, tekst = `Navn (antall)`. 633 for Lilfire
- `select#style_picker`: ølstiler med antall. 199 for Lilfire
- `select#country_picker`: land med antall. 48 for Lilfire
- Profiltall: innsjekkinger, unike øl, merker, venner
- De 25 nyeste unike ølene (`.beer-item`): navn, bryggeri, stil, din og global rangering, alkoholprosent, IBU, første og siste innsjekking, antall innsjekkinger
- Innlogget bruker: lenke til `/user/<navn>` i toppmenyen

Antallene er **unike øl**, ikke innsjekkinger. Kontrolltall for Lilfire: summen over bryggerier, stiler og land = 2 711 = unike øl.

Datoer: rå HTML har `<abbr class="date-time">Thu, 03 Sep 2026 23:16:28 +0200</abbr>`. Sidens JavaScript gjør det om til
`09/03/26` (MM/DD/YY) etter lasting. `parse.js` leser begge. Lenken rundt datoen gir innsjekkings-ID-en.

## Versjon 1.1: årsoppsummering

Årsfane i stil med [Recappd](https://recappd.untappd.com/mine), og året side om side i sammenligningen.

**Datakilde:** `GET /profile/more_beer/<bruker>/<offset>?sort=date` — samme kall som «Show More»-knappen.
Returnerer rå HTML med 25 `.beer-item` per kall, med fullt tidsstempel. Vanlige sider ignorerer `?page=`/`?offset=`.
For 2 711 øl blir det 109 kall (~5,5 MB). `lib/history.js` henter med 1,5 sekund pause, kan avbrytes
(det hentede lagres), og stopper tidlig når en hel side er kjent fra før. Endepunktet er udokumentert;
brukeren er informert i README, og henting skjer bare når brukeren trykker.

**Fallgruve:** fragmentet skriver «You Rating», mens ølsiden skriver «Your Rating». `parse.js` godtar begge
(test: `sample-more-beer.html`).

**Utregning:** `lib/years.js` (rene funksjoner, testet) grupperer på året for første innsjekking og gir nye øl,
nye bryggerier, nye stiler, snittrangering mot global, snitt alkohol, sterkeste, topp 5, lavest rangerte,
toppstiler, toppbryggerier, måneder, ukedager, første og siste øl. `compareYear` gir felles og unike øl.

**Ikke mulig fra denne kilden:** steder, byer og gjentatte innsjekkinger (Recappd har dem fra
innsjekkingsfeeden, som ville doblet antall kall). Våre «nye øl i året» er øl smakt første gang det året,
mens Recappd teller alle unike øl sjekket inn det året. Merker kommer fra merkesiden (se under).

## Versjon 1.2: merker

Et troféskap, ikke en komplett merkeliste. Antall nye merker og mellomnivåer er ikke interessant. Det som vises:
merker tatt til **maks nivå** og **spesialmerker** (eventer, høytider, kampanjer). I tillegg får årsfanen kortet «Årets merker».

**Kartlegging (15. september 2026, Lilfire):**

- `/user/<bruker>/badges` har filterlenker med antall: `All Badges (2235)`, `Beer (1974)`, `Venue (68)`, `Special (189)`,
  med `?segment=beer|venue|special`
- Hvert merke: `.item.badge-item` med klassene `retired`/`not-retired` og `level`. Lenken `/user/<bruker>/badges/<id>`,
  `img` fra `assets.untappd.com`, `.name` («Navn (Level N)»), `.date` («November 30, 2023»)
- Nivåmerker fra nivå 2 har `.level-box` med nivået. Kan merket gå videre, finnes `.next-level` («Unlock the next level»)
- **Maks nivå** = `.level-box` uten `.next-level`, og ikke pensjonert. Klassen `level` alene sier ingenting (også på pensjonerte engangsmerker)
- Listen viser hvert merke én gang, på høyeste nivå. Et nytt nivå gir ny ID og flytter merket øverst
- «Show More»: `GET /profile/more_badges/<bruker>/<offset>?sort=unlocked&segment=<segment>` med `X-Requested-With`,
  52 merker per side. Første side kan i tillegg ha noen «Local Badges» øverst
- Fragmentet sier ikke hvilken kategori et merke har. Derfor hentes `segment=special` først, så `segment=all`

**Kode:** `parse.parseBadges`/`parseBadgeCounts`, `lib/badges.js` (klassifisering, sammenslåing på navn uten nivå,
gruppering), `history.syncBadges` (stopper på første kjente side), `store.loadBadges`/`saveBadges`,
`dashboard/badges.js`. Hentes etter Oppdater når merketallet på profilen er endret, hentingen er ufullstendig, eller det har gått en uke.

**Usikkert:** om merketallet på profilen øker når et merke går opp et nivå. Ukesgrensen fanger det uansett.

### Merker i sammenligningen

Kartlagt på tre venners merkesider (15. september 2026):

- Samme oppbygning og blaing som egen side, men **`.next-level` vises aldri på andres sider**
- Overskriften er «Your Badges» bare på egen side (`parse.parseBadgeListOwn`, lagret som `own`)
- Datoen kan også stå som «Thu, 04 Jun 2026 21:17:07 +0000», også på egen side. `parseBadgeDate` leser begge

**Maks nivå hos andre:** nivå ≥ 100 (100 er høyeste nivå på Untappd), eller samme nivå som ditt eget merke på maks.
`badges.compare` gir felles, bare du og bare vennen for maks nivå og spesialmerker. Den markerer hvem som tok merket først,
og har den andres nivå på radene med bare én av dere.

**Henting:** `dashboard/compare-badges.js` starter når vennen velges, etter landkoblingen, så det aldri går mer enn to
hentinger samtidig. Hentingen stoppes når en annen venn velges. Vennens merker lagres under `u:<venn>:badges`.

**Svakhet:** hos andre er et spesialmerke på nivå 1 (uten nivåboks) umulig å skille fra et engangsmerke, så det
kan telle som spesialmerke.

## Status

**Versjon 1.0.0 er ferdig bygget (11. september 2026).**

| Trinn | Status |
|---|---|
| 1 Forutsetninger | Testet i Firefox 153 og Chrome 152 (se under) |
| 2 Skjelett | Ikoner 16–128 px. Dashbordet åpnes fra ikonet og ved første installasjon |
| 3 Tolkning | `lib/parse.js`, tester mot oppdiktet `test/fixtures/sample-beers.html`. Valgfri test mot `private-beers.html` |
| 4 Henting og lagring | `lib/fetch.js`, `lib/store.js` (10 øyeblikksbilder, daglige totaltall), `test/store.test.js` |
| 5 Dashbord | Nøkkeltall, siste endring, bryggerier, land, stiler, siste øl, utvikling. Verifisert i forhåndsvisning med oppdiktede data |
| 6 Språk og innstillinger | `lib/i18n.js` (nb/en), `options/` |
| 7 Feiltilstander | Varsler for utlogget, sjekk, tidsavbrudd, manglende data og tilgang. Lagrede data vises fortsatt |
| 8 Distribusjon | `.github/workflows/release.yml`, `updates.json`, `scripts/update-manifest.js`. Signering venter på AMO-nøkler fra eier |
| 9 Sammenligning | Fanen «Sammenlign» |

Avvik fra planen:
- Skrifttyper: systemskrifter (Georgia for overskrifter), ingen pakkede fontfiler
- Språk: egen ordbok i `lib/i18n.js` i stedet for `_locales`. Chrome bruker `no` og Firefox `nb`, og brukeren skal kunne velge språk
- HTML settes via `lib/html.js` (automatisk escaping) i stedet for `innerHTML`
- Lint kjøres med `selfHosted`, fordi `update_url` er med for selvdistribusjon

### Trinn 1

**Trinn 1 er ferdig (11. september 2026).** Diagnosen (`dev/diagnose.html`) med samme manifest i begge nettlesere:

| Test | Firefox 153 | Chrome 152 |
|---|---|---|
| Tilgang til `untappd.com` | Gitt (etter klikk) | Gitt ved installering |
| Innlogget bruker via forsiden | `Lilfire` | `Lilfire` |
| Direkte henting fra utvidelsessiden | HTTP 200, ingen sjekk, 633 / 199 / 48, sum 2 711 | Samme |
| Henting via fane | OK på 1,2 s | OK på 0,9 s |
| Lagring ved besøk | OK | OK |

Rettet underveis: nedtrekkslistene bruker `id`, ikke `name`, og datoformatet i rå HTML (se over).

Merk: Via fane og ved besøk leses siden **etter** at Untappds JavaScript har gjort om datoene. Da mangler
klokkeslett (`firstAt`/`recentAt` = `null`), men dato og innsjekkings-ID er riktige. Dashbordet bruker direkte
henting som hovedkilde og lar fane og besøk bare fylle inn dato.

## Henting

1. **Direkte henting** fra dashbordsiden (`fetch` med innlogging, tolking med `DOMParser`).
   Den skjer i siden og ikke i bakgrunnen, fordi Chromes service worker ikke har `DOMParser`.
2. **Fane som reserve:** Hvis svaret mangler `brewery_picker`, åpnes ølsiden i en bakgrunnsfane.
   Et innholdsskript leser dataene, og fanen lukkes.
3. **Brukerhandling:** Innloggingsside eller sjekk fra Cloudflare → fanen flyttes fram med beskjed.
   Utvidelsen prøver **aldri** å omgå sjekker (ingen stealth, CAPTCHA-løsning eller proxy).
4. **Automatisk lagring:** Innholdsskriptet på `/user/*/beers` lagrer data hver gang brukeren selv besøker sin egen ølside.
5. **Automatisk oppdatering:** Er dataene eldre enn 6 timer (kan endres), hentes nye når dashbordet åpnes.
   Ingen tidsstyrt henting i bakgrunnen.

## Dashbord

- **Nøkkeltall:** innsjekkinger, unike øl, bryggerier, land, stiler, merker, venner
- **Bryggerier:** søk, filter på antall øl (1 / 2 / 3–4 / 5–9 / 10–19 / 20+), sortering, lenke til `untappd.com/brewery/<id>`
- **Land:** rangert liste med stolper
- **Stiler:** gruppert i familier (tekst før « - »), med mulighet til å klikke seg ned i hver familie
- **Merker:** maks nivå og spesialmerker gruppert etter år (se versjon 1.2)
- **Siste øl:** de 25 nyeste, din rangering mot den globale
- **Nytt siden sist:** nye bryggerier, land og stiler, og bryggerier som har fått flere øl
- **Utvikling over tid:** kurve over unike øl, bryggerier og land fra øyeblikksbildene
- **Status:** «Oppdatert for X min siden» og Oppdater-knapp
- **Fase 2:** sammenligning med en venn (felles og unike bryggerier, land og stiler)

## Teknisk

- Manifest V3 med ett manifest for begge: `background.scripts` (Firefox) og `background.service_worker` (Chrome)
- Tillatelser: `storage`, verter: `https://untappd.com/*`. Ingen andre verter, ingen `tabs`, ingen historikk
- `browser_specific_settings.gecko`: fast ID og `data_collection_permissions: none`
- Ren JavaScript, ingen avhengigheter i utvidelsen og ingen byggesteg. Egne SVG-diagrammer, skrifttyper pakket med
  (Mozilla tillater ikke kode eller ressurser lastet fra nettet)
- Liten shim: `const api = globalThis.browser ?? globalThis.chrome`
- Lagring (`storage.local`): siste fulle øyeblikksbilder (for eksempel 10) og daglige totaltall for kurven

### Filstruktur

```
dashboard-for-untappd/
  manifest.json
  background.js          åpner dashbordet, reserve via fane, tar imot data fra innholdsskriptet
  content.js             kjører på /user/*/beers, sender tolket data
  lib/
    api.js               shim for browser/chrome
    parse.js             tolking av ølsiden (bryggerier, stiler, land, profil, siste øl, brukernavn)
    store.js             øyeblikksbilder, sammenligning mot forrige, totaltall
    fetch.js             direkte henting, reserve via fane, gjenkjenning av innlogging og sjekk
  dashboard/
    index.html  dashboard.css  dashboard.js  charts.js
  options/               innstillinger (brukernavn, grense for oppdatering, nullstilling)
  _locales/nb/  _locales/en/
  icons/  fonts/
  test/
    parse.test.js        node --test mot fixtures/
    fixtures/            lagret kopi av ølsiden. INNEHOLDER PERSONLIGE DATA, ligger i .gitignore
  package.json           web-ext og testskript (bare utviklingsverktøy)
  README.md              installering, bruk, personvern, risiko etter Untappds vilkår
```

## Byggetrinn

1. **Test av forutsetninger:** at `fetch` sender med innloggingen fra utvidelsessiden i Firefox og Chrome, at brukernavnet gjenkjennes, og at samme manifest fungerer i begge
2. **Skjelett:** manifest, ikon, og at dashbordfanen åpnes. Kjøres med `web-ext run`
3. **Tolkning:** `parse.js` med tester. Tallene skal stemme: 633 / 199 / 48, sum 2 711
4. **Henting og lagring:** direkte henting, reserve via fane, øyeblikksbilder, sammenligning mot forrige
5. **Dashbord:** alle visningene over, lys og mørk modus
6. **Språk og innstillinger**
7. **Feiltilstander:** utlogget, sjekk, feil brukernavn, og at Untappd endrer siden sin (tydelig feilmelding, ikke tomme tall)
8. **Distribusjon:** `web-ext lint`, signering som unlisted på AMO (brukeren oppretter konto og legger inn nøkler selv), GitHub-release med `updates.json`, deretter Chrome
9. **Fase 2:** sammenligning med venner

## Testing

- `npm test`: tolkningstestene mot fixture
- Manuelt i Firefox og Chrome: innlogget, utlogget, reserve via fane, «nytt siden sist» etter ny innsjekking
- Nettverkspanelet: kall kun til untappd.com
- Test med en venns konto: riktig brukernavn og riktige data
- `web-ext lint` uten feil før hver release
