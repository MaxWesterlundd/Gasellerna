# Gasellerna

Webbplats för löparklubben Gasellerna (Göteborg). Statisk sajt (vanilla HTML/CSS/JS),
tänkt för GitHub Pages, med en GitHub Actions-pipeline som håller klubbstatistiken
uppdaterad utan någon databas. All historik ligger som JSON-filer i `data/`.

## Innehåll

- `index.html`, `stats.html` – sajtens två sidor (Hem, Statistik)
- `assets/` – CSS, JS, självhostat typsnitt, favicon-bilder
- `gasellerna_runner.svg` – logga/favicon (genererad placeholder, se nedan)
- `data/config.json` – klubb-id, widget-URL:er, tävlingsnedräkningar
- `data/activities.json` – **facit-liggaren**: varje deduplicerad aktivitet som någonsin hämtats
- `data/summary.json`, `data/winners.json`, `data/history/YYYY-Wxx.json` – härledd statistik som sajten läser
- `scripts/` – datapipelinen (Node, inga byggverktyg)
- `.github/workflows/scrape.yml` – daglig cron-körning

## Datapipeline: Plan B (widget-skrapning)

Klubben har valt bort Strava-API:et. Pipelinen bygger i stället på Stravas publika
inbäddningswidgets, samma iframe-koder som ligger på hemsidan:

- **Activity Widget** (`show_rides=true`) – de ~5 senaste aktiviteterna
- **Summary Widget** (`show_rides=false`) – veckans totalsumma, används som kontrollsiffra

Så här fungerar det:

1. `scripts/scrape.mjs` hämtar HTML:en för båda widgetsen (ingen inloggning behövs,
   de är publika) och parsar ut namn, distans, tid, höjdmeter och **datum** med `cheerio`.
2. Varje aktivitet har en unik Strava-aktivitets-ID inbäddad i länken
   (`strava.com/activities/<id>`). Det använder vi som deduplicerings­nyckel mot
   `data/activities.json` – enklare och säkrare än att para ihop namn+distans+tid.
3. Nya aktiviteter läggs till i liggaren. Eftersom widgeten bara visar de senaste
   ~5 aktiviteterna **måste** hämtningen ske dagligen, annars tappas data mellan körningarna.
4. `scripts/aggregate.mjs` bygger om all härledd statistik från liggaren från grunden
   varje gång (inte en inkrementell uppdatering), så resultatet är alltid konsekvent:
   - `data/history/YYYY-Wxx.json` per ISO-vecka (alla aktiviteter, ställning, vinnare)
   - `data/winners.json` (veckovinnare + antal veckosegrar per medlem)
   - `data/summary.json` (totaldistans i år, årsledare, flest veckovinster, veckoserien till diagrammet)
5. GitHub Actions-workflowet (`.github/workflows/scrape.yml`) kör båda skripten
   dagligen kl. 05:00 UTC och committar tillbaka `data/`-mappen om något ändrats.

### En avvikelse från originalplanen (till det bättre)

Planen antog samma begränsning som Stravas officiella API: inget datum, bara
förnamn + efternamnsinitial. **Widgeten ger faktiskt mer:** varje aktivitet har ett
fullständigt datum (`"Monday, May 11, 2026"`) och medlemmens fulla namn i den synliga
texten. Pipelinen använder därför aktivitetens verkliga datum för ISO-veckan, i stället
för hämtningsdatumet. `fetchedAt` sparas ändå per post, som spårbarhet.

### Om parsern slutar fungera

Strava kan när som helst ändra sin widget-markup, vilket är den största risken med
plan B. `scrape.mjs` är skrivet defensivt:

- Varje aktivitets-`<li>` valideras för sig. En trasig post loggas med
  `console.warn` (syns i Actions-loggen) och hoppas över i stället för att krascha hela körningen.
- Om `ul.activities` inte hittar några poster alls loggas en tydlig varning.
- Kontrollsiffran från summary-widgeten loggas varje körning (`data/control-log.json`),
  så du kan jämföra mot liggaren manuellt om något känns fel.

