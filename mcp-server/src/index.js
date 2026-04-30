import { Pool } from "@neondatabase/serverless";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}

// --- Tool handlers ---

async function get_deals(env, _args) {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const { rows } = await pool.query(`
    SELECT d.id, d.company_name, d.deal_type, d.stage, d.total_value,
           d.risk_level, d.last_activity_at, d.assigned_rep, d.rofr_deadline, d.notes,
           b.name AS buyer_name, s.name AS seller_name
    FROM deals d
    LEFT JOIN counterparties b ON d.buyer_id = b.id
    LEFT JOIN counterparties s ON d.seller_id = s.id
    WHERE d.stage != 'closed'
    ORDER BY d.id
  `);
  return { deals: rows };
}

async function get_deal_details(env, args) {
  const { deal_id } = args;
  if (!deal_id) throw { status: 400, error: "Missing required argument: deal_id" };

  const pool = new Pool({ connectionString: env.DATABASE_URL });

  const [dealRes, docsRes] = await Promise.all([
    pool.query("SELECT * FROM deals WHERE id = $1", [deal_id]),
    pool.query("SELECT * FROM deal_documents WHERE deal_id = $1 ORDER BY id", [deal_id]),
  ]);

  const deal = dealRes.rows[0];
  if (!deal) throw { status: 400, error: `Deal not found: ${deal_id}` };

  const [buyerRes, sellerRes] = await Promise.all([
    deal.buyer_id ? pool.query("SELECT * FROM counterparties WHERE id = $1", [deal.buyer_id]) : Promise.resolve({ rows: [null] }),
    deal.seller_id ? pool.query("SELECT * FROM counterparties WHERE id = $1", [deal.seller_id]) : Promise.resolve({ rows: [null] }),
  ]);

  return {
    deal: {
      ...deal,
      buyer: buyerRes.rows[0] ?? null,
      seller: sellerRes.rows[0] ?? null,
      documents: docsRes.rows,
    },
  };
}

async function get_counterparty_info(env, args) {
  const { party_id } = args;
  if (!party_id) throw { status: 400, error: "Missing required argument: party_id" };

  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const { rows } = await pool.query("SELECT * FROM counterparties WHERE id = $1", [party_id]);
  return { counterparty: rows[0] ?? null };
}

async function get_document_status(env, args) {
  const { deal_id } = args;
  if (!deal_id) throw { status: 400, error: "Missing required argument: deal_id" };

  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const { rows } = await pool.query(
    "SELECT * FROM deal_documents WHERE deal_id = $1 ORDER BY id",
    [deal_id]
  );
  return { documents: rows };
}

async function get_compliance_rules(env, args) {
  const { category } = args ?? {};
  const pool = new Pool({ connectionString: env.DATABASE_URL });

  const { rows } = category
    ? await pool.query("SELECT * FROM compliance_rules WHERE category = $1 ORDER BY id", [category])
    : await pool.query("SELECT * FROM compliance_rules ORDER BY id");

  return { rules: rows };
}

async function create_action(env, args) {
  const { run_id, deal_id, action_type, priority, reasoning, content, target_recipient } = args;

  if (!run_id) throw { status: 400, error: "Missing required argument: run_id" };
  if (!deal_id) throw { status: 400, error: "Missing required argument: deal_id" };
  if (!action_type) throw { status: 400, error: "Missing required argument: action_type" };
  if (!priority) throw { status: 400, error: "Missing required argument: priority" };
  if (!reasoning) throw { status: 400, error: "Missing required argument: reasoning" };

  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const { rows } = await pool.query(
    `INSERT INTO agent_actions
       (run_id, deal_id, action_type, priority, reasoning, content, target_recipient)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [run_id, deal_id, action_type, priority, reasoning, content ?? null, target_recipient ?? null]
  );
  return { action: rows[0] };
}

async function update_deal_status(env, args) {
  const { deal_id, new_status, risk_level } = args;

  if (!deal_id) throw { status: 400, error: "Missing required argument: deal_id" };
  if (!new_status) throw { status: 400, error: "Missing required argument: new_status" };

  const pool = new Pool({ connectionString: env.DATABASE_URL });

  const { rows } = risk_level
    ? await pool.query(
        "UPDATE deals SET stage = $1, risk_level = $2, last_activity_at = NOW() WHERE id = $3 RETURNING *",
        [new_status, risk_level, deal_id]
      )
    : await pool.query(
        "UPDATE deals SET stage = $1, last_activity_at = NOW() WHERE id = $2 RETURNING *",
        [new_status, deal_id]
      );

  return { deal: rows[0] ?? null };
}

// --- Router ---

const TOOLS = {
  get_deals,
  get_deal_details,
  get_counterparty_info,
  get_document_status,
  get_compliance_rules,
  create_action,
  update_deal_status,
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const { tool, arguments: args } = body;

    const handler = TOOLS[tool];
    if (!handler) {
      return json({ error: `Unknown tool: ${tool}` }, 400);
    }

    try {
      const result = await handler(env, args ?? {});
      return json(result);
    } catch (err) {
      if (err.status && err.error) {
        return json({ error: err.error }, err.status);
      }
      return json({ error: "Database error", details: err.message }, 500);
    }
  },
};
