// Uses the same catalogue as the Retro Archive publisher, so new releases appear here too.
const root = document.getElementById('retro-games');
const icons = { lemmings: '🚶', pop: '⚔️', heroes2: '🏰', keen: '🚀', scummvm: '🗺️', tim: '⚙️', jazz: '🐇', tyrian: '🛸', cosmo: '👽' };
const el = (tag, props, parent) => { const e = Object.assign(document.createElement(tag), props); parent.append(e); return e; };
if (root) fetch('/retro/catalog.json').then(r => { if (!r.ok) throw Error('Catalogue unavailable'); return r.json(); }).then(({ games }) => {
  for (const game of games) {
    if (!/^[a-z0-9-]+$/.test(game.id)) continue;
    const card = el('a', { className: 'game-card retro', href: '/retro/web/' + game.id + '/' }, root);
    const art = el('div', { className: 'art', textContent: icons[game.id] || '🎮' }, card); art.setAttribute('aria-hidden', 'true');
    el('span', { className: 'badge', textContent: game.tier === 'B' ? 'Full account' : 'Free game' }, card);
    el('h3', { textContent: game.title }, card);
    el('p', { textContent: game.blurb }, card);
    el('span', { className: 'play-btn', textContent: 'Play ▶' }, card);
  }
}).catch(() => { el('p', { textContent: 'Open the Retro Archive below to browse the games.' }, root); });
