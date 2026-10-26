// Phase one: real native engine on a separate, non-player process. No service
// credentials or complete native save are available in these player contexts.
async (page) => {
  const S = 'http://127.0.0.1:8814', relay = '?inviteRelay=ws://127.0.0.1:8810';
  const f = await (await page.request.get('http://127.0.0.1:8811/.qa/invite-fixtures.json')).json();
  const contexts = [], errors = [], checks = []; let step = 'setup', a, b;
  function ok(value, name) { if (!value) throw Error(name); checks.push(name); }
  async function device(index, w, h, touch = false) {
    const ctx = await page.context().browser().newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch }); contexts.push(ctx);
    await ctx.addInitScript(f => { localStorage.setItem('evonline.session', f.token); localStorage.setItem('evonline.tier', f.tier); localStorage.setItem('tenggames.profileId', String(f.id)); localStorage.setItem('tg.owner', String(f.id)); }, f[index]);
    await ctx.route('https://ev-online-api.justintengyz.workers.dev/**', async r => {
      if (r.request().url().includes('/api/retro/data/')) { errors.push('Original game data requested by a player'); return r.abort(); }
      if (r.request().url().endsWith('/api/state')) return r.fulfill({ status: 204, body: '' });
      await r.fulfill({ response: await r.fetch({ url: r.request().url().replace('https://ev-online-api.justintengyz.workers.dev', 'http://127.0.0.1:8812') }) });
    });
    await ctx.route('**/private-data/**', r => { errors.push('Private game data requested by player'); return r.abort(); });
    const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); return p;
  }
  const info = p => p.evaluate(() => ({ room: window.__heroes2.online.room, frames: window.__heroes2.online.stats.frames, engine: !!window.__heroes2.mod }));
  async function tap(p, x, y) { await p.locator('#remote-canvas').scrollIntoViewIfNeeded(); const box = await p.locator('#remote-canvas').boundingBox(); await p.mouse.click(box.x + x * box.width / 640, box.y + y * box.height / 480); await p.waitForTimeout(600); }
  try {
    a = await device(0, 1280, 900); b = await device(1, 390, 844, true);
    await a.goto(S + '/retro/web/heroes2/index.html' + relay); await a.getByRole('button', { name: 'Create invite', exact: true }).click();
    await a.waitForFunction(() => window.__heroes2.online.room?.serverOnline && window.__heroes2.online.room.active === 0, null, { timeout: 60000 });
    const hash = a.url().slice(a.url().indexOf('#')), id = hash.slice('#invite='.length);
    await b.goto(S + '/retro/web/heroes2/index.html' + relay + hash); await b.getByRole('button', { name: 'Join game', exact: true }).click();
    await b.waitForFunction(() => window.__heroes2.online.connected && window.__heroes2.online.room.players.length === 2);
    await a.waitForTimeout(4500);
    ok(!(await info(a)).engine && !(await info(b)).engine, 'neither creator nor invitee runs the native engine');
    ok((await info(b)).frames === 0, 'invitee receives no creator setup screen');
    step = 'start native scenario';
    await a.getByRole('button', { name: 'Enter', exact: true }).click();
    await a.waitForFunction(() => window.__heroes2.online.room.phase === 'adventure' && window.__heroes2.online.room.savedAt, null, { timeout: 30000 });
    await a.waitForTimeout(1000);
    for (const y of [320, 294, 328]) await tap(a, 320, y);
    step = 'server-owned movement';
    const savedBefore = (await info(a)).room.savedAt;
    // 4 Dimensions starts Blue's hero on tile434. A neighboring road is to the right.
    await tap(a, 272, 240); await tap(a, 272, 240);
    await a.waitForFunction(t => window.__heroes2.online.room.savedAt > t, savedBefore);
    ok((await info(a)).room.savedAt > savedBefore, 'native progress is checkpointed by the server');
    await b.getByRole('button', { name: 'Leave', exact: true }).click();
    step = 'offline opponent handover';
    await a.locator('[data-code=Escape]').click(); await a.waitForTimeout(400);
    await a.getByRole('button', { name: 'End turn', exact: true }).click(); await a.waitForTimeout(500);
    await a.screenshot({ path: 'E:/AI/Games/Teng Games Accounts/work/site/.qa/endturn-dialog.png', fullPage: true }); await tap(a, 270, 285);
    await a.waitForFunction(() => window.__heroes2.online.room.active === 1 && window.__heroes2.online.room.phase === 'adventure', null, { timeout: 15000 });
    const before = await info(a); await a.waitForTimeout(1800); const after = await info(a);
    ok(before.frames === after.frames, 'creator receives zero frames during the other player’s turn');
    ok(await a.evaluate(() => { const d = document.querySelector('#remote-canvas').getContext('2d').getImageData(0, 0, 640, 480).data; return !d.some((v, i) => i % 4 !== 3 && v !== 0); }), 'removing the cover would reveal an empty canvas, not the opponent’s map');
    ok(!after.room.players[1].online, 'turn advances and persists while the next player is offline');
    ok(!await a.evaluate(() => window.__heroes2.saves.get('heroes2', 'auto')), 'complete multiplayer saves are absent from the player device');
    await a.screenshot({ path: 'E:/AI/Games/Teng Games Accounts/work/site/.qa/nonplayer-creator-waiting.png', fullPage: true });
    await b.screenshot({ path: 'E:/AI/Games/Teng Games Accounts/work/site/.qa/nonplayer-phone-offline.png', fullPage: true });
    ok(!errors.length, 'no player data downloads or browser exceptions');
    return { passed: checks.length, checks, id, active: after.room.active, generation: after.room.generation, savedAt: after.room.savedAt };
  } catch (e) {
    for (const [i, p] of [a, b].entries()) if (p) await p.screenshot({ path: 'E:/AI/Games/Teng Games Accounts/work/site/.qa/nonplayer-failure-' + i + '.png', fullPage: true });
    return { failed: step, error: e.message, a: a ? await info(a).catch(() => null) : null, b: b ? await info(b).catch(() => null) : null, errors };
  } finally { for (const ctx of contexts) await ctx.close(); }
}
