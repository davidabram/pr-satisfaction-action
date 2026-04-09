# Plan: PR feedback zero-code alignment

## Change summary

Bring the implemented PR feedback Slack flow into exact alignment with the zero-code workflow contract. The current implementation already triggers on closed PRs, resolves participants, and sends Slack DMs, but the delivered DM UX does not yet match the documented zero-code workflow contract: it sends plain text instead of a button-based message, requires a pasted PR reference, and does not expose the same PR context shape described in the zero-code document.

## Success criteria

- Slack feedback requests still trigger on every `pull_request.closed` event for mapped participants.
- The DM sent to each mapped participant presents PR context directly in the Slack message history, matching the zero-code workflow intent.
- The DM includes a Slack **Give Feedback** button linking to `SLACK_WORKFLOW_URL` rather than relying on a bare URL line.
- The DM context includes, at minimum, PR number, PR title, PR URL, author, and closed-date/closed-state information needed for chat-history reference.
- The workflow no longer requires users to paste a PR reference into the form as part of the expected v1 flow.
- Tests cover the zero-code-aligned message payload and any new runtime/context formatting needed to produce it.
- Operator and context docs describe the implemented flow without stale coded-solution guidance.

## Constraints and non-goals

### Constraints
- Match the zero-code workflow contract exactly as the acceptance target for the user-facing Slack interaction.
- Preserve the existing closed-PR trigger, participant collection, mapping, and Slack-only response storage model.
- Keep task slices atomic: one coherent implementation intent per task, one atomic commit per task.
- Avoid broad refactors unrelated to zero-code UX parity.

### Non-goals
- No expansion of participant scope beyond the current author/reviewer/commenter model.
- No new response store, analytics sink, webhook processing, or database integration.
- No Slack Workflow Builder form prefill/custom backend work.
- No unrelated cleanup of the GitHub Action architecture.

## Task stack

- [x] T01: `Codify zero-code Slack DM contract in tests` (status:done)
  - Task ID: T01
  - Goal: Add or update targeted tests so the required Slack DM output is locked to the zero-code contract before behavior changes land.
  - Boundaries (in/out of scope): In - delivery formatting expectations, button payload expectations, required PR context fields, and removal of the paste-reference instruction from expected outputs. Out - production delivery implementation, workflow YAML changes, and documentation updates.
  - Done when: Tests fail against the current implementation for the known zero-code mismatches and clearly describe the required message/button behavior.
  - Verification notes (commands or checks): Run targeted Slack delivery/action tests and confirm they assert button-based DM payloads plus the required visible PR context.
  - Completed: 2026-04-09
  - Files changed: `test/pr-feedback/slack-delivery.test.ts`, `test/pr-feedback/action.test.ts`
  - Evidence: `npm run build` passed; `node --test dist/test/pr-feedback/slack-delivery.test.js dist/test/pr-feedback/action.test.js` produced 5 expected failures capturing current mismatches (plain-text DM, bare workflow URL, participant-role copy, missing author/closed context, no button payload).
  - Notes: Contract tests now define the zero-code target for T02/T03 without changing production behavior in this task.

- [x] T02: `Update Slack delivery payload to match zero-code UX` (status:done)
  - Task ID: T02
  - Goal: Change the Slack delivery layer to send the documented zero-code DM experience, including visible PR context and a `Give Feedback` button linked to the workflow URL.
  - Boundaries (in/out of scope): In - Slack message payload structure, message text/blocks, button wiring, and removal of the pasted-reference instruction from delivery copy. Out - participant collection logic, GitHub API fetching strategy, and doc/context updates.
  - Done when: The delivery layer sends a Slack payload that matches the zero-code document's user-facing interaction and passes the contract tests added in T01.
  - Verification notes (commands or checks): Run targeted delivery tests and inspect assertions for button text, workflow URL usage, and embedded PR context.
  - Completed: 2026-04-09
  - Files changed: `src/pr-feedback/slack-delivery.ts`, `test/pr-feedback/slack-delivery.test.ts`
  - Evidence: `npm run build` passed; `npm test` passed (21/21 tests). Delivery now sends blocks-based payload with header, section (PR context in mrkdwn), and actions (Give Feedback button). Removed paste-reference instruction. `SlackApiClient.postMessage` signature updated to accept `SlackMessagePayload` with text and blocks.
  - Notes: Author and closed-date fields use placeholders (`@author`, `📅 Closed:`) pending T03 context population.

