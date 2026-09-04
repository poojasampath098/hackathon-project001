# AetherAI — Production Deployment Guide

Backend: **Google Cloud Run** (node 20 Express + MongoDB Atlas).
Frontend: **Vercel** (React/Vite SPA), **Option A** (Vercel rewrites proxy `/api/*` to Cloud Run — zero frontend code changes, no CORS).

## Current state (already prepared in repo)

| Item | State |
| --- | --- |
| `backend/Dockerfile` | Written (was empty). node:20-slim, `npm ci --omit=dev`, non-root `node` user, listens on `$PORT`. |
| `backend/.dockerignore` | Written (excludes `node_modules`, `.env`, `tests`, … so local Windows `bcrypt` binaries/secrets never reach the image). |
| `backend/src/server.js` | Already binds `process.env.PORT` via `config.port` (`config.js`) — Cloud Run PORT works, no change needed. |
| `frontend/vercel.json` | Written: `rewrites` — `api/*` → Cloud Run, plus SPA fallback for client routes. **Replace `<CLOUD_RUN_URL>` before deploying.** |
| `frontend/.env.example` | Documents the one production env var (`VITE_GOOGLE_CLIENT_ID`). |
| `frontend/src/services/api.js` | `API_BASE = '/api'` unchanged — works via Vercel rewrite (dev proxy already in `vite.config.js`). |
| Dead OAuth callback | None — backend has no authorization-code/callback route (ID-token sign-in only). Nothing to remove. |

Local build/lint already verified: frontend `vite build` + oxlint clean.

## Step 0 — HUMAN ACTIONS (can't be done from this environment)

The coding tool cannot create accounts/projects/long-lived roots or run interactive login flows. Before anything below will run you must have:

1. **Google Cloud project** with billing enabled; Cloud Run + Cloud Build + Secret Manager APIs enabled. Install/authenticate the CLI:
   `gcloud auth login && gcloud config set project <project-id>`
2. **Vercel** account + project. Install/authenticate: `npm i -g vercel && vercel login`. (Fold the existing `frontend/` and `vercel.json` into the project.)
3. **MongoDB Atlas Network Access** for Cloud Run's outbound traffic:
   - **Chosen approach: allow 0.0.0.0/0** (simplest; acceptable for small projects — see tradeoff note in Step 2.1). Cloud Run has no static outbound IPs by default.
   - More correct alternative (more setup): Cloud Run VPC connector + Cloud NAT static IP + Atlas whitelist of that IP.
4. **Real secret values must already exist** (MongoDB URI, JWT secret, SMTP creds, Cloudinary secret, Google client secret). The deploy only moves *where* they're stored.

Also note: **Docker is not installed on this dev machine** — image build was not locally tested (gcloud builds submit builds in the cloud). `gcloud`/`vercel`/`firebase` CLIs are also not installed here yet.

## Step 1 — Backend on Cloud Run

### 1.1 Create secrets in Secret Manager (sensitive values)

```bash
REGION=us-central1            # any Cloud Run region
PROJECT=<your-project-id>

echo -n "<jwt-secret>"  | gcloud secrets create jwt-secret          --data-file=- --project=$PROJECT
echo -n "<mongodb-uri>" | gcloud secrets create mongodb-uri         --data-file=- --project=$PROJECT
echo -n "<smtp-pass>"   | gcloud secrets create smtp-pass           --data-file=- --project=$PROJECT
echo -n "<smtp-user>"   | gcloud secrets create smtp-user           --data-file=- --project=$PROJECT
echo -n "<cloudinary-api-secret>" | gcloud secrets create cloudinary-api-secret --data-file=- --project=$PROJECT
echo -n "<google-client-secret>"  | gcloud secrets create google-client-secret  --data-file=- --project=$PROJECT
echo -n "<gemini-api-key>"        | gcloud secrets create gemini-api-key        --data-file=- --project=$PROJECT
```

