# Founder's AI Team

An operating system for solo founders — enter your company name and one-liner, and get a full "Team OS" knowledge base (product docs, strategy, customers, engineering, analytics) plus a local web app with AI teammates standing in for every role you haven't hired yet.

Inspired by the [Team OS pattern](https://github.com/xkarx/team-os-example-repo) — a shared knowledge base that turns a team's collective context into something AI can actually use — adapted for a team of one.

## What's in here

- `templates/` — the generic scaffold used to generate a new company's workspace (product/design/engineering/analytics docs, PRDs, customer notes, strategy, `.claude/agents` for each AI teammate, a `/customer-call` command + skill)
- `workspaces/` — where generated companies live (gitignored — this is your real, private business data, not meant to be published)
- `webapp/` — the local GUI: a docs browser, a Kanban backlog board, and per-role AI chat (plus a "Propose to team" feature that fans a question out to every agent at once and can turn the resulting discussion into a backlog card)

## Running it

```
cd webapp
npm install
cp .env.example .env    # add ANTHROPIC_API_KEY or GEMINI_API_KEY
npm start
```

Open `http://localhost:4174`. The first screen lets you create a new company workspace or open an existing one.

**New here?** See [GETTING_STARTED.md](GETTING_STARTED.md) for a full walkthrough — setup, the docs browser, the Kanban backlog, chatting with AI teammates, and troubleshooting.

## AI teammates

Every function starts as an AI agent (Design, Engineering, Data & Analytics) grounded in that function's docs — chat with them from the Team tab. Product also gets two lead sub-agents, Research and Strategy. Replace any row in the root `CLAUDE.md` team table with a real person's name once you hire one; the agent stays available as backup either way.

## License

MIT — do whatever you want with it.
