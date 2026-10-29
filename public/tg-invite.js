// Shared private-link lobby for chess and Heroes II. No account names are shared.
(function () {
  'use strict';
  if (window.TengInvite) return;
  var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/tg-invite.css'; document.head.append(css);
  function mount(options) {
    var panel = document.createElement('section'); panel.className = 'tg-invite'; panel.setAttribute('aria-label', 'Play online');
    panel.innerHTML = '<h2>Play with friends</h2><p data-note></p><label data-count-label hidden>Human players <select data-count><option>2</option><option>3</option><option>4</option><option>5</option><option>6</option></select></label><label data-bot-label hidden>If a player is away during their battle <select data-bot><option value="wait">Wait for them to return</option><option value="0">Computer fights straight away</option><option value="1">Computer fights after 1 minute</option><option value="2">Computer fights after 2 minutes</option><option value="5">Computer fights after 5 minutes</option><option value="10">Computer fights after 10 minutes</option><option value="15">Computer fights after 15 minutes</option><option value="30">Computer fights after 30 minutes</option><option value="60">Computer fights after 1 hour</option></select></label><div class="tg-invite-actions"><button type="button" data-create>Create invite</button><button type="button" data-join hidden>Join game</button><button type="button" data-reconnect hidden>Reconnect</button><button type="button" data-copy hidden>Copy invite link</button><button type="button" data-share hidden>Share</button><button type="button" data-leave hidden>Leave</button></div><label data-link-label hidden>Private invite link<input data-link readonly aria-label="Private invite link"></label><p data-status role="status">Create an invite, then send the link to your friends.</p><div data-roster></div>';
    options.parent.append(panel);
    var $ = s => panel.querySelector(s), socket, heartbeat, room, retry = false, stopped = false;
    var turn = options.turn || (options.game === 'heroes2' ? { players: [2, 6], awayBot: true } : null);
    if (turn) $('[data-count]').innerHTML = Array.from({ length: turn.players[1] - turn.players[0] + 1 }, (_, i) => '<option>' + (turn.players[0] + i) + '</option>').join('');
    var code = new URLSearchParams(location.hash.slice(1)).get('invite');
    if (!/^[a-f0-9]{32}$/.test(code || '')) code = null;
    var api = { panel: panel, seat: null, connected: false, room: null, send: send, close: close };
    $('[data-note]').textContent = options.description || (options.game === 'heroes2'
      ? '2–6 full-account players. Every turn runs on the player’s own device; only the saved game passes between players. Player 1 chooses the scenario. Leave and return later with this link: the server keeps the save.'
      : 'Two signed-in players. Player 1 is White. No clock: take your turn even when your opponent is offline, then come back later. The server keeps the game; this link does not expire.');
    $('[data-count-label]').hidden = !turn || turn.players[0] === turn.players[1] || !!code; $('[data-bot-label]').hidden = !turn || !turn.awayBot || !!code;
    // Keep solo play available while the separate online server is provisioned.
    // Local integration tests deliberately use their own private engine service.
    let heroesAvailable = options.game !== 'heroes2' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    if (!heroesAvailable) {
      $('[data-create]').disabled = $('[data-join]').disabled = true;
      (async () => {
        try {
          const r = await fetch('https://tenggames-relay.justintengyz.workers.dev/health', { cache: 'no-store' });
          heroesAvailable = r.ok && (await r.json()).heroesAvailable === true;
          $('[data-create]').disabled = $('[data-join]').disabled = !heroesAvailable;
          if (!heroesAvailable) { $('[data-note]').textContent = 'Online Heroes is being set up. Solo play is available now.'; say('Online invitations will open when the separate game server is ready.'); }
        } catch { say('Online Heroes is temporarily unavailable. Solo play is available.'); }
      })();
    }
    if (code) { $('[data-create]').hidden = true; $('[data-join]').hidden = false; $('[data-status]').textContent = 'You have been invited. Join when you are ready.'; }
    if (!code) {
      const saved = document.createElement('div'); saved.className = 'tg-saved-games'; panel.append(saved);
      (async () => {
        try {
          const config = await (await fetch('/relay.json', { cache: 'no-store' })).json();
          let base = config.url;
          if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) base = new URLSearchParams(location.search).get('inviteRelay') || base;
          const endpoint = new URL(base); endpoint.protocol = endpoint.protocol === 'wss:' ? 'https:' : 'http:'; endpoint.pathname = '/games'; endpoint.search = '';
          if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && endpoint.hostname !== 'tenggames-relay.justintengyz.workers.dev') return;
          const response = await fetch(endpoint, { headers: { Authorization: 'Bearer ' + localStorage.getItem('evonline.session') } });
          if (!response.ok) return;
          const games = (await response.json()).games.filter(g => g.game === options.game && !g.result);
          if (!games.length) return;
          const heading = document.createElement('h3'); heading.textContent = 'Your saved games'; saved.append(heading);
          for (const g of games) {
            const b = document.createElement('button'); b.type = 'button'; b.textContent = (g.active === g.seat ? 'Your turn' : 'Waiting for your turn') + ' · ' + g.id.slice(0, 6);
            b.onclick = () => { if (socket && socket.readyState < 2) return; code = g.id; connect(false); }; saved.append(b);
          }
        } catch { /* Existing private links remain usable if the index is offline. */ }
      })();
    }
    function say(text) { $('[data-status]').textContent = text; }
    function send(msg) {
      if (!socket || socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > 256000) return false;
      socket.send(msg instanceof Blob || msg instanceof ArrayBuffer ? msg : JSON.stringify(msg)); return true;
    }
    function state(value) {
      api.room = room = value;
      $('[data-roster]').replaceChildren();
      for (var p of value.players) {
        var row = document.createElement('div'); row.className = 'tg-invite-player';
        row.textContent = 'Player ' + (p.seat + 1) + (p.seat === api.seat ? ' (you)' : '') + (p.online ? ' · connected' : ' · offline') + (value.active === p.seat ? ' · current turn' : '');
        $('[data-roster]').append(row);
      }
      if (options.game.startsWith('metal-slug')) say(value.players.length<2?'Waiting for your friend.':value.players.every(p=>p.online)?'Both players connected.':'Game paused. Waiting for the other player to return.');
      else if (options.game === 'heroes2' && value.mode === 'local') say(value.result || (value.holder === api.seat ? (value.checkpointPhase == null ? 'Choose your scenario and start the game.' : 'Your turn. It runs on this device.') : value.viewer === api.seat ? 'Battle: your army is fighting during Player ' + (value.holder + 1) + '’s turn.' : 'Player ' + (value.holder + 1) + (value.players[value.holder] && value.players[value.holder].online ? ' is playing.' : ' is next. The game continues when they return.') + ' Your screen is private; return for your turn.'));
      else if (options.game === 'heroes2') say(value.result || (value.runtimeRetryAt > Date.now() ? 'Heroes has reached its server runtime allowance. Your cloud save is safe. Play can resume after ' + new Date(value.runtimeRetryAt).toLocaleString() + '.' : !value.serverOnline ? (value.savedAt ? 'Your saved game is safe. Starting the game server…' : 'Starting the game server. This may take a minute…') : value.active < 0 ? 'The server is preparing the next turn.' : value.active === api.seat ? (value.phase === 'setup' ? 'Choose your scenario and start the game.' : 'Your turn. Progress is saved on the server.') : 'Player ' + (value.active + 1) + ' is next. Your screen is private; return for your turn.'));
      else say(value.result || (value.players.length < 2 ? 'Waiting for your friend to join once.' : value.active === api.seat ? 'Your turn. Your opponent can be offline.' : 'Waiting for your next turn. You can leave and come back.'));
      options.onState?.(value, api);
    }
    async function connect(create) {
      if (!heroesAvailable) return;
      if (socket && socket.readyState < 2) return;
      var token = localStorage.getItem('evonline.session');
      if (!token) { say('Sign in and choose a profile before joining.'); return; }
      $('[data-create]').disabled = true; $('[data-join]').disabled = true; $('[data-reconnect]').disabled = true;
      stopped = false; retry = false;
      try {
        // Only a local page may override the relay for development; production never sends credentials to a URL from an invite.
        var relay;
        if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) relay = new URLSearchParams(location.search).get('inviteRelay');
        if (!relay) { var response = await fetch('/relay.json', { cache: 'no-store' }); if (!response.ok) throw Error('Online play is not configured yet.'); relay = (await response.json()).url; }
        var endpoint = new URL(relay);
        if (!['wss:', 'ws:'].includes(endpoint.protocol) || (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && (endpoint.protocol !== 'wss:' || endpoint.hostname !== 'tenggames-relay.justintengyz.workers.dev'))) throw Error('Invalid online play service.');
        if (create) code = Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
        endpoint.pathname = '/invite/' + options.game + '/' + code; endpoint.search = create ? (turn ? '?host=1&players=' + $('[data-count]').value + (turn.awayBot ? '&bot=' + $('[data-bot]').value : '') : '?host=1') : ''; endpoint.hash = '';
        socket = new WebSocket(endpoint.href, ['tg-invite', 'tg-auth.' + token]); socket.binaryType = 'arraybuffer';
        var connection = socket;
        say('Connecting…');
        socket.onopen = function () {
          if (socket !== connection) return;
          api.connected = true; clearInterval(heartbeat); heartbeat = setInterval(function () { if (socket.readyState === 1) socket.send('~'); }, 25000);
          location.hash = 'invite=' + code;
          var link = new URL(location.href); link.searchParams.delete('inviteRelay'); link.hash = 'invite=' + code;
          $('[data-link]').value = link.href;
          for (var name of ['create', 'join', 'reconnect']) $('[data-' + name + ']').hidden = true;
          $('[data-count-label]').hidden = $('[data-bot-label]').hidden = true;
          if (panel.querySelector('.tg-saved-games')) panel.querySelector('.tg-saved-games').hidden = true;
          for (var name of ['copy', 'leave', 'link-label']) $('[data-' + name + ']').hidden = false;
          $('[data-share]').hidden = !navigator.share;
        };
        socket.onmessage = function (e) {
          if (socket !== connection) return;
          if (e.data === '~') return;
          if (typeof e.data !== 'string') { options.onFrame?.(e.data, api); return; }
          var value; try { value = JSON.parse(e.data); } catch { return; }
          if (value.type === 'welcome') { api.seat = value.seat; }
          else if (value.type === 'room') state(value);
          else if (value.type === 'your-turn') { yourTurn(); options.onMessage?.(value, api); }
          else options.onMessage?.(value, api);
        };
        socket.onclose = function (e) {
          if (socket !== connection) return;
          clearInterval(heartbeat); api.connected = false;
          if (stopped) return;
          retry = e.code !== 4410 && e.code !== 4001;
          $('[data-reconnect]').hidden = !retry; $('[data-reconnect]').disabled = false;
          for (var name of ['copy', 'share']) $('[data-' + name + ']').hidden = true;
          if (!retry) { $('[data-create]').hidden = false; $('[data-create]').disabled = false; $('[data-create]').textContent = 'Start another invite'; }
          say(e.code === 4410 ? 'This game has ended.' : e.code === 4001 ? 'This profile opened the game in another tab.' : 'Disconnected. Your server save is kept. Check sign-in and access, then reconnect.');
          options.onDisconnect?.(api);
        };
        socket.onerror = function () { /* onclose supplies a single useful status */ };
      } catch (e) { say(e.message); $('[data-create]').disabled = false; $('[data-join]').disabled = false; $('[data-reconnect]').disabled = false; }
    }
    function close() {
      stopped = true; clearInterval(heartbeat); api.connected = false; socket?.close(1000, 'Left game.'); socket = null;
      options.onDisconnect?.(api); say('You left. Rejoin with your invite link.'); $('[data-reconnect]').hidden = false; $('[data-reconnect]').disabled = false;
      for (var name of ['copy', 'share', 'leave']) $('[data-' + name + ']').hidden = true;
    }
    // "Your turn" while this tab is in the background: a browser notification
    // (if allowed) and a marked tab title until the player looks.
    var baseTitle = document.title;
    function yourTurn() {
      if (!document.hidden) return;
      document.title = '\u25CF Your turn \u2013 ' + baseTitle;
      try { if (window.Notification && Notification.permission === 'granted') new Notification('Your turn', { body: (options.title || document.title.replace(/^.*\u2013 /, '')) + ': it is your turn.', tag: 'tg-turn-' + code }); } catch {}
    }
    document.addEventListener('visibilitychange', function () { if (!document.hidden) document.title = baseTitle; });
    function askToNotify() { try { if (turn && window.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch {} }
    $('[data-create]').onclick = () => { askToNotify(); connect(true); };
    $('[data-join]').onclick = $('[data-reconnect]').onclick = () => { askToNotify(); connect(false); };
    $('[data-copy]').onclick = async () => { try { await navigator.clipboard.writeText($('[data-link]').value); say('Invite link copied.'); } catch { $('[data-link]').select(); say('Select and copy the invite link above.'); } };
    $('[data-share]').onclick = async () => { try { await navigator.share({ title: 'Play ' + (options.title || (options.game === 'chess' ? 'chess' : 'Heroes II')) + ' on Teng Games', url: $('[data-link]').value }); } catch {} };
    $('[data-leave]').onclick = close;
    window.addEventListener('pagehide', close, { once: true });
    return api;
  }
  window.TengInvite = { mount: mount };
})();
