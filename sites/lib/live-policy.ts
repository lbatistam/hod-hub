export const LIVE_INTERVAL_MS=10_000;
export const SYNC_FRESHNESS_MS=10_000;
export const MAX_RETRY_MS=120_000;
export function retryDelay(failures:number){return Math.min(MAX_RETRY_MS,LIVE_INTERVAL_MS*2**Math.min(5,Math.max(0,failures)))}
