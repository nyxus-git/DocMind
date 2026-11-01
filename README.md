# DocMind 📑🧠
> **Enterprise-Grade Grounded Multimodal Document Intelligence & Compliance Research Workspace**

---

## 🚀 Overview
DocMind is a compliance-grade document intelligence platform built for professionals, researchers, and analysts. Rather than acting as an ungrounded conversational chatbot, DocMind guarantees **verifiable factual answers**:
- **Source-Only Mode:** Explicit abstention when evidence is absent ("I could not find enough information in the selected documents to answer this reliably").
- **Server-Side Provenance:** Citations map directly to immutable database chunks and verified page numbers on the server; model hallucinated references are stripped.
- **Tenant Isolation by Construction:** Workspaces act as cryptographic and relational security boundaries. Every database query, vector search, file access, and background job carries a verified `workspace_id`.
- **Economical Architecture:** Designed to operate on a single **2 vCore, 4 GB RAM VPS (~₹500/month)** via Caddy, FastAPI, a single-slot worker, and PostgreSQL 16 (`pgvector`) without an expensive Redis cluster.
- **Static Frontend:** Next.js 15 compiled via `output: export` hosted freely on Cloudflare Pages for 0ms origin latency and zero VPS memory consumption.

---

## 🛠️ Technology Stack
- **Backend**: Python 3.12+, FastAPI, SQLAlchemy 2.0 (Async), Alembic, Pydantic v2
- **Database & Queue**: PostgreSQL 16 with `pgvector` & Full-Text Search. Jobs table managed via `FOR UPDATE SKIP LOCKED`.
- **Object Storage**: Cloudflare R2 (S3-compatible API with direct browser-to-R2 presigned PUT/GET).
- **AI & Embeddings**: Google Gemini API (`gemini-3.8-flash` & `gemini-embedding-2` 768-dim).
- **Document Ingestion**: PyMuPDF (`fitz`), `python-docx`, Tesseract OCR fallback.
- **Frontend**: Next.js 15 (Static Export), TypeScript, Tailwind CSS.
- **Reverse Proxy & TLS**: Caddy (automatic HTTPS and security headers).

---

## 📂 Project Structure
```
DocMind/
├── frontend/               # Next.js 15 static export application
│   ├── app/                # App Router layouts & main dashboard
│   ├── components/         # Navbar, Sidebar, UploadModal, CitationDrawer
│   ├── lib/api.ts          # Typed API client
│   └── next.config.ts      # output: "export"
├── backend/                # FastAPI application & worker
│   ├── app/
│   │   ├── api/v1/         # Versioned REST endpoints & dependencies
│   │   ├── core/           # Config, security, RFC 7807 problem details, logging
│   │   ├── db/             # SQLAlchemy session and Base model
│   │   ├── models/         # Database entities & Enums
│   │   ├── schemas/        # Pydantic v2 request/response DTOs
│   │   ├── repositories/   # Tenant-scoped data access queries
│   │   ├── services/       # Core business logic (auth, doc, chat, quota)
│   │   ├── adapters/       # Storage (R2/Local) & AI (Gemini/Mock)
│   │   ├── ingestion/      # Format parsers (PDF, DOCX, TXT, MD), chunker
│   │   ├── retrieval/      # Hybrid search & Reciprocal Rank Fusion
│   │   ├── workers/        # Background queue runner & handlers
│   │   └── main.py         # FastAPI application entrypoint
│   ├── tests/              # Unit & cross-tenant security test suite
│   ├── requirements.txt    # Pinned production Python dependencies
│   └── Dockerfile          # Lean multi-purpose production image
├── infra/                  # Production Docker Compose, Caddyfile, backup scripts
│   ├── compose.yaml
│   ├── Caddyfile
│   ├── postgres/init.sql
│   └── scripts/
│       ├── backup.sh       # Automated AES-256 encrypted DB backup to R2
│       └── deploy.sh       # Zero-downtime deployment & health check
├── .github/workflows/      # Automated CI/CD pipeline
├── .env.example            # Source-of-truth environment variables
└── README.md
```

---

## ⚡ Quick Start (Local Development)

### 1. Clone & Set Up Python Environment
```bash
python -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt
```

### 2. Configure Environment
```bash
cp .env.example .env
```

### 3. Run Backend Test Suite
```bash
PYTHONPATH=backend pytest backend/tests/
```

### 4. Start Backend API Server
```bash
PYTHONPATH=backend uvicorn app.main:app --reload --port 8000
```
API Documentation will be live at `http://localhost:8000/docs`.

### 5. Start Background Ingestion Worker
In a second terminal:
```bash
PYTHONPATH=backend python -m app.workers.runner
```

### 6. Start Frontend Development Server
In a third terminal:
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## 🚢 Production Deployment (~₹500 / month VPS)

### 1. Provision VPS & DNS
1. Launch an Ubuntu 24.04 LTS instance (2 vCPU, 4 GB RAM, 40 GB NVMe).
2. Configure DNS A record pointing `api.yourdomain.com` to the VPS public IP.
3. In Cloudflare, set SSL/TLS mode to **Full (strict)**.

### 2. Deploy Docker Compose Stack
```bash
git clone https://github.com/your-org/DocMind.git
cd DocMind
cp .env.example .env
# Edit .env with production passwords and Gemini/R2 API keys
chmod +x infra/scripts/*.sh
./infra/scripts/deploy.sh
```

### 3. Deploy Frontend to Cloudflare Pages
1. In Cloudflare Dashboard, navigate to **Workers & Pages** -> **Create Application** -> **Pages**.
2. Connect your Git repository.
3. Build Configuration:
   - Framework preset: `Next.js (Static HTML Export)`
   - Build command: `npm run build`
   - Build output directory: `frontend/out`
   - Environment Variable: `NEXT_PUBLIC_API_BASE_URL=https://api.yourdomain.com/api/v1`
4. Deploy!

### 4. Setup Automated Nightly Database Backups
Add to root crontab (`crontab -e`):
```cron
0 2 * * * /bin/bash /opt/DocMind/infra/scripts/backup.sh >> /var/log/docmind_backup.log 2>&1
```
Snapshots are encrypted using AES-256 and uploaded directly to your private Cloudflare R2 backup bucket.
