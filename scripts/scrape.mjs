// Plan B data pipeline: scrapes Strava's public embed widgets (no API, no login).
// Run daily. The activity widget only shows the ~5 latest activities, so
// infrequent runs would lose data between fetches.
//
// Writes new activities into data/activities.json (the full deduped ledger).
// Run scripts/aggregate.mjs afterwards to rebuild the derived summary files.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';
import { isoWeekOf, parseKm, parseMeters, parseDurationToSeconds, parseWidgetDate } from './lib.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = path.join(ROOT, 'data');
const LEDGER_PATH = path.join(DATA_DIR, 'activities.json');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const CONTROL_LOG_PATH = path.join(DATA_DIR, 'control-log.json');

const USER_AGENT = 'Mozilla/5.0 (compatible; GasellernaDataBot/1.0)';

async function fetchHtml(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9' }
  });
  if (!res.ok) throw new Error(`Fetch failed (HTTP ${res.status}) for ${url}`);
  return res.text();
}

function parseActivityWidget(html, fetchedAt) {
  const $ = load(html);
  const items = $('ul.activities > li');

  if (!items.length) {
    console.warn(
      '[scrape] WARNING: activity widget returned 0 items. Either the club has no recent ' +
      'activity, or Strava changed the widget markup and the parser needs updating. ' +
      'Check assets against README.md > "Om parsern slutar fungera".'
    );
  }

  const activities = [];
  items.each((_, el) => {
    const li = $(el);
    const athleteHref = li.find('a.avatar').attr('href') || '';
    const athleteIdMatch = athleteHref.match(/\/athletes\/(\d+)/);
    const athleteName = li.find('.athlete-name').text().trim();

    const activityHref = li.find('h3 a').attr('href') || '';
    const activityIdMatch = activityHref.match(/\/activities\/(\d+)/);
    const title = (li.find('h3 a').attr('title') || li.find('h3 a').text() || '').trim();

    const statEls = li.find('ul.stats > li');
    const distanceText = statEls.eq(0).text().trim();
    const timeText = statEls.eq(1).text().trim();
    const elevationText = statEls.eq(2).text().trim();
    const timestampText = li.find('.timestamp').text().trim();

    const distanceKm = parseKm(distanceText);
    const movingTimeSec = parseDurationToSeconds(timeText);
    const elevationM = parseMeters(elevationText);
    const activityDate = parseWidgetDate(timestampText);

    const isValid = athleteName && activityIdMatch && distanceKm !== null &&
      activityDate && !Number.isNaN(activityDate.getTime());

    if (!isValid) {
      console.warn('[scrape] Skipping an activity entry that did not parse cleanly:', {
        athleteName, activityHref, distanceText, timeText, timestampText
      });
      return;
    }

    activities.push({
      id: activityIdMatch[1],
      athleteId: athleteIdMatch ? athleteIdMatch[1] : null,
      athleteName,
      title,
      distanceKm,
      movingTimeSec,
      elevationM,
      date: activityDate.toISOString().slice(0, 10),
      isoWeek: isoWeekOf(activityDate),
      fetchedAt
    });
  });

  return activities;
}

function parseSummaryWidget(html) {
  const $ = load(html);
  const weekLabel = $('.header h2.compact').text().replace(/\s+/g, ' ').trim();
  const stats = {};

  $('.list-stats .stat').each((_, el) => {
    const label = $(el).find('.stat-subtext').text().replace(/\s+/g, ' ').trim();
    const valueText = $(el).find('.stat-text').text().replace(/\s+/g, ' ').trim();
    stats[label] = valueText;
  });

  const activitiesCount = stats.Activities ? parseInt(stats.Activities, 10) : null;
  const distanceKm = parseKm(stats.Distance);
  let timeSec = null;
  if (stats.Time) {
    const m = stats.Time.match(/(?:(\d+)h)?\s*(?:(\d+)m)?/);
    if (m) timeSec = parseInt(m[1] || '0', 10) * 3600 + parseInt(m[2] || '0', 10) * 60;
  }
  const elevationM = parseMeters(stats.Elevation);

  if (activitiesCount === null || distanceKm === null) {
    console.warn('[scrape] WARNING: summary widget did not parse cleanly. Raw stats:', stats);
  }

  return { weekLabel, activitiesCount, distanceKm, timeSec, elevationM };
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function main() {
  const config = await readJson(CONFIG_PATH, null);
  if (!config || !config.club || !config.club.activityWidgetUrl || !config.club.summaryWidgetUrl) {
    throw new Error('data/config.json is missing club.activityWidgetUrl / club.summaryWidgetUrl.');
  }

  const fetchedAt = new Date().toISOString().slice(0, 10);

  const [activityHtml, summaryHtml] = await Promise.all([
    fetchHtml(config.club.activityWidgetUrl),
    fetchHtml(config.club.summaryWidgetUrl)
  ]);

  const scraped = parseActivityWidget(activityHtml, fetchedAt);
  const controlReading = parseSummaryWidget(summaryHtml);

  console.log(`[scrape] Parsed ${scraped.length} activities from the widget (fetched ${fetchedAt}).`);
  console.log('[scrape] Summary widget control reading:', controlReading);

  const ledger = await readJson(LEDGER_PATH, []);
  const seenIds = new Set(ledger.map((a) => a.id));
  const fresh = scraped.filter((a) => !seenIds.has(a.id));

  if (fresh.length) {
    const updated = ledger.concat(fresh)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    await fs.writeFile(LEDGER_PATH, JSON.stringify(updated, null, 2) + '\n');
    console.log(`[scrape] Added ${fresh.length} new activities to the ledger (${updated.length} total).`);
  } else {
    console.log('[scrape] No new activities since the last run.');
  }

  const controlLog = await readJson(CONTROL_LOG_PATH, []);
  controlLog.push({ fetchedAt, ...controlReading });
  await fs.writeFile(CONTROL_LOG_PATH, JSON.stringify(controlLog.slice(-90), null, 2) + '\n');
}

main().catch((err) => {
  console.error('[scrape] Fatal error:', err);
  process.exitCode = 1;
});
