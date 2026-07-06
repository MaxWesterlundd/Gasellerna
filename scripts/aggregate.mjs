// Rebuilds every derived data file from the activities ledger (data/activities.json).
// Full recompute on every run rather than incremental patching, so the output is always
// consistent with the ledger regardless of how scrape.mjs was interrupted or re-run.
//
// Produces:
//   data/history/YYYY-Wxx.json  (per-week detail: activities, standings, winner)
//   data/winners.json           (weekly winners + running win-count per athlete)
//   data/summary.json           (YTD total, year leader, most weekly wins, chart/table feed)

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isoWeekOf, isoWeekStart, isoDateStr } from './lib.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = path.join(ROOT, 'data');
const LEDGER_PATH = path.join(DATA_DIR, 'activities.json');
const HISTORY_DIR = path.join(DATA_DIR, 'history');
const WINNERS_PATH = path.join(DATA_DIR, 'winners.json');
const SUMMARY_PATH = path.join(DATA_DIR, 'summary.json');

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function athleteKeyOf(activity) {
  return activity.athleteId || activity.athleteName;
}

function weekNumberLabel(isoWeek) {
  const [, weekPart] = isoWeek.split('-W');
  return `v.${parseInt(weekPart, 10)}`;
}

function pickLeader(totals) {
  let best = null;
  for (const entry of totals.values()) {
    if (!best || entry.km > best.km || (entry.km === best.km && entry.name.localeCompare(best.name) < 0)) {
      best = entry;
    }
  }
  return best;
}

async function main() {
  const ledger = await readJson(LEDGER_PATH, []);
  const now = new Date();
  const generatedAt = now.toISOString();
  const currentIsoWeek = isoWeekOf(now);
  const currentYear = now.getUTCFullYear();

  await fs.mkdir(HISTORY_DIR, { recursive: true });

  const byWeek = new Map();
  for (const activity of ledger) {
    if (!byWeek.has(activity.isoWeek)) byWeek.set(activity.isoWeek, []);
    byWeek.get(activity.isoWeek).push(activity);
  }

  const winnersWeeks = {};
  const winCounts = {};
  const summaryWeeks = [];

  const sortedWeeks = [...byWeek.keys()].sort();

  for (const isoWeek of sortedWeeks) {
    const weekActivities = byWeek.get(isoWeek);
    const totals = new Map();
    for (const activity of weekActivities) {
      const key = athleteKeyOf(activity);
      const entry = totals.get(key) || { name: activity.athleteName, km: 0 };
      entry.km += activity.distanceKm;
      totals.set(key, entry);
    }

    const standings = [...totals.values()]
      .sort((a, b) => b.km - a.km || a.name.localeCompare(b.name))
      .map((e) => ({ name: e.name, km: Math.round(e.km * 100) / 100 }));

    const winner = pickLeader(totals);
    const totalKm = Math.round(weekActivities.reduce((sum, a) => sum + a.distanceKm, 0) * 100) / 100;
    const monday = isoWeekStart(new Date(`${weekActivities[0].date}T00:00:00Z`));
    const sunday = new Date(monday.getTime());
    sunday.setUTCDate(sunday.getUTCDate() + 6);
    const isPartial = isoWeek === currentIsoWeek;

    await fs.writeFile(
      path.join(HISTORY_DIR, `${isoWeek}.json`),
      JSON.stringify({
        isoWeek,
        weekLabel: weekNumberLabel(isoWeek),
        startDate: isoDateStr(monday),
        endDate: isoDateStr(sunday),
        totalKm,
        winner: winner ? winner.name : null,
        isPartial,
        standings,
        activities: weekActivities
      }, null, 2) + '\n'
    );

    if (winner) {
      winnersWeeks[isoWeek] = { winner: winner.name, km: Math.round(winner.km * 100) / 100, standings };
      if (!isPartial) {
        winCounts[winner.name] = (winCounts[winner.name] || 0) + 1;
      }
    }

    summaryWeeks.push({
      isoWeek,
      weekLabel: weekNumberLabel(isoWeek),
      startDate: isoDateStr(monday),
      totalKm,
      winner: winner ? winner.name : null,
      isPartial
    });
  }

  await fs.writeFile(
    WINNERS_PATH,
    JSON.stringify({ generatedAt, weeks: winnersWeeks, winCounts }, null, 2) + '\n'
  );

  const ytdTotals = new Map();
  let ytdKm = 0;
  for (const activity of ledger) {
    if (new Date(`${activity.date}T00:00:00Z`).getUTCFullYear() !== currentYear) continue;
    ytdKm += activity.distanceKm;
    const key = athleteKeyOf(activity);
    const entry = ytdTotals.get(key) || { name: activity.athleteName, km: 0 };
    entry.km += activity.distanceKm;
    ytdTotals.set(key, entry);
  }

  const yearLeaderRaw = pickLeader(ytdTotals);
  const yearLeader = yearLeaderRaw
    ? { name: yearLeaderRaw.name, totalKm: Math.round(yearLeaderRaw.km * 100) / 100 }
    : null;

  let mostWeeklyWins = null;
  for (const [name, wins] of Object.entries(winCounts)) {
    if (!mostWeeklyWins || wins > mostWeeklyWins.wins || (wins === mostWeeklyWins.wins && name.localeCompare(mostWeeklyWins.name) < 0)) {
      mostWeeklyWins = { name, wins };
    }
  }

  await fs.writeFile(
    SUMMARY_PATH,
    JSON.stringify({
      generatedAt,
      ytd: { year: currentYear, totalKm: Math.round(ytdKm * 100) / 100 },
      yearLeader,
      mostWeeklyWins,
      weeks: summaryWeeks
    }, null, 2) + '\n'
  );

  console.log(`[aggregate] Rebuilt ${sortedWeeks.length} week file(s), winners.json and summary.json.`);
}

main().catch((err) => {
  console.error('[aggregate] Fatal error:', err);
  process.exitCode = 1;
});