(If `EMAIL_FROM` is the same account as SMTP_USER it's not sensitive; else add `email-from` to secrets too. `SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE` are non-sensitive → env vars.)

### 1.2 Build and deploy

```bash
# If service has never run for this project, grant access:
gcloud projects add-iam-policy-binding $PROJECT \
  --member="serviceAccount:$(gcloud iam service-accounts list --format='value(email)' | head -...)" \
  --role="roles/secretmanager.secretAccessor"   # (or use default compute SA; Runner SA details below)

gcloud builds submit --tag gcr.io/$PROJECT/aetherai-backend backend/

gcloud run deploy aetherai-backend \
  --image gcr.io/$PROJECT/aetherai-backend \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --min-instances=1 \
  --max-instances=1 \
  --timeout=3600 \
  --set-env-vars="NODE_ENV=production,FRONTEND_URL=https://<vercel-domain>,JWT_EXPIRES_IN=7d,GOOGLE_CLIENT_ID=<google-client-id>,SMTP_HOST=smtp.gmail.com,SMTP_PORT=465,SMTP_SECURE=true,CLOUDINARY_CLOUD_NAME=<name>,CLOUDINARY_API_KEY=<key>,GEMINI_MODEL=gemini-3.5-flash-lite" \
  --set-secrets="JWT_SECRET=jwt-secret:latest,MONGODB_URI=mongodb-uri:latest,SMTP_PASS=smtp-pass:latest,SMTP_USER=smtp-user:latest,CLOUDINARY_API_SECRET=cloudinary-api-secret:latest,GOOGLE_CLIENT_SECRET=google-client-secret:latest,GEMINI_API_KEY=gemini-api-key:latest"
```

**Flag updates vs. the boilerplate command (deliberate):**
- **`--min-instances=1` — REQUIRED, not optional.** `schedule.worker.js` polls every 30s via an in-container `setInterval`; scale-to-zero would kill it. Tradeoff: the service is never idle-free (≥1 instance always billed) — intended for this app's background worker.
- **`--max-instances=1` — recommended addition.** If Cloud Run autoscales to 2+ instances, *each* runs the poller and they race `findDueSchedules` → duplicate scheduled executions. Pin one instance so exactly one worker exists. (The truly correct fix is a DB lease/lock; out of scope here.)
- **`--timeout=3600`** (Cloud Run max) — `routes/event.routes.js` keeps SSE connections open with a 30s heartbeat (`X-Accel-Buffering: no` already set → streaming not buffered). A short request timeout would sever them.
- **`REGION`** — keep the same region for the service and secrets.

Note the resulting **Cloud Run URL** printed by deploy (≈ `https://aetherai-backend-<hash>-<region>.a.run.app`) — needed for `vercel.json` and Google Console origins.

## Step 2 — Frontend on Vercel (Option A chosen)

1. `vercel.json` at `frontend/` holds the rewrite. **Replace `<CLOUD_RUN_URL>`** with the real URL:
   `{ "source": "/api/(.*)", "destination": "https://<CLOUD_RUN_URL>/api/$1" }`
   (Reverse-proxying via the frontend domain ⇒ the browser never calls Cloud Run directly ⇒ no CORS, and `API_BASE='/api'` stays untouched.)
2. Set Vercel project env (Production): `VITE_GOOGLE_CLIENT_ID=<same value as always>`.
3. Deploy: `cd frontend && vercel --prod`. (Or connect the GitHub repo for auto-deploys — whichever is set up.)
4. **Google Cloud Console → APIs & Services → Credentials → your OAuth client**: add the deployed frontend origin (e.g. `https://aetherai.vercel.app`) to "Authorized JavaScript origins". Keep `http://localhost:5173`. Google sign-in fails until this lands.

If Vercel external rewrites are ever blocked (region/plan), fallback is Option B: `VITE_API_BASE_URL=https://<cloud-run-url>` + `api.js` `const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'` + rely on Cloud Run CORS (`FRONTEND_URL`). Not needed for the primary path.

## Step 3 — Post-deploy verification checklist

- [ ] `curl -s https://<cloud-run-url>/health` → `{"status":"ok"}`.
- [ ] Cloud Run env list in Console: sensitive values show as **Secret Manager refs**, not plaintext (see below).
- [ ] Frontend loads at its URL; DevTools Network tab: `/api/…` requests hit the proxy (200s; **no CORS errors, no 404s**).
- [ ] Login, the full 3-step registration, and **Google sign-in** work against the deployed backend (needs the origin update in Step 2.4 first).
- [ ] **Scheduled execution actually fires** (the one genuinely at-risk behavior): create a task with `nextRunAt` ≈ now+1–2min via the UI (or `curl -X POST $CLOUD_RUN/api/tasks -H "Authorization: Bearer <token>" -d '{…, nextRunAt, frequency:"once"}'`), then confirm on the Executions/Dashboard page that an execution ran and the activity log shows `Scheduled execution triggered` — don't assume `min-instances=1` alone.
- [ ] SSE streams: open a task's Live Execution page (or `curl -N "$CLOUD_RUN/api/events/task/<id>?token=…"`) — events arrive and stay connected past the old 60s limit; heartbeat lines every 30s.
- [ ] Secrets not exposed: `gcloud run services describe aetherai-backend --region $REGION --format='value(spec.template.spec.containers[0].env)'` — sensitive entries appear as `name/secretKeyRef/…`, not plain values. Confirm `.env` is absent from the image/Cloud Build logs.
- [ ] CORS sanity after `FRONTEND_URL` change: a direct cross-origin `fetch` from the production origin to the Cloud Run URL is allowed when `FRONTEND_URL` matches exactly (scheme+host, no trailing slash); local dev keeps its own `.env` backend.

Any failure to reach the container: `gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=aetherai-backend" --limit=50`.

## Final URLs (fill in after deploy)

- Backend (Cloud Run): `https://aetherai-backend-<hash>-<region>.a.run.app`
- Frontend (Vercel): `https://<project>.vercel.app`
- Platform/approach used: **Vercel + Option A (rewrite proxy)**; backend on **Google Cloud Run, min-instances=1**.
- Atlas access model: **0.0.0.0/0** (chosen for simplicity; tradeoff: any public IP can reach the DB — acceptable for a small project; swap to VPC connector + static NAT egress for stricter security).