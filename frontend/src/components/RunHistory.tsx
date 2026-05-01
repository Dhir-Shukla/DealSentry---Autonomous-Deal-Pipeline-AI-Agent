"use client"
import { useState } from "react"
import { ChevronDown, ChevronRight, CheckCircle, Loader2, XCircle } from "lucide-react"
import { formatAbsoluteTime } from "@/lib/utils"

export interface Run {
  id: number
  started_at: string
  completed_at: string | null
  deals_analyzed: number | null
  actions_created: number | null
  status: string
  action_count: number
}

export function RunHistory({
  runs,
  selectedRunId,
  onSelectRun,
}: {
  runs: Run[]
  selectedRunId: number | null
  onSelectRun: (id: number) => void
}) {
  const [open, setOpen] = useState(true)

  return (
    <div className="card-warm overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-orange-50/40 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="font-semibold text-[#1a1a2e] flex items-center gap-2">
          Run History
          <span className="text-xs font-normal text-gray-400 font-mono">{runs.length} runs</span>
        </span>
        {open ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
      </button>

      {open && (
        <div className="overflow-x-auto border-t border-orange-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-orange-100 bg-orange-50/30">
                {["Run #", "Date & Time", "Deals", "Actions", "Status"].map((h) => (
                  <th key={h} className="px-5 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-gray-400 text-sm">
                    No runs yet — click Run Sweep to start
                  </td>
                </tr>
              )}
              {runs.map((run) => (
                <tr
                  key={run.id}
                  onClick={() => onSelectRun(run.id)}
                  className={`border-b border-orange-50 cursor-pointer transition-colors hover:bg-orange-50/40 ${
                    selectedRunId === run.id ? "bg-orange-50/60" : ""
                  }`}
                >
                  <td className="px-5 py-3 font-mono font-medium text-[#1a1a2e]">#{run.id}</td>
                  <td className="px-5 py-3 text-gray-600">{formatAbsoluteTime(run.started_at)}</td>
                  <td className="px-5 py-3 font-mono text-gray-700">{run.deals_analyzed ?? "—"}</td>
                  <td className="px-5 py-3 font-mono text-gray-700">{run.action_count}</td>
                  <td className="px-5 py-3">
                    <StatusBadge status={run.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === "completed")
    return <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full"><CheckCircle className="h-3 w-3" /> Completed</span>
  if (status === "running")
    return <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full"><Loader2 className="h-3 w-3 animate-spin" /> Running</span>
  return <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-100 px-2 py-0.5 rounded-full"><XCircle className="h-3 w-3" /> Failed</span>
}
