# Overview

This repository defines a GitHub Actions + Slack workflow for collecting pull-request feedback.

## Current state

- The repository now has an executable GitHub Actions workflow for the v1 closed-PR feedback flow.
- The repository includes TypeScript modules for participant collection, GitHub-to-Slack identity resolution, Slack DM delivery, and runtime orchestration, all covered by targeted tests.
- The workflow runs on every `pull_request.closed` event.
- v1 covers both merged PRs and PRs closed without merge.
- In-scope participants are limited to the PR author, reviewers, and commenters.
- Slack is the only feedback response store in v1.

## Canonical docs

- Feature context: [`pr-feedback/slack-workflow.md`](pr-feedback/slack-workflow.md)
