// Inside a building: the shopkeeper's portrait, their verbatim Sierra lines
// (data/rules/towns.json shop_rules) and the original menus. Each service is a small
// async script driven by say() / choose() / amount() prompts.
import { ctx, W, H, text, panel, COLORS, drawCover, fade } from '../render/screen.js';
import { image } from '../core/assets.js';
import { audio } from '../core/audio.js';
import { Dialogue, Menu } from '../ui/widgets.js';
import { RULES, maxHp, levelUp, refillSpells, sageTier, xpNeeded, shieldTier, itemDesc } from '../game/character.js';
import { SPELLS, SPELL_ORDER } from '../game/spells.js';
import { splitPages } from './town.js';
const GOLD_MAX = 16777215; // 24-bit purse, as in the original

const PORTRAIT = {
  weapons_and_armour_shop: 'smith', magic_shop: 'witch', bank: 'banker', inn: 'innkeeper', church: 'priest', sage: 'sage', king: 'king', princess_chamber: 'felicia',
};
const SAGE_PORTRAITS = new Set(['Yasmin', 'Hajjar', 'Chiriga', 'Hisham', 'Maryam', 'Saied', 'Indihar']);
// Each town's keeper is their own person (portrait_<role>_<town>); towns not listed use the shared one.
const TOWN_PORTRAITS = {
  smith: ['satono', 'bosque', 'helada', 'tumba', 'dorado', 'llama', 'pureza', 'esco'],
  witch: ['satono', 'bosque', 'helada', 'tumba', 'dorado', 'llama', 'pureza', 'esco'],
  banker: ['satono', 'bosque', 'helada', 'tumba', 'dorado', 'llama', 'pureza', 'esco'],
  innkeeper: ['bosque', 'helada', 'tumba', 'dorado', 'llama', 'pureza'],
  priest: ['muralla', 'esco'],
};
const TITLE = {
  weapons_and_armour_shop: 'Weapon and Armour Shop', magic_shop: 'Witchcraft Implement Shop', bank: 'The Bank', inn: 'The Inn', church: 'Church', sage: 'Sage', king: 'King of Felishika', princess_chamber: 'In the Hut',
};
const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? `{${k}}`));

export class BuildingScene {
  constructor(game, town, building, local) {
    this.game = game;
    this.town = town;
    this.b = building;
    this.local = local || game.leader;
    this.c = this.local.character;
    this.service = building.service;
    this.shopRules = game.data.rules.towns?.shop_rules || {};
    this.townRules = town.rules || {};
    this.key = town.key;
    this.t = 0;
    this.widget = null;
    const p = PORTRAIT[this.service];
    this.portraitUrl = p ? `art/portraits/portrait_${p}${TOWN_PORTRAITS[p]?.includes(town.key) ? '_' + town.key : ''}.raw.png` : null;
    // Sages with their own portrait (portrait_sage_<name>) use it; the rest share portrait_sage.
    const own = this.service === 'sage' && SAGE_PORTRAITS.has(this.townRules.sage?.name) ? `art/portraits/portrait_sage_${this.townRules.sage.name.toLowerCase()}.raw.png` : null;
    if (own) image(own).then((i) => { this.portrait = i; }, () => image(this.portraitUrl).then((i) => { this.portrait = i; }));
    else if (this.portraitUrl) image(this.portraitUrl).then((i) => { this.portrait = i; });
    this.run().catch((e) => { console.error(e); this.close(); });
  }

