# DocMind Production CI/CD & Bluehost Server Setup Guide

This guide explains how to set up the automated **Docker CI/CD pipeline** on your **Bluehost VPS server** and **GitHub Actions** before merging `feat/docker-cicd-v1` into `main`.

---

## 1. Architecture Overview

```
                               ┌────────────────────────────────┐
                               │  Git Push to 'main' on GitHub  │
                               └───────────────┬────────────────┘
                                               │
                       ┌───────────────────────┴───────────────────────┐
                       ▼                                               ▼
         ┌───────────────────────────┐                   ┌───────────────────────────┐
         │   Job 1: Backend Checks   │                   │  Job 2: Frontend Checks   │
         │  • Pyright Type Checking  │                   │  • Next.js Static Export  │
         │  • Pytest with pgvector   │                   │    Verification Build     │
         └─────────────┬─────────────┘                   └─────────────┬─────────────┘
                       │                                               │
                       └───────────────────────┬───────────────────────┘
                                               │ Both Jobs Pass
                                               ▼
                               ┌───────────────────────────────┐
                               │     Job 3: Deploy Backend     │
                               │   (via SSH to Bluehost VPS)   │
                               └───────────────┬───────────────┘
                                               │
                       ┌───────────────────────┴───────────────────────┐
                       ▼                                               ▼
        ┌───────────────────────────────┐               ┌───────────────────────────────┐
        │       Bluehost VPS Host       │               │        Vercel Edge CDN        │
        │  1. `git pull origin main`    │               │  • Native Vercel Git Hook     │
        │  2. `infra/scripts/deploy.sh` │               │  • Deploys Next.js Frontend   │
        │  3. Docker Compose build API  │               │  • Connects to Bluehost API   │
        │  4. `app.db.migrate` applied  │               │    via NEXT_PUBLIC_API_URL    │
        │  5. Health Probe verified     │               └───────────────────────────────┘
        └───────────────────────────────┘
```

---

## 2. Server Setup Checklist (Do This on Bluehost BEFORE Merging to Main)

### Step 1: Connect to Your Bluehost Server
From your local terminal, SSH into your Bluehost VPS:
```bash
ssh username@your-bluehost-ip
```

### Step 2: Verify Docker and Docker Compose
Run the following on your server to verify Docker is running:
```bash
docker --version
docker compose version
```
> **If not installed**, install them via standard Ubuntu packages:
> ```bash
> sudo apt-get update
> sudo apt-get install -y docker.io docker-compose-v2
> sudo usermod -aG docker $USER
> newgrp docker
> ```

### Step 3: Set Up the Application Directory
Ensure your repository is cloned into the target directory (e.g. `/var/www/docmind` or `/home/youruser/DocMind`):
```bash
# If not yet cloned:
sudo mkdir -p /var/www/docmind
sudo chown -R $USER:$USER /var/www/docmind
git clone https://github.com/rohanmane/DocMind.git /var/www/docmind

cd /var/www/docmind
git checkout main
```

### Step 4: Configure the Production `.env` File
In `/var/www/docmind`, create or verify your production `.env` file:
```bash
nano /var/www/docmind/.env
```
Ensure it contains all required production secrets:
```ini
APP_ENV=production
POSTGRES_DB=docmind
POSTGRES_USER=docmind
POSTGRES_PASSWORD=your_strong_db_password
APP_SECRET_KEY=your_at_least_32_characters_random_secret_key!

# Cloudflare R2 / S3 Storage
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key
R2_SECRET_ACCESS_KEY=your_r2_secret_key
R2_BUCKET=docmind-private

# Gemini AI API Key
GOOGLE_API_KEY=your_gemini_api_key

# Public URLs & CORS
PUBLIC_APP_URL=https://docmind.rohanmane.dev
API_BASE_URL=https://api.docmind.rohanmane.dev
CORS_ALLOWED_ORIGINS=["https://docmind.rohanmane.dev","http://localhost:3000"]

# Domain for Caddy reverse proxy SSL
API_DOMAIN=api.docmind.rohanmane.dev

# SMTP Email Settings (optional)
EMAIL_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your_email@gmail.com
SMTP_PASSWORD=your_app_password
SMTP_FROM_EMAIL=your_email@gmail.com
SMTP_FROM_NAME=DocMind Support
SMTP_USE_TLS=true
```

### Step 5: Generate a Dedicated SSH Deploy Key
Generate a dedicated SSH key pair on your Bluehost server for GitHub Actions to use:
```bash
ssh-keygen -t ed25519 -C "github-actions-docmind" -f ~/.ssh/github_actions_deploy -N ""
```
This generates two files in `~/.ssh/`:
- `github_actions_deploy` (Private Key — goes into GitHub Secrets)
- `github_actions_deploy.pub` (Public Key — goes into `authorized_keys`)

