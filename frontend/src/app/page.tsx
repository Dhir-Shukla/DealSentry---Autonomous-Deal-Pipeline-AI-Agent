"use client"
import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { Shield, Play, RotateCcw, ChevronDown, ChevronRight, Zap, CheckCircle2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { DealCard, Deal } from "@/components/DealCard"
import { ActionCard, Action } from "@/components/ActionCard"
import { RunHistory, Run } from "@/components/RunHistory"
import { sortByPriority, formatCurrency } from "@/lib/utils"

type SweepStatus = "ready" | "running" | "complete" | "error"
type GroupBy = "priority" | "action_type"

const AGENT_API = process.env.NEXT_PUBLIC_AGENT_API_URL ?? "http://localhost:8000"
const POLL_INTERVAL_MS = 4000

function groupActions(actions: Action[], by: GroupBy): Record<string, Action[]> {
  return actions.reduce<Record<string, Action[]>>((acc, a) => {
    const key = by === "priority" ? a.priority : a.action_type.replace(/_/g, " ")
    if (!acc[key]) acc[key] = []
    acc[key].push(a)
    return acc
  }, {})
}

const PRIORITY_ORDER = ["critical", "high", "medium", "low"]

function sortGroupKeys(keys: string[], by: GroupBy): string[] {
  if (by === "priority") {
    return [...keys].sort((a, b) => {
      const ai = PRIORITY_ORDER.indexOf(a)
      const bi = PRIORITY_ORDER.indexOf(b)
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })
  }
  return [...keys].sort()
}

function ActionGroup({ label, actions, onDecision, newActionIds }: {
  label: string
  actions: Action[]
  onDecision: (id: number, decision: "approved" | "rejected", notes?: string) => Promise<void>
  newActionIds: Set<number>
}) {
  const [open, setOpen] = useState(true)

  return (
    <div className="space-y-2">
      <button
        className="flex items-center gap-2 w-full text-left py-1"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
        <span className="text-sm font-semibold text-[#1a1a2e] capitalize">{label}</span>
        <span className="text-xs text-gray-400 font-mono">{actions.length} action{actions.length !== 1 ? "s" : ""}</span>
      </button>
      {open && (
        <div className="space-y-1.5 pl-5">
          {actions.map((a) => (
            <ActionCard key={a.id} action={a} onDecision={onDecision} isNew={newActionIds.has(a.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

function ResolvedSection({ actions, onDecision, newActionIds }: {
  actions: Action[]
  onDecision: (id: number, decision: "approved" | "rejected", notes?: string) => Promise<void>
  newActionIds: Set<number>
}) {
  const [open, setOpen] = useState(false)
  if (actions.length === 0) return null

  return (
    <div className="space-y-2 pt-2 border-t border-gray-100">
      <button
        className="flex items-center gap-2 w-full text-left py-1"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 text-gray-300" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-300" />}
        <span className="text-sm font-medium text-gray-400">Resolved Actions ({actions.length})</span>
      </button>
      {open && (
        <div className="space-y-1.5 pl-5">
          {actions.map((a) => (
            <ActionCard key={a.id} action={a} onDecision={onDecision} dimmed isNew={newActionIds.has(a.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

function SweepStatusBanner({ status, currentDeal, progress }: {
  status: SweepStatus
  currentDeal: string
  progress: { current: number; total: number }
}) {
  if (status === "ready") return null

  if (status === "running") {
    const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0
    return (
      <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-sm font-medium text-amber-800 truncate">
              {currentDeal ? `Analyzing ${currentDeal}…` : "Sweep in progress…"}
            </span>
            {progress.total > 0 && (
              <span className="text-xs font-mono text-amber-600 shrink-0">{progress.current}/{progress.total}</span>
            )}
          </div>
          <div className="h-1.5 bg-amber-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-400 rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
    )
  }

  if (status === "complete") {
    return (
      <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
        <span className="text-sm font-medium text-green-800">Sweep complete — {progress.total} deals analyzed</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
      <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
      <span className="text-sm font-medium text-red-800">Sweep failed — check API connection</span>
    </div>
  )
}

export default function Page() {
  const [deals, setDeals] = useState<Deal[]>([])
  const [actions, setActions] = useState<Action[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [sweepStatus, setSweepStatus] = useState<SweepStatus>("ready")
  const [currentDeal, setCurrentDeal] = useState("")
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [groupBy, setGroupBy] = useState<GroupBy>("priority")
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null)
  const [loadingDeals, setLoadingDeals] = useState(true)
  const [loadingActions, setLoadingActions] = useState(true)
  const [loadingRuns, setLoadingRuns] = useState(true)
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [resetting, setResetting] = useState(false)

  // Refs so polling callbacks always see current values without re-creating the interval
  const sweepStatusRef = useRef(sweepStatus)
  sweepStatusRef.current = sweepStatus
  const selectedRunIdRef = useRef(selectedRunId)
  selectedRunIdRef.current = selectedRunId
  const seenActionIdsRef = useRef(new Set<number>())

  // ─── Fetch helpers ───────────────────────────────────────────────────────────

  const fetchDeals = useCallback(async (silent = false): Promise<Deal[]> => {
    if (!silent) setLoadingDeals(true)
    let data: Deal[] = []
    try {
      const r = await fetch("/api/deals")
      if (r.ok) {
        data = await r.json()
        setDeals(data)
      }
    } finally {
      if (!silent) setLoadingDeals(false)
    }
    return data
  }, [])

  const fetchActions = useCallback(async (runId?: number, silent = false) => {
    if (!silent) setLoadingActions(true)
    try {
      const url = runId ? `/api/actions?run_id=${runId}` : "/api/actions"
      const r = await fetch(url)
      if (r.ok) setActions(await r.json())
    } finally {
      if (!silent) setLoadingActions(false)
    }
  }, [])

  const fetchRuns = useCallback(async (silent = false): Promise<Run[]> => {
    const r = await fetch("/api/runs")
    const data: Run[] = r.ok ? await r.json() : []
    setRuns(data)
    if (!silent) setLoadingRuns(false)
    return data
  }, [])

  // ─── Initial load ─────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchDeals()
    fetchActions()
    fetchRuns()
  }, [fetchDeals, fetchActions, fetchRuns])

  // ─── Restore sweep state after a page refresh ─────────────────────────────────
  // If the latest run in the DB is still "running" when we load, resume the
  // "running" UI state so the status banner stays visible.

  useEffect(() => {
    if (loadingRuns) return
    if (sweepStatusRef.current !== "ready") return  // SSE already managing state
    if (runs.length > 0 && runs[0].status === "running") {
      setSweepStatus("running")
    }
  }, [loadingRuns, runs])

  // Seed progress.total from deals once we know how many there are (covers the
  // refresh case where we never received the SSE "start" event).
  useEffect(() => {
    if (sweepStatus === "running" && progress.total === 0 && deals.length > 0) {
      setProgress((p) => ({ ...p, total: deals.length }))
    }
  }, [sweepStatus, progress.total, deals.length])

  // ─── Live polling while a sweep is running ────────────────────────────────────
  // Silently refreshes actions, deals, and runs every 4 s so the UI updates
  // without the user having to manually refresh. Also detects when the sweep
  // finishes if the page was refreshed mid-run (no active SSE stream).

  useEffect(() => {
    if (sweepStatus !== "running") return

    const poll = async () => {
      if (sweepStatusRef.current !== "running") return

      const [updatedRuns, updatedDeals] = await Promise.all([
        fetchRuns(true),
        fetchDeals(true),
        fetchActions(selectedRunIdRef.current ?? undefined, true),
      ])

      if (sweepStatusRef.current !== "running") return  // SSE may have already resolved

      // Infer how many deals have been analyzed from risk_level changes.
      // The agent always updates risk_level for every deal it processes.
      const analyzedCount = updatedDeals.filter((d) => d.risk_level !== "unknown").length
      setProgress((p) => ({ ...p, current: analyzedCount }))

      const latest = updatedRuns[0]
      if (!latest) return

      if (latest.status === "completed") {
        setSweepStatus("complete")
        setProgress((p) => ({
          current: latest.deals_analyzed ?? p.total,
          total: latest.deals_analyzed ?? p.total,
        }))
      } else if (latest.status === "failed") {
        setSweepStatus("error")
      }
    }

    const id = setInterval(poll, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [sweepStatus, fetchRuns, fetchDeals, fetchActions])

  // Track which action IDs have been rendered before so newly arriving cards can animate in.
  useEffect(() => {
    actions.forEach((a) => seenActionIdsRef.current.add(a.id))
  }, [actions])

  // ─── Handlers ─────────────────────────────────────────────────────────────────

  async function handleSelectRun(id: number) {
    setSelectedRunId(id)
    await fetchActions(id)
  }

  async function handleDecision(id: number, decision: "approved" | "rejected", notes?: string) {
    await fetch(`/api/actions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, notes }),
    })
    setActions((prev) =>
      prev.map((a) => a.id === id ? { ...a, human_decision: decision, human_notes: notes ?? null } : a)
    )
    await fetchDeals(true)
  }

  async function handleSweep() {
    if (sweepStatus === "running") return
    setSweepStatus("running")
    setCurrentDeal("")
    setProgress({ current: 0, total: 0 })
    setSelectedRunId(null)

    try {
      const res = await fetch(`${AGENT_API}/sweep`, { method: "POST" })

      if (!res.ok || !res.body) {
        setSweepStatus("error")
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          const raw = line.slice(6).trim()
          if (!raw) continue
          try {
            const evt = JSON.parse(raw)

            if (evt.type === "start") {
              setProgress({ current: 0, total: evt.total_deals ?? 0 })
            } else if (evt.type === "deal_start") {
              setCurrentDeal(evt.company_name ?? "")
            } else if (evt.type === "deal_complete" || evt.type === "deal_error") {
              setProgress((p) => ({ ...p, current: p.current + 1 }))
            } else if (evt.type === "complete") {
              setSweepStatus("complete")
              // Full refresh — polling will stop automatically since status is no longer "running"
              await Promise.all([fetchDeals(), fetchRuns(), fetchActions()])
            } else if (evt.type === "error") {
              setSweepStatus("error")
            }
          } catch {
            // non-JSON SSE line — skip
          }
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== "AbortError") {
        setSweepStatus("error")
      }
    }
  }

  async function handleReset() {
    setResetting(true)
    try {
      await fetch(`${AGENT_API}/reset`, { method: "POST" })
      setSweepStatus("ready")
      setSelectedRunId(null)
      setCurrentDeal("")
      setProgress({ current: 0, total: 0 })
      setLoadingDeals(true)
      setLoadingActions(true)
      setLoadingRuns(true)
      await Promise.all([fetchDeals(), fetchActions(), fetchRuns()])
    } finally {
      setResetting(false)
      setShowResetDialog(false)
    }
  }

  // ─── Derived state ────────────────────────────────────────────────────────────

  const totalPipelineValue = deals.reduce((sum, d) => sum + parseFloat(d.total_value), 0)
  const pendingActions = sortByPriority(actions.filter((a) => a.human_decision === "pending"))
  const resolvedActions = [...actions.filter((a) => a.human_decision !== "pending")].sort((a, b) => b.id - a.id)
  const grouped = groupActions(pendingActions, groupBy)
  const groupKeys = sortGroupKeys(Object.keys(grouped), groupBy)
  // Compute which action IDs are appearing for the first time this render so they animate in.
  // seenActionIdsRef is updated in a useEffect AFTER this render, so new IDs are correctly identified.
  const newActionIds = useMemo(
    () => new Set(actions.filter((a) => !seenActionIdsRef.current.has(a.id)).map((a) => a.id)),
    [actions]
  )

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-sm border-b border-orange-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
          {/* Wordmark */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#F97066] to-[#c94033] flex items-center justify-center shadow-sm">
              <Shield className="text-white" style={{ height: "1.125rem", width: "1.125rem" }} />
            </div>
            <span className="text-lg font-bold text-[#1a1a2e] tracking-tight">DealSentry</span>
          </div>

          {/* Status banner (center, desktop) */}
          <div className="flex-1 max-w-xl hidden sm:block">
            <SweepStatusBanner status={sweepStatus} currentDeal={currentDeal} progress={progress} />
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="text-gray-500 hover:text-gray-700 gap-1.5"
              onClick={() => setShowResetDialog(true)}
              disabled={sweepStatus === "running" || resetting}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Reset</span>
            </Button>
            <button
              className={[
                "relative inline-flex items-center gap-2 px-5 h-10 rounded-xl font-semibold text-sm text-white",
                "bg-gradient-to-br from-[#F97066] via-[#f5543f] to-[#c94033]",
                "shadow-[0_4px_14px_rgba(249,112,102,0.45)]",
                "hover:shadow-[0_6px_22px_rgba(249,112,102,0.65)] hover:scale-[1.03]",
                "active:scale-[0.98]",
                "transition-all duration-150",
                "disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-[0_4px_14px_rgba(249,112,102,0.45)]",
                sweepStatus === "ready" ? "ring-2 ring-[#F97066]/30 ring-offset-1" : "",
              ].join(" ")}
              onClick={handleSweep}
              disabled={sweepStatus === "running"}
            >
              {sweepStatus === "running" ? (
                <>
                  <div className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  Running…
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" />
                  Run Sweep
                </>
              )}
            </button>
          </div>
        </div>

        {/* Mobile status banner */}
        {sweepStatus !== "ready" && (
          <div className="sm:hidden px-4 pb-3">
            <SweepStatusBanner status={sweepStatus} currentDeal={currentDeal} progress={progress} />
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">

        {/* Info banner */}
        <div className="rounded-xl bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-100 px-5 py-4">
          <div className="flex items-start gap-3">
            <Play className="h-4 w-4 text-[#F97066] mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-[#1a1a2e]">AI-powered deal monitoring</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Click Run Sweep to execute the agentic analysis. DealSentry will scan the deals in the pipeline, flag any concerns such as regulatory issues or approaching deadlines, and propose the next step for your approval. Reset the pipeline after sweeping to restore mock data for a fully fresh test.
              </p>
              <p className="text-xs text-gray-500 mt-4">
                 Note: Due to API budget constraints, the agent processes each deal individually to avoid maxing out tokens. Each deal takes south of 1 minute to analyze (~10 minutes total).
              </p>
            </div>
          </div>
        </div>

        {/* Pipeline section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-[#1a1a2e]">Pipeline</h2>
              {!loadingDeals && (
                <p className="text-sm text-gray-500 mt-0.5">
                  {deals.length} deals · {formatCurrency(String(totalPipelineValue))} total
                </p>
              )}
            </div>
          </div>

          {loadingDeals ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="card-warm p-4 space-y-3">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-7 w-1/2" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-2 w-full rounded-full" />
                </div>
              ))}
            </div>
          ) : deals.length === 0 ? (
            <div className="card-warm px-6 py-12 text-center text-gray-400 text-sm">
              No deals found — check your database connection
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {deals.map((d) => <DealCard key={d.id} deal={d} />)}
            </div>
          )}
        </section>

        {/* Actions section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-bold text-[#1a1a2e]">Actions</h2>
              {!loadingActions && actions.length > 0 && (
                <p className="text-sm text-gray-500 mt-0.5">
                  {pendingActions.length} pending · {actions.length} total
                </p>
              )}
            </div>

            {pendingActions.length > 0 && (
              <div className="flex items-center bg-gray-100 rounded-lg p-0.5 text-xs font-medium">
                <button
                  onClick={() => setGroupBy("priority")}
                  className={`px-3 py-1 rounded-md transition-colors ${groupBy === "priority" ? "bg-white text-[#1a1a2e] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  By priority
                </button>
                <button
                  onClick={() => setGroupBy("action_type")}
                  className={`px-3 py-1 rounded-md transition-colors ${groupBy === "action_type" ? "bg-white text-[#1a1a2e] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  By type
                </button>
              </div>
            )}
          </div>

          {loadingActions ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="card-warm p-4 space-y-3">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-7 w-24" />
                </div>
              ))}
            </div>
          ) : actions.length === 0 ? (
            <div className="card-warm px-6 py-12 text-center">
              <Zap className="h-8 w-8 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">No actions yet — run a sweep to have DealSentry analyze the pipeline</p>
            </div>
          ) : (
            <div className="space-y-6">
              {groupKeys.map((key) => (
                <ActionGroup
                  key={key}
                  label={key}
                  actions={grouped[key]}
                  onDecision={handleDecision}
                  newActionIds={newActionIds}
                />
              ))}
              <ResolvedSection actions={resolvedActions} onDecision={handleDecision} newActionIds={newActionIds} />
            </div>
          )}
        </section>

        {/* Run History section */}
        {loadingRuns ? (
          <div className="card-warm p-5 space-y-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <RunHistory
            runs={runs}
            selectedRunId={selectedRunId}
            onSelectRun={handleSelectRun}
          />
        )}
      </main>

      {/* Reset confirmation dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset pipeline?</DialogTitle>
            <DialogDescription>
              This will call the backend reset endpoint, which truncates all agent runs, actions, deals, and counterparties, then re-seeds the database with fresh sample data. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setShowResetDialog(false)} disabled={resetting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleReset}
              disabled={resetting}
            >
              {resetting ? "Resetting…" : "Yes, reset"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
