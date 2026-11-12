export const POLICY_TIMEOUT_MS=700;
export function expired(pending,now){return pending!==null && Number.isFinite(pending.at) && now-pending.at>POLICY_TIMEOUT_MS;}
