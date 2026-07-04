---
description: Process a customer/prospect call transcript into a summary + saved transcript for that account.
---

# Customer Call Transcript Processing

Process a call transcript with a customer or prospect into structured notes.

**Summary format:** Read `.claude/skills/customer-call-summary/SKILL.md` for the expected structure and level of detail.

## Step 1: Gather info

Ask the user for:
- **Account name** (this becomes the folder name under `product-development/product/customers/accounts/`)
- **Call date** (YYYY-MM-DD)
- **Participants**
- **Transcript**: pasted text, or a file path

## Step 2: Check for an existing account

Look for `product-development/product/customers/accounts/{account}/`. If it doesn't exist, create it:
- `CLAUDE.md` (contacts + links — copy the shape from an existing account if one exists)
- `account-context.md` (goals, risks, what they care about)
- `calls/summaries/` and `calls/transcripts/`

## Step 3: Write the summary

Follow `.claude/skills/customer-call-summary/SKILL.md`. Save to:
`product-development/product/customers/accounts/{account}/calls/summaries/{date}.md`

## Step 4: Save the transcript

Save the raw transcript (with a short header: date, participants) to:
`product-development/product/customers/accounts/{account}/calls/transcripts/{date}.md`

## Step 5: Update account context

Update `account-context.md` with anything new learned about this account's goals, risks, or blockers.

## Step 6: Update the customer index

Add or update the row for this account in `product-development/product/customers/CLAUDE.md`'s Named Accounts table.

## Step 7: Present a short recap

Show the user: key insights, any feature requests surfaced, and suggested next steps — so they can act on it without opening the files.
