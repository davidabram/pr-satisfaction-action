# PR Satisfaction Action

A GitHub Action that automatically collects feedback from pull request participants when a PR is closed. When a pull request is merged or closed, the action identifies all contributors (author, reviewers, and commenters), maps their GitHub usernames to Slack users, and sends personalized feedback requests via Slack to gather insights about the code review experience.

## Setup

### 1. Slack Bot Permissions

Create a Slack app and install it to your workspace with the following **Bot Token Scopes**:

| Scope | Purpose |
|-------|---------|
| `chat:write` | Post feedback request messages to user DMs |
| `im:write` | Open direct message conversations with users |

The bot token should be stored as `SLACK_BOT_TOKEN` in your repository secrets.

### 2. Slack Workflow Entry Step

The workflow should have `Start the workflow` set to `Starts from a link in Slack`. Store the workflow URL as `SLACK_WORKFLOW_URL` in your repository secrets.

### 3. User Mapping (`USER_MAP_JSON`)

Create a JSON mapping of GitHub usernames to Slack user IDs:

```json
{
  "octocat": "U1234567890",
  "hubot": "U0987654321",
  "monalisa": "U1122334455"
}
```

**Notes:**
- Keys are GitHub login names (case-sensitive)
- Values are Slack user IDs (starting with `U`)
- To find a Slack user ID: Click the user's profile → "Copy member ID"
- Store this JSON as `USER_MAP_JSON` in your repository secrets

## Required Secrets

| Secret | Description |
|--------|-------------|
| `USER_MAP_JSON` | JSON mapping GitHub usernames to Slack user IDs |
| `SLACK_BOT_TOKEN` | Bot token from your Slack app (xoxb-...) |
| `SLACK_WORKFLOW_URL` | Webhook URL from your Slack workflow |
