import type { Participant } from './participants';

export interface GitHubToSlackMap {
  [githubLogin: string]: string;
}

export interface MappedParticipant extends Participant {
  slackUserId: string;
}

export interface MissingSlackUsersReport {
  mappedCount: number;
  unmappedCount: number;
  unmappedLogins: string[];
}

export interface ResolveSlackRecipientsResult {
  mappedParticipants: MappedParticipant[];
  unmappedParticipants: Participant[];
  report: MissingSlackUsersReport;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseGitHubToSlackMap(rawMapping: string): GitHubToSlackMap {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawMapping);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown JSON parse error';
    throw new Error(`USER_MAP_JSON must be valid JSON: ${message}`);
  }

  if (!isRecord(parsed)) {
    throw new Error('USER_MAP_JSON must be a JSON object keyed by GitHub login');
  }

  const mapping: GitHubToSlackMap = {};

  for (const [rawLogin, rawSlackUserId] of Object.entries(parsed)) {
    const login = rawLogin.trim();

    if (!login) {
      throw new Error('USER_MAP_JSON cannot contain empty GitHub login keys');
    }

    if (typeof rawSlackUserId !== 'string') {
      throw new Error(`USER_MAP_JSON entry for "${login}" must be a Slack user ID string`);
    }

    const slackUserId = rawSlackUserId.trim();

    if (!slackUserId) {
      throw new Error(`USER_MAP_JSON entry for "${login}" cannot be empty`);
    }

    mapping[login] = slackUserId;
  }

  return mapping;
}

export function resolveSlackRecipients(
  participants: Participant[],
  rawMapping: string,
): ResolveSlackRecipientsResult {
  const mapping = parseGitHubToSlackMap(rawMapping);
  const mappedParticipants: MappedParticipant[] = [];
  const unmappedParticipants: Participant[] = [];

  for (const participant of participants) {
    const slackUserId = mapping[participant.login];

    if (slackUserId) {
      mappedParticipants.push({
        ...participant,
        slackUserId,
      });
      continue;
    }

    unmappedParticipants.push(participant);
  }

  return {
    mappedParticipants,
    unmappedParticipants,
    report: {
      mappedCount: mappedParticipants.length,
      unmappedCount: unmappedParticipants.length,
      unmappedLogins: unmappedParticipants.map((participant) => participant.login),
    },
  };
}
