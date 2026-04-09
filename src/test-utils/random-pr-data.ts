import type { PullRequestContext } from '../pr-feedback/slack-delivery';

const DEFAULT_TITLES = [
  'Improve Slack notification formatting',
  'Fix race condition in participant collection',
  'Add fallback logging for unmapped users',
  'Refactor pull request event parsing',
  'Tighten Slack delivery error handling',
  'Document closed-without-merge behavior',
];

const DEFAULT_AUTHORS = [
  'davidabram',
  'octocat',
  'samdev',
  'alex-reviewer',
  'taylor-ci',
  'jordan-bot',
];

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export interface RandomPrDataOptions {
  seed?: number;
  now?: Date;
  titles?: readonly string[];
  authors?: readonly string[];
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function getRandomNumber(random: () => number, min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function getRandomItem<T>(random: () => number, items: readonly T[], fallback: T): T {
  if (items.length === 0) {
    return fallback;
  }

  return items[getRandomNumber(random, 0, items.length - 1)] ?? fallback;
}

function createRandomSource(seed: number | undefined): () => number {
  return seed === undefined ? Math.random : createSeededRandom(seed);
}

export function createRandomPullRequestContext(options: RandomPrDataOptions = {}): PullRequestContext {
  const random = createRandomSource(options.seed);
  const now = options.now ?? new Date();
  const merged = random() >= 0.5;
  const number = getRandomNumber(random, 1, 9999);
  const title = getRandomItem(random, options.titles ?? DEFAULT_TITLES, 'Test pull request update');
  const author = getRandomItem(random, options.authors ?? DEFAULT_AUTHORS, 'davidabram');
  const daysAgo = getRandomNumber(random, 0, 29);
  const closedAt = new Date(now.getTime() - daysAgo * MILLISECONDS_PER_DAY).toISOString();

  return {
    number,
    title,
    url: `https://github.com/davidabram/pr-satisfaction-action/pull/${number}`,
    merged,
    author,
    closedAt,
  };
}