Om Strava byter markup helt: öppna en av widget-URL:erna i `data/config.json` direkt
i webbläsaren, "Visa källkod", och uppdatera CSS-selektorerna i `parseActivityWidget`
respektive `parseSummaryWidget` i `scripts/scrape.mjs`.

### Köra pipelinen lokalt

```bash
npm install
npm run scrape       # hämtar + deduplicerar mot data/activities.json
npm run aggregate    # bygger om summary.json, winners.json, data/history/
# eller båda i ett steg:
npm run update-data
```

## Konfiguration (`data/config.json`)

```json
{
  "club": {
    "id": "1572790",
    "activityWidgetUrl": "...",
    "summaryWidgetUrl": "..."
  },
  "countdowns": [
    { "id": "...", "name": "...", "location": "...", "date": "2027-05-09T09:30:00+02:00" }
  ]
}
```

Lägg till, ta bort eller ändra lopp i `countdowns`-listan för att uppdatera
nedräkningarna på startsidan (`assets/js/countdown.js` läser filen direkt, ingen
ombyggnad behövs). Datum anges med tidszon (`+02:00` för svensk sommartid).

## Köra sajten lokalt

Sajten är helt statisk, ingen build behövs:

```bash
python3 -m http.server 8080
# öppna http://localhost:8080
```

Med tom `data/`-mapp (ursprungsläget) visar statistiksidan vänliga tomma-lägen
i stället för ett trasigt diagram. Så fort pipelinen har kört en gång fylls
korten, diagrammet och tabellen i automatiskt.

## Publicera med GitHub Pages

1. Pusha repot till GitHub.
2. **Settings → Pages** → Source: `Deploy from a branch` → branch `main`, mapp `/ (root)`.
3. Vänta någon minut, sajten publiceras på `https://<user>.github.io/<repo>/`.
4. **Settings → Actions → General** → kontrollera att "Workflow permissions" är satt
   till "Read and write permissions", annars kan inte `scrape.yml` committa tillbaka data.

Inga GitHub Secrets behövs för plan B (ingen inloggning, inga nycklar).

## Om du senare vill byta till Strava API (plan A)

Widget-skrapning fungerar utan nycklar, men är känsligare för att Strava ändrar sin
HTML. Om ni någon gång vill byta till det officiella API:et i stället:

1. Skapa en app på [strava.com/settings/api](https://www.strava.com/settings/api)
   (kräver bara ett vanligt Strava-konto, gratis).
2. Gör OAuth-flödet **en gång** manuellt för att få en `refresh_token` med scope `read`:
   - Öppna `https://www.strava.com/oauth/authorize?client_id=DITT_CLIENT_ID&response_type=code&redirect_uri=http://localhost&scope=read`
   - Godkänn, kopiera `code`-parametern ur redirect-URL:en
   - Byt in den mot en refresh token:
     ```bash
     curl -X POST https://www.strava.com/oauth/token \
       -d client_id=DITT_CLIENT_ID \
       -d client_secret=DIN_CLIENT_SECRET \
       -d code=KODEN_FRÅN_STEGET_OVAN \
       -d grant_type=authorization_code
     ```
   - Spara `refresh_token` från svaret.
3. Lägg `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` och `STRAVA_REFRESH_TOKEN` som
   GitHub Secrets (**Settings → Secrets and variables → Actions**).
4. Ett nytt skript skulle behöva anropa `GET /api/v3/clubs/{CLUB_ID}/activities` med
   en access token som förnyas via refresh token vid varje körning, och samma
   dedupliceringslogik (fast med nyckeln `athlete+namn+distans+tid`, eftersom API:t
   varken ger datum eller fullständigt efternamn). Den nuvarande plan B-datan
   (`data/activities.json` osv.) har samma format oavsett källa, så sajten skulle
   inte behöva ändras.

## Loggan

`gasellerna_runner.svg` är en enkel genererad placeholder-logga (en löpande gasell
i klubbens orange/amber-palett), byggd som fyra platta SVG-former. Byt gärna ut den
mot en riktig logga senare, samma filnamn används som favicon på båda sidorna.
