"use client"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertTriangle, Shield, Mail, HelpCircle, ArrowUpCircle, Check, X, User, ChevronRight } from "lucide-react"

export interface Action {
  id: number
  run_id: number
  deal_id: number
  company_name: string
  total_value: string
  action_type: string
  priority: string
  reasoning: string
  content: string | null
  target_recipient: string | null
  human_decision: string
  human_notes: string | null
  created_at: string
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  escalation:      <AlertTriangle className="h-3.5 w-3.5" />,
  compliance_flag: <Shield className="h-3.5 w-3.5" />,
  follow_up:       <Mail className="h-3.5 w-3.5" />,
  info_request:    <HelpCircle className="h-3.5 w-3.5" />,
  status_update:   <ArrowUpCircle className="h-3.5 w-3.5" />,
}

const PRIORITY_BORDER: Record<string, string> = {
  critical: "priority-border-critical",
  high:     "priority-border-high",
  medium:   "priority-border-medium",
  low:      "priority-border-low",
}

const PRIORITY_BADGE: Record<string, "critical" | "high" | "medium" | "low"> = {
  critical: "critical", high: "high", medium: "medium", low: "low",
}

const PRIORITY_DOT: Record<string, string> = {
  critical: "bg-red-500",
  high:     "bg-orange-500",
  medium:   "bg-yellow-400",
  low:      "bg-green-500",
}

const ACTION_TYPE_COLORS: Record<string, string> = {
  escalation:      "text-red-600 bg-red-50",
  compliance_flag: "text-indigo-600 bg-indigo-50",
  follow_up:       "text-blue-600 bg-blue-50",
  info_request:    "text-amber-600 bg-amber-50",
  status_update:   "text-emerald-600 bg-emerald-50",
}

