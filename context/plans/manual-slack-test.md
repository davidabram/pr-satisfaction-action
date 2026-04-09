# Manual Slack Testing Tool

## Change summary

Create a local manual testing script that generates random dummy PR data and sends a Slack DM to davidabram via the existing Slack workflow. This enables local verification of the Slack delivery flow without triggering GitHub Actions.

## Success criteria

- [ ] Running `npm run test:slack` sends a Slack DM to davidabram with random PR data
- [ ] The tool uses credentials from the existing `.env` file (SLACK_BOT_TOKEN, SLACK_WORKFLOW_URL, USER_MAP_JSON)
- [ ] PR data is randomly generated (PR number, title, author, closed date, merged status)
- [ ] The script outputs the generated data and delivery result to the console
- [ ] The script exits with code 0 on success, non-zero on failure
- [ ] The code follows existing patterns in `src/pr-feedback/`

## Constraints and non-goals

**Constraints:**
- Reuse existing modules from `src/pr-feedback/` where possible
- Must work with the existing `.env` file format
- TypeScript with the existing `tsconfig.json`

**Non-goals:**
- No changes to the production GitHub Actions workflow
- No new environment variables required beyond what's already in `.env`
- No GUI or interactive prompts
- No persistence of test runs
- Not a comprehensive test suite (this is a manual testing tool)

## Task stack

- [x] T01: `Create random PR data generator` (status:done)
  - Task ID: T01
  - Goal: Create a utility module that generates random PR data for testing
  - Boundaries (in/out of scope): 
    - In: Random PR number (1-9999), random title from a preset list, random author from a preset list, random closed date within last 30 days, random merged status
    - Out: No actual GitHub API calls, no Slack delivery logic
  - Done when: 
    - `src/test-utils/random-pr-data.ts` exports a function that returns `PullRequestContext` with random values
    - Function has a deterministic seed option for reproducibility (optional but nice)
  - Verification notes (commands or checks):
    - `npm run build` succeeds
    - Import the module in Node REPL and verify it generates different data on each call
  - Completed: 2026-04-09
  - Files changed: `src/test-utils/random-pr-data.ts`
  - Evidence: `npm run build` succeeded on 2026-04-09

- [x] T02: `Create manual test script` (status:done)
  - Task ID: T02
  - Goal: Create the main test script that wires together random data generation, Slack client, and delivery
  - Boundaries (in/out of scope):
    - In: Load `.env` file, generate random PR data, create Slack client, send feedback request to davidabram, log results
    - Out: No GitHub client (skip PR participant collection), no GITHUB_OUTPUT writing
  - Done when:
    - `scripts/test-slack.ts` exists and compiles
    - Script loads environment from `.env` using dotenv or similar
    - Script generates random PR data using T01's generator
    - Script sends Slack DM to davidabram using existing `sendFeedbackRequests` from `slack-delivery.ts`
    - Script logs the generated PR data and delivery result
  - Verification notes (commands or checks):
    - `npm run build` succeeds
    - `node dist/scripts/test-slack.js` runs without errors (dry-run or actual test)
  - Completed implementation: 2026-04-09
  - Files changed: `scripts/test-slack.ts`, `tsconfig.json`
  - Evidence: `npm run build` succeeded; `node dist/scripts/test-slack.js` sent a Slack DM successfully on 2026-04-09

- [x] T03: `Add npm script and validation` (status:done)
  - Task ID: T03
  - Goal: Add the `test:slack` npm script and verify the complete flow works
  - Boundaries (in/out of scope):
    - In: Add `test:slack` script to `package.json`, ensure all dependencies are available
    - Out: No changes to existing source code or tests
  - Done when:
    - `package.json` has `"test:slack": "npm run build && node dist/scripts/test-slack.js"`
    - Running `npm run test:slack` successfully sends a Slack message
    - Console output shows generated PR data and confirms delivery
  - Verification notes (commands or checks):
    - `npm run test:slack` executes successfully
    - davidabram receives the Slack DM
    - Script exits with code 0
  - Completed: 2026-04-09
  - Files changed: `package.json`
  - Evidence: `npm run test:slack` succeeded on 2026-04-09; build completed; console printed generated PR data; Slack DM delivered to davidabram; process exited 0

- [x] T04: `Validation and cleanup` (status:done)
  - Task ID: T04
  - Goal: Verify the implementation meets all success criteria and sync context
  - Boundaries (in/out of scope):
    - In: Run full test suite, verify no regressions, update context if needed
    - Out: No code changes unless bugs are found
  - Done when:
    - `npm test` passes
    - `npm run build` produces clean output
    - The manual test works end-to-end
  - Verification notes (commands or checks):
    - `npm test` - all existing tests pass
    - `npm run test:slack` - manual test works
    - Verify `.env` loading works correctly
    - Document any additional setup steps in comments
  - Completed: 2026-04-09
  - Files changed: `context/plans/manual-slack-test.md`
  - Evidence: `npm run build` succeeded; `npm test` passed (21/21); `npm run test:slack` succeeded with generated PR data printed, Slack DM delivered to davidabram, and process exited 0 on 2026-04-09

## Open questions

None - all requirements clarified.

## Validation Report

### Commands run

- `npm run build` -> exit 0 (`tsc -p tsconfig.json` completed cleanly)
- `npm test` -> exit 0 (21 tests passed, 0 failed)
- `npm run test:slack` -> exit 0 (built successfully, printed generated PR data, delivered Slack DM to `davidabram`)

### Lint/format checks

- No dedicated lint or format command is currently defined in `package.json`; no additional lint/format validation was available to run.

### Temporary scaffolding

- No temporary scaffolding or debug artifacts were identified for removal.

### Success-criteria verification

- [x] Running `npm run test:slack` sends a Slack DM to davidabram with random PR data -> confirmed by successful `npm run test:slack` output and Slack delivery result for `davidabram`
- [x] The tool uses credentials from the existing `.env` file (`SLACK_BOT_TOKEN`, `SLACK_WORKFLOW_URL`, `USER_MAP_JSON`) -> confirmed by end-to-end manual run succeeding through the documented `.env`-based script path
- [x] PR data is randomly generated (PR number, title, author, closed date, merged status) -> confirmed by printed generated PR payload from `npm run test:slack`
- [x] The script outputs the generated data and delivery result to the console -> confirmed by console output from `npm run test:slack`
- [x] The script exits with code 0 on success, non-zero on failure -> success path confirmed with exit 0 during `npm run test:slack`; failure behavior remains documented in `context/pr-feedback/manual-slack-test.md`
- [x] The code follows existing patterns in `src/pr-feedback/` -> confirmed by prior implementation tasks and passing `npm test` / `npm run build` validation

### Context verification

- Verified `context/overview.md`, `context/architecture.md`, `context/glossary.md`, `context/patterns.md`, `context/context-map.md`, and `context/pr-feedback/manual-slack-test.md` against current code truth.
- Feature existence documentation for the manual Slack testing utility is present and linked via `context/pr-feedback/manual-slack-test.md` and `context/context-map.md`.

### Failed checks and follow-ups

- None.

### Residual risks

- End-to-end manual Slack validation depends on valid local Slack credentials/network availability at runtime.
