// Site playtest regressions (Nov 2026 pass). Run with the Playwright MCP tool browser_run_code_unsafe (filename = this file).
// Needs: the built site (npm run build) served from dist/ on http://127.0.0.1:8806 with folder URLs serving index.html
// (like GitHub Pages; `vite preview` or any static server), and the accounts Worker (ev-online cloud, wrangler dev) on
// http://127.0.0.1:8808 with an approved family FAMILY/PASSWORD below that has a kid "Lily" with PIN 1234 and a kid "Max".
// The live API address is routed to the local Worker; high-score submissions are blocked, so nothing live changes.
async (page) => {
  const S = 'http://127.0.0.1:8806', LOCAL_API = 'http://127.0.0.1:8808', LIVE_API = 'https://ev-online-api.justintengyz.workers.dev';
  const { FAMILY, PASSWORD } = globalThis.__tgPlaytest ?? { FAMILY: 'PTwutw', PASSWORD: 'pt-pass-j6wrrh' };
  const contexts = [], checks = [], errors = [];
  let step = 'setup';
  // Every check is recorded and the run carries on, so one failure does not hide the others.
  const ok = (value, name) => checks.push((value ? 'ok   ' : 'FAIL ') + name);
  async function device(w, h) {
    const ctx = await page.context().browser().newContext({ viewport: { width: w, height: h }, hasTouch: w < 600, isMobile: w < 600 });
    contexts.push(ctx);
    await ctx.route(LIVE_API + '/**', async r => r.fulfill({ response: await r.fetch({ url: r.request().url().replace(LIVE_API, LOCAL_API) }) }));
    await ctx.route(/scores.*workers\.dev/, r => r.request().method() === 'GET' ? r.continue() : r.abort());
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(step + ': ' + e.message.slice(0, 160)));
    return p;
  }
  const insideViewport = (p, sel) => p.evaluate(sel => [...document.querySelectorAll(sel)].every(e => {
    const r = e.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1;
  }), sel);
  async function ninjaSolo(p) {
    await p.goto(S + '/ninja-nab/');
    await p.waitForSelector('[data-a="solo"]');
    // Collect every toast so a quick "Invalid message." is caught even after it fades.
    await p.evaluate(() => { window.__toasts = []; new MutationObserver(() => window.__toasts.push(document.body.innerText)).observe(document.body, { subtree: true, childList: true, characterData: true }); });
    await p.locator('[data-a="solo"]').click();
    await p.locator('[data-skill="1"]').first().click();
    await p.waitForTimeout(3500);
    return p.evaluate(() => ({ rejected: window.__toasts.some(t => t.includes('Invalid message')), menuGone: !document.querySelector('[data-a="solo"]')?.offsetParent }));
  }
  try {
    for (const [name, w, h] of [['desktop', 1280, 860], ['phone', 390, 844]]) {
      step = name + ' guest';
      const p = await device(w, h);
      await p.goto(S + '/account/');
      await p.getByRole('button', { name: 'Play as a guest' }).click();
      await p.waitForURL(u => !u.pathname.startsWith('/account'));
      await p.waitForSelector('.account-chip b');
      ok(((await p.locator('.account-chip').innerText()).match(/guest/gi) || []).length === 1, `${name}: the guest chip says "Guest" once`);

      step = name + ' Ninja Nab solo';
      const solo = await ninjaSolo(p);
      ok(!solo.rejected, `${name}: Ninja Nab solo is not rejected with "Invalid message."`);
      ok(solo.menuGone, `${name}: Ninja Nab solo leaves the menu and starts`);
      await p.goto(S + '/ninja-nab/'); await p.waitForSelector('.menu-grid .btn');
      ok(await insideViewport(p, '.menu-grid, .menu-grid .btn'), `${name}: Ninja Nab menu buttons fit the screen`);

      step = name + " Hammerguy's Party";
      await p.goto(S + '/hammerguys-party/'); await p.waitForSelector('#join');
      ok(await insideViewport(p, '.row.join, .row.join > *'), `${name}: Hammerguy's Party code box and Join button fit the screen`);
    }

    step = 'family sign-in';
    const p = await device(1280, 860);
    await p.goto(S + '/account/');
    await p.getByRole('textbox', { name: 'Username' }).fill(FAMILY);
    await p.getByRole('textbox', { name: 'Password' }).fill(PASSWORD);
    await p.getByRole('button', { name: 'Sign in' }).click();
    await p.waitForSelector('button.kid');
    const heights = await p.locator('button.kid .kid-name').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().height)));
    ok(heights.length >= 2 && Math.max(...heights) - Math.min(...heights) <= 2, 'picker: a PIN lock does not make that name taller than the others');
    const lockedName = await p.locator('button.kid', { hasText: 'Lily' }).getAttribute('aria-label');
    ok(lockedName === 'Lily, has a PIN', 'picker: the locked profile is read out as "Lily, has a PIN"');
    await p.locator('button.kid').first().click();               // the grown-up (no lock in the test family)
    await p.waitForURL(u => !u.pathname.startsWith('/account'));
    await p.goto(S + '/account/');
    const play = p.locator('#account a.btn', { hasText: 'Play' }).first();
    await play.waitFor();
    ok(await play.evaluate(e => getComputedStyle(e).textDecorationLine) === 'none', 'account page: the Play ▶ link is a button, not underlined text');

    step = 'kid Max: chess name';
    await p.goto(S + '/account/');
    const sw = p.getByRole('button', { name: 'Switch profile' });
    if (await sw.count()) await sw.click();
    await p.locator('button.kid', { hasText: 'Max' }).click();
    await p.waitForURL(u => !u.pathname.startsWith('/account'));
    await p.goto(S + '/chess/');
    await p.waitForSelector('text=Ready to play?');
    ok(/Hi\s+Max!/.test(await p.locator('body').innerText()), 'chess: Hoot greets the profile by name');

    step = 'Demon Dragon high scores';
    await p.goto(S + '/demon-dragon/');
    await p.getByText('High Scores').click();
    await p.waitForTimeout(2500);
    ok(!/error/i.test(await p.locator('body').innerText()), 'Demon Dragon: High Scores opens without an error');
    ok(!errors.length, 'no page errors: ' + errors.join(' | '));
  } catch (e) {
    checks.push('FAILED at ' + step + ': ' + e.message.slice(0, 300));
  } finally {
    for (const c of contexts) await c.close().catch(() => {});
  }
  return checks;
}
