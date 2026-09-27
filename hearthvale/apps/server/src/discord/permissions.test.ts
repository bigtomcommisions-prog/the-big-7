import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits, type GuildBasedChannel, type GuildMember } from 'discord.js';
import { PermissionService } from './permissions.ts';
import type { DiscordBot } from './bot.ts';

const perms = new PermissionService({ on: () => undefined } as unknown as DiscordBot);

function member(opts: { timedOut?: boolean; serverMute?: boolean } = {}) {
  return { isCommunicationDisabled: () => Boolean(opts.timedOut), voice: { serverMute: opts.serverMute ?? null } } as unknown as GuildMember;
}
function channel(name: string, voice: boolean, granted: bigint[]) {
  return {
    name,
    isVoiceBased: () => voice,
    permissionsFor: () => ({ has: (need: bigint[]) => need.every((p) => granted.includes(p)) }),
  } as unknown as GuildBasedChannel;
}
const { ViewChannel, SendMessages, Connect, Speak } = PermissionFlagsBits;

test('talking outdoors is allowed unless timed out or server-muted', () => {
  assert.equal(perms.speakBlock(member(), null), null);
  assert.match(perms.speakBlock(member({ timedOut: true }), null) ?? '', /timed out/);
  assert.match(perms.speakBlock(member({ serverMute: true }), null) ?? '', /server-muted/);
});

test('in a house you need Send Messages in that channel', () => {
  assert.equal(perms.speakBlock(member(), channel('general', false, [ViewChannel, SendMessages])), null);
  assert.match(perms.speakBlock(member(), channel('announcements', false, [ViewChannel])) ?? '', /#announcements/);
  assert.match(perms.speakBlock(member({ timedOut: true }), channel('general', false, [ViewChannel, SendMessages])) ?? '', /timed out/);
});

test('in a voice gazebo you need Connect and Speak in that channel', () => {
  assert.equal(perms.speakBlock(member(), channel('Lounge', true, [ViewChannel, Connect, Speak])), null);
  assert.match(perms.speakBlock(member(), channel('Stage', true, [ViewChannel, Connect])) ?? '', /speak in Stage/);
  assert.notEqual(perms.speakBlock(member(), channel('Stage', true, [ViewChannel, SendMessages])), null);
});
