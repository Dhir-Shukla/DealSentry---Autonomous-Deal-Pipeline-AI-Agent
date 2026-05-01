import { Pool } from "@neondatabase/serverless"
import { NextRequest, NextResponse } from "next/server"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const STAGES = ["inquiry", "agreement", "negotiation", "documentation", "rofr", "settlement", "closing", "closed"]

function extractStage(text: string | null): string | null {
  if (!text) return null
  const lower = text.toLowerCase()
  return STAGES.find((s) => lower.includes(s)) ?? null
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { decision, notes } = await req.json()
    if (!["approved", "rejected"].includes(decision)) {
      return NextResponse.json({ error: "Invalid decision" }, { status: 400 })
    }

    const { rows } = await pool.query(
      `UPDATE agent_actions
       SET human_decision = $1, human_notes = $2
       WHERE id = $3
       RETURNING *`,
      [decision, notes ?? null, params.id]
    )

    const action = rows[0]
    if (!action) return NextResponse.json({ error: "Action not found" }, { status: 404 })

    // If a status_update is approved, advance the deal stage
    if (decision === "approved" && action.action_type === "status_update") {
      const newStage = extractStage(action.content) ?? extractStage(action.reasoning)
      if (newStage) {
        await pool.query(
          `UPDATE deals SET stage = $1, last_activity_at = NOW() WHERE id = $2`,
          [newStage, action.deal_id]
        )
      }
    }

    return NextResponse.json(action)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
