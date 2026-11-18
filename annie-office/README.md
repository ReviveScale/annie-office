# Annie Office

Restoration job desk demo for ABC Restoration. Plain HTML, CSS and JS, no build step.

- `index.html`: page shell
- `style.css`: look (ReviveScale dark, cyan to green)
- `app.js`: everything else. The back end URL is at the top (`API`).
- `logo.js`: ReviveScale logo

The page talks to one n8n webhook (`annie-office`) with these actions: `board`, `update`, `create`, `reset`, `ask`.
Workflow: "Annie Office API" in n8n. Reset puts the 8 demo jobs back and starts a fresh Annie session.

Netlify: publish directory is the repo root, no build command. Every push to `main` goes live.