  // ------------------------------------------------------------ prompt helpers
  speaker() { return this.service === 'sage' ? this.townRules.sage?.name || 'Sage' : TITLE[this.service] || ''; }
  say(str, opts = {}) {
    const pages = (Array.isArray(str) ? str : [str]).flatMap((s) => splitPages(s, 220)).map((t) => ({ text: t, speaker: opts.speaker ?? this.speaker() }));
    return new Promise((res) => { this.widget = new Dialogue(pages, { onDone: () => { this.widget = null; res(); } }); });
  }
  ask(str, choices = ['Yes', 'No']) {
    const pages = splitPages(str, 220).map((t) => ({ text: t, speaker: this.speaker() }));
    return new Promise((res) => {
      const last = pages[pages.length - 1];
      last.choices = choices;
      last.onChoice = (i) => { this.answer = i; return []; };
      this.widget = new Dialogue(pages, { onDone: () => { this.widget = null; res(this.answer); } });
    });
  }
  choose(items, opts = {}) {
    return new Promise((res) => {
      this.widget = new Menu(items, {
        x: 470, y: 120, w: 440, title: opts.title, rows: 8, size: 18,
        onSelect: (it) => { this.widget = null; res(it.value); },
        onCancel: () => { this.widget = null; res(opts.cancel ?? null); },
      });
    });
  }
  // Amount entry: Left/Right ±1, Up/Down ±10 (as the manual describes), Enter to confirm.
  amount(max, prompt) {
    return new Promise((res) => {
      this.widget = { amount: Math.min(max, 1000), max, prompt, kind: 'amount', done: (v) => { this.widget = null; res(v); } };
    });
  }
  close() { this.game.pop(); this.town.onReturn?.(); }

  // ------------------------------------------------------------ scripts
  async run() {
    const s = this.service;
    if (s === 'weapons_and_armour_shop') await this.armoury();
    else if (s === 'magic_shop') await this.magicShop();
    else if (s === 'bank') await this.bank();
    else if (s === 'inn') await this.inn();
    else if (s === 'church') await this.church();
    else if (s === 'sage') await this.sage();
    else if (s === 'king') await this.king();
    else if (s === 'princess_chamber') await this.princess();
    else await this.say('There is nobody here.');
    this.game.save();
    this.close();
  }

  price(id) {
    const it = RULES.swords[id] || RULES.shields[id] || RULES.items[id];
    return it?.prices?.[this.key] ?? it?.prices?.all_towns ?? 0;
  }
  stock(kind) {
    const shops = this.townRules.shops || {};
    const base = (shops[kind] || []).map((x) => x.item);
    const extra = this.c.stock?.[this.key]?.[kind] || [];
    return [...new Set([...base, ...extra])];
  }
  addStock(kind, id) {
    this.c.stock ||= {};
    const s = (this.c.stock[this.key] ||= {});
    (s[kind] ||= []).includes(id) || s[kind].push(id);
  }

