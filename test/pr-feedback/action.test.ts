import test from 'node:test';
import assert from 'node:assert/strict';

import { createGitHubApiClient, runClosedPullRequestFeedback, runFromEnvironment } from '../../src/pr-feedback/action';
import type { MappedParticipant } from '../../src/pr-feedback/slack-mapping';

test('runs the closed-PR workflow for a merged PR and reports mapped plus unmapped users', async () => {
  const logs: string[] = [];
  const deliveredTo: string[] = [];
  const postedMessages: unknown[] = [];

  const result = await runClosedPullRequestFeedback({
    event: {
      action: 'closed',
      pull_request: {
        number: 42,
        title: 'Improve webhook retries',
        html_url: 'https://github.com/acme/app/pull/42',
        merged: true,
        user: { login: 'author' },
        closed_at: '2024-01-15T10:30:00Z',
      },
    },
    repositoryFullName: 'acme/app',
    userMapJson: '{"author":"U123","reviewer":"U456"}',
    workflowUrl: 'https://slack.com/workflows/pr-feedback',
    githubClient: {
      async listReviews() {
        return [{ user: { login: 'reviewer' } }];
      },
      async listIssueComments() {
        return [{ user: { login: 'commenter' } }];
      },
      async listReviewComments() {
        return [];
      },
    },
    slackClient: {
      async openDirectMessage(slackUserId: string) {
        deliveredTo.push(`open:${slackUserId}`);
        return { channelId: `D-${slackUserId}` };
      },
      async postMessage(channelId: string, message: unknown) {
        deliveredTo.push(`post:${channelId}`);
        postedMessages.push(message);
        return { ts: `ts-${channelId}` };
      },
    } as any,
    logger: {
      log(message) {
        logs.push(message);
      },
    },
  });

  assert.deepEqual(result, {
    status: 'processed',
    participantCount: 3,
    mappedCount: 2,
    unmappedCount: 1,
    sentCount: 2,
    failedCount: 0,
    unmappedLogins: ['commenter'],
    failedLogins: [],
  });
  assert.deepEqual(deliveredTo, ['open:U123', 'post:D-U123', 'open:U456', 'post:D-U456']);
  assert.deepEqual(postedMessages[0], {
    text: '👋 PR Feedback Request - PR #42',
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '👋 PR Feedback Request',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '📋 *PR #42:* Improve webhook retries\n🔗 <https://github.com/acme/app/pull/42|View PR>\n📝 Remember PR #42 — copy/paste the PR number or PR URL into the next step.\n👤 Author: author\n📅 Closed: Jan 15, 2024',
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Give Feedback',
              emoji: true,
            },
            url: 'https://slack.com/workflows/pr-feedback',
            style: 'primary',
          },
        ],
      },
    ],
  });
  assert.ok(logs.some((message) => message.includes('Processing PR #42 (merged): Improve webhook retries')));
  assert.ok(logs.some((message) => message.includes('Unmapped GitHub logins: ["commenter"]')));
});

test('runs the closed-without-merge workflow and continues after per-user Slack failures', async () => {
  const recipients: MappedParticipant[] = [];

  const result = await runClosedPullRequestFeedback({
    event: {
      action: 'closed',
      pull_request: {
        number: 7,
        title: 'Abandon experiment',
        html_url: 'https://github.com/acme/app/pull/7',
        merged: false,
        user: { login: 'author' },
        closed_at: '2024-02-20T14:45:00Z',
      },
    },
    repositoryFullName: 'acme/app',
    userMapJson: '{"author":"U123","reviewer":"U456"}',
    workflowUrl: 'https://slack.com/workflows/pr-feedback',
    githubClient: {
      async listReviews() {
        return [{ user: { login: 'reviewer' } }];
      },
      async listIssueComments() {
        return [];
      },
      async listReviewComments() {
        return [];
      },
    },
    slackClient: {
      async openDirectMessage(slackUserId) {
        recipients.push({ login: slackUserId, roles: [], slackUserId });
        return { channelId: `D-${slackUserId}` };
      },
      async postMessage(channelId) {
        if (channelId === 'D-U123') {
          throw new Error('Slack API request failed for chat.postMessage: channel_not_found');
        }

        return { ts: `ts-${channelId}` };
      },
    },
  });

  assert.deepEqual(result, {
    status: 'processed',
    participantCount: 2,
    mappedCount: 2,
    unmappedCount: 0,
    sentCount: 1,
    failedCount: 1,
    unmappedLogins: [],
    failedLogins: ['author'],
  });
  assert.equal(recipients.length, 2);
});

test('writes GitHub Action outputs from environment-driven execution', async () => {
  const output: string[] = [];

  const result = await runFromEnvironment({
    env: {
      GITHUB_EVENT_PATH: '/tmp/fake-event.json',
      GITHUB_REPOSITORY: 'acme/app',
      GITHUB_TOKEN: 'ghs_test',
      USER_MAP_JSON: '{"author":"U123"}',
      SLACK_BOT_TOKEN: 'xoxb-test',
      SLACK_WORKFLOW_URL: 'https://slack.com/workflows/pr-feedback',
      GITHUB_OUTPUT: '/tmp/fake-output.txt',
    },
    readTextFile: async () =>
      JSON.stringify({
        action: 'closed',
        pull_request: {
          number: 3,
          title: 'Tighten workflow logs',
          html_url: 'https://github.com/acme/app/pull/3',
          merged: true,
          user: { login: 'author' },
          closed_at: '2024-03-10T08:15:00Z',
        },
      }),
    appendTextFile: async (_path, data) => {
      output.push(data);
    },
    fetchImpl: async (input) => {
      const url = String(input);

      if (url.includes('/pulls/3/reviews')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url.includes('/issues/3/comments')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url.includes('/pulls/3/comments')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url.endsWith('/conversations.open')) {
        return new Response(JSON.stringify({ ok: true, channel: { id: 'D123' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ ok: true, ts: '123.456' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  assert.equal(result.status, 'processed');
  assert.equal(output.length, 1);
  assert.match(output[0] ?? '', /status=processed/);
  assert.match(output[0] ?? '', /participant_count=1/);
  assert.match(output[0] ?? '', /mapped_count=1/);
  assert.match(output[0] ?? '', /unmapped_logins=\[\]/);
});

test('GitHub API client calls the expected PR review and comment endpoints', async () => {
  const requests: Array<{ url: string; method: string; headers: Headers }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);

    requests.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers,
    });

    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const client = createGitHubApiClient('ghs_test', fetchMock);
  await client.listReviews('acme', 'app', 9);
  await client.listIssueComments('acme', 'app', 9);
  await client.listReviewComments('acme', 'app', 9);

  assert.equal(requests.length, 3);
  assert.equal(requests[0]?.url, 'https://api.github.com/repos/acme/app/pulls/9/reviews?per_page=100');
  assert.equal(requests[1]?.url, 'https://api.github.com/repos/acme/app/issues/9/comments?per_page=100');
  assert.equal(requests[2]?.url, 'https://api.github.com/repos/acme/app/pulls/9/comments?per_page=100');
  assert.equal(requests[0]?.method, 'GET');
  assert.equal(requests[0]?.headers.get('Authorization'), 'Bearer ghs_test');
});
