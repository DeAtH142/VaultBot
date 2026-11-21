import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';

if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = `base64:${randomBytes(32).toString('base64')}`;
}

const { verifyUserStatus } = await import('../src/utils/statusGate.js');

const userId = '123456789012345678';

function createClient(member) {
  const guild = {
    members: {
      cache: new Map(member ? [[userId, member]] : []),
    },
  };
  return {
    guilds: { cache: new Map([['guild', guild]]) },
    users: { cache: new Map() },
  };
}

test('allows an online member whose custom status contains .gg/rexal', async () => {
  const member = {
    id: userId,
    user: { displayAvatarURL: () => 'https://example.test/avatar.png' },
    presence: {
      status: 'online',
      activities: [{ type: 4, name: 'Custom Status', state: '.gg/rexal' }],
    },
  };

  const result = await verifyUserStatus(createClient(member), userId, { force: true });

  assert.equal(result.ok, true);
  assert.equal(result.reason, 'sart-tamam');
  assert.equal(result.member.customText, '.gg/rexal');
});

test('does not treat a fetched user object as presence data', async () => {
  const client = {
    guilds: { cache: new Map() },
    users: {
      cache: new Map([[userId, {
        status: 'online',
        activities: [{ type: 4, state: '.gg/rexal' }],
      }]]),
    },
  };

  const result = await verifyUserStatus(client, userId, { force: true });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'durum-gizli');
});
