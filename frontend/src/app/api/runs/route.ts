import { Pool } from "@neondatabase/serverless"
import { NextResponse } from "next/server"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export async function GET() {
  try {
    const { rows } = await pool.query(`
      SELECT ar.*, COUNT(aa.id)::int AS action_count
      FROM agent_runs ar
      LEFT JOIN agent_actions aa ON aa.run_id = ar.id
      GROUP BY ar.id
      ORDER BY ar.started_at DESC
    `)
    return NextResponse.json(rows)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