function ActionModal({
  action,
  onDecision,
  onClose,
}: {
  action: Action
  onDecision: (id: number, decision: "approved" | "rejected", notes?: string) => Promise<void>
  onClose: () => void
}) {
  const [state, setState] = useState<"idle" | "rejecting" | "loading">("idle")
  const [notes, setNotes] = useState("")
  const decided = action.human_decision !== "pending"

  async function handleApprove() {
    setState("loading")
    await onDecision(action.id, "approved")
    onClose()
  }

  async function handleReject() {
    if (state === "rejecting") {
      setState("loading")
      await onDecision(action.id, "rejected", notes || undefined)
      onClose()
    } else {
      setState("rejecting")
    }
  }

  const typeColor = ACTION_TYPE_COLORS[action.action_type] ?? "text-gray-600 bg-gray-100"

  return (
    <>
      <DialogHeader className="shrink-0 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className={`h-3 w-3 rounded-full shrink-0 shadow-sm ${PRIORITY_DOT[action.priority] ?? "bg-gray-400"}`} />
          <DialogTitle className="text-base font-bold text-[#1a1a2e] leading-tight">
            {action.company_name}
          </DialogTitle>
        </div>
        <p className="text-xs font-mono text-gray-400 mt-0.5 pl-5">deal #{action.deal_id}</p>
      </DialogHeader>

      {/* Two-column body: left = content, right = meta + decision */}
      <div className="flex-1 min-h-0 overflow-y-auto flex gap-5 pt-1">

        {/* Left: reasoning + drafted content */}
        <div className="flex-1 min-w-0 space-y-3">
          <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2.5">
            <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1.5">Agent Reasoning</p>
            <p className="text-sm text-gray-700 leading-relaxed">{action.reasoning}</p>
          </div>

          {action.content && (
            <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Drafted Content</p>
              <p className="text-xs text-gray-600 whitespace-pre-wrap font-mono leading-relaxed">{action.content}</p>
            </div>
          )}
        </div>

        {/* Right: meta + decision */}
        <div className="w-44 shrink-0 border-l border-gray-100 pl-4 flex flex-col gap-3">
          {/* Type + priority */}
          <div className="flex flex-wrap gap-1.5">
            <Badge variant={PRIORITY_BADGE[action.priority] ?? "default"}>
              {action.priority}
            </Badge>
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${typeColor}`}>
              {ACTION_ICONS[action.action_type]}
              {action.action_type.replace(/_/g, " ")}
            </span>
          </div>

          {/* Recipient */}
          {action.target_recipient && (
            <div className="flex items-start gap-1.5 text-xs text-gray-500">
              <User className="h-3 w-3 shrink-0 mt-0.5" />
              <span className="break-words">{action.target_recipient}</span>
            </div>
          )}

          {/* Spacer — pushes decision to bottom */}
          <div className="flex-1" />

          {/* Decision */}
          <div className="pt-3 border-t border-gray-100">
            {decided ? (
              <div className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full ${
                action.human_decision === "approved"
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}>
                {action.human_decision === "approved"
                  ? <Check className="h-3.5 w-3.5" />
                  : <X className="h-3.5 w-3.5" />}
                {action.human_decision === "approved" ? "Approved" : "Rejected"}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-col gap-1.5">
                  <Button
                    size="sm"
                    variant="success"
                    disabled={state === "loading" || state === "rejecting"}
                    onClick={handleApprove}
                    className="h-8 text-xs w-full"
                  >
                    <Check className="h-3 w-3" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={state === "loading"}
                    onClick={handleReject}
                    className="h-8 text-xs w-full"
                  >
                    <X className="h-3 w-3" />
                    {state === "rejecting" ? "Confirm" : "Reject"}
                  </Button>
                </div>
                {state === "rejecting" && (
                  <input
                    autoFocus
                    className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#F97066]"
                    placeholder="Optional notes..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleReject()}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export function ActionCard({
  action,
  onDecision,
  dimmed = false,
  isNew = false,
}: {
  action: Action
  onDecision: (id: number, decision: "approved" | "rejected", notes?: string) => Promise<void>
  dimmed?: boolean
  isNew?: boolean
}) {
  const [showModal, setShowModal] = useState(false)
  const decided = action.human_decision !== "pending"

  const truncated = action.reasoning.length > 90
    ? action.reasoning.slice(0, 90).trimEnd() + "…"
    : action.reasoning

  const borderClass = PRIORITY_BORDER[action.priority] ?? "border-l-4 border-l-gray-300"

  return (
    <>
      <div
        className={[
          "card-warm p-0 overflow-hidden cursor-pointer select-none transition-opacity",
          borderClass,
          dimmed ? "opacity-50 hover:opacity-70" : "",
          isNew ? "action-new" : "",
        ].join(" ")}
        onClick={() => setShowModal(true)}
      >
        <div className="px-3 py-2.5 flex items-center gap-2.5 min-w-0">
          {/* Type icon + label */}
          <span className="inline-flex items-center gap-1 text-xs text-gray-500 shrink-0">
            {ACTION_ICONS[action.action_type]}
            <span className="hidden sm:inline font-medium">{action.action_type.replace(/_/g, " ")}</span>
          </span>

          {/* Company */}
          <span className="text-xs font-semibold text-[#1a1a2e] shrink-0">{action.company_name}</span>

          {/* Priority badge */}
          <Badge
            variant={PRIORITY_BADGE[action.priority] ?? "default"}
            className="shrink-0 text-[10px] px-1.5 py-0 leading-4"
          >
            {action.priority}
          </Badge>

          {/* Truncated reasoning */}
          <span className="text-xs text-gray-400 truncate flex-1 min-w-0">{truncated}</span>

          {/* Decision indicator */}
          {decided && (
            <span className={`shrink-0 inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
              action.human_decision === "approved"
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            }`}>
              {action.human_decision === "approved"
                ? <Check className="h-2.5 w-2.5" />
                : <X className="h-2.5 w-2.5" />}
            </span>
          )}

          <ChevronRight className="h-3.5 w-3.5 text-gray-300 shrink-0" />
        </div>
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <ActionModal
            action={action}
            onDecision={onDecision}
            onClose={() => setShowModal(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
