import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseGitHubToSlackMap,
  resolveSlackRecipients,
} from '../../src/pr-feedback/slack-mapping';

test('parses a valid GitHub-to-Slack mapping JSON object', () => {
  assert.deepEqual(parseGitHubToSlackMap('{"author":"U123","reviewer":"U456"}'), {
    author: 'U123',
    reviewer: 'U456',
  });
});

test('throws a clear error for malformed mapping JSON', () => {
  assert.throws(
    () => parseGitHubToSlackMap('{"author":"U123"'),
    /USER_MAP_JSON must be valid JSON/,
  );
});

test('throws when mapping JSON is not an object', () => {
  assert.throws(
    () => parseGitHubToSlackMap('["U123"]'),
    /must be a JSON object keyed by GitHub login/,
  );
});

test('throws when a mapping entry is empty or not a string', () => {
  assert.throws(
    () => parseGitHubToSlackMap('{"author":"   "}'),
    /entry for "author" cannot be empty/,
  );

  assert.throws(
    () => parseGitHubToSlackMap('{"reviewer":123}'),
    /entry for "reviewer" must be a Slack user ID string/,
  );
});

test('resolves mapped participants and reports unmapped logins', () => {
  const result = resolveSlackRecipients(
    [
      { login: 'author', roles: ['author'] },
      { login: 'reviewer', roles: ['reviewer'] },
      { login: 'commenter', roles: ['commenter'] },
    ],
    '{"author":"U123","commenter":"U789"}',
  );

  assert.deepEqual(result, {
    mappedParticipants: [
      { login: 'author', roles: ['author'], slackUserId: 'U123' },
      { login: 'commenter', roles: ['commenter'], slackUserId: 'U789' },
    ],
    unmappedParticipants: [{ login: 'reviewer', roles: ['reviewer'] }],
    report: {
      mappedCount: 2,
      unmappedCount: 1,
      unmappedLogins: ['reviewer'],
    },
  });
});

test('keeps participant roles intact for mixed mapped and unmapped users', () => {
  const result = resolveSlackRecipients(
    [
      { login: 'shared-user', roles: ['author', 'commenter'] },
      { login: 'reviewer', roles: ['reviewer'] },
    ],
    '{"shared-user":"U123"}',
  );

  assert.deepEqual(result.mappedParticipants, [
    { login: 'shared-user', roles: ['author', 'commenter'], slackUserId: 'U123' },
  ]);
  assert.deepEqual(result.unmappedParticipants, [{ login: 'reviewer', roles: ['reviewer'] }]);
  assert.deepEqual(result.report.unmappedLogins, ['reviewer']);
});
