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

// --- Tool registry (single source of truth for schemas + discovery) ---

const TOOL_REGISTRY = [
  {
    name: "get_deals",
    description:
      "Retrieve all active (non-closed) deals in the pipeline with basic info including company name, deal type, stage, total value, risk level, last activity date, assigned rep, ROFR deadline, and buyer/seller names. Use this as the first step to get an overview of deals to analyze.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_deal_details",
    description:
      "Get complete details for a specific deal including full buyer counterparty info (KYC status, accredited investor status, last contacted date), full seller counterparty info, and all associated documents with their statuses. Use this to deeply understand a deal's current state.",
    input_schema: {
      type: "object",
      properties: {
        deal_id: { type: "integer", description: "The ID of the deal to retrieve" },
      },
      required: ["deal_id"],
    },
  },
  {
    name: "get_counterparty_info",
    description:
      "Get detailed information about a specific counterparty including their KYC status, accredited investor verification status, last contact date, average response time, and notes. Use this when you need to check a specific person's compliance status or contact history.",
    input_schema: {
      type: "object",
      properties: {
        party_id: { type: "integer", description: "The ID of the counterparty to retrieve" },
      },
      required: ["party_id"],
    },
  },
  {
    name: "get_document_status",
    description:
      "Get all documents associated with a deal and their current statuses (received, pending, missing, expired, rejected). Use this to identify missing or problematic documentation blocking deal progress.",
    input_schema: {
      type: "object",
      properties: {
        deal_id: { type: "integer", description: "The ID of the deal whose documents to retrieve" },
      },
      required: ["deal_id"],
    },
  },
  {
    name: "get_compliance_rules",
    description:
      "Get compliance rules and regulations relevant to private securities transactions. Can filter by category: kyc, accredited_investor, holding_period, communication, rofr. Use this to cite specific regulations when flagging compliance issues.",
    input_schema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "Optional category filter: kyc, accredited_investor, holding_period, communication, rofr",
        },
      },
      required: [],
    },
  },
  {
    name: "create_action",
    description:
      "Record a recommended action for a deal. Actions are reviewed by humans before execution. Action types: follow_up (draft outreach email), compliance_flag (flag regulatory issue), escalation (urgent human attention needed), info_request (request specific missing info), status_update (advance deal stage). Every action requires reasoning explaining why it's needed.",
    input_schema: {
      type: "object",
      properties: {
        run_id: { type: "integer", description: "The current agent run ID" },
        deal_id: { type: "integer", description: "The deal this action is for" },
        action_type: {
          type: "string",
          description: "One of: follow_up, compliance_flag, escalation, info_request, status_update",
        },
        priority: { type: "string", description: "One of: low, medium, high, critical" },
        reasoning: { type: "string", description: "Explanation of why this action is needed" },
        content: { type: "string", description: "The action content, e.g. a drafted email or specific instruction" },
        target_recipient: { type: "string", description: "Who the action is directed at, e.g. buyer name or rep name" },
      },
      required: ["run_id", "deal_id", "action_type", "priority", "reasoning"],
    },
  },
  {
    name: "update_deal_status",
    description:
      "Update a deal's pipeline stage and/or risk level assessment. Use for status_update actions (advancing the deal stage) and for recording your risk assessment after analyzing a deal. Risk levels: low, medium, high, critical.",
    input_schema: {
      type: "object",
      properties: {
        deal_id: { type: "integer", description: "The deal to update" },
        new_status: { type: "string", description: "New pipeline stage value" },
        risk_level: { type: "string", description: "Optional risk assessment: low, medium, high, critical" },
      },
      required: ["deal_id", "new_status"],
    },
  },
  {
    name: "create_run",
    description:
      "Create a new agent sweep run record. Call this once at the start of a pipeline sweep before analyzing any deals. Returns the run_id to use when creating actions.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "complete_run",
    description:
      "Mark an agent sweep run as completed with summary statistics. Call this once after all deals have been analyzed.",
    input_schema: {
      type: "object",
      properties: {
        run_id: { type: "integer", description: "The run ID to complete" },
        deals_analyzed: { type: "integer", description: "Total number of deals analyzed" },
        actions_created: { type: "integer", description: "Total number of actions created" },
      },
      required: ["run_id", "deals_analyzed", "actions_created"],
    },
  },
];

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

async function create_run(env, _args) {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const { rows } = await pool.query(
    "INSERT INTO agent_runs (started_at, status) VALUES (NOW(), 'running') RETURNING *"
  );
  return { run: rows[0] };
}

async function complete_run(env, args) {
  const { run_id, deals_analyzed, actions_created } = args;

  if (!run_id) throw { status: 400, error: "Missing required argument: run_id" };
  if (deals_analyzed == null) throw { status: 400, error: "Missing required argument: deals_analyzed" };
  if (actions_created == null) throw { status: 400, error: "Missing required argument: actions_created" };

  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const { rows } = await pool.query(
    `UPDATE agent_runs
     SET completed_at = NOW(), deals_analyzed = $1, actions_created = $2, status = 'completed'
     WHERE id = $3
     RETURNING *`,
    [deals_analyzed, actions_created, run_id]
  );
  return { run: rows[0] ?? null };
}

// --- Router ---

const HANDLERS = {
  get_deals,
  get_deal_details,
  get_counterparty_info,
  get_document_status,
  get_compliance_rules,
  create_action,
  update_deal_status,
  create_run,
  complete_run,
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

    if (tool === "list_tools") {
      return json({ tools: TOOL_REGISTRY });
    }

    const handler = HANDLERS[tool];
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
