# Dashboard for Untappd

Nettleserutvidelse for Firefox og Chrome som viser ditt eget Untappd-dashbord: bryggerier, land og stiler,
hentet med innloggingen du allerede har i nettleseren.

**Ikke tilknyttet Untappd.** Utvidelsen kontakter bare untappd.com, har ingen sporing og sender ingen data noe annet sted.

> Under utvikling. Se [PLAN.md](PLAN.md).

## Prøv den (utvikling)

### Firefox
1. Gå til `about:debugging#/runtime/this-firefox`
2. Trykk **Last inn midlertidig tillegg …** og velg `manifest.json` i denne mappen
3. Klikk på utvidelsesikonet i verktøylinjen (eventuelt via puslespillikonet)

Midlertidige tillegg forsvinner når Firefox startes på nytt.

### Chrome
1. Gå til `chrome://extensions` og slå på **Utviklermodus**
2. Trykk **Last inn upakket** og velg denne mappen
3. Klikk på utvidelsesikonet i verktøylinjen

## Utvikling

```bash
npm install
npm run lint
```

## Bruk på egen risiko

Utvidelsen gjør vanlige sidevisninger av din egen ølside, og bare når du ber om det eller dataene er gamle.
Untappds vilkår er strenge på automatisering. Bruk skjer på eget ansvar.
