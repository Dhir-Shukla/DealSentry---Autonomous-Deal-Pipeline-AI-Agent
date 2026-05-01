# Deal Sentry

An autonomous AI agent for monitoring and managing private securities deal pipelines. Deal Sentry sweeps your active deals, identifies compliance risks and operational blockers, and surfaces prioritised recommended actions for human review and approval.

---

## What It Does

1. A user triggers a **sweep** from the frontend.
2. The backend orchestrator fetches all active deals and dispatches Claude to analyse each one.
3. Claude calls tools on the MCP server to inspect deal details, counterparty KYC status, document completeness, and compliance rules.
4. Claude writes back recommended actions (`follow_up`, `compliance_flag`, `escalation`, `info_request`, `status_update`) with reasoning and a priority level.
5. Results stream to the UI in real time via Server-Sent Events.
6. A human reviews, approves, or rejects each recommended action before anything is acted on.

---

## Infrastructure Outline

```
┌─────────────────────────────────────────────────────────┐
│                     Browser (UI)                        │
│              Next.js 14 · React 18 · Tailwind           │
│          Real-time SSE consumer + action approvals      │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP / SSE
┌────────────────────────▼────────────────────────────────┐
│                  Backend API                            │
│           FastAPI (Python 3.11) · Uvicorn               │
│    POST /sweep  –  streams SSE events as deals are      │
│                    analysed                             │
│    POST /reset  –  reload demo data                     │
│    GET  /health –  liveness probe                       │
│                                                         │
│    ┌─────────────────────────────────────────┐          │
│    │         Agent Orchestrator              │          │
│    │  • Fetches deals from MCP server        │          │
│    │  • Runs Claude per deal (tool_use loop) │          │
│    │  • Concurrency: max 2 deals in parallel │          │
│    │  • Per-deal hard timeout: 180 s         │          │
│    └──────────────────┬──────────────────────┘          │
└───────────────────────┼─────────────────────────────────┘
                        │ HTTP (JSON-RPC-style)
┌───────────────────────▼─────────────────────────────────┐
│              MCP Server (Tool Registry)                 │
│         Cloudflare Workers (Node.js compat mode)        │
│                                                         │
│  Tools exposed to Claude:                               │
│    get_deals · get_deal_details · get_document_status   │
│    get_counterparty_info · get_compliance_rules         │
│    create_action · update_deal_status                   │
│    update_counterparty_info · complete_run · …          │
└───────────────────────┬─────────────────────────────────┘
                        │ SQL (Neon serverless driver)
┌───────────────────────▼─────────────────────────────────┐
│                  PostgreSQL (Neon)                      │
│   Tables: deals · counterparties · deal_documents       │
│            agent_runs                                   │
└─────────────────────────────────────────────────────────┘
```

### Directory Layout

```
Deal Sentry/
├── backend/             # FastAPI app + Claude agent orchestration
│   ├── api/main.py      # Route definitions
│   ├── agent/
│   │   ├── orchestrator.py   # Per-deal Claude loop, SSE emitter
│   │   ├── mcp_client.py     # HTTP client for MCP server
│   │   └── prompts.py        # System prompt for Claude
│   ├── db/schema.py     # SQLAlchemy table definitions
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/            # Next.js UI
│   ├── src/app/
│   │   ├── page.tsx          # Main sweep dashboard
│   │   └── api/              # Next.js API routes (proxy to backend)
│   └── src/components/
│       ├── DealCard.tsx
│       ├── ActionCard.tsx     # Approve / reject UI
│       └── RunHistory.tsx
└── mcp-server/          # Cloudflare Workers tool server
    ├── src/index.js     # Tool handler registry
    └── wrangler.toml
```

---

## Key Infrastructure Decisions

| Decision | Rationale |
|---|---|
| **MCP (Model Context Protocol) for tool exposure** | Decouples Claude's tool surface from the backend. Claude discovers tools at runtime via `list_tools`, so new capabilities can be added to the MCP server without changing the orchestrator or re-prompting. |
| **Cloudflare Workers for the MCP server** | Globally distributed, zero cold-start serverless runtime. Claude's tool calls are low-latency regardless of where the backend runs. The Neon serverless Postgres driver is compatible without a persistent connection pool. |
| **Server-Sent Events (SSE) for streaming** | Sweep progress (deal started, action created, deal complete) streams to the UI as it happens rather than waiting for the full sweep to finish. SSE is simpler than WebSockets for a unidirectional feed. |
| **PostgreSQL (Neon) as the single source of truth** | All deal, counterparty, document, and agent-run data lives in one relational store. Claude reads and writes through MCP tools, so the database is never directly exposed to the agent. |
| **Human-in-the-loop approval** | Claude recommends actions; humans approve or reject them before anything is executed. This keeps the agent advisory rather than autonomous, which is appropriate for compliance-sensitive securities workflows. |
| **FastAPI + Uvicorn backend** | Async-native Python server pairs naturally with `asyncio`-based agent logic and SSE streaming. Containerised via Docker for straightforward deployment. |

---

## Important Notes

### Why the agent is slow (and how it scales in production)

In the current deployment, deals are analysed **sequentially with a concurrency cap of 2**. For each deal, Claude runs a multi-turn tool-use loop: it can call `get_deal_details`, `get_counterparty_info`, `get_document_status`, and `get_compliance_rules` one after another, wait for each MCP response, and then write one or more actions back. Each round trip to the Cloudflare Workers MCP server adds latency, and the Anthropic API adds further latency per inference call. A sweep over 15 deals therefore takes on the order of several minutes end-to-end.

**In an enterprise deployment this bottleneck is addressable:**

- **Horizontal parallelism** — Remove or raise the concurrency semaphore. With enough API rate-limit quota, every deal in the pipeline can be dispatched to Claude simultaneously, reducing total sweep time from O(n) to O(1) relative to deal count.
- **Batch tool calls** — Claude can be instructed (or fine-tuned via prompting) to fetch all relevant context in fewer round trips, cutting per-deal latency.
- **Provisioned throughput** — Anthropic's enterprise tier offers higher requests-per-minute limits, eliminating the rate-limit back-off that currently serialises bursts.
- **Edge-colocated MCP** — Deploying the MCP server in the same cloud region as the backend removes cross-region RTT from every tool call.
- **Streaming partial results** — The SSE architecture is already in place; faster upstream processing means actions appear in the UI progressively rather than in a long tail.

The current design is intentionally conservative to stay within free-tier and demo-scale constraints. The architecture does not need to change to scale — only the concurrency limits and infrastructure tier.

---

## Environment Variables

### Backend (`backend/.env`)

```
DATABASE_URL=postgresql://user:pass@host/dbname
MCP_SERVER_URL=https://deal-sentry-mcp.<subdomain>.workers.dev
ANTHROPIC_API_KEY=sk-ant-...
```

### Frontend (`frontend/.env.local`)

See `frontend/.env.local.example`.

### MCP Server

Database connection string is set in `wrangler.toml` (or via Cloudflare dashboard secrets).

---

## Running Locally

```bash
# MCP server (deploy to Cloudflare Workers)
cd mcp-server
npm install
npx wrangler deploy

# Backend
cd backend
pip install -r requirements.txt
cp .env.example .env   # fill in values
uvicorn api.main:app --reload --port 8000

# Frontend
cd frontend
npm install
cp .env.local.example .env.local   # fill in values
npm run dev
```

Or run the backend via Docker:

```bash
cd backend
docker build -t deal-sentry-backend .
docker run -p 8000:8000 --env-file .env deal-sentry-backend
```
