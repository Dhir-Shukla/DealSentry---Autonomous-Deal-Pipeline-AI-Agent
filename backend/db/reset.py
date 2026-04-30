from db.connection import get_connection
from db.seed import seed_database


def reset_database():
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("TRUNCATE TABLE agent_actions, agent_runs CASCADE")
    cur.execute("TRUNCATE TABLE deal_documents, deals, counterparties, compliance_rules CASCADE")

    conn.commit()
    cur.close()
    conn.close()

    seed_database()
    print("Database reset to demo state")


if __name__ == "__main__":
    reset_database()
