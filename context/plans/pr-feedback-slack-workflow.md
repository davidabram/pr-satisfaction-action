# Plan: PR feedback Slack workflow

## Change summary

Implement a GitHub Actions-based PR feedback trigger that runs whenever a pull request is closed, gathers the PR author, reviewers, and commenters, maps them to Slack users, and sends each mapped participant a Slack DM linking to a Slack Workflow Builder feedback form. The feedback form responses will be stored only in Slack as the system of record.

## Success criteria

- A GitHub Actions workflow runs on every `pull_request.closed` event.
- The workflow handles both merged PRs and closed-without-merge PRs.
- The workflow identifies and deduplicates PR participants in scope: author, reviewers, and commenters.
- Bot accounts are excluded from notification recipients.
- GitHub logins are mapped to Slack user IDs using repository-configured mapping data.
- Each mapped participant receives one Slack DM per closed PR with PR context and a Slack workflow link.
- Unmapped participants are skipped and reported in workflow output.
- Feedback is collected through a Slack Workflow Builder form.
- Feedback responses are stored only in Slack and are reviewable/exportable from Slack.
- Repository documentation/config guidance is sufficient for an operator to supply required Slack app values and secrets.

## Constraints and non-goals

### Constraints
- The implementation surface is a GitHub Action in this repository plus an existing Slack app/backend.
- Response storage must stay in Slack only for v1.
- The workflow must trigger for every closed PR, including merged and unmerged closures.
- Participant scope is limited to PR author, reviewers, and commenters.
- Unmapped users must be skipped and explicitly reported.
- Tasks must remain atomic and implementation-ready, one coherent commit per task.

### Non-goals
- No external database, warehouse, or analytics sink.
- No dashboarding or trend analysis UI in v1.
- No automatic fallback Slack identity lookup in v1.
- No expansion to assignees, requested reviewers without participation, or other peripheral actors unless required by implementation details.
- No custom Slack-hosted analytics or long-term reporting automation in v1.

## Task stack

- [x] T01: `Define workflow contract and operator inputs` (status:done)
  - Task ID: T01
  - Goal: Create the implementation contract for the GitHub Action by defining event behavior, required secrets/config, participant rules, unmapped-user reporting requirements, and Slack message/form assumptions in repo documentation.
  - Boundaries (in/out of scope): In - workflow inputs/outputs, secret names, participant inclusion rules, DM payload requirements, reporting expectations, and operator setup notes. Out - executable workflow code, Slack API client code, and runtime tests.
  - Done when: Repository documentation clearly specifies the v1 contract needed to implement the action and Slack integration without inventing behavior during coding.
  - Verification notes (commands or checks): Review docs for explicit coverage of trigger behavior, participant scope, unmapped-user handling, required secrets, and Slack-only storage model.
  - Completed: 2026-04-09
  - Files changed: `plan.md`, `slack.md`
  - Evidence: Documentation updated to define the v1 closed-PR trigger contract, participant scope, required secrets, unmapped-user reporting expectations, Slack-only storage model, and operator setup notes.
  - Notes: Resolved earlier doc drift by narrowing participant scope to author/reviewers/commenters and making merged + closed-without-merge behavior explicit for v1.

- [x] T02: `Add participant collection and normalization module` (status:done)
  - Task ID: T02
  - Goal: Implement code that reads the closed PR event plus GitHub PR discussion/review data, extracts author/reviewers/commenters, excludes bots, and returns a deduplicated participant list.
  - Boundaries (in/out of scope): In - participant extraction logic, bot filtering, deduplication, and unit tests for scope rules. Out - Slack mapping, Slack delivery, workflow YAML wiring, and operator docs.
  - Done when: A reusable module returns the expected unique participant set for merged and unmerged PR scenarios and tests cover duplicate users, commenters, reviewers, and bot exclusion.
  - Verification notes (commands or checks): Run targeted unit tests for participant extraction against representative PR payload fixtures and mocked GitHub API responses.
  - Completed: 2026-04-09
  - Files changed: `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore`, `src/pr-feedback/participants.ts`, `test/pr-feedback/participants.test.ts`
  - Evidence: `npm test` passed (5 tests), `npm run build` passed.
  - Notes: Added minimal root TypeScript + Node test scaffolding and a reusable participant collector that merges roles by GitHub login while excluding bot accounts.

