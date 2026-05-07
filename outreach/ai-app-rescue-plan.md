# AI App Rescue Money Plan

## Current Wedge

Sell production cleanup for apps built with Lovable, Bolt, Replit, Cursor, v0, Base44, and similar AI app builders.

The buyer is not looking for a generic developer. They are stuck after an AI builder produced a convincing prototype that fails at deployment, auth, payments, database rules, or maintainability.

## Offer Ladder

- $99 risk check: repo/live-app triage, top risks, reproduction notes, and ranked fix plan.
- $299+ rescue sprint: one urgent production blocker fixed.
- $750+ hardening pass: auth, rules, key flows, deploy notes, error handling, and maintainability cleanup.
- $500+ MCP or agent connector: useful for teams that already have an internal workflow and want agents connected to tools safely.

## Where To Find Buyers

- Reddit threads where founders complain about Replit, Lovable, Bolt, Base44, Cursor, or v0 projects breaking.
- Product Hunt launches that mention AI-built MVPs, no-code builders, or "built in a weekend" and expose a public support/contact email.
- Indie Hackers and SaaS communities where founders ask why deploy, auth, Stripe, Supabase, Firebase, or webhooks do not work.
- X/LinkedIn posts from founders showing AI-built apps and asking for technical help.
- Agencies already selling AI apps but lacking production engineering capacity.

## Search Queries

Use these daily:

- `"Lovable" "Stripe" "broken" founder`
- `"Bolt.new" "works in preview" "production"`
- `"Replit" "subscriptions" "deployment" "broken"`
- `"Supabase" "RLS" "Lovable" "help"`
- `"Firebase rules" "AI app" "help"`
- `"vibe coded" "auth" "broken"`
- `"vibe coded" "production" "users"`
- `"Cursor" "generated app" "Stripe" "webhook"`
- `"Base44" "app" "broken" "deploy"`
- `"AI-built app" "security" "founder"`

## Outreach Rules

- Do not claim a vulnerability unless we have authorization or the issue is already public.
- Do not probe private data, brute force, scrape user records, or run invasive scans.
- Lead with the exact failure category, not "AI automation."
- Offer a small paid triage first. Do not pitch a full rebuild first.
- If posting publicly, make the comment useful without requiring them to hire us.

## Public Reply Template

You are probably at the point where the builder made the UI but not the production boundary.

Before paying for another round of prompts, check these in order:

1. Is the failing route using browser code to call something that should be server-only?
2. Are the deploy environment variables different from preview?
3. Are test/live Stripe keys or webhook secrets mixed?
4. Are Supabase/Firebase rules allowing the preview but blocking real users?
5. Is the app using mock data that never got replaced?

I do paid AI-app rescue checks if you want a second set of eyes, but this list should help you narrow it down first.

## Direct Message Template

Hey, I saw your post about the AI-built app getting stuck after preview/deploy.

That failure pattern is common with Lovable/Bolt/Replit/Cursor projects: the UI gets close, then auth, env vars, Stripe, database rules, or server/client boundaries break in production.

I do a small $99 risk check where I look at the repo or live app you control, identify the actual blocker, and give a ranked fix plan. If it is a focused repair, I can usually quote a small sprint instead of pushing a rebuild.

Rescue scope: https://tatelyman.github.io/tate-web-services/ai-app-rescue.html

If useful, send the app link/repo, builder used, deploy target, and the flow that must work first.

## Priority Today

1. Publish the AI app rescue page.
2. Search for 20 public buyer signals from the queries above.
3. Prepare 5 personalized public replies or DMs.
4. Send only where self-promotion rules allow it or where a direct contact channel is clearly provided.
5. Keep Capgo/bounty reviews as side bets, not the main channel.
