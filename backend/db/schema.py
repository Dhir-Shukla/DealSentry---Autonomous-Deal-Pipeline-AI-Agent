from db.connection import get_connection


def create_tables():
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS counterparties (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            email TEXT,
            company TEXT,
            accredited_investor_status TEXT,
            kyc_status TEXT,
            last_contacted_at TIMESTAMP,
            response_time_avg_days INTEGER,
            notes TEXT
        );

        CREATE TABLE IF NOT EXISTS deals (
            id SERIAL PRIMARY KEY,
            company_name TEXT NOT NULL,
            deal_type TEXT NOT NULL,
            stage TEXT NOT NULL,
            share_quantity INTEGER,
            price_per_share DECIMAL(12,2),
            total_value DECIMAL(14,2),
            buyer_id INTEGER REFERENCES counterparties(id),
            seller_id INTEGER REFERENCES counterparties(id),
            assigned_rep TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            last_activity_at TIMESTAMP,
            rofr_deadline DATE,
            notes TEXT,
            risk_level TEXT DEFAULT 'unknown'
        );

        CREATE TABLE IF NOT EXISTS deal_documents (
            id SERIAL PRIMARY KEY,
            deal_id INTEGER REFERENCES deals(id),
            doc_type TEXT NOT NULL,
            status TEXT NOT NULL,
            requested_at TIMESTAMP,
            received_at TIMESTAMP,
            notes TEXT
        );

        CREATE TABLE IF NOT EXISTS agent_runs (
            id SERIAL PRIMARY KEY,
            started_at TIMESTAMP DEFAULT NOW(),
            completed_at TIMESTAMP,
            deals_analyzed INTEGER,
            actions_created INTEGER,
            status TEXT DEFAULT 'running'
        );

        CREATE TABLE IF NOT EXISTS agent_actions (
            id SERIAL PRIMARY KEY,
            run_id INTEGER REFERENCES agent_runs(id),
            deal_id INTEGER REFERENCES deals(id),
            action_type TEXT NOT NULL,
            priority TEXT NOT NULL,
            reasoning TEXT NOT NULL,
            content TEXT,
            target_recipient TEXT,
            human_decision TEXT DEFAULT 'pending',
            human_notes TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS compliance_rules (
            id SERIAL PRIMARY KEY,
            rule_code TEXT NOT NULL,
            category TEXT NOT NULL,
            description TEXT NOT NULL,
            risk_if_violated TEXT
        );
    """)

    conn.commit()
    cur.close()
    conn.close()
    print("Tables created successfully")


if __name__ == "__main__":
    create_tables()
