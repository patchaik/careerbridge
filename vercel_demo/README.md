# CareerBridge on Vercel (sample)

A small FastAPI app plus one web page, used to prove the hosting pipeline:
GitHub → Vercel → live URL → Supabase.

```
vercel_demo/
├── main.py            FastAPI app (Vercel finds `app` here automatically)
├── requirements.txt   Python packages Vercel installs
├── .python-version    Python 3.12
└── public/
    └── index.html     Web page, served from Vercel's CDN
```

| URL | What it shows |
| --- | --- |
| `/` | Status page and a "Say hello" form |
| `/api/health` | `{"status": "ok", "database": "connected" \| "not_configured" \| "error", ...}` |
| `/api/hello?name=Ana` | A JSON greeting |
| `/docs` | Interactive API docs |

---

## 1. Decide who owns the Vercel project

On Vercel's free **Hobby** plan, **only the account owner's commits trigger deployments**.
Collaboration features need the paid Pro plan. So:

- **One person owns the Vercel project.** Ideally this is the GitHub repo owner (Shrezz), because
  connecting a repo needs permission on the account that owns it.
- **Everyone else needs only GitHub access.** They push branches and open pull requests;
  the owner merges, and that merge deploys.

Hobby is for personal, non-commercial use. It is fine for the buildathon.

## 2. Create the Vercel account (owner, once)

1. Go to **https://vercel.com/signup**.
2. Choose **Hobby**, enter your name, and click **Continue with GitHub**.
3. Sign in to GitHub and click **Authorize Vercel**.

If the owner is not the GitHub repo owner: when Vercel asks to install its GitHub app,
choose **Only select repositories → careerbridge**. GitHub sends the repo owner an
approval request; the repo owner approves it under **GitHub → Settings → Applications**.

## 3. Get the sample onto `main`

From the repo root on your laptop:

```bash
git add vercel_demo
git commit -m "Add Vercel sample app"
git push
```

Then open a pull request into `main` and merge it (see step 6 for the merge method).

## 4. Import the project into Vercel (owner, once)

1. Go to **https://vercel.com/new** and click **Import** next to `careerbridge`.
   (If it isn't listed, click **Adjust GitHub App Permissions** and add the repo.)
2. **Project Name:** `careerbridge`
3. **Root Directory:** click **Edit**, choose **`vercel_demo`**, and click **Continue**.
4. **Framework Preset:** should detect **FastAPI**. If it shows **Other**, leave it.
5. Open **Environment Variables** and add:

   | Key | Value |
   | --- | --- |
   | `SUPABASE_URL` | `https://<your-project>.supabase.co` |
   | `SUPABASE_KEY` | the Supabase **secret** key |

6. Click **Deploy**. After about a minute you get a URL like `https://careerbridge-xxxx.vercel.app`.

Never put the key in the code or the repo. Vercel stores it encrypted and gives it to the
app at runtime.

## 5. Check it works

Open the URL. The status card should show **API: Running** and
**Database: Connected to Supabase**.

| Database shows | Fix |
| --- | --- |
| Not configured | Add both variables (step 4.5), then **Deployments → ⋯ → Redeploy** |
| Cannot reach Supabase | Use the secret key, not the publishable one; open the Supabase dashboard to wake a paused project |
| Page is 404 | Root Directory must be `vercel_demo` (**Settings → Build and Deployment**) |

## 6. Team workflow

**Teammates (no Vercel account needed):**

```bash
git checkout main && git pull
git checkout -b yourname-feature
# ...make changes...
git add -A && git commit -m "Describe the change"
git push -u origin yourname-feature
```

Then open a pull request into `main` on GitHub.

**Owner:**

1. Review the pull request on GitHub.
2. Merge with **Create a merge commit**. The merge commit is yours, so Vercel deploys it to
   production automatically. Squash merges may keep the teammate as author and get blocked.
3. Watch it build on the Vercel dashboard under **Deployments**.

If a deployment shows **Blocked** (commit author not on the plan), use
**Deployments → ⋯ → Redeploy**, or deploy from your laptop with `vercel --prod`.
Preview deployments for teammates' branches may also be blocked on Hobby. That's expected.
For full team access, start Vercel's Pro trial.

## 7. Run it locally (optional)

```bash
npm install -g vercel
cd ~/careerbridge
vercel login
vercel link          # pick the careerbridge project
vercel env pull      # downloads the env vars into a local file (git-ignored)
vercel dev           # http://localhost:3000
```

## Next step: the real backend

This sample is self-contained. To serve the real API (`api/openapi.yaml`) using the
`database/` package, the project must deploy from the repo root so Python can import
`database`. The usual way is a root `pyproject.toml` with:

```toml
[tool.vercel]
entrypoint = "backend.main:app"
```

Then change **Root Directory** back to the repo root in Vercel's settings.
