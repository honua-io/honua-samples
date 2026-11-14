import assert from 'node:assert/strict';
import test from 'node:test';
import { LIVE_FEEDS, describeAge, feedState, parseFeed, parseNwsAlerts, parseTideGauge, parseUsgsGauge } from '../public/live-feeds.js';

const feed = (id) => LIVE_FEEDS.find((entry) => entry.id === id);
const alert = (event, same) => ({ properties: { event, geocode: { SAME: same } } });

test('NWS alerts keep only Maui County and name each event once', () => {
  const result = parseNwsAlerts({ updated: '2026-11-14T17:05:04+00:00', features: [
    alert('High Surf Advisory', ['015009', '015001']), alert('High Surf Advisory', ['015009']), alert('Wind Advisory', ['015003']),
  ] });
  assert.equal(result.observedAt.toISOString(), '2026-11-14T17:05:04.000Z');
  assert.equal(result.summary, '2 active for Maui County: High Surf Advisory');
  assert.equal(parseNwsAlerts({ updated: '2026-11-14T17:05:04Z', features: [] }).summary, 'No active alerts for Maui County');
  assert.throws(() => parseNwsAlerts({ features: [] }), /NWS feed update time/);
});

test('USGS gauge reports the latest flow and stage and skips no-data sentinels', () => {
  const series = (code, values) => ({ variable: { variableCode: [{ value: code }] }, values: [{ value: values }] });
  const result = parseUsgsGauge({ value: { timeSeries: [
    series('00060', [{ value: '70.1', dateTime: '2026-11-14T06:35:00.000-10:00' }, { value: '69.3', qualifiers: ['P', 'e'], dateTime: '2026-11-14T06:50:00.000-10:00' }]),
    series('00065', [{ value: '0.99', qualifiers: ['P'], dateTime: '2026-11-14T06:50:00.000-10:00' }]),
  ] } });
  assert.equal(result.observedAt.toISOString(), '2026-11-14T16:50:00.000Z');
  assert.equal(result.summary, '69.3 ft³/s · gage 0.99 ft · provisional');
  assert.equal(parseUsgsGauge({ value: { timeSeries: [series('00060', [{ value: '-999999', dateTime: '2026-11-14T06:50:00-10:00' }]),
    series('00065', [{ value: '1.02', dateTime: '2026-11-14T06:50:00-10:00' }])] } }).summary, 'gage 1.02 ft');
  assert.throws(() => parseUsgsGauge({ value: { timeSeries: [] } }), /no current reading/);
});

test('NOAA tide gauge reads GMT times and surfaces API errors', () => {
  const result = parseTideGauge({ data: [{ t: '2026-11-14 17:00', v: '2.329', q: 'p' }] });
  assert.equal(result.observedAt.toISOString(), '2026-11-14T17:00:00.000Z');
  assert.equal(result.summary, '2.33 ft above MLLW · preliminary');
  assert.throws(() => parseTideGauge({ error: { message: 'No data was found.' } }), /No data was found/);
  assert.throws(() => parseTideGauge({ data: [] }), /no current reading/);
});

test('feed state shows age, Hawaii update time and a stale warning past the cadence', () => {
  const observedAt = new Date('2026-11-14T17:00:00Z');
  const current = feedState(feed('tide'), { observedAt, summary: '2.33 ft above MLLW' }, observedAt.getTime() + 90_000);
  assert.deepEqual(current, { age: '90 s', stale: false, detail: '2.33 ft above MLLW · updated Nov 14, 07:00 HST' });
  const stale = feedState(feed('tide'), { observedAt, summary: '2.33 ft' }, observedAt.getTime() + 45 * 60_000);
  assert.equal(stale.age, '45 min');
  assert.equal(stale.stale, true);
  assert.match(stale.detail, /stale: expected within 30 min$/);
  const failed = feedState(feed('usgs'), { error: 'HTTP 503' }, Date.now());
  assert.deepEqual(failed, { age: 'n/a', stale: true, detail: 'Unavailable: HTTP 503. Check U.S. Geological Survey directly.' });
});

test('a malformed agency payload reads as an unexpected response, not a network failure', () => {
  assert.match(parseFeed(feed('nws'), { updated: '2026-11-14T17:05:04Z', features: [{ properties: null }] }).error,
    /^unexpected response from National Weather Service \(/);
  assert.match(parseFeed(feed('tide'), { data: [{ v: '1.0' }] }).error, /^unexpected response from NOAA CO-OPS/);
  assert.equal(parseFeed(feed('tide'), { data: [{ t: '2026-11-14 17:00', v: '1.0' }] }).summary, '1.00 ft above MLLW');
});

test('ages switch units at two minutes and two hours', () => {
  assert.equal(describeAge(-5_000), '0 s');
  assert.equal(describeAge(119_000), '119 s');
  assert.equal(describeAge(120_000), '2 min');
  assert.equal(describeAge(3 * 3600_000), '3 h');
});
