# Mover Check

A free red-flag checker and guide for people hiring a moving company.

- **The checker** (home page, `/`): someone describes the quote, deposit or contract in front of them. It asks one question at a time, puts any close deadline first (like the 3-day cancellation window), and ends with a specific plan and a "Next step". Ranked options fill the side cards.
- **The guide** (`/guide`): 17 plain-language topics, from "mover or broker?" to getting a deposit back. Every rule and phone number was checked against federal sources on October 15, 2026.

The checker reasons over the same guide content (`data/gub.json`), so updating the guide updates both.

## 1. Put it on GitHub with GitHub Desktop

1. Unzip `mover-check.zip`. You get a folder called `mover-check` that is already a Git repository (branch `main`, no commits yet).
2. Open GitHub Desktop and choose **File → Add local repository…**, then select the `mover-check` folder. It opens straight away; there is no "create a repository" step.
3. In the bottom-left box, type the summary `Initial commit` and click **Commit to main**.
4. Click **Publish repository**. Keep **Keep this code private** ticked, then click **Publish repository**.
5. On GitHub, open the repository's **Settings → Code security** (on some accounts it's called **Advanced Security**) and turn on **Secret scanning** and **Push protection**.

## 2. Put it online with Vercel

1. In Vercel, click **Add New… → Project**, import the `mover-check` repository and click **Deploy**. No build settings are needed.
2. In the Claude Console, create a workspace just for this project, set a monthly spend limit and spend alerts, and create an API key inside it.
3. In the Vercel project, go to **Settings → Environment Variables** and add `ANTHROPIC_API_KEY` for **Production**. Leave Preview without a key, or give it a separate low-limit key.
4. Redeploy: open **Deployments**, then on the latest deployment choose **⋯ → Redeploy**. Environment variables only apply to new deployments.
5. Add the rate-limit rule: **Firewall → Configure → New Rule**, path `/api/chat`, a fixed window of 600 seconds, 20 requests, counted by IP address, action Too Many Requests (429). These numbers match the limiter built into `api/chat.js`, so the site stays protected even if your Vercel plan doesn't offer this rule. Check Vercel's WAF rate-limiting documentation for current plan availability.

Until `ANTHROPIC_API_KEY` is set and the project is redeployed, the checker shows a plain "not set up yet" message instead of answering.

Optional settings:

- `ANTHROPIC_MODEL` to use a model other than the default `claude-sonnet-5-5`.
- `SITE_ORIGINS` (comma-separated, for example `https://www.yourdomain.com`) if the site is reached through a custom domain as well as its Vercel address.

The checker uses Claude's web search tool to look up current facts, such as a mover's record on FMCSA's SAFER site. If web search is turned off for your organization in the Claude Console, turn it on there.

## What's in the repo

| Path | What it is |
| --- | --- |
| `index.html`, `assets/css/engine.css`, `assets/js/engine.js` | The checker (home page) |
| `guide/index.html`, `assets/css/guide.css`, `assets/js/guide.js` | The guide at `/guide` |
| `assets/js/prefs.js` | Text-size selector and theme toggle shared by both pages |
| `data/gub.json` | The guide content. The guide page shows it, and `/api/chat` picks the most relevant entries for each conversation |
| `api/chat.js` | Serverless function that holds the API key and calls Claude |
| `vercel.json` | Security headers, clean URLs and function settings |

## Editing the guide

Change `data/gub.json`. Each entry has an `id`, `title`, `summary`, `body` (a list of paragraphs; lines that start with `- ` become a bullet list), `tags` and `details`. A `details` key named `Source` becomes an "Official source" link.

The guide's filter buttons use these tags: `before booking`, `after signing`, `moving day`, `money back` and `real case`.

Commit and push in GitHub Desktop. Both the guide and the checker use the new content on the next deploy.

## What works, and what would need a bigger build

Works now:

- A real conversation that asks one question at a time and ends with a recommendation and a "Next step".
- Ranked options in the side cards, with deadlines, costs and who to contact.
- Voice input in browsers that support it (Chrome, Edge and Safari). The mic button hides itself elsewhere, such as Firefox.
- A plain-text download of the plan, made in the browser with no server call.
- Text size and theme settings that are remembered on that device.
- The guide.

The conversation stays in the browser tab and clears when the tab is closed. Nothing is stored on a server.

Not included, and needing more work plus a server-side safety check:

- Sending emails or filing complaints on someone's behalf. The checker drafts the text; the person sends it.
- Reading uploaded contracts or photos.
- User accounts and saved history.

## Security

- The API key lives only in Vercel environment variables (and in a local `.env.local`, which git ignores). The browser only ever calls `/api/chat`.
- `/api/chat` accepts only POST with JSON, rejects bodies over 32 KB, limits each visitor to 20 requests per 10 minutes, and caps the number and length of messages. It forwards only the visitor's and the assistant's messages. The server alone decides the model, `max_tokens` (16,000) and the instructions.
- It rejects requests whose `Origin` header isn't this site (403). That blocks other websites from using it, but not scripts, so it doesn't replace the rate limit or the spend limit.
- Calls to Claude time out after 110 seconds, inside the function's 120-second limit.
- Errors return plain messages. Logs record status words only, never keys, headers or messages.
- Every page sends a strict Content Security Policy. The one inline script (the theme restore) is allowed by its SHA-256 hash. **If you edit that script in `index.html` or `guide/index.html`, the hash in `vercel.json` must be updated**, or browsers will block it.
- Model replies and visitor text are always shown as plain text, never as HTML.

This is general information, not legal advice.
