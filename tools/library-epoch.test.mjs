import test from 'node:test';
import assert from 'node:assert/strict';
import { epochMatches, beginForegroundEpoch, takeForegroundEpoch } from '../library-epoch.mjs';

test('an operation captured before deletion cannot pass the post-delete fence', () => {
  const beforeDelete = 4;
  const afterDelete = beforeDelete + 1;
  assert.equal(epochMatches(beforeDelete, afterDelete), false);
});

test('a foreground scramble captured after deletion can pass the new epoch fence', () => {
  const afterDelete = 5;
  assert.equal(epochMatches(afterDelete, afterDelete), true);
});

test('missing, negative, and unsafe epochs fail closed', () => {
  assert.equal(epochMatches(undefined, 0), false);
  assert.equal(epochMatches(-1, -1), false);
  assert.equal(epochMatches(Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER + 1), false);
});

test('foreground epoch is snapshotted at request start, not consumed/display time', async () => {
  let databaseEpoch = 8;
  beginForegroundEpoch(() => databaseEpoch);
  databaseEpoch = 9; // deletion committed while generator was pending
  const displayedRequestEpoch = await takeForegroundEpoch();
  assert.equal(displayedRequestEpoch, 8);
  assert.equal(epochMatches(displayedRequestEpoch, databaseEpoch), false);
});

test('only the current foreground request epoch is used after a superseding request', async () => {
  let databaseEpoch = 1;
  beginForegroundEpoch(() => databaseEpoch);
  databaseEpoch = 2;
  beginForegroundEpoch(() => databaseEpoch);
  const currentRequestEpoch = await takeForegroundEpoch();
  assert.equal(currentRequestEpoch, 2);
  assert.equal(epochMatches(currentRequestEpoch, databaseEpoch), true);
});

test('manual and background writes share the same stale epoch decision', () => {
  const capturedEpoch = 11;
  const afterDelete = 12;
  const writes = ['background-batch', 'manual-batch'];
  for (const _write of writes) assert.equal(epochMatches(capturedEpoch, afterDelete), false);
});
