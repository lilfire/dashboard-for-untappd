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

## Status

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
