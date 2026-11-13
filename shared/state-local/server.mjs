// The Honua server and map archives the state-local journeys read from, chosen at build time.
export const SERVER_SETTING = 'VITE_STATE_LOCAL_SERVER';
export const BASEMAP_SETTING = 'VITE_STATE_LOCAL_BASEMAP';
export const ISLAND_DATA_SETTING = 'VITE_STATE_LOCAL_ISLAND_DATA';
export const DEFAULT_SERVER = 'https://demo.honua.io';
export const BASEMAP_ROUTE = '/api/v1/tiles/pmtiles/maui-basemap';
export const DEFAULT_ISLAND_DATA = '/state-local/data/island/';

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

export function isLocalServer(url) {
  return LOCAL_HOSTS.includes(url.hostname);
}

function webUrl(value, setting) {
  const url = new URL(value, 'https://site.invalid');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
    || /['"\\<>\s]/u.test(value)) {
    throw new Error(`${setting} must be an http(s) URL without credentials, query, fragment, quotes or spaces`);
  }
  return url;
}

function absoluteUrl(value, setting) {
  if (!/^https?:\/\//u.test(value)) throw new Error(`${setting} must be an absolute http(s) URL`);
  return webUrl(value, setting);
}

export function serverOrigin(value) {
  const url = absoluteUrl(value || DEFAULT_SERVER, SERVER_SETTING);
  if (url.pathname !== '/') throw new Error(`${SERVER_SETTING} must be a bare server origin such as ${DEFAULT_SERVER}`);
  return url.origin;
}

export function basemapUrl(value, server) {
  return value ? absoluteUrl(value, BASEMAP_SETTING).href : `${server}${BASEMAP_ROUTE}`;
}

export function islandDataUrl(value) {
  const text = value || DEFAULT_ISLAND_DATA;
  webUrl(text, ISLAND_DATA_SETTING);
  if (!text.endsWith('/') || !/^(\/[^/]|https?:\/\/)/u.test(text)) {
    throw new Error(`${ISLAND_DATA_SETTING} must be a site path or http(s) URL ending in /`);
  }
  return text;
}

const env = globalThis.process?.env ?? {};
export const stateLocalServer = serverOrigin(import.meta.env?.VITE_STATE_LOCAL_SERVER ?? env[SERVER_SETTING]);
export const stateLocalBasemap = basemapUrl(env[BASEMAP_SETTING], stateLocalServer);
export const stateLocalIslandData = islandDataUrl(env[ISLAND_DATA_SETTING]);

export const PAGE_PLACEHOLDERS = Object.freeze({
  '{{STATE_LOCAL_BASEMAP}}': stateLocalBasemap,
  '{{STATE_LOCAL_ISLAND_DATA}}': stateLocalIslandData,
});

export function withStateLocalEndpoints(text) {
  return Object.entries(PAGE_PLACEHOLDERS).reduce((page, [placeholder, value]) => page.replaceAll(placeholder, value), text);
}