  async armoury() {
    const T = this.shopRules.weapons_and_armour?.texts || {};
    const E = this.shopRules.weapons_and_armour?.explain_texts || {};
    const c = this.c;
    // Tumba: the Crest of Glory buys the Knight's Sword.
    if (this.key === 'tumba' && c.crests.includes('crest_of_glory') && !this.game.hasBit('0x24', 0x02)) {
      if ((await this.ask(T.crest_offer || 'Might I trade you a knight\'s sword for it?')) === 0) {
        c.sword = 'knights_sword'; c.crests = c.crests.filter((x) => x !== 'crest_of_glory');
        this.game.setBit('0x24', 0x02);
        this.game.refresh(this.local);
        audio.sfx('chest_open');
        await this.say(T.crest_accepted);
      } else await this.say(T.crest_declined);
    }
    await this.say(T.greeting || 'May I be of service, sir?');
    let bought = false;
    for (;;) {
      const v = await this.choose([
        { label: 'Repair shield', value: 'repair' }, { label: 'Buy weapon', value: 'sword' }, { label: 'Buy shield', value: 'shield' },
        { label: 'Explain goods', value: 'explain' }, { label: 'Go outside', value: 'out' },
      ], { title: 'Weapons & Armour', cancel: 'out' });
      if (v === 'out' || v == null) break;
      if (v === 'repair') {
        if (!c.shield) { await this.say(T.no_shield); continue; }
        const max = RULES.shields[c.shield].power;
        if (c.shieldHp >= max) { await this.say(T.no_repair_needed); continue; }
        const cost = Math.ceil((max - c.shieldHp) / 2);
        if ((await this.ask(fill(T.repair_offer, { N: cost }))) !== 0) continue;
        if (c.gold < cost) { await this.say(T.not_enough_gold); continue; }
        c.gold -= cost; c.shieldHp = max; audio.sfx('anvil', { vol: 0.7 });
        await this.say([T.repair_wait, T.repair_done]);
        bought = true;
      } else if (v === 'sword' || v === 'shield') {
        const isSword = v === 'sword';
        const table = isSword ? RULES.swords : RULES.shields;
        const ids = this.stock(isSword ? 'weapons' : 'shields');
        const id = await this.choose([...ids.map((x) => ({
          label: table[x]?.name || x, value: x, right: `${this.price(x)} G`,
          disabled: (isSword ? c.sword : c.shield) === x, hint: isSword ? `Damage ${table[x]?.damage}` : `Strength ${table[x]?.power}`,
        })), { label: 'Back', value: null }], { title: isSword ? 'Weapons' : 'Shields' });
        if (!id) continue;
        if (this.key === 'tumba' && id === 'knights_sword' && !this.game.hasBit('0x24', 0x02)) { await this.say(T.not_sold); continue; }
        const price = this.price(id);
        if ((await this.ask(`${fill(T.confirm, { ITEM: table[id].name })} ${fill(T.price, { N: price })}`)) !== 0) continue;
        if (c.gold < price) { await this.say(T.not_enough_gold); continue; }
        c.gold -= price;
        const old = isSword ? c.sword : c.shield;
        if (old) {
          const back = Math.floor(this.price(old) / 2);
          c.gold = Math.min(GOLD_MAX, c.gold + back);
          this.addStock(isSword ? 'weapons' : 'shields', old);
          await this.say(fill(isSword ? T.trade_in_weapon : T.trade_in_shield, { N: back }));
        }
        if (isSword) c.sword = id; else { c.shield = id; c.shieldHp = RULES.shields[id].power; }
        this.game.refresh(this.local);
        audio.sfx('coin_pickup');
        bought = true;
        await this.say(T.again2 || T.again);
      } else if (v === 'explain') {
        const all = [...this.stock('weapons'), ...this.stock('shields')];
        const id = await this.choose([...all.map((x) => ({ label: (RULES.swords[x] || RULES.shields[x])?.name || x, value: x })), { label: 'Back', value: null }], { title: T.explain_prompt ? 'Explain goods' : '' });
        if (id) await this.say(E[id] || '...');
      }
    }
    await this.say(bought ? T.leave_after_purchase : T.leave_without_purchase);
  }

  async magicShop() {
    const T = this.shopRules.magic?.texts || {};
    const D = this.shopRules.magic?.descriptions || {};
    const c = this.c;
    await this.say(T.greeting);
    for (;;) {
      const v = await this.choose([{ label: 'Buy item', value: 'buy' }, { label: 'Sell item', value: 'sell' }, { label: 'Description of item', value: 'desc' }, { label: 'Go outside', value: 'out' }], { title: 'Witchcraft Implements', cancel: 'out' });
      if (v === 'out' || v == null) break;
      if (v === 'buy') {
        const id = await this.choose([...this.stock('magic').map((x) => ({ label: RULES.items[x]?.name || x, value: x, right: `${this.price(x)} G`, hint: itemDesc(x, c) })), { label: 'Back', value: null }], { title: T.buy_prompt });
        if (!id) continue;
        const price = this.price(id);
        if ((await this.ask(`${fill(T.confirm, { ITEM: RULES.items[id].name })} ${fill(T.price, { N: price })}`)) !== 0) continue;
        if (c.items.length >= 5) { await this.say(T.full); continue; }
        if (c.gold < price) { await this.say(T.no_money); continue; }
        c.gold -= price; c.items.push(id); audio.sfx('coin_pickup');
        await this.say(T.thanks);
      } else if (v === 'sell') {
        if (!c.items.length) { await this.say(T.nothing_to_sell); continue; }
        const i = await this.choose([...c.items.map((x, k) => ({ label: RULES.items[x]?.name || x, value: k, right: `${Math.floor(this.price(x) / 2)} G` })), { label: 'Back', value: null }], { title: T.sell_prompt });
        if (i == null) continue;
        const id = c.items[i];
        const offer = Math.floor(this.price(id) / 2);
        if ((await this.ask(fill(T.sell_offer, { N: offer }))) !== 0) { await this.say(T.sell_declined); continue; }
        c.items.splice(i, 1); c.gold = Math.min(GOLD_MAX, c.gold + offer); audio.sfx('coin_pickup');
        await this.say(T.thanks);
      } else if (v === 'desc') {
        const id = await this.choose([...this.stock('magic').map((x) => ({ label: RULES.items[x]?.name || x, value: x })), { label: 'Back', value: null }], { title: T.describe_prompt });
        if (id) await this.say(D[id] || itemDesc(id, c) || '...');
      }
    }
    await this.say(T.bye);
  }