- [x] T03: `Add Slack identity mapping and missing-user reporting` (status:done)
  - Task ID: T03
  - Goal: Implement logic that loads the GitHub-to-Slack mapping configuration, resolves participant Slack IDs, splits mapped vs unmapped users, and produces machine-readable/report-friendly missing-user output.
  - Boundaries (in/out of scope): In - secret/config parsing, mapping validation, mapped/unmapped partitioning, structured reporting, and tests. Out - Slack DM sending, participant extraction rules, and workflow trigger wiring.
  - Done when: The code can accept a participant list, resolve mapped Slack recipients, skip unmapped users, and expose/report unmapped logins in a predictable format covered by tests.
  - Verification notes (commands or checks): Run targeted tests for valid mapping JSON, malformed mapping JSON, missing entries, and mixed mapped/unmapped participant sets.
  - Completed: 2026-04-09
  - Files changed: `src/pr-feedback/slack-mapping.ts`, `test/pr-feedback/slack-mapping.test.ts`
  - Evidence: `npm test` passed (11 tests), `npm run build` passed.
  - Notes: Added strict `USER_MAP_JSON` parsing/validation and a pure resolver that partitions mapped vs unmapped participants while producing a stable missing-user report payload.

- [x] T04: `Implement Slack DM delivery for PR feedback requests` (status:done)
  - Task ID: T04
  - Goal: Implement Slack delivery logic that opens or reuses DMs and sends one feedback-request message per mapped participant containing PR context and the workflow link.
  - Boundaries (in/out of scope): In - Slack API client integration, message formatting, DM send flow, retry/error handling strategy appropriate to repo standards, and delivery tests/mocks. Out - participant extraction, mapping rules, workflow orchestration, and Slack form creation.
  - Done when: Given mapped recipients and PR metadata, the delivery layer sends the expected DM payload exactly once per recipient and surfaces failures clearly for workflow logs/tests.
  - Verification notes (commands or checks): Run targeted tests for message payload formatting and mocked Slack API delivery behavior, including API failure cases.
  - Completed: 2026-04-09
  - Files changed: `src/pr-feedback/slack-delivery.ts`, `test/pr-feedback/slack-delivery.test.ts`
  - Evidence: `npm test` passed (17 tests), `npm run build` passed.
  - Notes: Added injectable Slack Web API delivery helpers plus deterministic DM formatting and structured per-recipient success/failure results for later workflow orchestration.

- [x] T05: `Wire the closed-PR GitHub Action end to end` (status:done)
  - Task ID: T05
  - Goal: Add the GitHub Actions workflow and orchestration code that runs on `pull_request.closed`, invokes participant collection, mapping, reporting, and Slack DM delivery for both merged and unmerged closures.
  - Boundaries (in/out of scope): In - workflow YAML, runtime entrypoint/orchestration, event gating, secret consumption, step outputs/logging, and end-to-end fixture/integration coverage. Out - new analytics features, fallback identity lookup, and post-v1 enhancements.
  - Done when: The repository contains an executable workflow that processes closed PR events, notifies mapped participants, and reports unmapped users without failing the full run for expected mapping misses.
  - Verification notes (commands or checks): Run the repo’s targeted workflow/integration tests or local action harness checks against merged and closed-without-merge fixtures; inspect produced logs/outputs for mapped and unmapped cases.
  - Completed: 2026-04-09
  - Files changed: `.github/workflows/pr-feedback-slack.yml`, `src/pr-feedback/action.ts`, `test/pr-feedback/action.test.ts`
  - Evidence: `npm test` passed (21 tests), `npm run build` passed.
  - Notes: Added a `pull_request.closed` workflow plus an orchestration entrypoint that fetches PR participation data from GitHub, resolves Slack recipients, sends DMs, logs mapped/unmapped outcomes, and writes GitHub Action outputs.

- [x] T06: `Document Slack setup and operating procedure` (status:done)
  - Task ID: T06
  - Goal: Update operator-facing docs so maintainers can configure the Slack app/backend, publish the Slack workflow form, populate secrets, and understand how Slack remains the sole response store.
  - Boundaries (in/out of scope): In - setup docs, required scopes/secrets, workflow form expectations, unmapped-user operational handling, and response export guidance. Out - code changes to workflow behavior or Slack app implementation.
  - Done when: A maintainer can complete setup and ongoing operation from repository docs without needing unstated Slack configuration knowledge.
  - Verification notes (commands or checks): Review docs for completeness against implemented secret names, workflow URL usage, required scopes, and Slack response export steps.
  - Completed: 2026-04-09
  - Files changed: `slack.md`, `plan.md`, `context/pr-feedback/slack-workflow.md`
  - Evidence: Reviewed operator docs against `.github/workflows/pr-feedback-slack.yml` and `src/pr-feedback/action.ts`; updated setup, outputs/log review, unmapped-user handling, and validation guidance to match implemented behavior.
  - Notes: Operator docs now cover the executable workflow entrypoint, required GitHub secrets, workflow outputs, and incident-response guidance for unmapped users and Slack delivery failures.

