import { appendFile, readFile } from 'node:fs/promises';

import {
  collectParticipants,
  type CommentLike,
  type GitHubUserLike,
  type PullRequestClosedEventLike,
  type ReviewLike,
} from './participants';
import { createSlackApiClient, sendFeedbackRequests, type PullRequestContext, type SlackApiClient } from './slack-delivery';
import { resolveSlackRecipients } from './slack-mapping';

type FetchLike = typeof fetch;

export interface PullRequestClosedEvent extends PullRequestClosedEventLike {
  action?: string | null;
  repository?: {
    full_name?: string | null;
  } | null;
  pull_request?: {
    number?: number | null;
    title?: string | null;
    html_url?: string | null;
    merged?: boolean | null;
    user?: GitHubUserLike | null;
    closed_at?: string | null;
  } | null;
}

export interface GitHubApiClient {
  listReviews(owner: string, repo: string, pullNumber: number): Promise<ReviewLike[]>;
  listIssueComments(owner: string, repo: string, pullNumber: number): Promise<CommentLike[]>;
  listReviewComments(owner: string, repo: string, pullNumber: number): Promise<CommentLike[]>;
}

export interface ActionLogger {
  log(message: string): void;
}

export interface RunClosedPullRequestFeedbackInput {
  event: PullRequestClosedEvent;
  repositoryFullName: string;
  githubToSlackJson: string;
  workflowUrl: string;
  githubClient: GitHubApiClient;
  slackClient: SlackApiClient;
  logger?: ActionLogger;
}

export interface ActionRunResult {
  status: 'processed' | 'skipped';
  participantCount: number;
  mappedCount: number;
  unmappedCount: number;
  sentCount: number;
  failedCount: number;
  unmappedLogins: string[];
  failedLogins: string[];
}

export interface RunFromEnvironmentOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
  logger?: ActionLogger;
  readTextFile?: (path: string, encoding: BufferEncoding) => Promise<string>;
  appendTextFile?: (path: string, data: string) => Promise<void>;
}

function createError(message: string): Error {
  return new Error(message);
}

function getRequiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();

  if (!value) {
    throw createError(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parseRepositoryFullName(repositoryFullName: string): { owner: string; repo: string } {
  const [owner, repo, ...rest] = repositoryFullName.split('/');

  if (!owner || !repo || rest.length > 0) {
    throw createError(`GITHUB_REPOSITORY must be in the form owner/repo: ${repositoryFullName}`);
  }

  return { owner, repo };
}

function toPullRequestContext(event: PullRequestClosedEvent): PullRequestContext {
  const number = event.pull_request?.number;
  const title = event.pull_request?.title?.trim();
  const url = event.pull_request?.html_url?.trim();

  if (typeof number !== 'number') {
    throw createError('Closed pull request event is missing pull_request.number');
  }

  if (!title) {
    throw createError('Closed pull request event is missing pull_request.title');
  }

  if (!url) {
    throw createError('Closed pull request event is missing pull_request.html_url');
  }

  return {
    number,
    title,
    url,
    merged: event.pull_request?.merged === true,
    author: event.pull_request?.user?.login?.trim() || undefined,
    closedAt: event.pull_request?.closed_at?.trim() || undefined,
  };
}

async function callGitHubApi<TResponse>(
  fetchImpl: FetchLike,
  token: string,
  path: string,
): Promise<TResponse> {
  const response = await fetchImpl(`https://api.github.com${path}`, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'pr-satisfaction-action',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    throw createError(`GitHub API request failed for ${path}: HTTP ${response.status}`);
  }

  return (await response.json()) as TResponse;
}

export function createGitHubApiClient(token: string, fetchImpl: FetchLike = fetch): GitHubApiClient {
  return {
    listReviews(owner: string, repo: string, pullNumber: number): Promise<ReviewLike[]> {
      return callGitHubApi<ReviewLike[]>(
        fetchImpl,
        token,
        `/repos/${owner}/${repo}/pulls/${pullNumber}/reviews?per_page=100`,
      );
    },

    listIssueComments(owner: string, repo: string, pullNumber: number): Promise<CommentLike[]> {
      return callGitHubApi<CommentLike[]>(
        fetchImpl,
        token,
        `/repos/${owner}/${repo}/issues/${pullNumber}/comments?per_page=100`,
      );
    },

    listReviewComments(owner: string, repo: string, pullNumber: number): Promise<CommentLike[]> {
      return callGitHubApi<CommentLike[]>(
        fetchImpl,
        token,
        `/repos/${owner}/${repo}/pulls/${pullNumber}/comments?per_page=100`,
      );
    },
  };
}

function logSummary(logger: ActionLogger, pullRequest: PullRequestContext, result: ActionRunResult): void {
  const closureState = pullRequest.merged ? 'merged' : 'closed without merge';

  logger.log(`Processing PR #${pullRequest.number} (${closureState}): ${pullRequest.title}`);
  logger.log(`Participants identified: ${result.participantCount}`);
  logger.log(`Mapped recipients: ${result.mappedCount}`);
  logger.log(`Unmapped recipients: ${result.unmappedCount}`);
  logger.log(`Unmapped GitHub logins: ${JSON.stringify(result.unmappedLogins)}`);
  logger.log(`Slack messages sent: ${result.sentCount}`);
  logger.log(`Slack delivery failures: ${result.failedCount}`);
  logger.log(`Failed Slack recipient logins: ${JSON.stringify(result.failedLogins)}`);
}

async function writeGitHubOutputs(
  appendTextFile: (path: string, data: string) => Promise<void>,
  outputPath: string,
  result: ActionRunResult,
): Promise<void> {
  const lines = [
    `status=${result.status}`,
    `participant_count=${result.participantCount}`,
    `mapped_count=${result.mappedCount}`,
    `unmapped_count=${result.unmappedCount}`,
    `unmapped_logins=${JSON.stringify(result.unmappedLogins)}`,
    `sent_count=${result.sentCount}`,
    `failed_count=${result.failedCount}`,
    `failed_logins=${JSON.stringify(result.failedLogins)}`,
    '',
  ].join('\n');

  await appendTextFile(outputPath, lines);
}

export async function runClosedPullRequestFeedback({
  event,
  repositoryFullName,
  githubToSlackJson,
  workflowUrl,
  githubClient,
  slackClient,
  logger = console,
}: RunClosedPullRequestFeedbackInput): Promise<ActionRunResult> {
  if (event.action !== 'closed' || !event.pull_request) {
    logger.log('Skipping run because the event is not pull_request.closed.');

    return {
      status: 'skipped',
      participantCount: 0,
      mappedCount: 0,
      unmappedCount: 0,
      sentCount: 0,
      failedCount: 0,
      unmappedLogins: [],
      failedLogins: [],
    };
  }

  const { owner, repo } = parseRepositoryFullName(repositoryFullName);
  const pullRequest = toPullRequestContext(event);
  const [reviews, issueComments, reviewComments] = await Promise.all([
    githubClient.listReviews(owner, repo, pullRequest.number),
    githubClient.listIssueComments(owner, repo, pullRequest.number),
    githubClient.listReviewComments(owner, repo, pullRequest.number),
  ]);

  const participants = collectParticipants({
    event,
    reviews,
    issueComments,
    reviewComments,
  });
  const recipients = resolveSlackRecipients(participants, githubToSlackJson);
  const delivery = await sendFeedbackRequests(
    slackClient,
    recipients.mappedParticipants,
    pullRequest,
    workflowUrl,
  );

  const result: ActionRunResult = {
    status: 'processed',
    participantCount: participants.length,
    mappedCount: recipients.report.mappedCount,
    unmappedCount: recipients.report.unmappedCount,
    sentCount: delivery.sent.length,
    failedCount: delivery.failed.length,
    unmappedLogins: recipients.report.unmappedLogins,
    failedLogins: delivery.failed.map((failure) => failure.login),
  };

  logSummary(logger, pullRequest, result);

  return result;
}

export async function runFromEnvironment({
  env = process.env,
  fetchImpl = fetch,
  logger = console,
  readTextFile = readFile,
  appendTextFile = appendFile,
}: RunFromEnvironmentOptions = {}): Promise<ActionRunResult> {
  const eventPath = getRequiredEnv(env, 'GITHUB_EVENT_PATH');
  const slackBotToken = getRequiredEnv(env, 'SLACK_BOT_TOKEN');
  const workflowUrl = getRequiredEnv(env, 'SLACK_WORKFLOW_URL');
  const githubToSlackJson = getRequiredEnv(env, 'GITHUB_TO_SLACK_JSON');
  const githubToken = getRequiredEnv(env, 'GITHUB_TOKEN');
  const event = JSON.parse(await readTextFile(eventPath, 'utf8')) as PullRequestClosedEvent;
  const repositoryFullName = env.GITHUB_REPOSITORY?.trim() || event.repository?.full_name?.trim();

  if (!repositoryFullName) {
    throw createError('Missing repository name in GITHUB_REPOSITORY and event.repository.full_name');
  }

  const result = await runClosedPullRequestFeedback({
    event,
    repositoryFullName,
    githubToSlackJson,
    workflowUrl,
    githubClient: createGitHubApiClient(githubToken, fetchImpl),
    slackClient: createSlackApiClient(slackBotToken, fetchImpl),
    logger,
  });

  const outputPath = env.GITHUB_OUTPUT?.trim();

  if (outputPath) {
    await writeGitHubOutputs(appendTextFile, outputPath, result);
  }

  return result;
}

if (require.main === module) {
  runFromEnvironment().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
