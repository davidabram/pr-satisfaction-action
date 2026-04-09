import type { MappedParticipant } from './slack-mapping';

export interface PullRequestContext {
  number: number;
  title: string;
  url: string;
  merged: boolean;
  author?: string;
  closedAt?: string;
}

export interface SlackMessagePayload {
  text: string;
  blocks: unknown[];
}

export interface SlackApiClient {
  openDirectMessage(slackUserId: string): Promise<{ channelId: string }>;
  postMessage(channelId: string, message: SlackMessagePayload): Promise<{ ts?: string }>;
}

export interface SlackDeliverySuccess {
  login: string;
  slackUserId: string;
  channelId: string;
  ts?: string;
}

export interface SlackDeliveryFailure {
  login: string;
  slackUserId: string;
  error: string;
}

export interface SlackDeliveryResult {
  sent: SlackDeliverySuccess[];
  failed: SlackDeliveryFailure[];
}

type FetchLike = typeof fetch;

function getClosureLabel(merged: boolean): string {
  return merged ? 'merged' : 'closed without merge';
}

function formatParticipantRoles(roles: string[]): string {
  return roles.join(', ');
}

async function callSlackApi<TResponse extends Record<string, unknown>>(
  fetchImpl: FetchLike,
  token: string,
  method: string,
  body: Record<string, unknown>,
): Promise<TResponse> {
  const response = await fetchImpl(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Slack API request failed for ${method}: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as TResponse & { ok?: boolean; error?: string };

  if (payload.ok !== true) {
    throw new Error(`Slack API request failed for ${method}: ${payload.error ?? 'unknown_error'}`);
  }

  return payload;
}

function formatDate(dateString: string | undefined): string {
  if (!dateString) {
    return '';
  }

  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

export function formatFeedbackRequestMessage(
  participant: MappedParticipant,
  pullRequest: PullRequestContext,
  workflowUrl: string,
): SlackMessagePayload {
  const headerText = `👋 PR Feedback Request - PR #${pullRequest.number}`;

  // Build context lines with available data
  const contextLines: string[] = [
    `📋 *PR #${pullRequest.number}:* ${pullRequest.title}`,
    `🔗 <${pullRequest.url}|View PR>`,
    `📝 Remember PR #${pullRequest.number} — copy/paste the PR number or PR URL into the next step.`,
  ];

  // Add author if available
  const author = pullRequest.author ?? '@author';
  contextLines.push(`👤 Author: ${author}`);

  // Add closed date if available
  const closedDate = formatDate(pullRequest.closedAt);
  if (closedDate) {
    contextLines.push(`📅 Closed: ${closedDate}`);
  }

  return {
    text: headerText,
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
          text: contextLines.join('\n'),
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
            url: workflowUrl,
            style: 'primary',
          },
        ],
      },
    ],
  };
}

export function createSlackApiClient(token: string, fetchImpl: FetchLike = fetch): SlackApiClient {
  return {
    async openDirectMessage(slackUserId: string): Promise<{ channelId: string }> {
      const payload = await callSlackApi<{ channel?: { id?: string } }>(
        fetchImpl,
        token,
        'conversations.open',
        { users: slackUserId },
      );

      const channelId = payload.channel?.id;

      if (!channelId) {
        throw new Error(`Slack API request failed for conversations.open: missing channel id for ${slackUserId}`);
      }

      return { channelId };
    },

    async postMessage(channelId: string, message: SlackMessagePayload): Promise<{ ts?: string }> {
      const payload = await callSlackApi<{ ts?: string }>(fetchImpl, token, 'chat.postMessage', {
        channel: channelId,
        ...message,
      });

      return { ts: payload.ts };
    },
  };
}

export async function sendFeedbackRequests(
  slackClient: SlackApiClient,
  recipients: MappedParticipant[],
  pullRequest: PullRequestContext,
  workflowUrl: string,
): Promise<SlackDeliveryResult> {
  const sent: SlackDeliverySuccess[] = [];
  const failed: SlackDeliveryFailure[] = [];

  for (const recipient of recipients) {
    try {
      const { channelId } = await slackClient.openDirectMessage(recipient.slackUserId);
      const messagePayload = formatFeedbackRequestMessage(recipient, pullRequest, workflowUrl);
      const { ts } = await slackClient.postMessage(channelId, messagePayload);

      sent.push({
        login: recipient.login,
        slackUserId: recipient.slackUserId,
        channelId,
        ts,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Slack delivery error';

      failed.push({
        login: recipient.login,
        slackUserId: recipient.slackUserId,
        error: message,
      });
    }
  }

  return { sent, failed };
}
