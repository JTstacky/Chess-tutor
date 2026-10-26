async (page) => {
  const S = 'http://127.0.0.1:8814';
  const fixture = await (await page.request.get('http://127.0.0.1:8811/.qa/invite-fixtures.json')).json();
  const { id } = await (await page.request.get('http://127.0.0.1:8811/.qa/nonplayer-case.json')).json();
  const checks = [], errors = [], contexts = [];
  async function device() {
    const ctx = await page.context().browser().newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true }); contexts.push(ctx);
    await ctx.addInitScript(f => { localStorage.setItem('evonline.session', f.token); localStorage.setItem('evonline.tier', f.tier); localStorage.setItem('tenggames.profileId', String(f.id)); localStorage.setItem('tg.owner', String(f.id)); }, fixture[1]);
    await ctx.route('https://ev-online-api.justintengyz.workers.dev/**', async r => {
      if (r.request().url().includes('/api/retro/data/')) { errors.push('Player requested native data'); return r.abort(); }
      if (r.request().url().endsWith('/api/state')) return r.fulfill({ status: 204, body: '' });
      await r.fulfill({ response: await r.fetch({ url: r.request().url().replace('https://ev-online-api.justintengyz.workers.dev', 'http://127.0.0.1:8812') }) });
    });
    const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); return p;
  }
  try {
    const a = await device();
    await a.goto(S + '/retro/web/heroes2/index.html?inviteRelay=ws://127.0.0.1:8810#invite=' + id);
    await a.getByRole('button', { name: 'Join game', exact: true }).click();
    await a.waitForFunction(() => window.__heroes2.online.room?.active === 1 && window.__heroes2.online.room.phase === 'adventure' && window.__heroes2.online.stats.frames > 0, null, { timeout: 60000 });
    checks.push('returning player receives their own native turn after service restart');
    const state = await a.evaluate(() => ({ room: window.__heroes2.online.room, engine: !!window.__heroes2.mod }));
    if (state.engine || state.room.players[0].online) throw Error('Creator or client engine required');
    checks.push('creator stays offline and no native engine or save is loaded by player');
    await a.screenshot({ path: 'E:/AI/Games/Teng Games Accounts/work/site/.qa/nonplayer-return-tablet.png', fullPage: true });
    await contexts[0].close();
    const b = await device();
    await b.goto(S + '/retro/web/heroes2/index.html?inviteRelay=ws://127.0.0.1:8810');
    await b.waitForFunction(id => [...document.querySelectorAll('button')].some(b => b.textContent.includes(id.slice(0, 6))), id, { timeout: 15000 });
    checks.push('fresh device finds the persistent game in its profile saved-game list');
    if (errors.length) throw Error(errors.join('; '));
    return { passed: checks.length, checks, id, active: state.room.active, savedAt: state.room.savedAt };
  } finally { for (const c of contexts) await c.close(); }
}
