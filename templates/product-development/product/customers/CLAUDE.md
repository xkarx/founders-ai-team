# Customer Insights

Call notes and account context for {{COMPANY_NAME}}'s early customers/prospects.

## Segments

*(fill in: e.g. paying customer, prospect, partner)*

## Named Accounts

*(empty: add a row here the first time you talk to a real customer/prospect)*

| Account | Segment | Folder |
|---------|---------|--------|

## Adding a new account

1. Create `accounts/{name}/CLAUDE.md` (contacts + links, copy the shape of any existing account)
2. Create `accounts/{name}/account-context.md` (goals, risks, what they care about)
3. Use `/customer-call` (see `.claude/commands/customer-call.md`) after every call: it writes `accounts/{name}/calls/summaries/{date}.md` and `accounts/{name}/calls/transcripts/{date}.md` for you
4. Add a row to the Named Accounts table above

## Skills to use here

- `/synthesize-research`: once you have several calls, turn them into ranked themes instead of re-reading every transcript
- `pm-market-research:research-users`: build personas/segments/journey map once you have enough accounts
- `pm-market-research:sentiment-analysis` / `analyze-feedback`: sentiment scoring across many pieces of feedback at once
