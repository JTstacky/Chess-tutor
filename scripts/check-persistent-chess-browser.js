// Persistent asynchronous chess browser regression. Local fixtures only.
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
    await a.getByRole('button', { name: 'Leave', exact: true }).click();
    await tap(b, 'e7'); await tap(b, 'e5'); await a.getByRole('button', { name: 'Reconnect', exact: true }).click(); await a.locator('.online-moves', { hasText: 'e5' }).waitFor();
    ok(true, 'Black moves while White is offline; White returns to server-owned history');
    ok((await a.locator('.online-moves').innerText()) === (await b.locator('.online-moves').innerText()), 'legal chess moves synchronize in both directions');
    await b.reload(); await b.getByRole('button', { name: 'Join game', exact: true }).click(); await b.locator('.online-moves', { hasText: 'e5' }).waitFor();
    ok((await b.locator('.tg-invite').innerText()).includes('Player 2 (you)'), 'phone reload restores Black seat and game');
    await a.getByRole('button', { name: 'Offer draw', exact: true }).click(); await b.getByRole('button', { name: 'Accept draw', exact: true }).click(); await a.locator('.online-turn', { hasText: 'Draw by agreement' }).waitFor();
    for (const [p, name] of [[a, 'desktop'], [b, 'phone']]) { ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'chess ' + name + ' has no horizontal overflow'); await p.screenshot({ path: 'E:/AI/Games/Teng Games Accounts/work/site/.qa/invite-chess-' + name + '.png', fullPage: true }); }
    if (errors.length) throw Error(errors.join('; '));
    return { passed: results.length, results };
  } finally { for (const ctx of contexts) await ctx.close(); }
}
