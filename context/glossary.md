# Glossary

- **Closed-PR feedback workflow** — The planned automation that runs on `pull_request.closed`, messages in-scope PR participants in Slack, and collects feedback through a Slack workflow form.
- **In-scope participant** — A deduplicated GitHub user who is the PR author, submitted a review, left a PR conversation comment, or left an inline review comment.
- **Participant collector** — The reusable module in `src/pr-feedback/participants.ts` that normalizes author/reviewer/commenter inputs into one deduplicated participant list.
- **Unmapped participant** — An in-scope participant whose GitHub login does not have a Slack user ID entry in `USER_MAP_JSON`; they are skipped and reported.
- **`USER_MAP_JSON`** — Repository or organization secret containing a JSON object that maps GitHub logins to Slack user IDs.
- **Missing-user report** — Machine-readable output containing mapped/unmapped counts plus the ordered list of unmapped GitHub logins for a workflow run.
- **Action run result** — Structured workflow outcome containing participant, mapped, unmapped, sent, and failed counts plus recipient login lists for logs and GitHub Action outputs.
- **Slack delivery result** — Structured per-recipient send outcome containing successful DM deliveries and clearly reported per-user failures.
- **Slack-only storage** — v1 policy that keeps feedback responses only in Slack Workflow Builder response storage, with no external database or analytics sink.
