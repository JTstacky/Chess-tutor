// Only the configured relay may receive a session token. Query-string relay
// overrides are useful for testing WebSockets, but are not trusted for auth.
export function turnEndpoint(relay, configuredRelay) {
  if (!relay || relay !== configuredRelay) return null;
  try {
    const url = new URL(relay);
    if (url.protocol !== 'wss:' || url.username || url.password || url.search || url.hash) return null;
    // The accounts Worker issues the same short-lived Cloudflare TURN credentials
    // used by the other Teng Games titles. Never send the profile bearer token to
    // a relay URL supplied through the page query string.
    return 'https://ev-online-api.justintengyz.workers.dev/turn';
  } catch {
    return null;
  }
}

const TURN_URL = /^turn(s?):turn\.cloudflare\.com(?::([0-9]{1,5}))?(?:\?transport=(udp|tcp))?$/;

export function validTurnResponse(body) {
  if (!body || !Number.isInteger(body.ttl) || body.ttl < 60 || body.ttl > 86400 ||
      !Array.isArray(body.iceServers) || body.iceServers.length === 0) return null;
  const servers = [];
  for (const server of body.iceServers) {
    if (!server || typeof server.username !== 'string' || !server.username ||
        typeof server.credential !== 'string' || !server.credential) return null;
    const urls = typeof server.urls === 'string' ? [server.urls] : server.urls;
    if (!Array.isArray(urls) || urls.length === 0 || urls.some((url) => {
      if (typeof url !== 'string') return true;
      const match = TURN_URL.exec(url);
      return !match || (match[2] && (+match[2] < 1 || +match[2] > 65535));
    })) return null;
    servers.push({ urls: server.urls, username: server.username, credential: server.credential });
  }
  return { servers, ttl: body.ttl };
}
