# Manual Slack Test Utilities

See also: [../overview.md](../overview.md), [slack-workflow.md](slack-workflow.md)

## Current state

- `src/test-utils/random-pr-data.ts` exports `createRandomPullRequestContext(...)`.
- The generator returns a `PullRequestContext` object compatible with `src/pr-feedback/slack-delivery.ts`.
- `scripts/test-slack.ts` loads `.env`, generates one random PR context, resolves the Slack mapping for `davidabram`, and calls `sendFeedbackRequests(...)`.
- `tsconfig.json` includes `scripts/**/*.ts`, so the manual script compiles to `dist/scripts/test-slack.js` during `npm run build`.
- `package.json` exposes `npm run test:slack`, which builds the repo and then runs `dist/scripts/test-slack.js`.
- Generated fields currently include:
  - PR number in the range `1..9999`
  - PR title chosen from a preset list
  - PR author chosen from a preset list
  - `merged` status
  - `closedAt` timestamp within the last 30 days
  - Repository-local PR URL derived from the generated PR number

## Options

- `seed` switches the generator to deterministic output for reproducible manual tests.
- `now` anchors date generation for repeatable `closedAt` values.
- `titles` and `authors` allow callers to override the preset lists.

## Manual script behavior

- The script reads `SLACK_BOT_TOKEN`, `SLACK_WORKFLOW_URL`, and `USER_MAP_JSON` from the repository `.env` file, with shell environment variables taking precedence when both are present.
- The supported operator entrypoint for end-to-end manual delivery is `npm run test:slack`.
- The delivered Slack DM reminds the recipient to keep or copy the PR number / PR URL because the next step needs that reference.
- The script prints the generated PR payload before delivery and prints the structured Slack delivery result afterward.
- The script exits non-zero when required configuration is missing, `davidabram` is not present in `USER_MAP_JSON`, or Slack delivery reports a failure.

## Current operational state

- End-to-end manual delivery succeeds when the local Slack bot token has the scopes required for `conversations.open` and `chat.postMessage`.

## Boundaries

- The generator does not call GitHub APIs.
- The manual script does not call GitHub APIs.
- The manual script does not write `GITHUB_OUTPUT`.
