import { Pool } from "@neondatabase/serverless"
import { NextRequest, NextResponse } from "next/server"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export async function GET(req: NextRequest) {
  try {
    const runId = req.nextUrl.searchParams.get("run_id")

    let query: string
    let params: unknown[]

    if (runId) {
      query = `
        SELECT aa.*, d.company_name, d.total_value
        FROM agent_actions aa
        JOIN deals d ON aa.deal_id = d.id
        WHERE aa.run_id = $1
        ORDER BY
          CASE aa.priority
            WHEN 'critical' THEN 1 WHEN 'high' THEN 2
            WHEN 'medium'   THEN 3 WHEN 'low'  THEN 4 ELSE 5
          END, aa.id
      `
      params = [runId]
    } else {
      query = `
        SELECT aa.*, d.company_name, d.total_value
        FROM agent_actions aa
        JOIN deals d ON aa.deal_id = d.id
        WHERE aa.run_id = (
          SELECT id FROM agent_runs ORDER BY started_at DESC LIMIT 1
        )
        ORDER BY
          CASE aa.priority
            WHEN 'critical' THEN 1 WHEN 'high' THEN 2
            WHEN 'medium'   THEN 3 WHEN 'low'  THEN 4 ELSE 5
          END, aa.id
      `
      params = []
    }

    const { rows } = await pool.query(query, params)
    return NextResponse.json(rows)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
