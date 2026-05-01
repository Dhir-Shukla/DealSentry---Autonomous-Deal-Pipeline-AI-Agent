import { Pool } from "@neondatabase/serverless"
import { NextResponse } from "next/server"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export async function GET() {
  try {
    const { rows } = await pool.query(`
      SELECT
        d.id, d.company_name, d.deal_type, d.stage, d.total_value, d.risk_level,
        d.last_activity_at, d.assigned_rep, d.rofr_deadline, d.notes,
        b.name AS buyer_name,
        s.name AS seller_name,
        COUNT(dd.id)::int                                          AS doc_total,
        COUNT(CASE WHEN dd.status != 'received' THEN 1 END)::int  AS doc_pending,
        (
          SELECT row_to_json(a)
          FROM (
            SELECT action_type, priority, created_at
            FROM agent_actions
            WHERE deal_id = d.id
            ORDER BY created_at DESC
            LIMIT 1
          ) a
        ) AS latest_action
      FROM deals d
      LEFT JOIN counterparties  b  ON d.buyer_id  = b.id
      LEFT JOIN counterparties  s  ON d.seller_id = s.id
      LEFT JOIN deal_documents dd  ON dd.deal_id  = d.id
      WHERE d.stage != 'closed'
      GROUP BY d.id, b.name, s.name
      ORDER BY
        CASE d.risk_level
          WHEN 'critical' THEN 1
          WHEN 'high'     THEN 2
          WHEN 'medium'   THEN 3
          WHEN 'low'      THEN 4
          ELSE 5
        END,
        d.id
    `)
    return NextResponse.json(rows)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
