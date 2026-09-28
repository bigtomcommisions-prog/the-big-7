import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_APPEARANCE, DEFAULT_PREFERENCES } from '@hearthvale/shared';
import { openDatabase } from './index.ts';
import { createRepos } from './repos.ts';

test('data export includes everything stored, and delete erases it (GDPR)', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'hv-db-'));
  const db = openDatabase(`file:${join(dir, 'test.db')}`);
  t.after(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const repos = createRepos(db);
  for (const id of ['u1', 'u2']) {
    repos.users.upsert({ id, username: id, global_name: null, avatar: null });
    repos.sessions.create({ id_hash: `h-${id}`, user_id: id, access_token_enc: 'x', refresh_token_enc: 'y', token_expires_at: 1, created_at: 1, expires_at: Date.now() + 1e6 } as never);
    repos.characters.set(id, DEFAULT_APPEARANCE);
    repos.preferences.set(id, DEFAULT_PREFERENCES);
    repos.worldMessages.record(`m-${id}`, 'g', 'c', id);
    repos.activePlayers.join(id, 'g');
  }

  const data = repos.users.export('u1');
  assert.equal((data.user as { id: string }).id, 'u1');
  assert.equal(data.sessions.length, 1);
  assert.ok(!JSON.stringify(data).includes('access_token'), 'tokens must not be exported');
  assert.deepEqual((data.character as { appearance: unknown }).appearance, DEFAULT_APPEARANCE);
  assert.equal(data.messagesSentFromWorld.length, 1);

  repos.users.deleteAll('u1');
  const gone = repos.users.export('u1');
  assert.equal(gone.user, null);
  assert.equal(gone.sessions.length + gone.messagesSentFromWorld.length + gone.activeWorlds.length, 0);
  assert.equal(gone.character, null);
  assert.equal(gone.preferences, null);
  // Other users untouched
  assert.equal(repos.users.export('u2').sessions.length, 1);
});
