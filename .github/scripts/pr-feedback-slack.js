const { appendFile, readFile } = require('node:fs/promises');

const need = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const writeOutput = async (values) => {
  const path = process.env.GITHUB_OUTPUT?.trim();
  if (!path) return;
  await appendFile(path, `${Object.entries(values).map(([k, v]) => `${k}=${v}`).join('\n')}\n`);
};

const api = async (url, init, label) => {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
  return res.json();
};

const githubGet = (path, token) =>
  api(
    `https://api.github.com${path}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'pr-satisfaction-action',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
    `GitHub API request failed for ${path}`,
  );

const slackPost = async (method, body, token) => {
  const payload = await api(
    `https://slack.com/api/${method}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(body),
    },
    `Slack API request failed for ${method}`,
  );
  if (payload.ok !== true) throw new Error(`Slack API request failed for ${method}: ${payload.error ?? 'unknown_error'}`);
  return payload;
};

const parseMap = (raw) => {
  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new Error(`USER_MAP_JSON must be valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('USER_MAP_JSON must be a JSON object keyed by GitHub login');
  }
  return Object.fromEntries(
    Object.entries(data).map(([login, slack]) => {
      if (!login.trim()) throw new Error('USER_MAP_JSON cannot contain empty GitHub login keys');
      if (typeof slack !== 'string' || !slack.trim()) {
        throw new Error(`USER_MAP_JSON entry for "${login}" must be a non-empty Slack user ID string`);
      }
      return [login.trim(), slack.trim()];
    }),
  );
};

const add = (people, user, role) => {
  const login = user?.login?.trim();
  if (!login || user?.type === 'Bot' || login.endsWith('[bot]')) return;
  (people.get(login) ?? people.set(login, new Set()).get(login)).add(role);
};

const collectParticipants = (event, reviews, issueComments, reviewComments) => {
  const people = new Map();
  add(people, event.pull_request?.user, 'author');
  for (const item of reviews) add(people, item.user, 'reviewer');
  for (const item of issueComments) add(people, item.user, 'commenter');
  for (const item of reviewComments) add(people, item.user, 'commenter');
  return [...people].map(([login, roles]) => ({ login, roles: [...roles] }));
};

const messageFor = (pr, workflowUrl) => {
  const closed = pr.closedAt && !Number.isNaN(new Date(pr.closedAt).getTime())
    ? new Date(pr.closedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : '';
  const lines = [
    `📋 *PR #${pr.number}:* ${pr.title}`,
    `🔗 <${pr.url}|View PR>`,
    `📝 Remember PR #${pr.number} - copy/paste the PR number or PR URL into the next step.`,
    `👤 Author: ${pr.author ?? '@author'}`,
    closed && `📅 Closed: ${closed}`,
  ].filter(Boolean);
  return {
    text: `PR Feedback Request - PR #${pr.number}`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: 'PR Feedback Request' } },
      { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
      {
        type: 'actions',
        elements: [{ type: 'button', text: { type: 'plain_text', text: 'Give Feedback', emoji: true }, url: workflowUrl, style: 'primary' }],
      },
    ],
  };
};

async function main() {
  const event = JSON.parse(await readFile(need('GITHUB_EVENT_PATH'), 'utf8'));
  if (event.action !== 'closed' || !event.pull_request) {
    await writeOutput({ status: 'skipped', participant_count: 0, mapped_count: 0, unmapped_count: 0, unmapped_logins: '[]', sent_count: 0, failed_count: 0, failed_logins: '[]' });
    return;
  }

  const githubToken = need('GITHUB_TOKEN');
  const slackToken = need('SLACK_BOT_TOKEN');
  const workflowUrl = need('SLACK_WORKFLOW_URL');
  const userMap = parseMap(need('USER_MAP_JSON'));
  const fullName = process.env.GITHUB_REPOSITORY?.trim() || event.repository?.full_name?.trim();
  const [owner, repo, ...rest] = (fullName || '').split('/');
  if (!owner || !repo || rest.length) throw new Error(`GITHUB_REPOSITORY must be in the form owner/repo: ${fullName}`);

  const { number, merged, closed_at } = event.pull_request;
  const title = event.pull_request.title?.trim();
  const url = event.pull_request.html_url?.trim();
  if (typeof number !== 'number' || !title || !url) throw new Error('Closed pull request event is missing required pull request fields');

  const pr = { number, title, url, merged: merged === true, author: event.pull_request.user?.login?.trim(), closedAt: closed_at?.trim() };
  const [reviews, issueComments, reviewComments] = await Promise.all([
    githubGet(`/repos/${owner}/${repo}/pulls/${number}/reviews?per_page=100`, githubToken),
    githubGet(`/repos/${owner}/${repo}/issues/${number}/comments?per_page=100`, githubToken),
    githubGet(`/repos/${owner}/${repo}/pulls/${number}/comments?per_page=100`, githubToken),
  ]);

  const participants = collectParticipants(event, reviews, issueComments, reviewComments);
  const unmapped = [];
  let mapped = 0;
  let sent = 0;
  let failed = 0;
  const failedLogins = [];

  for (const participant of participants) {
    const slackUserId = userMap[participant.login];
    if (!slackUserId) {
      unmapped.push(participant.login);
      continue;
    }

    mapped += 1;

    try {
      const opened = await slackPost('conversations.open', { users: slackUserId }, slackToken);
      const channel = opened.channel?.id;
      if (!channel) throw new Error(`Slack API request failed for conversations.open: missing channel id for ${slackUserId}`);
      await slackPost('chat.postMessage', { channel, ...messageFor(pr, workflowUrl) }, slackToken);
      sent += 1;
    } catch {
      failed += 1;
      failedLogins.push(participant.login);
    }
  }

  await writeOutput({
    status: 'processed',
    participant_count: participants.length,
    mapped_count: mapped,
    unmapped_count: unmapped.length,
    unmapped_logins: JSON.stringify(unmapped),
    sent_count: sent,
    failed_count: failed,
    failed_logins: JSON.stringify(failedLogins),
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