  async bank() {
    const T = this.shopRules.bank?.texts || {};
    const c = this.c;
    const rate = this.townRules.bank || { almas_in: 1, gold_out: 6 };
    // Japanese balance: lower rates (gold per alma) from japanese_balance.json.
    let inA = rate.almas_in, outG = rate.gold_out;
    if (RULES.jp) { const r = RULES.exchange[this.key]; if (r != null) { if (r >= 1) { inA = 1; outG = r; } else { inA = Math.round(1 / r); outG = 1; } } }
    await this.say(T.greeting);
    let business = false;
    for (;;) {
      const v = await this.choose([{ label: 'Exchange almas', value: 'ex', right: `${inA} : ${outG}` }, { label: 'Deposit money', value: 'dep' }, { label: 'Withdraw money', value: 'wd' }, { label: 'Check balance', value: 'bal' }, { label: 'Go outside', value: 'out' }], { title: 'The Bank', cancel: 'out' });
      if (v === 'out' || v == null) break;
      business = true;
      if (v === 'ex') {
        if (!c.almas) { await this.say(T.no_almas); continue; }
        if ((await this.ask(fill(T.rate, { IN: inA, OUT: outG }))) !== 0) continue;
        if (c.almas < inA) { await this.say(T.not_enough_almas); continue; }
        const n = Math.floor(c.almas / inA);
        c.almas -= n * inA; c.gold = Math.min(GOLD_MAX, c.gold + n * outG);
        audio.sfx('coin_pickup');
        this.game.toast(`+${n * outG} gold`, COLORS.gold);
      } else if (v === 'dep') {
        if (!c.gold) { await this.say(T.no_gold); continue; }
        await this.say(T.deposit_prompt);
        const n = await this.amount(c.gold, 'Deposit');
        if (!n) continue;
        c.gold -= n; c.bank += n; audio.sfx('coin_pickup');
        await this.say(n >= 1000 ? T.large_deposit : T.small_deposit);
      } else if (v === 'wd') {
        if (!c.bank) { await this.say(T.empty_account); continue; }
        await this.say(T.withdraw_prompt);
        // The purse holds at most 16,777,215 G (24 bits, as the original): withdraw up to that.
        const n = await this.amount(Math.min(c.bank, GOLD_MAX - c.gold), 'Withdraw');
        if (!n) continue;
        c.bank -= n; c.gold += n; audio.sfx('coin_pickup');
        await this.say(n === 1 ? T.withdraw_one : fill(T.withdraw_done, { N: n }));
      } else if (v === 'bal') {
        await this.say(c.bank === 0 ? T.account_empty : c.bank === 1 ? T.check_one : fill(T.check, { N: c.bank }));
      }
    }
    await this.say(business ? T.bye : T.no_business);
  }

  async inn() {
    const T = this.shopRules.inn?.texts || {};
    const price = this.townRules.inn?.price ?? 50;
    const c = this.c;
    if ((await this.ask(fill(T.offer, { N: price }))) !== 0) { await this.say(T.declined); return; }
    if (c.gold < price) { await this.say(T.no_money); return; }
    c.gold -= price;
    await this.say(T.accepted);
    await this.sleep();
    for (const l of this.game.locals) { l.character.hp = maxHp(l.character); refillSpells(l.character); }
    await this.say(T.morning);
  }
  sleep() {
    return new Promise((res) => { this.night = 0; audio.sfx('inn_rest', { vol: 0.6 }); this.nightDone = res; });
  }

  async church() {
    const T = this.shopRules.church?.texts || {};
    const c = this.c;
    const hurt = c.hp < maxHp(c);
    const first = !this.game.hasBit('0xe6', this.key === 'esco' ? 0x02 : 0x01);
    if (first) this.game.setBit('0xe6', this.key === 'esco' ? 0x02 : 0x01);
    await this.say(first ? T.first_visit : hurt ? T.visit_when_hurt : T.visit_when_healthy);
    for (const l of this.game.locals) { l.character.hp = maxHp(l.character); refillSpells(l.character); }
    audio.sfx('heal', { vol: 0.6 });
    this.glow = 1.2;
  }

