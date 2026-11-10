export const displaySnapshot: boolean;
export function snapshotFeatures<T = unknown>(name: string): Promise<T[]>;
export function readSnapshotFeatures<T = unknown>(url: string | URL): Promise<T[]>;
