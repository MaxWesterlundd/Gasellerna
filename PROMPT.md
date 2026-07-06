# Bygg Gasellernas klubbsida

Bygg en komplett webbplats för löparklubben Gasellerna (Göteborg) i den här mappen.

## Översikt

Statisk webbplats (vanilla HTML/CSS/JS eller Astro) som deployas på GitHub Pages, med GitHub Actions som datapipeline mot Strava API. All historik sparas som JSON-filer i repot — ingen databas behövs.

## Design

- Färgtema: orange/amber (#E8933A, #D97E2B, cream #FFF8EC) — samma palett som loggan
- Använd `gasellerna_runner.svg` (ligger i mappen) som logga och favicon
- Mobilvänlig, sportig känsla. Tagline: "Göteborgs största, framgångsrikaste och snabbaste löparklubb"

## Sidor/sektioner

1. **Hem**: logga, lanseringstext (se nedan), Stravas inbäddade widgets (iframe-koder, se "Att fylla i"), event-countdowns
2. **Statistik**:
   - Total distans för gruppen i år (YTD)
   - Årsledare: vem har sprungit längst i år
   - Flest veckovinster: vem har vunnit flest veckoleaderboards
   - Veckohistorik: tabell + linjediagram (Chart.js) över gruppens km/vecka, med veckans vinnare markerad
3. **Countdowns** (konfigurerbara i `config.json`, uppdateras live med JS, visa dagar/timmar/minuter):
   - Copenhagen Marathon: 2027-05-09 09:30
   - Göteborgsvarvet: 2027-05-22 13:00

## Datapipeline (viktigt)

Obs: Strava API:et är gratis för alla konton — skapa en app på strava.com/settings/api. Detta är den primära lösningen (plan A). Om jag uttryckligen väljer bort API:et, använd plan B längre ner.

- Hämta klubbaktiviteter via Strava API: `GET /api/v3/clubs/{CLUB_ID}/activities`
- **Känd begränsning**: endpointen returnerar INTE datum för aktiviteter, och bara förnamn + efternamnsinitial. Lös det så här:
  - GitHub Action körs dagligen (cron, plus manuell trigger) och hämtar aktiviteterna
  - Deduplicera mot redan sparade aktiviteter med nyckel `(athlete, name, distance, moving_time)`
  - Nya aktiviteter taggas med körningens datum och ISO-vecka
  - Aggregera per vecka till `data/history/YYYY-Wxx.json`; bygg en sammanställd `data/summary.json` som sajten läser
- Veckovinnare = flest km under ISO-veckan; spara löpande i `data/winners.json` (grund för "flest veckovinster")
- Strava OAuth: `client_id`, `client_secret`, `refresh_token` som GitHub Secrets; skriptet förnyar access token vid varje körning
- Committa uppdaterad data tillbaka till repot från workflow:en

## Plan B: datainsamling utan API (widget-skrapning)

Om jag väljer bort API:et: bygg pipelinen på Stravas publika inbäddningswidgets i stället.

- Widget-iframens `src`-URL (t.ex. `https://www.strava.com/clubs/{CLUB_ID}/latest-rides/{TOKEN}?show_rides=true`) är publikt åtkomlig utan inloggning — hämta HTML:en med ett skript i GitHub Actions
- Hämta DAGLIGEN (inte veckovis): aktivitetswidgeten visar bara de senaste ~5 aktiviteterna, så gles hämtning tappar data
- Parsa medlemsnamn, distans och tid ur HTML:en; deduplicera precis som i plan A och tagga med hämtningsdatum/ISO-vecka
- Parsa även summary-widgeten för veckans aggregat som kontrollsiffra
- Bygg parsern defensivt (Strava kan ändra markup) och logga tydligt fel i workflow:en när parsning misslyckas
- Samma output-format som plan A (`data/history/`, `data/summary.json`, `data/winners.json`) så att sajten inte påverkas av vilket dataläge som används

## README ska innehålla

- Hur man skapar en Strava API-app (strava.com/settings/api)
- Hur man gör OAuth-flödet en gång för att få refresh token (scope: `read`)
- Hur man lägger in GitHub Secrets och aktiverar GitHub Pages

## Att fylla i (fråga mig om värden saknas)

- `STRAVA_CLUB_ID`: <fyll i — syns i klubbens URL på strava.com/clubs/...>
- Iframe-koder från Strava (Activity Widget + Summary Widget): <klistra in>

## Lanseringstext

> Idag skriver vi historia i Göteborgs mest framgångsrika löparklubb. NUNNA Runclub är ett minne blott — från och med nu springer vi under ett nytt namn: **Gasellerna**. Snabbare, stoltare, svettigare. #welcometothebigleagues

## Leverans

- Initiera git-repo och committa
- GitHub Actions workflow för daglig datahämtning
- Verifiera att sajten fungerar lokalt både utan data (tomma states) och med exempeldata
