// Local fixture setup only. All Wrangler invocations explicitly use --local
// and an isolated persistence directory; no production account is touched.
import { randomBytes, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..'), cloud = path.resolve(root, '../ev-online/cloud');
const db = path.resolve(root, '../invite-test-db');
const wrangler = path.join(cloud, 'node_modules/wrangler/bin/wrangler.js');
const execute = args => execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'ev-online', '--local', '--config', 'wrangler.retro-dev.toml', '--persist-to', db, ...args], { cwd: cloud, stdio: 'pipe', windowsHide: true });
execute(['--file', 'schema.sql']);
const fixtures = Array.from({ length: 11 }, (_, i) => ({ id: 910001 + i, token: randomBytes(32).toString('base64url'), tier: i === 8 ? 'basic' : i === 9 ? 'guest' : 'full', stage: i === 10 ? 'account' : 'profile' }));
const now = Date.now();
execute(['--command', fixtures.map(f => `INSERT OR REPLACE INTO accounts(id,username,username_key,pw_hash,recovery_hash,created_at,tier,approval,kind) VALUES(${f.id},'Invite fixture ${f.id}','invite fixture ${f.id}','unused','unused',${now},'${f.tier === 'guest' ? 'basic' : f.tier}','approved','${f.tier === 'guest' ? 'guest' : 'parent'}'); INSERT INTO sessions(token_hash,account_id,created_at,expires_at,stage) VALUES('${createHash('sha256').update(f.token).digest('base64')}',${f.id},${now},${now + 86400e3},'${f.stage}');`).join('\n')]);
fs.mkdirSync(path.join(root, '.qa'), { recursive: true });
fs.writeFileSync(path.join(root, '.qa/invite-fixtures.json'), JSON.stringify(fixtures), { mode: 0o600 });
const vars = path.join(root, 'relay/.dev.vars');
if (!fs.existsSync(vars)) fs.writeFileSync(vars, 'HEROES_SERVICE_TOKEN=' + randomBytes(32).toString('base64url') + '\n', { mode: 0o600 });
console.log('Isolated local fixtures prepared; tokens and service secret remain in ignored local files.');
