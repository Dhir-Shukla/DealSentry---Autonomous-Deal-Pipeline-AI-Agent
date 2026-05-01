"use client"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatCurrency, formatAbsoluteTime } from "@/lib/utils"

export interface Deal {
  id: number
  company_name: string
  deal_type: string
  stage: string
  total_value: string
  risk_level: string
  last_activity_at: string
  assigned_rep: string
  rofr_deadline: string | null
  notes: string | null
  buyer_name: string | null
  seller_name: string | null
  doc_total: number
  doc_pending: number
  latest_action?: { action_type: string; priority: string } | null
}

const STAGE_COLORS: Record<string, string> = {
  inquiry:       "bg-gray-100 text-gray-700",
  negotiation:   "bg-purple-100 text-purple-700",
  agreement:     "bg-blue-100 text-blue-700",
  documentation: "bg-indigo-100 text-indigo-700",
  rofr:          "bg-amber-100 text-amber-700",
  settlement:    "bg-teal-100 text-teal-700",
  closing:       "bg-green-100 text-green-700",
  closed:        "bg-gray-100 text-gray-500",
}

const RISK_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  high:     "bg-orange-100 text-orange-700",
  medium:   "bg-amber-100 text-amber-700",
  low:      "bg-green-100 text-green-700",
  unknown:  "bg-gray-100 text-gray-500",
}

function DealDetailModal({ deal }: { deal: Deal }) {
  const docsComplete = deal.doc_total - deal.doc_pending

  const rows: [string, string][] = [
    ["type",           deal.deal_type],
    ["stage",          deal.stage],
    ["value",          formatCurrency(deal.total_value)],
    ["risk",           deal.risk_level],
    ["buyer",          deal.buyer_name ?? "—"],
    ["seller",         deal.seller_name ?? "—"],
    ["rep",            deal.assigned_rep],
    ["last activity",  formatAbsoluteTime(deal.last_activity_at)],
    ["rofr deadline",  deal.rofr_deadline ?? "none"],
    ["documents",      `${docsComplete} / ${deal.doc_total} complete (${deal.doc_pending} pending)`],
    ["notes",          deal.notes ?? "none"],
  ]

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-sm font-mono text-gray-500 font-normal">
          deal #{deal.id} — {deal.company_name}
        </DialogTitle>
      </DialogHeader>
      <div className="mt-4 grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-1.5 text-xs">
        {rows.map(([label, value]) => (
          <span key={label} className="contents">
            <span className="text-gray-400 font-medium uppercase tracking-wide text-[10px] pt-px leading-4">{label}</span>
            <span className="text-gray-700 font-mono leading-4 break-words">{value}</span>
          </span>
        ))}
      </div>
    </>
  )
}

export function DealCard({ deal }: { deal: Deal }) {
  const [showModal, setShowModal] = useState(false)

  return (
    <>
      <div
        className="card-warm p-4 flex flex-col gap-2.5 cursor-pointer select-none"
        onClick={() => setShowModal(true)}
      >
        {/* Name + type */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold text-[#1a1a2e] text-sm leading-tight">{deal.company_name}</h3>
          <Badge variant={deal.deal_type === "buy" ? "buy" : "sell"} className="shrink-0">
            {deal.deal_type.toUpperCase()}
          </Badge>
        </div>

        {/* Value */}
        <span className="font-mono text-base font-semibold text-[#1a1a2e]">
          {formatCurrency(deal.total_value)}
        </span>

        {/* Stage + risk */}
        <div className="flex items-center justify-between gap-2">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STAGE_COLORS[deal.stage] ?? "bg-gray-100 text-gray-600"}`}>
            {deal.stage}
          </span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${RISK_COLORS[deal.risk_level] ?? "bg-gray-100 text-gray-500"}`}>
            {deal.risk_level === "unknown" ? "unassessed" : deal.risk_level}
          </span>
        </div>
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-sm">
          <DealDetailModal deal={deal} />
        </DialogContent>
      </Dialog>
    </>
  )
}