  async sage() {
    const S = this.townRules.sage || {};
    const R = this.shopRules.sage || {};
    const g = this.game, c = this.c;
    const cap = RULES.sageCaps[this.key] ?? 255;
    // Speaking to a Sage marks it as the last Sage (the Japanese respawn point).
    for (const l of g.locals) l.character.lastSage = this.town.mapId;
    const metBit = { muralla: 0x80, satono: 0x40, bosque: 0x20, helada: 0x10, tumba: 0x08, dorado: 0x04, llama: 0x02, pureza: 0x01 }[this.key] || 0;
    if (metBit && !g.hasBit('0xe5', metBit)) {
      g.setBit('0xe5', metBit);
      await this.say(S.intro_text || 'I am the Sage.');
      const sp = (S.spell_taught_on_first_visit || '').toLowerCase();
      if (sp && SPELLS[sp]) {
        for (const l of g.locals) { const ch = l.character; if (!ch.spellsLearned.includes(sp)) ch.spellsLearned.push(sp); ch.spell = sp; }
        audio.sfx('level_up');
        g.toast(`You learned ${SPELLS[sp].name}!`, COLORS.magic);
      }
    }
    if (this.town.opts.wake) {
      this.town.opts.wake = false;
      await this.say(R.after_death || []);
    }
    await this.say(R.greeting);
    for (;;) {
      const v = await this.choose([{ label: 'See Power', value: 'power' }, { label: 'Listen Knowledge', value: 'know' }, { label: 'Record Experience', value: 'save' }, { label: 'Go outside', value: 'out' }], { title: S.name ? `Sage ${S.name}` : 'Sage', cancel: 'out' });
      if (v === 'out' || v == null) break;
      if (v === 'power') {
        const sp = R.see_power || {};
        await this.say([sp.prayer, sp.prayer2].filter(Boolean));
        for (const l of g.locals) {
          const ch = l.character;
          let tier = sageTier(ch);
          if (tier === 3 && ch.level >= cap) tier = 4;
          const who = g.locals.length > 1 ? `${ch.name}: ` : '';
          await this.say(who + (sp.tier_texts?.[tier] || ''));
          if (tier === 3) {
            levelUp(ch);
            g.refresh(l);
            audio.sfx('level_up');
            this.glow = 1.5;
            g.toast(`${ch.name} reached level ${ch.level}!`, COLORS.gold);
          }
        }
        g.coop?.onLevel?.();
      } else if (v === 'know') {
        await this.say(S.knowledge_hint || '...');
      } else if (v === 'save') {
        const rec = R.record_experience || {};
        await this.say((rec.prompt || 'I shall record your experiences.').replace('\nInput name:', ''));
        const ok = g.save();
        for (const l of g.locals.slice(1)) g.save(l);
        await this.say(ok ? (rec.done || 'Your journey has been recorded.').replace('Place is saved on user disk.', 'Your journey is recorded.') : 'This knight has no save slot to record to.');
      }
      await this.say(R.again);
    }
    await this.say(R.bye);
  }

  async king() {
    const g = this.game;
    const story = g.data.rules.story?.king?.scripts || [];
    const s5 = g.getByte('0x05'), s6 = g.getByte('0x06'), s49 = g.getByte('0x49');
    const id = !s5 && !s6 ? 'first_visit' : !s6 ? 'reminder_before_caverns' : !s49 ? 'after_entering_caverns' : 'post_victory';
    const sc = story.find((x) => x.id === id);
    const lines = sc ? sc.lines : ['Brave Duke Garland...'];
    if (id === 'first_visit') {
      await this.say(lines.slice(0, 3).join(' '), { speaker: 'King Felishika' });
      for (let i = 0; i < 10; i++) { for (const l of g.locals) l.character.gold = Math.min(GOLD_MAX, l.character.gold + 100); audio.sfx('coin_pickup', { vol: 0.5, rate: 1 + i * 0.03 }); await wait(130); }
      g.setBit('0x05', 0xff);
      await this.say(lines.slice(3), { speaker: 'King Felishika' });
    } else await this.say(lines.join(' '), { speaker: 'King Felishika' });
  }

