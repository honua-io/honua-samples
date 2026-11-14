// Live public feeds for Maui County, read directly from the publishing agencies.
const MAUI_COUNTY_SAME = '015009';
const MINUTE = 60_000;
const REQUEST_TIMEOUT_MS = 15_000;
const REFRESH_MS = 5 * MINUTE;
const AGE_TICK_MS = 15_000;
const HAWAII_TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Pacific/Honolulu', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
});

export function parseNwsAlerts(body) {
  const alerts = (body.features ?? [])
    .map(({ properties }) => properties)
    .filter((alert) => alert.geocode?.SAME?.includes(MAUI_COUNTY_SAME));
  const events = [...new Set(alerts.map((alert) => alert.event))];
  return {
    observedAt: requireTime(body.updated, 'NWS feed update time'),
    summary: alerts.length ? `${alerts.length} active for Maui County: ${events.join(', ')}` : 'No active alerts for Maui County',
  };
}

export function parseUsgsGauge(body) {
  const series = body.value?.timeSeries ?? [];
  const latest = (code) => {
    const values = series.find((entry) => entry.variable?.variableCode?.[0]?.value === code)?.values?.[0]?.value ?? [];
    const reading = values.at(-1);
    return reading && Number(reading.value) > -999_999 ? reading : null;
  };
  const flow = latest('00060');
  const stage = latest('00065');
  const reading = flow ?? stage;
  if (!reading) throw new Error('USGS returned no current reading');
  const parts = [flow && `${flow.value} ft³/s`, stage && `gage ${stage.value} ft`].filter(Boolean);
  const provisional = reading.qualifiers?.includes('P') ? ' · provisional' : '';
  return { observedAt: requireTime(reading.dateTime, 'USGS reading time'), summary: `${parts.join(' · ')}${provisional}` };
}

export function parseTideGauge(body) {
  if (body.error) throw new Error(body.error.message ?? 'NOAA returned an error');
  const reading = body.data?.at(-1);
  if (!reading) throw new Error('NOAA returned no current reading');
  const preliminary = reading.q === 'p' ? ' · preliminary' : '';
  return {
    observedAt: requireTime(`${reading.t.replace(' ', 'T')}:00Z`, 'NOAA reading time'),
    summary: `${Number(reading.v).toFixed(2)} ft above MLLW${preliminary}`,
  };
}

function requireTime(value, label) {
  const time = new Date(value);
  if (!value || Number.isNaN(time.getTime())) throw new Error(`Missing ${label}`);
  return time;
}

export const LIVE_FEEDS = [
  {
    id: 'nws', label: 'NWS active alerts · Maui County', agency: 'National Weather Service',
    url: 'https://api.weather.gov/alerts/active?area=HI', staleAfterMs: 15 * MINUTE, parse: parseNwsAlerts,
  },
  {
    id: 'usgs', label: 'USGS 16604500 · Wailuku River at Kepaniwai Park', agency: 'U.S. Geological Survey',
    url: 'https://waterservices.usgs.gov/nwis/iv/?format=json&sites=16604500&parameterCd=00060,00065&siteStatus=all',
    staleAfterMs: 2 * 60 * MINUTE, parse: parseUsgsGauge,
  },
  {
    id: 'tide', label: 'NOAA tide gauge · Kahului Harbor 1615680', agency: 'NOAA CO-OPS',
    url: 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?station=1615680&product=water_level&datum=MLLW&units=english&time_zone=gmt&format=json&date=latest&application=honua_samples',
    staleAfterMs: 30 * MINUTE, parse: parseTideGauge,
  },
];

export function describeAge(ageMs) {
  const seconds = Math.max(0, Math.round(ageMs / 1000));
  if (seconds < 120) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 120 ? `${minutes} min` : `${Math.floor(minutes / 60)} h`;
}

export function feedState(feed, result, now) {
  if (result.error) return { age: 'n/a', stale: true, detail: `Unavailable: ${result.error}. Check ${feed.agency} directly.` };
  const ageMs = now - result.observedAt.getTime();
  const stale = ageMs > feed.staleAfterMs;
  const updated = `updated ${HAWAII_TIME.format(result.observedAt)} HST`;
  const warning = stale ? ` · stale: expected within ${describeAge(feed.staleAfterMs)}` : '';
  return { age: describeAge(ageMs), stale, detail: `${result.summary} · ${updated}${warning}` };
}

async function fetchJson(url) {
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), headers: { Accept: 'application/json, application/geo+json' } });
  } catch (error) {
    throw new Error(error.name === 'TimeoutError' ? 'no response within 15 s' : 'network request failed');
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json().catch(() => { throw new Error('response was not JSON'); });
}

export function parseFeed(feed, body) {
  try {
    return feed.parse(body);
  } catch (error) {
    return { error: `unexpected response from ${feed.agency} (${error.message})` };
  }
}

async function readFeed(feed) {
  try {
    return parseFeed(feed, await fetchJson(feed.url));
  } catch (error) {
    return { error: error.message };
  }
}

function renderFeed(row, feed, result) {
  const state = feedState(feed, result, Date.now());
  const age = row.querySelector('.age');
  age.textContent = state.age;
  age.classList.toggle('stale', state.stale);
  const detail = row.querySelector('small');
  if (detail.textContent !== state.detail) detail.textContent = state.detail;
  row.dataset.state = result.error ? 'error' : state.stale ? 'stale' : 'current';
}

export function mountLiveFeeds(container) {
  const rows = LIVE_FEEDS.map((feed) => {
    const row = document.createElement('div');
    row.className = 'feed';
    row.dataset.feed = feed.id;
    row.dataset.state = 'loading';
    const label = document.createElement('a');
    label.href = feed.url;
    label.rel = 'noopener';
    label.textContent = feed.label;
    const age = document.createElement('span');
    age.className = 'age';
    age.setAttribute('aria-hidden', 'true');
    const detail = document.createElement('small');
    detail.textContent = `Reading ${feed.agency}…`;
    row.append(label, age, detail);
    container.append(row);
    return { row, feed, result: null };
  });
  const refresh = () => rows.forEach(async (entry) => {
    entry.result = await readFeed(entry.feed);
    renderFeed(entry.row, entry.feed, entry.result);
  });
  refresh();
  setInterval(refresh, REFRESH_MS);
  setInterval(() => rows.forEach((entry) => entry.result && renderFeed(entry.row, entry.feed, entry.result)), AGE_TICK_MS);
}

const container = globalThis.document?.getElementById('liveFeeds');
if (container) mountLiveFeeds(container);