- [x] T07: `Validate implementation and sync context` (status:done)
  - Task ID: T07
  - Goal: Run final validation/cleanup for the closed-PR Slack feedback system and update shared context artifacts to reflect the implemented current state.
  - Boundaries (in/out of scope): In - full relevant test/lint/format validation, cleanup of temporary scaffolding, verification of operator docs, and sync of `context/` files affected by the delivered design. Out - new feature work or behavioral changes beyond fixes required to pass validation.
  - Done when: All relevant checks pass, temporary artifacts are removed, operator docs match behavior, and `context/` is updated to the final current-state design.
  - Verification notes (commands or checks): Run the project’s full relevant validation suite plus any action-specific tests; confirm `context/` accurately reflects trigger behavior, participant scope, Slack-only storage, and operating constraints.
  - Completed: 2026-04-09
  - Files changed: `context/plans/pr-feedback-slack-workflow.md`
  - Evidence: `npm test` passed (21 tests), `npm run build` passed, operator docs (`plan.md`, `slack.md`) match `.github/workflows/pr-feedback-slack.yml` and `src/pr-feedback/action.ts`, and root/domain context files were verified as current with no additional edits required.
  - Notes: Final-task context sync was classify-as-verify-only; `context/overview.md`, `context/architecture.md`, `context/glossary.md`, `context/patterns.md`, `context/context-map.md`, and `context/pr-feedback/slack-workflow.md` already matched code truth.

## Open questions

- None for v1. Future enhancements can revisit fallback Slack identity resolution and downstream analytics/export automation.

## Validation Report

### Commands run

- `npm test` -> exit 0 (`npm run build` + Node test runner, 21 tests passed, 0 failed)
- `npm run build` -> exit 0

### Lint/format/tooling status

- No dedicated lint or format script/tooling is configured in `package.json` and no repo lint/format config files were found during validation.

### Cleanup

- No temporary scaffolding or disposable validation artifacts required removal.

### Success-criteria verification

- [x] A GitHub Actions workflow runs on every `pull_request.closed` event -> confirmed in `.github/workflows/pr-feedback-slack.yml` lines 3-6.
- [x] The workflow handles both merged PRs and closed-without-merge PRs -> confirmed in `src/pr-feedback/action.ts` lines 167-177 and covered by `test/pr-feedback/action.test.ts` merged + unmerged cases.
- [x] The workflow identifies and deduplicates PR participants in scope: author, reviewers, and commenters -> confirmed in `src/pr-feedback/participants.ts` and participant tests.
- [x] Bot accounts are excluded from notification recipients -> confirmed in `src/pr-feedback/participants.ts` and `test/pr-feedback/participants.test.ts`.
- [x] GitHub logins are mapped to Slack user IDs using repository-configured mapping data -> confirmed in `src/pr-feedback/slack-mapping.ts` and mapping tests.
- [x] Each mapped participant receives one Slack DM per closed PR with PR context and a Slack workflow link -> confirmed in `src/pr-feedback/slack-delivery.ts`, `src/pr-feedback/action.ts`, and delivery/action tests.
- [x] Unmapped participants are skipped and reported in workflow output -> confirmed in `src/pr-feedback/slack-mapping.ts`, `src/pr-feedback/action.ts`, and action tests/log output assertions.
- [x] Feedback is collected through a Slack Workflow Builder form -> confirmed in `plan.md`, `slack.md`, and `context/pr-feedback/slack-workflow.md`.
- [x] Feedback responses are stored only in Slack and are reviewable/exportable from Slack -> confirmed in `plan.md`, `slack.md`, `context/overview.md`, and `context/pr-feedback/slack-workflow.md`.
- [x] Repository documentation/config guidance is sufficient for an operator to supply required Slack app values and secrets -> confirmed in `slack.md` and `plan.md` against the implemented required environment variables in `.github/workflows/pr-feedback-slack.yml` and `src/pr-feedback/action.ts`.

### Failed checks and follow-ups

- None.

### Residual risks

- No automated lint/format gate is configured in this repository; style regressions would rely on code review or future tooling adoption.