Append the public key to `authorized_keys`:
```bash
cat ~/.ssh/github_actions_deploy.pub >> ~/.ssh/authorized_keys
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

Display the private key so you can copy it to GitHub:
```bash
cat ~/.ssh/github_actions_deploy
```
*(Copy the entire output starting with `-----BEGIN OPENSSH PRIVATE KEY-----` and ending with `-----END OPENSSH PRIVATE KEY-----`)*

---

## 3. GitHub Secrets Setup (In Your GitHub Repository)

Go to your repository on GitHub:
**Settings → Secrets and variables → Actions → New repository secret**

Add the following 5 secrets:

| Secret Name | Value Example | Description |
| :--- | :--- | :--- |
| `BLUEHOST_HOST` | `162.241.x.x` or `docmind.rohanmane.dev` | Your Bluehost VPS public IP address or hostname. |
| `BLUEHOST_USER` | `root` or `rohan` | The SSH username you use to log in to Bluehost. |
| `BLUEHOST_SSH_KEY` | *(Paste private key from Step 5)* | The raw private key generated for GitHub Actions. |
| `BLUEHOST_PORT` | `22` | SSH port (defaults to 22 unless custom). |
| `BLUEHOST_APP_DIR` | `/var/www/docmind` | Absolute path where the repo is cloned on Bluehost. |

---

## 4. Test Local Deployment Once on Bluehost

Before testing automated CI/CD from GitHub, run the deploy script once directly on your Bluehost server to ensure everything builds and starts smoothly:

```bash
cd /var/www/docmind
chmod +x infra/scripts/deploy.sh
bash infra/scripts/deploy.sh
```

**Expected output:**
```
[INFO] Ensuring Postgres database service is running...
[INFO] Building backend & worker Docker containers...
[INFO] Executing database schema migrations...
[INFO] Launching API, Worker, and Caddy services...
[INFO] Awaiting service readiness (http://127.0.0.1:8000/health/ready)...
[SUCCESS] Health check passed (HTTP 200). DocMind is ready!
[INFO] Pruning dangling Docker images to reclaim disk space...
[SUCCESS] DocMind deployed and passing all readiness probes.
```

---

## 5. How It Works Under the Hood

### The Automated Flow:
1. **Developer pushes to `main`**:
   - GitHub Actions runner spins up an ephemeral Ubuntu VM.
   - It runs `pgvector:pg16` in a background service container.
   - Runs strict `pyright backend/` (0 errors required) and `pytest backend/tests/` (all tests must pass).
   - Runs `npm run build` for the frontend static export.
2. **Triggering Deployment**:
   - If tests fail, the workflow immediately halts and alerts you. The server is **never touched**.
   - If tests pass, the `deploy-backend` job opens an encrypted SSH tunnel to your Bluehost VPS.
3. **Execution on Bluehost**:
   - Pulls the newest code with `git reset --hard origin/main`.
   - Executes `infra/scripts/deploy.sh`.
   - Docker Compose rebuilds the FastAPI container and background worker container.
   - Executes `python -m app.db.migrate` inside the container to apply any new database schema alterations and seeds.
   - Starts Caddy reverse proxy on port 80/443 (automatic SSL certificate issuance via Let's Encrypt).
   - Probes `http://127.0.0.1:8000/health/ready` every 3 seconds up to 12 times.
   - If healthy, prunes old unused container images to save disk space.
4. **Frontend on Vercel**:
   - Concurrently, Vercel detects the push to `main` and updates the edge CDN in ~30 seconds.

---

## 6. Is This How Professional Companies Do It?

### **Yes. This pattern is called GitOps / Automated CD Pipeline.**

Here is how modern SaaS companies operate across stages:

#### **Stage 1: Seed to Series A ($0 - $5M ARR) — *Where DocMind is now***
- **Frontend:** Vercel / Netlify / Cloudflare Pages.
- **Backend:** Single or Dual VPS (Bluehost, DigitalOcean, Hetzner, or AWS EC2) running **Docker Compose**.
- **Orchestration:** GitHub Actions via SSH deployment keys.
- **Why companies love this:** It costs \$20–\$80/month instead of \$2,000/month on AWS Kubernetes, requires zero dedicated DevOps engineers, and can easily support **50,000+ daily active users**.

#### **Stage 2: Series B & Beyond ($10M+ ARR)**
- As companies grow to hundreds of developers and millions of users, they transition from single-node Docker Compose to multi-node clusters:
  - **AWS ECS (Fargate)** or **Kubernetes (EKS)**
  - Managed RDS PostgreSQL + Aurora Multi-AZ
- **Crucial Takeaway:** The Dockerfile, the environment variable patterns, the GitHub Actions testing jobs, and the database migration scripts you built here are **100% identical** to what is used in Kubernetes. The knowledge and configuration directly transfer.

---

## 7. How to Push and Trigger the Pipeline

1. **Commit and push this branch**:
   ```bash
   git add .
   git commit -m "feat: complete production Docker CI/CD pipeline with Bluehost deployment"
   git push origin feat/docker-cicd-v1
   ```
2. **Open a Pull Request on GitHub**:
   - `feat/docker-cicd-v1` → `main`.
   - Watch GitHub Actions run `backend-checks` and `frontend-checks`.
3. **Merge the PR into `main`**:
   - The moment you click **Merge**, the `deploy-backend` job triggers.
   - GitHub Actions logs will show the live deployment to your Bluehost server!
