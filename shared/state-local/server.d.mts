export const SERVER_SETTING: string;
export const DEFAULT_SERVER: string;
export const SERVER_PLACEHOLDER: string;
export const stateLocalServer: string;
export function isLocalServer(url: URL): boolean;
export function serverOrigin(value?: string | null): string;
export function withStateLocalServer(text: string): string;
