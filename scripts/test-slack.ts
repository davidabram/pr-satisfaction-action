import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { sendFeedbackRequests, createSlackApiClient } from '../src/pr-feedback/slack-delivery';
import { resolveSlackRecipients } from '../src/pr-feedback/slack-mapping';
import { createRandomPullRequestContext } from '../src/test-utils/random-pr-data';
import type { Participant } from '../src/pr-feedback/participants';

function parseDotEnv(text: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const normalizedLine = line.startsWith('export ') ? line.slice(7).trim() : line;
    const separatorIndex = normalizedLine.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalizedLine.slice(0, separatorIndex).trim();
    const rawValue = normalizedLine.slice(separatorIndex + 1).trim();

    if (!key) {
      continue;
    }

    const isQuoted =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"));

    values[key] = isQuoted ? rawValue.slice(1, -1) : rawValue;
  }

  return values;
}

async function loadEnvFile(filePath: string): Promise<NodeJS.ProcessEnv> {
  const text = await readFile(filePath, 'utf8');
  const fileEnv = parseDotEnv(text);

  return {
    ...fileEnv,
    ...process.env,
  };
}

function getRequiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const recipientLogins = args.length > 0 ? args : ['davidabram'];

  const envPath = path.resolve(process.cwd(), '.env');
  const env = await loadEnvFile(envPath);
  const pullRequest = createRandomPullRequestContext();
  const workflowUrl = getRequiredEnv(env, 'SLACK_WORKFLOW_URL');
  const slackBotToken = getRequiredEnv(env, 'SLACK_BOT_TOKEN');
  const userMapJson = getRequiredEnv(env, 'USER_MAP_JSON');

  const participants: Participant[] = recipientLogins.map((login) => ({ login, roles: ['author'] }));
  const recipientResolution = resolveSlackRecipients(participants, userMapJson);
  const recipients = recipientResolution.mappedParticipants;

  if (recipients.length === 0) {
    throw new Error(`USER_MAP_JSON does not include Slack user IDs for any of: ${recipientLogins.join(', ')}`);
  }

  const slackClient = createSlackApiClient(slackBotToken);

  console.log('Generated PR data:');
  console.log(JSON.stringify(pullRequest, null, 2));
  console.log(`Sending Slack feedback request to ${recipientLogins.join(', ')}...`);

  const deliveryResult = await sendFeedbackRequests(slackClient, recipients, pullRequest, workflowUrl);

  console.log('Delivery result:');
  console.log(JSON.stringify(deliveryResult, null, 2));

  if (deliveryResult.failed.length > 0) {
    const failedLogins = deliveryResult.failed.map((f) => f.login).join(', ');
    throw new Error(`Slack delivery failed for: ${failedLogins}`);
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
