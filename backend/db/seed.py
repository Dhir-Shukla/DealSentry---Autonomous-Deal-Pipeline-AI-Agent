from datetime import datetime, timedelta
from db.connection import get_connection


def seed_database():
    conn = get_connection()
    cur = conn.cursor()

    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

    # --- Counterparties ---
    counterparties = [
        # Buyers
        (
            "Michael Chen", "buyer", "mchen@horizoncapital.com", "Horizon Capital",
            "verified", "complete",
            today - timedelta(days=2), 3, "Reliable buyer, quick to sign"
        ),
        (
            "Sarah Williams", "buyer", "swilliams@privatefunds.com", "Private Funds LLC",
            "pending", "incomplete",
            today - timedelta(days=14), 7, "Accredited status still in review"
        ),
        (
            "James Morrison", "buyer", "jmorrison@mfamily.com", "Morrison Family Office",
            "verified", "expired",
            today - timedelta(days=390), 4, "KYC expired — verified 13 months ago"
        ),
        (
            "Elena Vasquez", "buyer", "evasquez@ev-invest.com", "EV Investments",
            "not_submitted", "pending",
            today - timedelta(days=5), 6, "New buyer, no docs submitted yet"
        ),
        (
            "Kevin Okafor", "buyer", "kokafor@bluecrest.io", "BlueCrest Partners",
            "verified", "complete",
            today - timedelta(days=1), 2, "Fast mover, prefers wire payments"
        ),
        (
            "Linda Huang", "buyer", "lhuang@sequencecap.com", "Sequence Capital",
            "verified", "complete",
            today - timedelta(days=8), 3, "Interested in tech secondary deals"
        ),
        (
            "Marcus Bell", "buyer", "mbell@bellinvest.com", "Bell Investments",
            "verified", "complete",
            today - timedelta(days=21), 5, "Has gone cold — last contacted 21 days ago"
        ),
        (
            "Priya Mehta", "buyer", "pmehta@indocap.com", "IndoCap Growth",
            "verified", "complete",
            today - timedelta(days=3), 4, "High-volume buyer in fintech space"
        ),
        # Sellers
        (
            "David Park", "seller", "dpark@foundershold.com", "Founders Hold",
            "verified", "complete",
            today - timedelta(days=4), 3, "Early employee, selling vested RSUs"
        ),
        (
            "Rachel Foster", "seller", "rfoster@rsfamily.com", "RS Family Trust",
            "expired", "complete",
            today - timedelta(days=45), 6, "Accredited status expired — needs renewal"
        ),
        (
            "Tom Bradley", "seller", "tbradley@bradleyvc.com", "Bradley Ventures",
            "verified", "complete",
            today - timedelta(days=3), 2, "Series A investor, motivated seller"
        ),
        (
            "Nina Patel", "seller", "npatel@global-sec.co.uk", "Global Securities Ltd",
            "verified", "complete",
            today - timedelta(days=7), 5, "International seller, UK-based, W-8BEN required"
        ),
        (
            "Carlos Rivera", "seller", "crivera@svangel.com", "SV Angel",
            "not_submitted", "pending",
            today - timedelta(days=4), 8, "Accredited status not submitted, KYC pending"
        ),
        (
            "Aisha Johnson", "seller", "ajohnson@foundershare.io", "FounderShare",
            "verified", "complete",
            today - timedelta(days=1), 3, "Ex-employee, selling post-lockup shares"
        ),
        # Brokers
        (
            "Alex Thompson", "broker", "athompson@crossroads-sec.com", "Crossroads Securities",
            None, None,
            today - timedelta(days=1), 2, "Top performer, fast responder"
        ),
        (
            "Maria Santos", "broker", "msantos@crossroads-sec.com", "Crossroads Securities",
            None, None,
            today - timedelta(days=2), 5, "Handles mid-market deals"
        ),
        # Counsel
        (
            "Jennifer Walsh", "counsel", "jwalsh@walshlaw.com", "Walsh & Associates",
            None, None,
            today - timedelta(days=2), 3, "Responsive, specializes in secondary transactions"
        ),
        (
            "Robert Kim", "counsel", "rkim@kimpartners.com", "Kim Partners LLP",
            None, None,
            today - timedelta(days=8), 8, "Slow responder — typically 8+ days"
        ),
        # Additional
        (
            "Fatima Al-Hassan", "buyer", "falhassan@gulfinvest.ae", "Gulf Invest MENA",
            "verified", "complete",
            today - timedelta(days=2), 3, "MENA-based institutional buyer"
        ),
        (
            "Owen Fitzgerald", "seller", "ofitz@fitzenterprise.com", "Fitz Enterprises",
            "verified", "complete",
            today - timedelta(days=3), 4, "Seed-stage seller, motivated to close"
        ),
    ]

    cur.executemany("""
        INSERT INTO counterparties
            (name, type, email, company, accredited_investor_status, kyc_status,
             last_contacted_at, response_time_avg_days, notes)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, counterparties)

    # Map names to IDs
    cur.execute("SELECT id, name FROM counterparties ORDER BY id")
    rows = cur.fetchall()
    cp = {name: id_ for id_, name in rows}

    # --- Deals ---
    # (company_name, deal_type, stage, share_qty, price_per_share, total_value,
    #  buyer_id, seller_id, assigned_rep, last_activity_at, rofr_deadline, notes, risk_level)
    
    deals = [
        # Deal 1: SpaceX — ROFR deadline in 2 days (ESCALATION)
        (
            "SpaceX", "sell", "rofr", 5000, 185.00, 925000.00,
            cp["Kevin Okafor"], cp["Tom Bradley"], "Alex Thompson",
            today - timedelta(days=6), (today + timedelta(days=2)).date(),
            "ROFR submitted to SpaceX",
            "unknown"
        ),
        # Deal 2: Stripe — buyer gone quiet (FOLLOW_UP)
        (
            "Stripe", "buy", "documentation", 3000, 28.00, 84000.00,
            cp["Sarah Williams"], cp["David Park"], "Maria Santos",
            today - timedelta(days=14), None,
            "Buyer sent PA last week, no word back",
            "unknown"
        ),
        # Deal 3: Databricks — missing accredited verification (COMPLIANCE_FLAG)
        (
            "Databricks", "buy", "agreement", 2000, 45.00, 90000.00,
            cp["Elena Vasquez"], cp["Owen Fitzgerald"], "Alex Thompson",
            today - timedelta(days=5), None,
            None,
            "unknown"
        ),
        # Deal 4: Canva — healthy, recently active (NO_ACTION)
        (
            "Canva", "sell", "negotiation", 1500, 32.00, 48000.00,
            cp["Linda Huang"], cp["Aisha Johnson"], "Maria Santos",
            today - timedelta(days=1), None,
            "Both sides seem engaged, good energy on the call",
            "unknown"
        ),
        # Deal 5: Anduril — transfer form stuck (INFO_REQUEST)
        (
            "Anduril", "buy", "documentation", 4000, 52.00, 208000.00,
            cp["Michael Chen"], cp["David Park"], "Alex Thompson",
            today - timedelta(days=10), None,
            "Waiting on seller for transfer form",
            "unknown"
        ),
        # Deal 6: Plaid — expired KYC in settlement (COMPLIANCE_FLAG)
        (
            "Plaid", "sell", "settlement", 2500, 15.00, 37500.00,
            cp["Priya Mehta"], cp["James Morrison"], "Maria Santos",
            today - timedelta(days=3), None,
            None,
            "unknown"
        ),
        # Deal 7: Discord — ROFR waiver received (STATUS_UPDATE)
        (
            "Discord", "sell", "rofr", 6000, 30.00, 180000.00,
            cp["Fatima Al-Hassan"], cp["Tom Bradley"], "Alex Thompson",
            today - timedelta(days=1), (today + timedelta(days=20)).date(),
            "Got the waiver back from issuer",
            "unknown"
        ),
        # Deal 8: Klarna — high value, counsel unresponsive (ESCALATION)
        (
            "Klarna", "buy", "agreement", 8000, 265.00, 2120000.00,
            cp["Michael Chen"], cp["Rachel Foster"], "Maria Santos",
            today - timedelta(days=8), None,
            "Counsel has been slow on this one",
            "unknown"
        ),
        # Deal 9: Cerebras — new inquiry, needs outreach (FOLLOW_UP)
        (
            "Cerebras", "sell", "inquiry", 1000, 18.00, 18000.00,
            None, cp["Aisha Johnson"], "Alex Thompson",
            today, None,
            "New inbound, seller seems motivated",
            "unknown"
        ),
        # Deal 10: Figma — international seller, missing W-8BEN (INFO_REQUEST)
        (
            "Figma", "buy", "documentation", 3500, 42.00, 147000.00,
            cp["Linda Huang"], cp["Nina Patel"], "Maria Santos",
            today - timedelta(days=7), None,
            "Still waiting on tax docs from seller",
            "unknown"
        ),
        # Deal 11: Rippling — accredited not submitted (COMPLIANCE_FLAG)
        (
            "Rippling", "sell", "negotiation", 2000, 14.00, 28000.00,
            cp["Kevin Okafor"], cp["Carlos Rivera"], "Alex Thompson",
            today - timedelta(days=4), None,
            None,
            "unknown"
        ),
        # Deal 12: Scale AI — everything on track (NO_ACTION)
        (
            "Scale AI", "buy", "settlement", 5000, 72.00, 360000.00,
            cp["Priya Mehta"], cp["David Park"], "Maria Santos",
            today - timedelta(days=2), None,
            "Pretty much all buttoned up, just waiting on TA",
            "unknown"
        ),
        # Deal 13: Impossible Foods — re-engagement needed (FOLLOW_UP)
        (
            "Impossible Foods", "buy", "agreement", 1500, 8.00, 12000.00,
            cp["Marcus Bell"], cp["Rachel Foster"], "Alex Thompson",
            today - timedelta(days=21), None,
            None,
            "unknown"
        ),
        # Deal 14: Reddit — healthy ROFR in progress (NO_ACTION)
        (
            "Reddit", "sell", "rofr", 3000, 55.00, 165000.00,
            cp["Fatima Al-Hassan"], cp["Owen Fitzgerald"], "Maria Santos",
            today - timedelta(days=3), (today + timedelta(days=15)).date(),
            "ROFR submitted, all good so far",
            "unknown"
        ),
        # Deal 15: Flexport — rejected purchase agreement (ESCALATION + COMPLIANCE_FLAG)
        (
            "Flexport", "buy", "documentation", 2500, 19.00, 47500.00,
            cp["Priya Mehta"], cp["Tom Bradley"], "Alex Thompson",
            today - timedelta(days=1), None,
            "PA came back rejected, needs revision",
            "unknown"
        ),
    ]

    cur.executemany("""
        INSERT INTO deals
            (company_name, deal_type, stage, share_quantity, price_per_share, total_value,
             buyer_id, seller_id, assigned_rep, last_activity_at, rofr_deadline, notes, risk_level)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, deals)

    cur.execute("SELECT id, company_name FROM deals ORDER BY id")
    deal_rows = cur.fetchall()
    d = {name: id_ for id_, name in deal_rows}

    # --- Deal Documents ---
    docs = [
        # Deal 1: SpaceX — ROFR in progress
        (d["SpaceX"], "purchase_agreement", "received", today - timedelta(days=20), today - timedelta(days=18), None),
        (d["SpaceX"], "kyc_id", "received", today - timedelta(days=20), today - timedelta(days=19), None),
        (d["SpaceX"], "accredited_proof", "received", today - timedelta(days=20), today - timedelta(days=17), None),
        (d["SpaceX"], "rofr_waiver", "pending", today - timedelta(days=6), None, "Submitted to SpaceX, no response yet"),

        # Deal 2: Stripe — buyer unresponsive
        (d["Stripe"], "purchase_agreement", "sent", today - timedelta(days=14), None, "Sent to buyer, no response"),
        (d["Stripe"], "kyc_id", "received", today - timedelta(days=20), today - timedelta(days=19), None),
        (d["Stripe"], "accredited_proof", "pending", today - timedelta(days=14), None, None),

        # Deal 3: Databricks — missing accredited
        (d["Databricks"], "purchase_agreement", "draft", today - timedelta(days=5), None, None),
        (d["Databricks"], "kyc_id", "pending", today - timedelta(days=5), None, None),
        (d["Databricks"], "accredited_proof", "missing", today - timedelta(days=5), None, "Buyer has not submitted any accredited investor documentation"),

        # Deal 4: Canva — healthy
        (d["Canva"], "purchase_agreement", "received", today - timedelta(days=10), today - timedelta(days=8), None),
        (d["Canva"], "kyc_id", "received", today - timedelta(days=10), today - timedelta(days=9), None),
        (d["Canva"], "accredited_proof", "received", today - timedelta(days=10), today - timedelta(days=7), None),
        (d["Canva"], "transfer_form", "received", today - timedelta(days=5), today - timedelta(days=3), None),

        # Deal 5: Anduril — transfer form pending
        (d["Anduril"], "purchase_agreement", "received", today - timedelta(days=20), today - timedelta(days=18), None),
        (d["Anduril"], "kyc_id", "received", today - timedelta(days=20), today - timedelta(days=19), None),
        (d["Anduril"], "accredited_proof", "received", today - timedelta(days=20), today - timedelta(days=17), None),
        (d["Anduril"], "transfer_form", "pending", today - timedelta(days=10), None, "Requested from seller 10 days ago, still outstanding"),

        # Deal 6: Plaid — expired KYC
        (d["Plaid"], "purchase_agreement", "received", today - timedelta(days=30), today - timedelta(days=28), None),
        (d["Plaid"], "kyc_id", "expired", today - timedelta(days=400), today - timedelta(days=395), "KYC documents expired — over 12 months old"),
        (d["Plaid"], "accredited_proof", "received", today - timedelta(days=30), today - timedelta(days=27), None),
        (d["Plaid"], "transfer_form", "received", today - timedelta(days=10), today - timedelta(days=8), None),

        # Deal 7: Discord — ROFR waiver received
        (d["Discord"], "purchase_agreement", "received", today - timedelta(days=30), today - timedelta(days=28), None),
        (d["Discord"], "kyc_id", "received", today - timedelta(days=30), today - timedelta(days=29), None),
        (d["Discord"], "accredited_proof", "received", today - timedelta(days=30), today - timedelta(days=27), None),
        (d["Discord"], "rofr_waiver", "received", today - timedelta(days=5), today - timedelta(days=1), "Written waiver received from issuer"),

        # Deal 8: Klarna — high value, counsel blocking
        (d["Klarna"], "purchase_agreement", "pending", today - timedelta(days=15), None, "Awaiting review from buyer counsel Robert Kim"),
        (d["Klarna"], "kyc_id", "received", today - timedelta(days=30), today - timedelta(days=28), None),
        (d["Klarna"], "accredited_proof", "received", today - timedelta(days=30), today - timedelta(days=25), None),
        (d["Klarna"], "transfer_form", "pending", today - timedelta(days=8), None, None),

        # Deal 9: Cerebras — new inquiry, minimal docs
        (d["Cerebras"], "kyc_id", "pending", today, None, "Initial request sent today"),
        (d["Cerebras"], "accredited_proof", "pending", today, None, None),

        # Deal 10: Figma — missing W-8BEN
        (d["Figma"], "purchase_agreement", "received", today - timedelta(days=15), today - timedelta(days=13), None),
        (d["Figma"], "kyc_id", "received", today - timedelta(days=15), today - timedelta(days=14), None),
        (d["Figma"], "accredited_proof", "received", today - timedelta(days=15), today - timedelta(days=12), None),
        (d["Figma"], "tax_form", "missing", today - timedelta(days=7), None, "W-8BEN required for international seller, not yet submitted"),

        # Deal 11: Rippling — compliance issues
        (d["Rippling"], "purchase_agreement", "draft", today - timedelta(days=4), None, None),
        (d["Rippling"], "kyc_id", "pending", today - timedelta(days=4), None, "KYC not yet submitted"),
        (d["Rippling"], "accredited_proof", "missing", today - timedelta(days=4), None, "Accredited investor status not submitted"),

        # Deal 12: Scale AI — everything complete
        (d["Scale AI"], "purchase_agreement", "received", today - timedelta(days=30), today - timedelta(days=28), None),
        (d["Scale AI"], "kyc_id", "received", today - timedelta(days=30), today - timedelta(days=29), None),
        (d["Scale AI"], "accredited_proof", "received", today - timedelta(days=30), today - timedelta(days=27), None),
        (d["Scale AI"], "transfer_form", "received", today - timedelta(days=10), today - timedelta(days=8), None),
        (d["Scale AI"], "rofr_waiver", "received", today - timedelta(days=20), today - timedelta(days=18), None),

        # Deal 13: Impossible Foods — cold deal
        (d["Impossible Foods"], "purchase_agreement", "sent", today - timedelta(days=21), None, "Sent 21 days ago, no response from buyer"),
        (d["Impossible Foods"], "kyc_id", "received", today - timedelta(days=30), today - timedelta(days=28), None),
        (d["Impossible Foods"], "accredited_proof", "received", today - timedelta(days=30), today - timedelta(days=25), None),

        # Deal 14: Reddit — healthy ROFR
        (d["Reddit"], "purchase_agreement", "received", today - timedelta(days=20), today - timedelta(days=18), None),
        (d["Reddit"], "kyc_id", "received", today - timedelta(days=20), today - timedelta(days=19), None),
        (d["Reddit"], "accredited_proof", "received", today - timedelta(days=20), today - timedelta(days=17), None),
        (d["Reddit"], "rofr_waiver", "pending", today - timedelta(days=3), None, "ROFR period active — 15 days remaining"),

        # Deal 15: Flexport — rejected purchase agreement
        (d["Flexport"], "purchase_agreement", "rejected", today - timedelta(days=7), None, "Rejected by compliance — missing risk disclosure addendum"),
        (d["Flexport"], "kyc_id", "received", today - timedelta(days=15), today - timedelta(days=13), None),
        (d["Flexport"], "accredited_proof", "received", today - timedelta(days=15), today - timedelta(days=12), None),
        (d["Flexport"], "transfer_form", "pending", today - timedelta(days=3), None, None),
    ]

    cur.executemany("""
        INSERT INTO deal_documents
            (deal_id, doc_type, status, requested_at, received_at, notes)
        VALUES (%s, %s, %s, %s, %s, %s)
    """, docs)

    # --- Compliance Rules ---
    rules = [
        (
            "FINRA-2111", "accredited_investor",
            "Suitability obligations require verification of accredited investor status before executing "
            "transactions in private securities. Firms must have reasonable grounds to believe the investor "
            "meets SEC accredited investor criteria.",
            "high"
        ),
        (
            "SEC-Rule-144", "holding_period",
            "Restricted securities acquired from an issuer in a non-registered transaction are subject to "
            "holding period requirements. Securities must be held for a minimum of 6 months (reporting "
            "companies) or 12 months (non-reporting companies) before resale.",
            "high"
        ),
        (
            "FINRA-3110", "communication",
            "Member firms must establish and maintain a system to supervise activities of registered "
            "representatives, including review of outgoing and incoming written communications relating "
            "to the firm's investment banking or securities business.",
            "high"
        ),
        (
            "BSA-AML-KYC", "kyc",
            "Under the Bank Secrecy Act and Anti-Money Laundering regulations, firms must implement "
            "Customer Identification Programs (CIP) and perform ongoing due diligence. KYC documentation "
            "must be current and refreshed periodically — industry standard is every 12 months.",
            "critical"
        ),
        (
            "ROFR-COMPLIANCE", "rofr",
            "Right of First Refusal provisions in company bylaws or shareholder agreements must be honored. "
            "Transactions cannot proceed until the ROFR period has expired or the issuer has provided a "
            "written waiver. Missing ROFR deadlines can void the transaction.",
            "critical"
        ),
        (
            "SEC-REG-D-506b", "accredited_investor",
            "Under Regulation D Rule 506(b), issuers may sell securities to an unlimited number of "
            "accredited investors but must verify accredited status through reasonable steps. Documentation "
            "such as tax returns, bank statements, or third-party verification letters is required.",
            "high"
        ),
    ]

    cur.executemany("""
        INSERT INTO compliance_rules (rule_code, category, description, risk_if_violated)
        VALUES (%s, %s, %s, %s)
    """, rules)

    conn.commit()
    cur.close()
    conn.close()


if __name__ == "__main__":
    seed_database()
    print("Seed complete")
