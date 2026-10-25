// Run via browser_run_code_unsafe after scripts/check-invites.mjs.
async (page) => {
  const S = 'http://127.0.0.1:8814', relay = '?inviteRelay=ws://127.0.0.1:8810';
  const fixtures = await (await page.request.get('http://127.0.0.1:8811/.qa/invite-fixtures.json')).json();
  const browser = page.context().browser(), contexts = [], results = [], errors = [];
  let step = 'chess';
  let streaming;
  function ok(condition, name) { if (!condition) throw Error(name); results.push(name); }
  async function device(index, width, height, touch = false) {
    const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch }); contexts.push(ctx);
    await ctx.route('https://ev-online-api.justintengyz.workers.dev/**', async route => {
      if (route.request().url().endsWith('/api/state')) return route.fulfill({ status: route.request().method() === 'GET' ? 204 : 200, contentType: 'application/json', body: route.request().method() === 'GET' ? '' : '{}' });
      const response = await route.fetch({ url: route.request().url().replace('https://ev-online-api.justintengyz.workers.dev', 'http://127.0.0.1:8812') }); await route.fulfill({ response });
    });
    await ctx.route(S + '/private-data/**', async route => { const response = await route.fetch({ url: route.request().url().replace(S, 'http://127.0.0.1:8813') }); await route.fulfill({ response }); });
    await ctx.addInitScript(f => { localStorage.setItem('evonline.session', f.token); localStorage.setItem('evonline.tier', f.tier); localStorage.setItem('tenggames.profileId', String(f.id)); localStorage.setItem('tg.owner', String(f.id)); }, fixtures[index]);
    const p = await ctx.newPage(); p.on('pageerror', error => errors.push(error.message)); return p;
  }
  async function tap(p, square) { const locator = p.locator('.squares [data-sq="' + square + '"]'); await locator.scrollIntoViewIfNeeded(); const r = await locator.boundingBox(); await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); }
  try {
    const a = await device(0, 1280, 900), b = await device(8, 390, 844, true);
    await a.goto(S + '/chess/' + relay); await a.getByRole('button', { name: 'Play a Friend' }).click(); await a.getByRole('button', { name: 'Invite a friend online' }).click();
    await a.getByRole('button', { name: 'Create invite', exact: true }).click(); await a.getByRole('button', { name: 'Copy invite link' }).waitFor();
    const hash = a.url().slice(a.url().indexOf('#'));
    await b.goto(S + '/chess/' + relay + hash); await b.getByRole('button', { name: 'Join game', exact: true }).click(); await b.locator('.online-turn', { hasText: 'White to move' }).waitFor();
    ok(await a.locator('.tg-invite-player').count() === 2, 'same invite flow connects desktop and phone chess');
    await tap(a, 'e2'); await tap(a, 'e4'); await b.locator('.online-moves', { hasText: 'e4' }).waitFor();
    await tap(b, 'e7'); await tap(b, 'e5'); await a.locator('.online-moves', { hasText: 'e5' }).waitFor();
    ok((await a.locator('.online-moves').innerText()) === (await b.locator('.online-moves').innerText()), 'legal chess moves synchronize in both directions');
    await b.reload(); await b.getByRole('button', { name: 'Join game', exact: true }).click(); await b.locator('.online-moves', { hasText: 'e5' }).waitFor();
    ok((await b.locator('.tg-invite').innerText()).includes('Player 2 (you)'), 'phone reload restores Black seat and game');
    await a.getByRole('button', { name: 'Offer draw', exact: true }).click(); await b.getByRole('button', { name: 'Accept draw', exact: true }).click(); await a.locator('.online-turn', { hasText: 'Draw by agreement' }).waitFor();
    for (const [p, name] of [[a, 'desktop'], [b, 'phone']]) { ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'chess ' + name + ' has no horizontal overflow'); await p.screenshot({ path: 'E:/AI/Games/Teng Games Accounts/work/site/.qa/invite-chess-' + name + '.png', fullPage: true }); }
    step = 'Heroes lobby';
    await a.goto(S + '/retro/web/heroes2/index.html' + relay); await a.getByRole('button', { name: 'Create invite', exact: true }).click(); await a.getByRole('button', { name: 'Copy invite link' }).waitFor();
    const h = a.url().slice(a.url().indexOf('#'));
    const c = await device(1, 844, 390, true), d = await device(2, 820, 1180, true);
    for (const p of [c, d]) { await p.goto(S + '/retro/web/heroes2/index.html' + relay + h); await p.getByRole('button', { name: 'Join game', exact: true }).click(); await p.locator('.tg-remote-cover', { hasText: 'Waiting for your turn' }).waitFor(); }
    ok(await c.evaluate(() => !window.__heroes2.ready && !window.__heroes2.mod), 'Heroes invitee does not boot or download another engine');
    await a.getByRole('button', { name: 'Play', exact: true }).click(); await a.waitForFunction(() => window.__heroes2.ready || window.__heroes2.error, null, { timeout: 120000 });
    ok(await a.evaluate(() => window.__heroes2.ready && !window.__heroes2.error), 'host starts native Heroes II engine');
    await a.waitForTimeout(3500);
    await a.locator('.tg-invite-player').nth(1).getByRole('button', { name: 'Pass control' }).click();
    step = 'first remote frame';
    await c.waitForFunction(() => document.querySelector('.tg-remote-cover').hidden, null, { timeout: 10000 });
    step = 'remote colored pixels';
    await c.waitForFunction(() => { const canvas = document.querySelector('#canvas'), data = canvas.getContext('2d').getImageData(0, 0, 640, 480).data; let colored = 0; for (let i = 0; i < data.length; i += 16) if (data[i] + data[i + 1] + data[i + 2] > 60) colored++; return colored > 5000; });
    ok(true, 'phone receives rendered game pixels, not a black WebGL buffer');
    ok(await d.locator('.tg-remote-cover').isVisible(), 'inactive tablet receives a covered screen');
    // Actual remote native menu input: N, M, H, 2 selects Hot Seat setup.
    await c.locator('#canvas').click();
    for (const k of ['n', 'm', 'h', '2']) { await c.keyboard.press(k); await c.waitForTimeout(400); }
    await a.screenshot({ path: 'E:/AI/Games/Teng Games Accounts/work/site/.qa/invite-heroes-host-setup.png', fullPage: true });
    await c.screenshot({ path: 'E:/AI/Games/Teng Games Accounts/work/site/.qa/invite-heroes-phone-setup.png', fullPage: true });
    step = 'Hot Seat scenario';
    for (let i = 0; i < 2; i++) { await c.getByRole('button', { name: 'Enter', exact: true }).click(); await c.waitForTimeout(500); }
    await a.waitForFunction(() => window.__heroes2.state().tile >= 0, null, { timeout: 15000 });
    ok(true, 'remote touch Enter starts an original two-player Hot Seat scenario');
    // This scenario opens a story dialog after the Hot Seat handover. Dismiss its
    // original OK button through the remote canvas, rather than saving over it.
    await c.locator('#canvas').scrollIntoViewIfNeeded();
    const story = await c.locator('#canvas').boundingBox();
    await c.touchscreen.tap(story.x + story.width / 2, story.y + story.height * 320 / 480);
    await c.waitForTimeout(600);
    await c.touchscreen.tap(story.x + story.width / 2, story.y + story.height * 294 / 480);
    await c.waitForTimeout(600);
    await c.touchscreen.tap(story.x + story.width / 2, story.y + story.height * 328 / 480);
    await c.waitForTimeout(600);
    step = 'remote hero movement';
    const before = await a.evaluate(() => window.__heroes2.state());
    let moved = false;
    for (const [dx, dy] of [[32, 0], [0, 32], [-32, 0], [0, -32]]) {
      const pos = await a.evaluate(() => ({ x: window.__heroes2.mod._fh_hero_screen_x(), y: window.__heroes2.mod._fh_hero_screen_y() }));
      const box = await c.locator('#canvas').boundingBox();
      for (let i = 0; i < 2; i++) { await c.touchscreen.tap(box.x + (pos.x + dx) * box.width / 640, box.y + (pos.y + dy) * box.height / 480); await c.waitForTimeout(200); }
      await c.waitForTimeout(500);
      const after = await a.evaluate(() => window.__heroes2.state());
      if (after.tile !== before.tile && after.moves < before.moves) { moved = true; break; }
    }
    ok(moved, 'remote phone taps move the native hero and spend movement points');
    step = 'Hot Seat quick save';
    await c.getByRole('button', { name: 'Quick save', exact: true }).last().click();
    await a.waitForFunction(() => window.__heroes2.mod.FS.readdir('/saves').some(n => /\.savh$/i.test(n)), null, { timeout: 10000 });
    await a.evaluate(() => window.__heroes2.captureNow());
    ok(await a.evaluate(async () => !!(await window.__heroes2.saves.get('heroes2', 'auto'))), 'remote touch quick save writes a native Hot Seat save on the host');
    const savedState = await a.evaluate(() => window.__heroes2.state());
    const measuredAt = await a.evaluate(() => ({ at: performance.now(), ...window.__heroes2.online.stats }));
    await a.waitForTimeout(5000);
    const measuredEnd = await a.evaluate(() => ({ at: performance.now(), ...window.__heroes2.online.stats }));
    const seconds = (measuredEnd.at - measuredAt.at) / 1000;
    streaming = { seconds, framesPerSecond: (measuredEnd.sent - measuredAt.sent) / seconds, kibibytesPerSecond: (measuredEnd.bytes - measuredAt.bytes) / 1024 / seconds, note: 'Local relay, active scenario with native map animations; unchanged JPEGs deduplicated.' };
    ok(await c.locator('.tg-invite-keys').isVisible(), 'active phone has touch keyboard and information controls');
    ok(await d.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Heroes tablet has no horizontal overflow');
    step = 'native turn handover';
    await c.getByRole('button', { name: 'End turn', exact: true }).click(); await c.waitForTimeout(500);
    await c.getByRole('button', { name: 'Enter', exact: true }).click(); await c.waitForTimeout(600);
    await a.locator('.tg-invite-player').nth(2).getByRole('button', { name: 'Pass control' }).click();
    await c.locator('.tg-remote-cover', { hasText: 'Waiting for your turn' }).waitFor();
    await d.waitForFunction(() => document.querySelector('.tg-remote-cover').hidden);
    await d.getByRole('button', { name: 'Enter', exact: true }).click();
    await a.waitForFunction(id => window.__heroes2.state().hero !== id && window.__heroes2.state().tile >= 0, savedState.hero);
    ok(true, 'End turn and manual handover transfer the original game to the next human');
    await a.locator('.tg-invite-player').nth(1).getByRole('button', { name: 'Pass control' }).click();
    // Disconnect the controller: host regains control, waiting devices stay covered.
    await c.getByRole('button', { name: 'Leave', exact: true }).click(); await a.locator('.tg-invite-player').nth(0).getByRole('button', { name: 'Has control' }).waitFor();
    await c.getByRole('button', { name: 'Reconnect', exact: true }).click(); await c.locator('.tg-invite-player', { hasText: 'Player 2 (you)' }).waitFor();
    ok(await c.locator('.tg-remote-cover').isVisible(), 'reconnected Heroes player keeps their seat and waits for control');
    await d.screenshot({ path: 'E:/AI/Games/Teng Games Accounts/work/site/.qa/invite-heroes-tablet-waiting.png', fullPage: true });
    step = 'native Hot Seat restoration';
    await a.reload(); await a.getByRole('button', { name: 'Join game', exact: true }).click();
    await a.getByRole('button', { name: 'Play', exact: true }).click(); await a.waitForFunction(() => window.__heroes2.ready);
    ok(await a.evaluate(() => window.__heroes2.restored.some(n => /\.savh$/i.test(n))), 'host reload restores the native Hot Seat save file');
    await a.waitForTimeout(3500); await a.locator('#canvas').click();
    for (const k of ['l', 'm', 'h', 'Enter', 'Enter']) { await a.keyboard.press(k); await a.waitForTimeout(500); }
    await a.waitForFunction(s => { const n = window.__heroes2.state(); return n.hero === s.hero && n.tile === s.tile && n.moves === s.moves; }, savedState, { timeout: 15000 });
    ok(true, 'native Load Game → Hot Seat restores the saved hero, tile and movement');
    ok(!errors.length, 'no browser exceptions: ' + errors.join('; '));
    return { passed: results.length, results, streaming };
  } catch (e) {
    const diagnostics = [];
    for (const ctx of contexts) for (const p of ctx.pages()) { await p.screenshot({ path: 'E:/AI/Games/Teng Games Accounts/work/site/.qa/invite-failure-' + diagnostics.length + '.png', fullPage: true }); diagnostics.push(await p.evaluate(() => ({ path: location.pathname, status: document.querySelector('[data-status]')?.textContent, native: window.__heroes2?.state?.(), saves: window.__heroes2?.mod?.FS.readdir('/saves'), online: window.__heroes2?.online?.stats, connected: window.__heroes2?.online?.connected, room: window.__heroes2?.online?.room, cover: document.querySelector('.tg-remote-cover')?.hidden })).catch(() => ({}))); }
    return { failed: step, error: e.message, diagnostics, errors };
  } finally { for (const ctx of contexts) await ctx.close(); }
}