  async princess() {
    const g = this.game;
    this.stone = true;
    if (g.getByte('0x49')) {
      this.stone = false;
      const { StoryScene } = await import('./story.js');
      g.pop();
      g.transition(() => new StoryScene(g, 'ending', () => g.transition(() => new (this.town.constructor)(g, { mapId: 'cmap', x: 90 }))));
      return new Promise(() => {});
    }
    await this.say('Princess Felicia has been turned to stone. Only the nine Tears of Esmesanti can break the spell.', { speaker: '' });
  }

  // ------------------------------------------------------------ loop
  update(dt) {
    this.t += dt;
    if (this.glow > 0) this.glow -= dt;
    const m = this.game.menu;
    if (this.nightDone) {
      this.night += dt;
      if (this.night > 1.8) { const r = this.nightDone; this.nightDone = null; r(); }
      return;
    }
    const w = this.widget;
    if (!w) return;
    if (w.kind === 'amount') {
      if (m.pressed('right')) w.amount = Math.min(w.max, w.amount + 1);
      if (m.pressed('left')) w.amount = Math.max(0, w.amount - 1);
      if (m.pressed('up')) w.amount = Math.min(w.max, w.amount + (w.amount >= 1000 ? 100 : 10));
      if (m.pressed('down')) w.amount = Math.max(0, w.amount - (w.amount > 1000 ? 100 : 10));
      if (m.pressed('menu')) w.amount = w.max;
      if (m.pressed('confirm') || m.pressed('attack')) w.done(w.amount);
      if (m.pressed('cancel')) w.done(0);
      return;
    }
    if (w instanceof Dialogue) w.update(dt, m); else w.update(m);
  }

  draw(t) {
    // Dim the street behind, then the room.
    this.town.draw(t);
    fade(0.72, '#06040c');
    panel(30, 24, W - 60, H - 48, { alpha: 0.96 });
    text(TITLE[this.service] || '', W / 2, 40, { size: 22, align: 'center', color: COLORS.gold });
    if (this.portrait) {
      ctx.save();
      if (this.stone) ctx.filter = 'grayscale(1) contrast(1.1) brightness(0.9)';
      const s = Math.min(380 / this.portrait.width, 330 / this.portrait.height);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.portrait, 60, 80, this.portrait.width * s, this.portrait.height * s);
      ctx.restore();
      ctx.strokeStyle = COLORS.panelEdge; ctx.lineWidth = 2; ctx.strokeRect(60, 80, this.portrait.width * s, this.portrait.height * s);
    } else {
      ctx.fillStyle = '#1a1424'; ctx.fillRect(60, 80, 330, 330);
      text(this.speaker(), 225, 230, { size: 20, align: 'center', color: COLORS.dim });
    }
    // Purse
    const c = this.c;
    text(`Gold ${c.gold}`, 470, 70, { size: 16, color: COLORS.gold });
    text(`Almas ${c.almas}`, 610, 70, { size: 16, color: COLORS.almas });
    if (c.bank) text(`Bank ${c.bank}`, 760, 70, { size: 16, color: COLORS.dim });
    text(`HP ${c.hp}/${maxHp(c)}   Lv ${c.level}   XP ${c.xp}/${xpNeeded(c)}`, 470, 92, { size: 14, color: COLORS.dim });
    if (this.glow > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(0.5, this.glow / 2); ctx.fillStyle = '#ffe9a8'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
    const w = this.widget;
    if (w?.kind === 'amount') {
      panel(520, 200, 340, 130);
      text(w.prompt, 690, 216, { size: 18, align: 'center', color: COLORS.gold });
      text(`${w.amount} G`, 690, 250, { size: 30, align: 'center' });
      text('←→ ±1   ↑↓ ±10   Menu: all   Enter: OK', 690, 296, { size: 12, align: 'center', color: COLORS.dim });
    } else w?.draw();
    if (this.nightDone) fade(Math.sin(Math.min(1, this.night / 1.8) * Math.PI), '#000');
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export { SPELL_ORDER, drawCover, shieldTier };