- [x] T03: `Provide exact PR context needed by the zero-code message` (status:done)
  - Task ID: T03
  - Goal: Update orchestration/runtime data shaping so the delivery layer receives and renders all context required by the zero-code workflow, including author and closed-date/closed-state details.
  - Boundaries (in/out of scope): In - action/runtime context types, event-field extraction/formatting, and tests covering merged and unmerged PR cases. Out - Slack payload layout changes already handled in T02 and documentation refresh.
  - Done when: Runtime code supplies the full zero-code context set needed for the DM and tests verify the values for representative closed PR events.
  - Verification notes (commands or checks): Run targeted action tests covering merged and closed-without-merge fixtures and confirm the rendered delivery input includes author plus closure timing/state data.
  - Completed: 2026-04-09
  - Files changed: `src/pr-feedback/slack-delivery.ts`, `src/pr-feedback/action.ts`, `test/pr-feedback/slack-delivery.test.ts`, `test/pr-feedback/action.test.ts`
  - Evidence: `npm run build` passed; `npm test` passed (21/21 tests). Added `author` and `closedAt` fields to `PullRequestContext` interface. Updated `toPullRequestContext` to extract author login and closed_at timestamp from GitHub event. Added `formatDate` helper to format closed date as "Mon DD, YYYY". Updated `formatFeedbackRequestMessage` to use actual author and formatted closed date instead of placeholders. All tests verify author and closed date are properly rendered in Slack DM payload.
  - Notes: Runtime now supplies full zero-code context (PR number, title, URL, author, closed date) as required by the zero-code workflow contract.

- [x] T04: `Sync operator and context docs to zero-code behavior` (status:done)
  - Task ID: T04
  - Goal: Update repo/operator/context documentation so it describes the implemented zero-code-aligned Slack flow and removes stale references to the previous plain-text/reference-field behavior.
  - Boundaries (in/out of scope): In - zero-code workflow contract cross-checks, operator docs, and current-state context files affected by the UX change. Out - new feature design work or additional product decisions beyond documenting the accepted behavior.
  - Done when: Docs consistently describe the button-based DM, chat-history reference model, and Slack-only response handling with no stale instructions to paste PR identifiers into the form.
  - Verification notes (commands or checks): Review updated docs against implementation and confirm all zero-code behavior statements are consistent across operator/context files.
  - Completed: 2026-04-09
  - Files changed: `context/overview.md`
  - Evidence: `npm run build` passed; `npm test` passed (21/21 tests). Removed stale references to non-existent `plan.md` and `slack.md` files from `context/overview.md`. Verified `context/pr-feedback/slack-workflow.md` already accurately describes the button-based DM with blocks payload (header, section with PR context, actions block with "Give Feedback" button).
  - Notes: Documentation now consistently references the correct operator guide and describes the zero-code-aligned Slack flow.

- [x] T05: `Validate zero-code alignment and cleanup` (status:done)
  - Task ID: T05
  - Goal: Run final validation for the zero-code alignment change and verify shared context reflects the resulting current state.
  - Boundaries (in/out of scope): In - full relevant test/build checks, cleanup of temporary scaffolding, and final context sync verification. Out - additional behavior changes beyond fixes required for validation success.
  - Done when: Relevant validation passes, no temporary artifacts remain, and `context/` accurately reflects the zero-code-aligned implementation.
  - Verification notes (commands or checks): Run the project's full relevant validation suite plus targeted Slack workflow tests; confirm context and operator docs match the delivered DM/button behavior.
  - Completed: 2026-04-09
  - Files changed: None (validation-only task)
  - Evidence: `npm run build` passed; `npm test` passed (21/21 tests). No temporary artifacts in `context/tmp/`. Context files verified: `context/pr-feedback/slack-workflow.md` describes button-based DM with blocks payload, `context/architecture.md`, `context/glossary.md`, `context/patterns.md` all accurate. Implementation matches zero-code contract: DM uses blocks payload with header, section (PR context in mrkdwn including number, title, URL, author, closed date), and actions block with "Give Feedback" button linking to workflow URL. No paste-reference instruction in delivery.
  - Notes: All success criteria met. Zero-code alignment complete.

## Open questions

- None. Acceptance target is exact alignment with the zero-code workflow contract for the user-facing Slack workflow behavior.
