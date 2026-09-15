# Dashboard for Untappd

Nettleserutvidelse for Firefox og Chrome som viser ditt eget Untappd-dashbord, hentet med innloggingen du allerede har i nettleseren.

**Ikke tilknyttet Untappd.** Utvidelsen kontakter bare untappd.com, har ingen sporing og lagrer dataene bare i nettleseren din.

## Hva du får

- **Nøkkeltall:** innsjekkinger, unike øl, bryggerier, land, stiler, merker og venner
- **Bryggerier:** søk, filter på antall øl og sortering, med lenke til bryggerisiden på Untappd
- **Land og stiler:** rangert, med stiler gruppert i familier
- **Merker:** et troféskap med merkene du har tatt til maks nivå, og spesialmerker (eventer, høytider, kampanjer) gruppert etter år
- **Siste øl:** de 25 nyeste, med din rangering mot den globale
- **Utvikling:** kurve over unike øl, bryggerier, land og stiler over tid
- **År:** årsoppsummering for hvert år, i stil med Recappd
- **Sammenlign:** felles bryggerier, land og stiler med en venn, og året side om side
- Norsk og engelsk

Tallene er unike øl, ikke innsjekkinger.

## Årsoppsummering

Fanen **År** viser, for hvert år: nye øl, nye bryggerier og nye stiler, snittrangering mot Untappds snitt,
snitt alkoholstyrke og sterkeste øl, best og lavest rangerte, topp 5, mest drukne stiler og bryggerier,
første og siste øl i året, og stolper per måned og ukedag.

Dette krever hele ølhistorikken din, og Untappd gir bare 25 øl om gangen. Første henting tar noen minutter
(én side i sekundet og et halvt), og du kan stoppe underveis — det som er hentet, blir lagret. Senere hentes
bare det som er nytt. Historikken lagres bare i nettleseren din.

Under **Sammenlign** kan du hente en venns historikk på samme måte og se året side om side, med antall øl
dere begge har hatt det året.

Tallene er øl du smakte **for første gang** det året. Untappds egen Recappd teller alle unike øl du sjekket
inn i året, også gjengangere, så tallene vil avvike noe. Steder, byer og gjentatte innsjekkinger
finnes ikke i ølhistorikken, og er derfor ikke med. Årets spesialmerker og merker tatt til maks nivå vises
når merkene er hentet under **Merker**.

## Merker

Fanen **Merker** viser bare merkene som er verdt å vise frem: merker tatt til **maks nivå** (ingen flere nivåer
å låse opp) og **spesialmerker** fra Untappds egen kategori. Merker på et mellomnivå vises ikke. Første henting
leser hele merkelisten, 52 merker per side med pause mellom hver. Senere hentes den bare når merketallet på
profilen har endret seg, eller når det har gått en uke. Da hentes bare det nye. Merkebildene lastes fra
`assets.untappd.com`.

Under **Sammenlign** hentes vennens merker automatisk, og du ser maks nivå og spesialmerker felles, bare hos deg
og bare hos vennen, med hvem som tok merket først. Untappd viser ikke om en venn kan gå videre på et merke. Hos
vennen regnes derfor nivå 100 som maks, i tillegg til merker der du selv er på maks.

## Installer

### Firefox
1. Last ned siste `dashboard-for-untappd-<versjon>.xpi` fra [Releases](https://github.com/lilfire/dashboard-for-untappd/releases)
2. Firefox spør om du vil legge til utvidelsen. Trykk **Legg til**
3. Nye versjoner installeres automatisk

### Chrome
1. Last ned siste `dashboard-for-untappd-chrome-<versjon>.zip` fra [Releases](https://github.com/lilfire/dashboard-for-untappd/releases) og pakk den ut
2. Gå til `chrome://extensions`, slå på **Utviklermodus** og trykk **Last inn upakket**
3. Velg den utpakkede mappen

Chrome-versjonen oppdateres ikke automatisk. Gjenta stegene når det kommer en ny versjon.

## Bruk

1. Logg inn på [untappd.com](https://untappd.com) i samme nettleser
2. Klikk på utvidelsesikonet. Dashbordet henter ølhistorikken din
3. Trykk **Oppdater** for ferske tall. Dataene oppdateres også automatisk når de er eldre enn 6 timer, og når du selv åpner ølsiden din på Untappd

Under **Innstillinger** kan du velge brukernavn, språk og hvor ofte dataene skal oppdateres, og slette alle lagrede data.

### Feilsøking
- **«Du er ikke logget inn»:** logg inn på untappd.com i samme nettleser og trykk Oppdater
- **«Untappd ba om en sjekk»:** fullfør sjekken i fanen som åpnes, og trykk Oppdater. Utvidelsen prøver aldri å omgå slike sjekker
- **Diagnose:** Innstillinger → lenken **Diagnose** nederst tester henting steg for steg

## Personvern

- Utvidelsen gjør vanlige sidevisninger av ølsiden din, med din innlogging, bare når du ber om det eller dataene er gamle
- Dataene lagres i nettleserens lagring for utvidelser og sendes ingen andre steder
- Den har bare tilgang til `untappd.com`

## Bruk på egen risiko

Untappds vilkår er strenge på automatisering. Utvidelsen henter én side om gangen, som når du selv besøker den, men bruk skjer på eget ansvar.

## Utvikling

```bash
npm install
npm test        # tester for tolking og lagring
npm run lint    # web-ext lint (selvdistribuert)
```

Last inn midlertidig: Firefox `about:debugging#/runtime/this-firefox` → **Last inn midlertidig tillegg** → `manifest.json`.
Chrome: `chrome://extensions` → **Last inn upakket** → prosjektmappen.

Legg gjerne en kopi av din egen ølside som `test/fixtures/private-beers.html` for en ekstra test mot ekte data. Filen ignoreres av git.

### Ny versjon

Engangsoppsett: lag API-nøkler på [addons.mozilla.org](https://addons.mozilla.org/developers/addon/api/key/) og legg dem inn som repo-hemmelighetene `AMO_JWT_ISSUER` og `AMO_JWT_SECRET` (Settings → Secrets and variables → Actions).

1. Øk `version` i `manifest.json` og commit
2. `git tag v<versjon>` og `git push origin v<versjon>`
3. GitHub Actions tester, signerer for Firefox (unlisted), lager Chrome-zip, publiserer releasen og oppdaterer `updates.json`
