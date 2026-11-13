// The Honua server the state-local journeys read from, chosen at build time.
export const SERVER_SETTING = 'VITE_STATE_LOCAL_SERVER';
export const DEFAULT_SERVER = 'https://demo.honua.io';
export const SERVER_PLACEHOLDER = '{{STATE_LOCAL_SERVER}}';

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

export function isLocalServer(url) {
  return LOCAL_HOSTS.includes(url.hostname);
}

export function serverOrigin(value) {
  const url = new URL(value || DEFAULT_SERVER);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${SERVER_SETTING} must be a bare server origin such as ${DEFAULT_SERVER}`);
  }
  return url.origin;
}

export const stateLocalServer = serverOrigin(import.meta.env?.VITE_STATE_LOCAL_SERVER
  ?? globalThis.process?.env?.[SERVER_SETTING]);

export function withStateLocalServer(text) {
  return text.replaceAll(SERVER_PLACEHOLDER, stateLocalServer);
}
