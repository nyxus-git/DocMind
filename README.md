# DocMind 📑🧠
> Enterprise-grade multimodal RAG agent with hybrid vector search, semantic caching, and verifiable citations.

## 🚀 Overview
DocMind is an enterprise document intelligence and audit platform. It merges dense semantic embeddings with sparse BM25 lexical retrieval using Reciprocal Rank Fusion (RRF) over Qdrant, featuring multi-agent debate reasoning for zero-hallucination compliance queries.

## 🛠️ Tech Stack
- **Backend**: Python 3.11+, FastAPI, LangChain, Qdrant Vector DB, Redis
- **Embedding & LLM**: BGE-M3 / OpenAI Embeddings, Llama-3.3-70B / DeepSeek
- **Document Ingestion**: PyMuPDF, PaddleOCR, Unstructured
- **Frontend**: Next.js 15, TypeScript, TailwindCSS

## 📂 Project Structure
```
DocMind/
├── app/
│   ├── api/          # FastAPI routes (query, ingest, audit)
│   ├── rag/          # Hybrid retrieval, Qdrant client, RRF reranker
│   └── main.py       # API entrypoint
├── data/
│   └── sample_documents/ # Test PDFs and reports
├── requirements.txt
├── .env.example
└── README.md
```

## ⚡ Quick Start (Arch Linux)
```bash
# 1. Setup virtual environment
python -m venv venv
source venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Launch Qdrant (Docker)
docker run -p 6333:6333 -p 6334:6334 qdrant/qdrant

# 4. Start API server
uvicorn app.main:app --reload --port 8000
```
