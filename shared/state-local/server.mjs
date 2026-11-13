// The Honua server and map archives the state-local journeys read from, chosen at build time.
export const SERVER_SETTING = 'VITE_STATE_LOCAL_SERVER';
export const BASEMAP_SETTING = 'VITE_STATE_LOCAL_BASEMAP';
export const ISLAND_DATA_SETTING = 'VITE_STATE_LOCAL_ISLAND_DATA';
export const DEFAULT_SERVER = 'https://demo.honua.io';
export const BASEMAP_ROUTE = '/api/v1/tiles/pmtiles/maui-basemap';
export const DEFAULT_ISLAND_DATA = '/state-local/data/island/';

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
const UNSAFE_CHARACTERS = /['"\\<>\s?#]/u;

export function isLocalServer(url) {
  return LOCAL_HOSTS.includes(url.hostname);
}

function absoluteUrl(value, setting) {
  const url = /^https?:\/\//u.test(value) && !UNSAFE_CHARACTERS.test(value) ? new URL(value) : null;
  if (!url || url.username || url.password || (url.protocol !== 'https:' && !isLocalServer(url))) {
    throw new Error(`${setting} must be an https URL (http only for localhost) without credentials, query, quotes or spaces`);
  }
  return url;
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
  const sitePath = /^\/[^/]/u.test(text) && !UNSAFE_CHARACTERS.test(text);
  if (!text.endsWith('/') || !(sitePath || absoluteUrl(text, ISLAND_DATA_SETTING))) {
    throw new Error(`${ISLAND_DATA_SETTING} must be a site path or https URL ending in /`);
  }
  return text;
}

const env = globalThis.process?.env ?? {};
export const stateLocalServer = serverOrigin(import.meta.env?.VITE_STATE_LOCAL_SERVER ?? env[SERVER_SETTING]);
export const stateLocalBasemap = basemapUrl(env[BASEMAP_SETTING], stateLocalServer);
export const stateLocalIslandData = islandDataUrl(env[ISLAND_DATA_SETTING]);

export function deployedOrigin(origin) {
  return origin === DEFAULT_SERVER ? stateLocalServer : origin;
}

export const PAGE_PLACEHOLDERS = Object.freeze({
  '{{STATE_LOCAL_BASEMAP}}': stateLocalBasemap,
  '{{STATE_LOCAL_ISLAND_DATA}}': stateLocalIslandData,
});

export function withStateLocalEndpoints(text) {
  const page = Object.entries(PAGE_PLACEHOLDERS).reduce((result, [placeholder, value]) => result.replaceAll(placeholder, value), text);
  if (page.includes('{{STATE_LOCAL_')) throw new Error('An unknown {{STATE_LOCAL_*}} placeholder remains in the page');
  return page;
}
