--
-- PostgreSQL database dump
--

\restrict Y2urqM3cxqkfaTwILJDg2AKCRMuDa3cIckHLF7CSQzxuMJOLiBHc4oxH8kY0YUW

-- Dumped from database version 16.13
-- Dumped by pg_dump version 16.13

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: app_set_current_firm(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_set_current_firm(firm_id text) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM set_config('app.current_firm_id', firm_id, true); -- true = local (transaction-scoped)
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


--
-- Name: alembic_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    action character varying(100) NOT NULL,
    entity_type character varying(100) NOT NULL,
    entity_id character varying(36),
    user_id character varying(36),
    details text,
    ip_address character varying(50),
    created_at timestamp without time zone DEFAULT now()
);

ALTER TABLE ONLY public.audit_logs FORCE ROW LEVEL SECURITY;


--
-- Name: breach_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.breach_reports (
    id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    breach_type character varying(100),
    severity character varying(50),
    status character varying(50),
    reported_date timestamp without time zone,
    ico_deadline timestamp without time zone,
    notification_status character varying(50),
    affected_records integer,
    root_cause text,
    resolution_date timestamp without time zone,
    remediation_plan_id character varying(36),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

ALTER TABLE ONLY public.breach_reports FORCE ROW LEVEL SECURITY;


--
-- Name: cdd_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cdd_records (
    id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    client_name character varying(255) NOT NULL,
    client_type character varying(100),
    cdd_level character varying(50),
    risk_level character varying(50),
    id_verified boolean,
    address_verified boolean,
    sof_verified boolean,
    status character varying(50),
    nationality character varying(100),
    country_of_residence character varying(100),
    company_number character varying(50),
    date_of_birth timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

ALTER TABLE ONLY public.cdd_records FORCE ROW LEVEL SECURITY;


--
-- Name: chaser_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chaser_logs (
    id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    matter_ref character varying(100),
    chaser_type character varying(100),
    recipient character varying(255),
    subject character varying(255),
    status character varying(50),
    sent_at timestamp without time zone,
    response_at timestamp without time zone,
    attempts integer,
    created_at timestamp without time zone DEFAULT now()
);

ALTER TABLE ONLY public.chaser_logs FORCE ROW LEVEL SECURITY;


--
-- Name: client_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_accounts (
    id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    account_name character varying(255) NOT NULL,
    account_type character varying(50),
    balance numeric(15,2),
    status character varying(50),
    bank_name character varying(255),
    account_number character varying(50),
    sort_code character varying(10),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

ALTER TABLE ONLY public.client_accounts FORCE ROW LEVEL SECURITY;


--
-- Name: client_intakes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_intakes (
    id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    client_name character varying(255) NOT NULL,
    client_email character varying(255),
    practice_area character varying(100),
    status character varying(50),
    conflict_check_status character varying(50),
    conflict_check_details text,
    client_care_letter_sent character varying(50),
    risk_level character varying(50),
    risk_score numeric(5,2),
    assigned_to character varying(36),
    source_of_funds character varying(100),
    pep_screening character varying(50),
    sanctions_check character varying(50),
    cdd_status character varying(50),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    external_ref character varying(100),
    source character varying(50),
    client_phone character varying(50),
    client_type character varying(50),
    company_name character varying(255)
);

ALTER TABLE ONLY public.client_intakes FORCE ROW LEVEL SECURITY;


--
-- Name: complaints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.complaints (
    id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    complainant_name character varying(255) NOT NULL,
    complainant_type character varying(100),
    category character varying(100),
    description text,
    priority character varying(50),
    status character varying(50),
    assigned_to character varying(36),
    opened_date timestamp without time zone DEFAULT now(),
    closed_date timestamp without time zone,
    resolution text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

ALTER TABLE ONLY public.complaints FORCE ROW LEVEL SECURITY;


--
-- Name: compliance_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compliance_alerts (
    id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    alert_type character varying(50),
    severity character varying(20),
    title character varying(255),
    description text,
    case_id character varying(36),
    client_id character varying(36),
    regulation_ref character varying(100),
    action_required text,
    created_at timestamp without time zone DEFAULT now(),
    acknowledged_at timestamp without time zone,
    resolved_at timestamp without time zone,
    status character varying(20),
    override_severity character varying(20),
    override_action_required text,
    override_notes text,
    overridden_by character varying(36),
    overridden_at timestamp without time zone
);

ALTER TABLE ONLY public.compliance_alerts FORCE ROW LEVEL SECURITY;


--
-- Name: compliance_checks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compliance_checks (
    id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    case_id character varying(36),
    client_id character varying(36),
    check_type character varying(50),
    check_name character varying(255),
    status character varying(20),
    severity character varying(20),
    description text,
    regulation_ref character varying(100),
    remediation text,
    checked_at timestamp without time zone,
    due_date character varying(20),
    resolved_at timestamp without time zone
);

ALTER TABLE ONLY public.compliance_checks FORCE ROW LEVEL SECURITY;


--
-- Name: compliance_scan_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compliance_scan_results (
    id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    scan_date timestamp without time zone DEFAULT now(),
    category character varying(100),
    check_name character varying(255),
    status character varying(20),
    details text,
    recommendation text,
    created_at timestamp without time zone DEFAULT now(),
    override_status character varying(20),
    override_recommendation text,
    override_notes text,
    overridden_by character varying(36),
    overridden_at timestamp without time zone
);

ALTER TABLE ONLY public.compliance_scan_results FORCE ROW LEVEL SECURITY;


--
-- Name: compliance_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compliance_tasks (
    id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    task_type character varying(50),
    title character varying(255),
    description text,
    assigned_to character varying(36),
    related_entity_type character varying(50),
    related_entity_id character varying(36),
    priority character varying(20),
    status character varying(20),
    due_date character varying(20),
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);

ALTER TABLE ONLY public.compliance_tasks FORCE ROW LEVEL SECURITY;


--
-- Name: conflict_checks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conflict_checks (
    id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    client_name character varying(255) NOT NULL,
    matter_type character varying(100),
    parties text,
    status character varying(50),
    conflict_type character varying(100),
    checked_by character varying(36),
    resolution text,
    resolved_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

ALTER TABLE ONLY public.conflict_checks FORCE ROW LEVEL SECURITY;


--
-- Name: conflict_parties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conflict_parties (
    id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    party_name character varying(255) NOT NULL,
    party_type character varying(50),
    date_added timestamp without time zone DEFAULT now(),
    created_at timestamp without time zone DEFAULT now()
);

ALTER TABLE ONLY public.conflict_parties FORCE ROW LEVEL SECURITY;


--
-- Name: deadlines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deadlines (
    id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    title character varying(255) NOT NULL,
    due_date timestamp without time zone NOT NULL,
    priority character varying(50),
    status character varying(50),
    assigned_to character varying(36),
    category character varying(100),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

ALTER TABLE ONLY public.deadlines FORCE ROW LEVEL SECURITY;


--
-- Name: email_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_queue (
    id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    template_id character varying(36),
    recipient character varying(255) NOT NULL,
    subject character varying(255) NOT NULL,
    status character varying(50),
    sent_at timestamp without time zone,
    error text,
    created_at timestamp without time zone DEFAULT now()
);

ALTER TABLE ONLY public.email_queue FORCE ROW LEVEL SECURITY;


--
-- Name: email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_templates (
    id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    name character varying(255) NOT NULL,
    subject character varying(255) NOT NULL,
    body text NOT NULL,
    category character varying(100),
    is_active boolean,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

ALTER TABLE ONLY public.email_templates FORCE ROW LEVEL SECURITY;


--
-- Name: evidence_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evidence_documents (
    id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    category character varying(100),
    file_path character varying(500),
    file_size integer,
    uploaded_by character varying(36),
    status character varying(50),
    review_date timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

ALTER TABLE ONLY public.evidence_documents FORCE ROW LEVEL SECURITY;


--
-- Name: firms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.firms (
    id character varying(36) NOT NULL,
    name character varying(255) NOT NULL,
    sra_number character varying(20) NOT NULL,
    email character varying(255),
    phone character varying(50),
    address text,
    postcode character varying(10),
    website character varying(255),
    subscription_tier character varying(20),
    subscription_plan character varying(20),
    subscription_status character varying(20),
    billing_email character varying(255),
    next_billing_date character varying(30),
    annual_cost integer,
    stripe_customer_id character varying(100),
    stripe_subscription_id character varying(100),
    trial_ends_at timestamp without time zone,
    practice_areas text,
    firm_size integer,
    colp_name character varying(255),
    cofa_name character varying(255),
    mlro_name character varying(255),
    notification_preferences text,
    firm_preferences text,
    sra_return_edits text,
    onboarding_status character varying(20),
    onboarding_completed_at timestamp without time zone,
    is_active boolean,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: import_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_history (
    id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    import_type character varying(100) NOT NULL,
    filename character varying(255),
    status character varying(50),
    records_processed integer,
    records_failed integer,
    imported_by character varying(36),
    created_at timestamp without time zone DEFAULT now()
);

ALTER TABLE ONLY public.import_history FORCE ROW LEVEL SECURITY;


--
-- Name: integration_sync_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_sync_logs (
    id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    integration_id character varying(36) NOT NULL,
    sync_type character varying(50) NOT NULL,
    status character varying(20),
    direction character varying(10),
    records_synced integer,
    records_created integer,
    records_updated integer,
    records_skipped integer,
    records_errored integer,
    started_at timestamp without time zone DEFAULT now(),
    completed_at timestamp without time zone,
    duration_seconds integer,
    error_message text,
    error_details text,
    created_at timestamp without time zone DEFAULT now()
);

ALTER TABLE ONLY public.integration_sync_logs FORCE ROW LEVEL SECURITY;


--
-- Name: integrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integrations (
    id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    name character varying(255) NOT NULL,
    type character varying(100) NOT NULL,
    status character varying(50),
    config text,
    last_sync timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    provider character varying(50),
    access_token text,
    refresh_token text,
    token_expires_at timestamp without time zone,
    token_scope character varying(500),
    provider_firm_name character varying(255),
    provider_user_name character varying(255),
    provider_user_id character varying(100),
    provider_account_id character varying(100),
    connected_at timestamp without time zone,
    disconnected_at timestamp without time zone,
    last_error text
);

ALTER TABLE ONLY public.integrations FORCE ROW LEVEL SECURITY;


--
-- Name: key_dates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.key_dates (
    id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    title character varying(255) NOT NULL,
    date timestamp without time zone NOT NULL,
    category character varying(100),
    status character varying(50),
    assigned_to character varying(36),
    created_at timestamp without time zone DEFAULT now()
);

ALTER TABLE ONLY public.key_dates FORCE ROW LEVEL SECURITY;


--
-- Name: matter_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.matter_items (
    id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    matter_id character varying(36) NOT NULL,
    title character varying(255) NOT NULL,
    description character varying(500),
    is_complete boolean,
    "order" numeric(5,2),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: matters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.matters (
    id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    client_name character varying(255) NOT NULL,
    matter_type character varying(100) NOT NULL,
    reference character varying(50),
    status character varying(50),
    assigned_to character varying(36),
    risk_level character varying(50),
    fee_estimate numeric(15,2),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    external_ref character varying(100),
    source character varying(50),
    title character varying(255),
    description text,
    practice_area character varying(100),
    client_id character varying(36),
    open_date character varying(20),
    close_date character varying(20)
);

ALTER TABLE ONLY public.matters FORCE ROW LEVEL SECURITY;


--
-- Name: policy_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.policy_documents (
    id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    title character varying(255) NOT NULL,
    category character varying(100),
    status character varying(50),
    version character varying(20),
    content text,
    last_reviewed timestamp without time zone,
    next_review timestamp without time zone,
    owner character varying(36),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

ALTER TABLE ONLY public.policy_documents FORCE ROW LEVEL SECURITY;


--
-- Name: reconciliations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reconciliations (
    id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    period character varying(50),
    status character varying(50),
    reconciled_by character varying(36),
    discrepancies text,
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);

ALTER TABLE ONLY public.reconciliations FORCE ROW LEVEL SECURITY;


--
-- Name: regulatory_interpretations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.regulatory_interpretations (
    id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    update_id character varying(36) NOT NULL,
    summary text NOT NULL,
    applicability character varying(10) NOT NULL,
    applicability_reasoning text,
    action_items text,
    source_citation text,
    confidence_score double precision,
    confidence_label character varying(20),
    model_used character varying(50),
    prompt_tokens integer,
    completion_tokens integer,
    processing_time_ms integer,
    status character varying(20),
    error_message text,
    override_applicability character varying(10),
    override_notes text,
    override_action_items text,
    overridden_by character varying(36),
    overridden_at timestamp without time zone,
    delivered_at timestamp without time zone,
    acknowledged_at timestamp without time zone,
    acknowledged_by character varying(36),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

ALTER TABLE ONLY public.regulatory_interpretations FORCE ROW LEVEL SECURITY;


--
-- Name: regulatory_updates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.regulatory_updates (
    id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    title character varying(255) NOT NULL,
    source character varying(100),
    impact_level character varying(50),
    published_date timestamp without time zone,
    description text,
    regulatory_body character varying(100),
    status character varying(50),
    created_at timestamp without time zone DEFAULT now(),
    body text,
    category character varying(100),
    content_hash character varying(64),
    effective_date character varying(20),
    scraped_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    source_url character varying(500),
    summary text,
    tags text
);


--
-- Name: remediation_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.remediation_plans (
    id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    title character varying(255) NOT NULL,
    source character varying(100),
    priority character varying(50),
    status character varying(50),
    assigned_to character varying(36),
    due_date timestamp without time zone,
    steps text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

ALTER TABLE ONLY public.remediation_plans FORCE ROW LEVEL SECURITY;


--
-- Name: risk_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.risk_scores (
    id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    entity_type character varying(50),
    entity_id character varying(36),
    overall_score integer,
    sra_score integer,
    aml_score integer,
    cpr_score integer,
    gdpr_score integer,
    limitation_score integer,
    calculated_at timestamp without time zone DEFAULT now(),
    override_overall_score integer,
    override_notes text,
    overridden_by character varying(36),
    overridden_at timestamp without time zone
);

ALTER TABLE ONLY public.risk_scores FORCE ROW LEVEL SECURITY;


--
-- Name: sar_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sar_records (
    id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    client_name character varying(255) NOT NULL,
    matter_ref character varying(100),
    suspicion_type character varying(100),
    amount numeric(15,2),
    report_date timestamp without time zone,
    mlro_decision character varying(100),
    nca_filed boolean,
    status character varying(50),
    grounds_for_suspicion text,
    transaction_details text,
    created_at timestamp without time zone DEFAULT now()
);

ALTER TABLE ONLY public.sar_records FORCE ROW LEVEL SECURITY;


--
-- Name: sra_audit_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sra_audit_items (
    id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    category character varying(100),
    item_name character varying(255),
    description text,
    status character varying(20),
    evidence_ref character varying(36),
    last_reviewed character varying(30),
    next_review_due character varying(20),
    notes text
);

ALTER TABLE ONLY public.sra_audit_items FORCE ROW LEVEL SECURITY;


--
-- Name: sra_feed_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sra_feed_log (
    id character varying(36) NOT NULL,
    feed_source character varying(100),
    last_checked timestamp without time zone,
    items_found integer,
    new_items integer,
    status character varying(20),
    error_message text
);


--
-- Name: staff_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_members (
    id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255),
    role character varying(100),
    department character varying(100),
    status character varying(50),
    pqe character varying(50),
    sra_id character varying(50),
    start_date timestamp without time zone,
    last_training timestamp without time zone,
    phone character varying(50),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    external_ref character varying(100),
    source character varying(50)
);

ALTER TABLE ONLY public.staff_members FORCE ROW LEVEL SECURITY;


--
-- Name: staff_training; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_training (
    id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    staff_id character varying(36) NOT NULL,
    staff_name character varying(255),
    title character varying(255),
    training_type character varying(100),
    status character varying(50),
    due_date timestamp without time zone,
    completed_at timestamp without time zone,
    cpd_hours integer,
    created_at timestamp without time zone DEFAULT now(),
    course_name character varying(255),
    provider character varying(255),
    completed_date character varying(20),
    certificate_ref character varying(100)
);

ALTER TABLE ONLY public.staff_training FORCE ROW LEVEL SECURITY;


--
-- Name: supervision_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supervision_records (
    id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    staff_id character varying(36) NOT NULL,
    staff_name character varying(255),
    supervisor character varying(255),
    frequency character varying(50),
    last_session timestamp without time zone,
    next_due timestamp without time zone,
    status character varying(50),
    notes_count integer,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

ALTER TABLE ONLY public.supervision_records FORCE ROW LEVEL SECURITY;


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    account_id character varying(36) NOT NULL,
    date timestamp without time zone NOT NULL,
    description character varying(255),
    amount numeric(15,2) NOT NULL,
    type character varying(50),
    matter_ref character varying(100),
    created_at timestamp without time zone DEFAULT now()
);

ALTER TABLE ONLY public.transactions FORCE ROW LEVEL SECURITY;


--
-- Name: undertakings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.undertakings (
    id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    description text NOT NULL,
    matter_ref character varying(100),
    given_to character varying(255),
    given_by character varying(255),
    given_date timestamp without time zone,
    due_date timestamp without time zone,
    status character varying(50),
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

ALTER TABLE ONLY public.undertakings FORCE ROW LEVEL SECURITY;


--
-- Name: user_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_accounts (
    id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(50) NOT NULL,
    staff_id character varying(36),
    is_active boolean,
    last_login timestamp without time zone,
    failed_login_attempts integer,
    locked_until timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

ALTER TABLE ONLY public.user_accounts FORCE ROW LEVEL SECURITY;


--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_sessions (
    id character varying(36) NOT NULL,
    user_id character varying(36) NOT NULL,
    firm_id character varying(36) NOT NULL,
    token character varying(500) NOT NULL,
    refresh_token character varying(500),
    ip_address character varying(50),
    user_agent character varying(500),
    expires_at timestamp without time zone NOT NULL,
    is_active boolean,
    created_at timestamp without time zone DEFAULT now()
);

ALTER TABLE ONLY public.user_sessions FORCE ROW LEVEL SECURITY;


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
327b48af-28a2-4cd0-ab19-2c72f48d83c2	56d2fc3e4a7a14d14f0f7fad2da8840a0f2e4e8fcc6668acdc0028cae606744b	2026-05-09 22:17:25.501455+00	20260509211707_enable_rls		\N	2026-05-09 22:17:25.501455+00	0
\.


--
-- Data for Name: alembic_version; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.alembic_version (version_num) FROM stdin;
merge_heads_2026_05
add_override_columns
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audit_logs (id, firm_id, action, entity_type, entity_id, user_id, details, ip_address, created_at) FROM stdin;
43abe2f9-7d31-4ece-8264-6605c1d44052	6b9a595d-2759-4158-89b2-ac8e54aa81bc	login	user	fb062dd8-73ac-4239-91d1-81d3c62a2896	fb062dd8-73ac-4239-91d1-81d3c62a2896	User logged in	192.168.65.1	2026-05-02 16:18:16.651725
91a061fb-2b43-42c8-b061-dddc022b9cc4	6b9a595d-2759-4158-89b2-ac8e54aa81bc	login	user	fb062dd8-73ac-4239-91d1-81d3c62a2896	fb062dd8-73ac-4239-91d1-81d3c62a2896	User logged in	192.168.65.1	2026-05-02 16:18:45.971174
f72a4db1-27d4-4f2c-8550-302dd2f9e207	6b9a595d-2759-4158-89b2-ac8e54aa81bc	login	user	fb062dd8-73ac-4239-91d1-81d3c62a2896	fb062dd8-73ac-4239-91d1-81d3c62a2896	User logged in	192.168.65.1	2026-05-02 16:20:42.497082
0e10388c-63ee-445f-8719-6dec6cdff3d0	6b9a595d-2759-4158-89b2-ac8e54aa81bc	login	user	fb062dd8-73ac-4239-91d1-81d3c62a2896	fb062dd8-73ac-4239-91d1-81d3c62a2896	User logged in	142.250.117.95	2026-05-02 16:37:35.163989
f96ee2d5-d138-4dc7-9a08-a7dec65924b3	3c041e01-9d26-429e-b22c-fcb4e852500d	onboarding_completed	firm	3c041e01-9d26-429e-b22c-fcb4e852500d	8d519c5a-5663-4a0d-9025-615e99d28e14	\N	\N	2026-05-10 17:29:10.249
7e41e3d4-dfe9-48fb-a4ec-f880494e58bc	3c041e01-9d26-429e-b22c-fcb4e852500d	onboarding_completed	firm	3c041e01-9d26-429e-b22c-fcb4e852500d	8d519c5a-5663-4a0d-9025-615e99d28e14	\N	\N	2026-05-10 17:46:29.208
7b50f176-ee14-4871-b663-e00262c73b92	3c041e01-9d26-429e-b22c-fcb4e852500d	onboarding_completed	firm	3c041e01-9d26-429e-b22c-fcb4e852500d	8d519c5a-5663-4a0d-9025-615e99d28e14	\N	\N	2026-05-10 17:59:34.871
df9e8733-71d4-46ef-9a6a-bc148e579d28	3c041e01-9d26-429e-b22c-fcb4e852500d	onboarding_completed	firm	3c041e01-9d26-429e-b22c-fcb4e852500d	8d519c5a-5663-4a0d-9025-615e99d28e14	\N	\N	2026-05-10 19:09:44.4
\.


--
-- Data for Name: breach_reports; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.breach_reports (id, firm_id, title, description, breach_type, severity, status, reported_date, ico_deadline, notification_status, affected_records, root_cause, resolution_date, remediation_plan_id, created_at, updated_at) FROM stdin;
55555555-aaaa-bbbb-cccc-500000000001	3c041e01-9d26-429e-b22c-fcb4e852500d	Misdirected client email — 11 May 2026	Email containing a draft witness statement sent to wrong recipient (similar surname).	data	medium	open	2026-05-11 10:24:00	2026-05-14 10:24:00	pending	1	Outlook autocomplete; sender did not verify recipient before sending.	\N	\N	2026-05-10 17:34:15.401368	2026-05-10 17:34:15.401368
\.


--
-- Data for Name: cdd_records; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cdd_records (id, firm_id, client_name, client_type, cdd_level, risk_level, id_verified, address_verified, sof_verified, status, nationality, country_of_residence, company_number, date_of_birth, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: chaser_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.chaser_logs (id, firm_id, matter_ref, chaser_type, recipient, subject, status, sent_at, response_at, attempts, created_at) FROM stdin;
\.


--
-- Data for Name: client_accounts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.client_accounts (id, firm_id, account_name, account_type, balance, status, bank_name, account_number, sort_code, created_at, updated_at) FROM stdin;
dddddddd-aaaa-bbbb-cccc-d00000000001	3c041e01-9d26-429e-b22c-fcb4e852500d	Smoke Test Firm — Client Account	client	245678.50	active	Lloyds	12345678	20-00-01	2026-05-10 17:41:33.747856	2026-05-10 17:41:33.747856
dddddddd-aaaa-bbbb-cccc-d00000000002	3c041e01-9d26-429e-b22c-fcb4e852500d	Smoke Test Firm — Office Account	office	18432.10	active	Lloyds	12345679	20-00-01	2026-05-10 17:41:33.747856	2026-05-10 17:41:33.747856
\.


--
-- Data for Name: client_intakes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.client_intakes (id, firm_id, client_name, client_email, practice_area, status, conflict_check_status, conflict_check_details, client_care_letter_sent, risk_level, risk_score, assigned_to, source_of_funds, pep_screening, sanctions_check, cdd_status, created_at, updated_at, external_ref, source, client_phone, client_type, company_name) FROM stdin;
22222222-aaaa-bbbb-cccc-200000000001	3c041e01-9d26-429e-b22c-fcb4e852500d	Aldridge & Sons Ltd	finance@aldridge.co.uk	Commercial	approved	clear	\N	\N	low	18.00	11111111-aaaa-bbbb-cccc-100000000004	company funds	clear	clear	complete	2026-05-10 17:34:15.375812	2026-05-10 17:34:15.375812	\N	\N	020 7946 0123	company	Aldridge & Sons Ltd
22222222-aaaa-bbbb-cccc-200000000002	3c041e01-9d26-429e-b22c-fcb4e852500d	Helen Roberts	helen.r@example.com	Family	pending	pending	\N	\N	medium	45.00	11111111-aaaa-bbbb-cccc-100000000003	salary	clear	clear	in_progress	2026-05-10 17:34:15.375812	2026-05-10 17:34:15.375812	\N	\N	07700 900111	individual	\N
22222222-aaaa-bbbb-cccc-200000000003	3c041e01-9d26-429e-b22c-fcb4e852500d	Pemberton Holdings	compliance@pemberton.io	Commercial	pending	review	\N	\N	high	72.00	11111111-aaaa-bbbb-cccc-100000000004	investment	review	clear	in_progress	2026-05-10 17:34:15.375812	2026-05-10 17:34:15.375812	\N	\N	020 7946 0500	company	Pemberton Holdings Ltd
22222222-aaaa-bbbb-cccc-200000000004	3c041e01-9d26-429e-b22c-fcb4e852500d	Daniel Okafor	d.okafor@example.com	Conveyancing	approved	clear	\N	\N	low	12.00	11111111-aaaa-bbbb-cccc-100000000002	remortgage	clear	clear	complete	2026-05-10 17:34:15.375812	2026-05-10 17:34:15.375812	\N	\N	07700 900222	individual	\N
\.


--
-- Data for Name: complaints; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.complaints (id, firm_id, complainant_name, complainant_type, category, description, priority, status, assigned_to, opened_date, closed_date, resolution, created_at, updated_at) FROM stdin;
99999999-aaaa-bbbb-cccc-900000000001	3c041e01-9d26-429e-b22c-fcb4e852500d	Sandra Beecham	client	service_quality	Slow response to email queries during conveyancing transaction.	medium	open	11111111-aaaa-bbbb-cccc-100000000002	2026-04-28 00:00:00	\N	\N	2026-05-10 17:34:15.418925	2026-05-10 17:34:15.418925
99999999-aaaa-bbbb-cccc-900000000002	3c041e01-9d26-429e-b22c-fcb4e852500d	Hartley Estates	client	fees	Disputes time-recording on closed litigation matter.	high	in_review	11111111-aaaa-bbbb-cccc-100000000001	2026-04-15 00:00:00	\N	\N	2026-05-10 17:34:15.418925	2026-05-10 17:34:15.418925
\.


--
-- Data for Name: compliance_alerts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.compliance_alerts (id, firm_id, alert_type, severity, title, description, case_id, client_id, regulation_ref, action_required, created_at, acknowledged_at, resolved_at, status, override_severity, override_action_required, override_notes, overridden_by, overridden_at) FROM stdin;
44444444-aaaa-bbbb-cccc-400000000001	3c041e01-9d26-429e-b22c-fcb4e852500d	overdue_training	high	AML Refresher overdue for 1 staff member	Marcus Hollings has not completed the 2026 AML Refresher (due 30 Apr 2026).	\N	\N	SRA AML Guidance 2024	Assign and complete training; update record.	2026-05-10 17:34:15.390507	\N	\N	open	\N	\N	\N	\N	\N
44444444-aaaa-bbbb-cccc-400000000002	3c041e01-9d26-429e-b22c-fcb4e852500d	policy_review_due	medium	Anti-bribery policy review overdue	Last reviewed 14 months ago; SRA recommends annual review.	\N	\N	SRA Code of Conduct §7.3	Review policy + reissue to all staff.	2026-05-10 17:34:15.390507	\N	\N	open	\N	\N	\N	\N	\N
44444444-aaaa-bbbb-cccc-400000000003	3c041e01-9d26-429e-b22c-fcb4e852500d	deadline_approaching	critical	SAR review window closes in 2 days	Suspicious activity report from 03 May 2026 needs MLRO sign-off by 14 May.	\N	\N	POCA 2002 §330	MLRO to review and sign off.	2026-05-10 17:34:15.390507	\N	\N	open	\N	\N	\N	\N	\N
44444444-aaaa-bbbb-cccc-400000000004	3c041e01-9d26-429e-b22c-fcb4e852500d	cpd_shortfall	low	CPD hours below target for 1 fee earner	Priya Shah at 12 hours; SRA recommends 16 by year-end.	\N	\N	SRA CPD Guidance	Schedule additional CPD before 30 Sept.	2026-05-10 17:34:15.390507	\N	\N	open	\N	\N	\N	\N	\N
\.


--
-- Data for Name: compliance_checks; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.compliance_checks (id, firm_id, case_id, client_id, check_type, check_name, status, severity, description, regulation_ref, remediation, checked_at, due_date, resolved_at) FROM stdin;
\.


--
-- Data for Name: compliance_scan_results; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.compliance_scan_results (id, firm_id, scan_date, category, check_name, status, details, recommendation, created_at, override_status, override_recommendation, override_notes, overridden_by, overridden_at) FROM stdin;
\.


--
-- Data for Name: compliance_tasks; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.compliance_tasks (id, firm_id, task_type, title, description, assigned_to, related_entity_type, related_entity_id, priority, status, due_date, completed_at, created_at) FROM stdin;
\.


--
-- Data for Name: conflict_checks; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.conflict_checks (id, firm_id, client_name, matter_type, parties, status, conflict_type, checked_by, resolution, resolved_at, created_at, updated_at) FROM stdin;
77777777-aaaa-bbbb-cccc-700000000001	3c041e01-9d26-429e-b22c-fcb4e852500d	Helen Roberts	family	["Helen Roberts","Marcus Roberts"]	clear	\N	11111111-aaaa-bbbb-cccc-100000000003	\N	\N	2026-05-10 17:34:15.411634	2026-05-10 17:34:15.411634
77777777-aaaa-bbbb-cccc-700000000002	3c041e01-9d26-429e-b22c-fcb4e852500d	Pemberton Holdings	commercial	["Pemberton Holdings","Aldridge & Sons Ltd"]	review	related_parties	11111111-aaaa-bbbb-cccc-100000000004	\N	\N	2026-05-10 17:34:15.411634	2026-05-10 17:34:15.411634
\.


--
-- Data for Name: conflict_parties; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.conflict_parties (id, firm_id, party_name, party_type, date_added, created_at) FROM stdin;
66666666-aaaa-bbbb-cccc-600000000001	3c041e01-9d26-429e-b22c-fcb4e852500d	Greenfield Properties Ltd	opposing	2025-06-04 00:00:00	2026-05-10 17:34:15.404422
66666666-aaaa-bbbb-cccc-600000000002	3c041e01-9d26-429e-b22c-fcb4e852500d	Aldridge & Sons Ltd	client	2026-04-12 00:00:00	2026-05-10 17:34:15.404422
66666666-aaaa-bbbb-cccc-600000000003	3c041e01-9d26-429e-b22c-fcb4e852500d	Pemberton Holdings Ltd	client	2026-04-25 00:00:00	2026-05-10 17:34:15.404422
\.


--
-- Data for Name: deadlines; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.deadlines (id, firm_id, title, due_date, priority, status, assigned_to, category, created_at, updated_at) FROM stdin;
aaaaaaaa-aaaa-bbbb-cccc-a00000000001	3c041e01-9d26-429e-b22c-fcb4e852500d	File defence — Pemberton v Aldridge	2026-05-20 16:00:00	critical	pending	11111111-aaaa-bbbb-cccc-100000000001	litigation	2026-05-10 17:34:15.425534	2026-05-10 17:34:15.425534
aaaaaaaa-aaaa-bbbb-cccc-a00000000002	3c041e01-9d26-429e-b22c-fcb4e852500d	CDD refresh: Aldridge & Sons Ltd	2026-06-12 17:00:00	medium	pending	11111111-aaaa-bbbb-cccc-100000000004	aml	2026-05-10 17:34:15.425534	2026-05-10 17:34:15.425534
aaaaaaaa-aaaa-bbbb-cccc-a00000000003	3c041e01-9d26-429e-b22c-fcb4e852500d	Annual SRA return submission	2026-10-31 23:59:00	high	pending	11111111-aaaa-bbbb-cccc-100000000004	regulatory	2026-05-10 17:34:15.425534	2026-05-10 17:34:15.425534
aaaaaaaa-aaaa-bbbb-cccc-a00000000004	3c041e01-9d26-429e-b22c-fcb4e852500d	Indemnity insurance renewal	2026-09-30 17:00:00	high	pending	11111111-aaaa-bbbb-cccc-100000000004	insurance	2026-05-10 17:34:15.425534	2026-05-10 17:34:15.425534
\.


--
-- Data for Name: email_queue; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.email_queue (id, firm_id, template_id, recipient, subject, status, sent_at, error, created_at) FROM stdin;
\.


--
-- Data for Name: email_templates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.email_templates (id, firm_id, name, subject, body, category, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: evidence_documents; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.evidence_documents (id, firm_id, title, description, category, file_path, file_size, uploaded_by, status, review_date, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: firms; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.firms (id, name, sra_number, email, phone, address, postcode, website, subscription_tier, subscription_plan, subscription_status, billing_email, next_billing_date, annual_cost, stripe_customer_id, stripe_subscription_id, trial_ends_at, practice_areas, firm_size, colp_name, cofa_name, mlro_name, notification_preferences, firm_preferences, sra_return_edits, onboarding_status, onboarding_completed_at, is_active, created_at, updated_at) FROM stdin;
6b9a595d-2759-4158-89b2-ac8e54aa81bc	Test Law Firm	123456	\N	\N	\N	\N	\N	professional	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	completed	\N	t	2026-05-02 16:07:41.112484	2026-05-02 16:07:41.112484
9a9d5d03-156b-4f32-b669-c1762f1f5f16	RLS Test Firm	RLSTEST01	\N	\N	\N	\N	\N	essentials	free	trial	\N	\N	0	\N	\N	\N	\N	1	\N	\N	\N	\N	\N	\N	pending	\N	t	2026-05-09 22:21:47.653	2026-05-09 22:21:47.653
1814e65e-ca48-4818-9158-20d8ab43b678	SRA Audit Test Firm	E2E329574	\N	\N	\N	\N	\N	essentials	free	trial	\N	\N	0	\N	\N	\N	\N	1	\N	\N	\N	\N	\N	\N	pending	\N	t	2026-05-10 00:52:10.153	2026-05-10 00:52:10.153
2d08f3dc-cd8c-4c4c-8e66-86a35f5d1f82	Matters Test Firm	E2E339085	\N	\N	\N	\N	\N	essentials	free	trial	\N	\N	0	\N	\N	\N	\N	1	\N	\N	\N	\N	\N	\N	pending	\N	t	2026-05-10 00:52:19.568	2026-05-10 00:52:19.568
3bae1669-dbb7-4218-aa3e-371a19ede5ab	Conflict Test Firm	E2E350045	\N	\N	\N	\N	\N	essentials	free	trial	\N	\N	0	\N	\N	\N	\N	1	\N	\N	\N	\N	\N	\N	pending	\N	t	2026-05-10 00:52:30.212	2026-05-10 00:52:30.212
9a0f8780-52dc-4b71-8ccd-907ae57019a6	Regulatory Test Firm	E2E359006	\N	\N	\N	\N	\N	essentials	free	trial	\N	\N	0	\N	\N	\N	\N	1	\N	\N	\N	\N	\N	\N	pending	\N	t	2026-05-10 00:52:39.204	2026-05-10 00:52:39.204
5e741e37-4bb8-4720-af05-1b5de57c5ffd	Breach Test Firm	E2E363162	\N	\N	\N	\N	\N	essentials	free	trial	\N	\N	0	\N	\N	\N	\N	1	\N	\N	\N	\N	\N	\N	pending	\N	t	2026-05-10 00:52:43.304	2026-05-10 00:52:43.304
420e3c1a-08cc-4beb-9a80-ecb49a904fa7	Dashboard Test Firm	E2E371960	\N	\N	\N	\N	\N	essentials	free	trial	\N	\N	0	\N	\N	\N	\N	1	\N	\N	\N	\N	\N	\N	pending	\N	t	2026-05-10 00:52:52.195	2026-05-10 00:52:52.195
5b221eee-59eb-42bb-84eb-41e616bf9394	SRA Audit Test Firm	E2E278645	\N	\N	\N	\N	\N	essentials	free	trial	\N	\N	0	\N	\N	\N	\N	1	\N	\N	\N	\N	\N	\N	pending	\N	t	2026-05-10 01:41:19.418	2026-05-10 01:41:19.418
55c16e48-c9f5-46e2-ae90-08cd05cb45d4	Matters Test Firm	E2E282890	\N	\N	\N	\N	\N	essentials	free	trial	\N	\N	0	\N	\N	\N	\N	1	\N	\N	\N	\N	\N	\N	pending	\N	t	2026-05-10 01:41:23.037	2026-05-10 01:41:23.037
32775193-b10c-4969-962b-d867f55507b0	Conflict Test Firm	E2E286764	\N	\N	\N	\N	\N	essentials	free	trial	\N	\N	0	\N	\N	\N	\N	1	\N	\N	\N	\N	\N	\N	pending	\N	t	2026-05-10 01:41:26.963	2026-05-10 01:41:26.963
68e33950-e766-4986-9695-f984e902318d	Regulatory Test Firm	E2E290690	\N	\N	\N	\N	\N	essentials	free	trial	\N	\N	0	\N	\N	\N	\N	1	\N	\N	\N	\N	\N	\N	pending	\N	t	2026-05-10 01:41:30.83	2026-05-10 01:41:30.83
e3198d39-6d17-48a8-99be-e9db448fe2e4	Breach Test Firm	E2E294057	\N	\N	\N	\N	\N	essentials	free	trial	\N	\N	0	\N	\N	\N	\N	1	\N	\N	\N	\N	\N	\N	pending	\N	t	2026-05-10 01:41:34.196	2026-05-10 01:41:34.196
8a1e84c9-b66a-4d1f-85c2-5b58c0736e49	Dashboard Test Firm	E2E297337	\N	\N	\N	\N	\N	essentials	free	trial	\N	\N	0	\N	\N	\N	\N	1	\N	\N	\N	\N	\N	\N	pending	\N	t	2026-05-10 01:41:37.46	2026-05-10 01:41:37.46
61592422-8ee7-4be7-bcc9-8b3598ac7ef8	SRA Audit Test Firm	E2E889766	\N	\N	\N	\N	\N	essentials	free	trial	\N	\N	0	\N	\N	\N	\N	1	\N	\N	\N	\N	\N	\N	pending	\N	t	2026-05-10 01:51:29.918	2026-05-10 01:51:29.918
96b87309-1d53-4446-a063-2a39f81827ef	Matters Test Firm	E2E904157	\N	\N	\N	\N	\N	essentials	free	trial	\N	\N	0	\N	\N	\N	\N	1	\N	\N	\N	\N	\N	\N	pending	\N	t	2026-05-10 01:51:44.359	2026-05-10 01:51:44.359
de3db366-af99-46d1-bf9f-660ab805b326	Conflict Test Firm	E2E917713	\N	\N	\N	\N	\N	essentials	free	trial	\N	\N	0	\N	\N	\N	\N	1	\N	\N	\N	\N	\N	\N	pending	\N	t	2026-05-10 01:51:57.853	2026-05-10 01:51:57.853
c9464eb8-0ba9-43bf-bb08-eb3f4bf06345	Regulatory Test Firm	E2E931506	\N	\N	\N	\N	\N	essentials	free	trial	\N	\N	0	\N	\N	\N	\N	1	\N	\N	\N	\N	\N	\N	pending	\N	t	2026-05-10 01:52:11.628	2026-05-10 01:52:11.628
73216b58-aeff-4f65-837a-cc4d5fc4f9d6	E2E Shared Firm 1778378856157	EE8856157	\N	\N	\N	\N	\N	essentials	free	trial	\N	\N	0	\N	\N	\N	\N	1	\N	\N	\N	\N	\N	\N	pending	\N	t	2026-05-10 02:07:36.524	2026-05-10 02:07:36.524
ae3a0443-25e1-4a0f-9dff-7d8017e0504b	E2E Shared Firm 1778379529450	EE9529450	\N	\N	\N	\N	\N	essentials	free	trial	\N	\N	0	\N	\N	\N	\N	1	\N	\N	\N	\N	\N	\N	pending	\N	t	2026-05-10 02:18:49.817	2026-05-10 02:18:49.817
ba29120c-b595-48fb-85b2-f3e79c245f14	E2E Shared Firm 1778381658900	EE1658900	\N	\N	\N	\N	\N	essentials	free	trial	\N	\N	0	\N	\N	\N	\N	1	\N	\N	\N	\N	\N	\N	pending	\N	t	2026-05-10 02:54:19.686	2026-05-10 02:54:19.686
a0072f02-9953-427f-914a-9c5e613cb932	E2E Shared Firm 1778382430681	EE2430681	\N	\N	\N	\N	\N	essentials	free	trial	\N	\N	0	\N	\N	\N	\N	1	\N	\N	\N	\N	\N	\N	pending	\N	t	2026-05-10 03:07:11.234	2026-05-10 03:07:11.234
1fe69a96-8e10-47bc-9113-0fa1a503562b	E2E Shared Firm 1778427207272	EE7207272	\N	\N	\N	\N	\N	essentials	free	trial	\N	\N	0	\N	\N	\N	\N	1	\N	\N	\N	\N	\N	\N	pending	\N	t	2026-05-10 15:33:27.661	2026-05-10 15:33:27.661
c8770b56-8e6b-4ed2-8f4f-8d4e5b4ef4e3	E2E Shared Firm 1778427506163	EE7506163	\N	\N	\N	\N	\N	essentials	free	trial	\N	\N	0	\N	\N	\N	\N	1	\N	\N	\N	\N	\N	\N	pending	\N	t	2026-05-10 15:38:26.505	2026-05-10 15:38:26.505
b70d78ae-681f-4e51-9990-6d8871dbdd04	E2E Shared Firm 1778430065946	EE0065946	\N	\N	\N	\N	\N	essentials	free	trial	\N	\N	0	\N	\N	\N	\N	1	\N	\N	\N	\N	\N	\N	pending	\N	t	2026-05-10 16:21:06.273	2026-05-10 16:21:06.273
11902720-5ef3-4bb5-ab6a-03832b32c725	E2E Shared Firm 1778430849578	EE0849578	\N	\N	\N	\N	\N	essentials	free	trial	\N	\N	0	\N	\N	\N	\N	1	\N	\N	\N	\N	\N	\N	pending	\N	t	2026-05-10 16:34:09.779	2026-05-10 16:34:09.779
f340a016-069e-4cda-a81e-6b0788e08673	E2E Shared Firm 1778431359390	EE1359390	\N	\N	\N	\N	\N	essentials	free	trial	\N	\N	0	\N	\N	\N	\N	1	\N	\N	\N	\N	\N	\N	pending	\N	t	2026-05-10 16:42:39.67	2026-05-10 16:42:39.67
3c041e01-9d26-429e-b22c-fcb4e852500d	Smoke Test Firm	SMOKETEST	\N	\N	\N	\N	\N	essentials	free	trial	\N	\N	0	\N	\N	\N	\N	1	\N	\N	\N	\N	\N	\N	completed	2026-05-10 19:09:44.368	t	2026-05-10 17:19:56.562	2026-05-10 19:09:44.387
\.


--
-- Data for Name: import_history; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.import_history (id, firm_id, import_type, filename, status, records_processed, records_failed, imported_by, created_at) FROM stdin;
\.


--
-- Data for Name: integration_sync_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.integration_sync_logs (id, firm_id, integration_id, sync_type, status, direction, records_synced, records_created, records_updated, records_skipped, records_errored, started_at, completed_at, duration_seconds, error_message, error_details, created_at) FROM stdin;
\.


--
-- Data for Name: integrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.integrations (id, firm_id, name, type, status, config, last_sync, created_at, updated_at, provider, access_token, refresh_token, token_expires_at, token_scope, provider_firm_name, provider_user_name, provider_user_id, provider_account_id, connected_at, disconnected_at, last_error) FROM stdin;
\.


--
-- Data for Name: key_dates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.key_dates (id, firm_id, title, date, category, status, assigned_to, created_at) FROM stdin;
\.


--
-- Data for Name: matter_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.matter_items (id, firm_id, matter_id, title, description, is_complete, "order", created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: matters; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.matters (id, firm_id, client_name, matter_type, reference, status, assigned_to, risk_level, fee_estimate, created_at, updated_at, external_ref, source, title, description, practice_area, client_id, open_date, close_date) FROM stdin;
33333333-aaaa-bbbb-cccc-300000000001	3c041e01-9d26-429e-b22c-fcb4e852500d	Aldridge & Sons Ltd	commercial	COM-2026-001	open	11111111-aaaa-bbbb-cccc-100000000004	low	18000.00	2026-05-10 17:34:15.38393	2026-05-10 17:34:15.38393	\N	manual	Aldridge — supply contract review	Reviewing supply chain contracts for compliance.	Commercial	\N	2026-04-12	\N
33333333-aaaa-bbbb-cccc-300000000002	3c041e01-9d26-429e-b22c-fcb4e852500d	Helen Roberts	family	FAM-2026-014	open	11111111-aaaa-bbbb-cccc-100000000003	medium	4500.00	2026-05-10 17:34:15.38393	2026-05-10 17:34:15.38393	\N	manual	Roberts — divorce proceedings	Initial advice + financial disclosure prep.	Family	\N	2026-04-18	\N
33333333-aaaa-bbbb-cccc-300000000003	3c041e01-9d26-429e-b22c-fcb4e852500d	Daniel Okafor	conveyancing	CONV-2026-077	open	11111111-aaaa-bbbb-cccc-100000000002	low	1800.00	2026-05-10 17:34:15.38393	2026-05-10 17:34:15.38393	\N	manual	Okafor — remortgage 14 Birch Lane	Remortgage from Halifax to Nationwide.	Conveyancing	\N	2026-05-02	\N
33333333-aaaa-bbbb-cccc-300000000004	3c041e01-9d26-429e-b22c-fcb4e852500d	Hartley Estates	litigation	LIT-2025-203	closed	11111111-aaaa-bbbb-cccc-100000000001	high	42000.00	2026-05-10 17:34:15.38393	2026-05-10 17:34:15.38393	\N	manual	Hartley v Greenfield — boundary dispute	Settled at mediation, Dec 2025.	Litigation	\N	2025-06-04	\N
33333333-aaaa-bbbb-cccc-300000000005	3c041e01-9d26-429e-b22c-fcb4e852500d	Pemberton Holdings	commercial	COM-2026-009	open	11111111-aaaa-bbbb-cccc-100000000004	high	75000.00	2026-05-10 17:34:15.38393	2026-05-10 17:34:15.38393	\N	manual	Pemberton — Series B investor diligence	Cross-border due diligence for investment.	Commercial	\N	2026-04-25	\N
\.


--
-- Data for Name: policy_documents; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.policy_documents (id, firm_id, title, category, status, version, content, last_reviewed, next_review, owner, created_at, updated_at) FROM stdin;
cccccccc-aaaa-bbbb-cccc-c00000000001	3c041e01-9d26-429e-b22c-fcb4e852500d	Anti-Money Laundering Policy	aml	published	3.1	Full policy text omitted for brevity.	2025-04-01 00:00:00	2026-04-01 00:00:00	11111111-aaaa-bbbb-cccc-100000000004	2026-05-10 17:41:33.743265	2026-05-10 17:41:33.743265
cccccccc-aaaa-bbbb-cccc-c00000000002	3c041e01-9d26-429e-b22c-fcb4e852500d	Anti-Bribery & Corruption Policy	ethics	published	2.0	Full policy text omitted for brevity.	2025-03-15 00:00:00	2026-03-15 00:00:00	11111111-aaaa-bbbb-cccc-100000000004	2026-05-10 17:41:33.743265	2026-05-10 17:41:33.743265
cccccccc-aaaa-bbbb-cccc-c00000000003	3c041e01-9d26-429e-b22c-fcb4e852500d	GDPR & Data Protection Policy	data	published	4.2	Full policy text omitted for brevity.	2025-11-20 00:00:00	2026-11-20 00:00:00	11111111-aaaa-bbbb-cccc-100000000004	2026-05-10 17:41:33.743265	2026-05-10 17:41:33.743265
\.


--
-- Data for Name: reconciliations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.reconciliations (id, firm_id, period, status, reconciled_by, discrepancies, completed_at, created_at) FROM stdin;
\.


--
-- Data for Name: regulatory_interpretations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.regulatory_interpretations (id, firm_id, update_id, summary, applicability, applicability_reasoning, action_items, source_citation, confidence_score, confidence_label, model_used, prompt_tokens, completion_tokens, processing_time_ms, status, error_message, override_applicability, override_notes, override_action_items, overridden_by, overridden_at, delivered_at, acknowledged_at, acknowledged_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: regulatory_updates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.regulatory_updates (id, firm_id, title, source, impact_level, published_date, description, regulatory_body, status, created_at, body, category, content_hash, effective_date, scraped_at, source_url, summary, tags) FROM stdin;
\.


--
-- Data for Name: remediation_plans; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.remediation_plans (id, firm_id, title, source, priority, status, assigned_to, due_date, steps, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: risk_scores; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.risk_scores (id, firm_id, entity_type, entity_id, overall_score, sra_score, aml_score, cpr_score, gdpr_score, limitation_score, calculated_at, override_overall_score, override_notes, overridden_by, overridden_at) FROM stdin;
\.


--
-- Data for Name: sar_records; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sar_records (id, firm_id, client_name, matter_ref, suspicion_type, amount, report_date, mlro_decision, nca_filed, status, grounds_for_suspicion, transaction_details, created_at) FROM stdin;
\.


--
-- Data for Name: sra_audit_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sra_audit_items (id, firm_id, category, item_name, description, status, evidence_ref, last_reviewed, next_review_due, notes) FROM stdin;
\.


--
-- Data for Name: sra_feed_log; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sra_feed_log (id, feed_source, last_checked, items_found, new_items, status, error_message) FROM stdin;
\.


--
-- Data for Name: staff_members; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.staff_members (id, firm_id, name, email, role, department, status, pqe, sra_id, start_date, last_training, phone, created_at, updated_at, external_ref, source) FROM stdin;
11111111-aaaa-bbbb-cccc-100000000001	3c041e01-9d26-429e-b22c-fcb4e852500d	Jane Whitfield	jane@smoketest.firm	Solicitor (Senior)	Litigation	active	12	604812	2014-09-01 00:00:00	2025-11-10 00:00:00	\N	2026-05-10 17:34:15.358438	2026-05-10 17:34:15.358438	\N	\N
11111111-aaaa-bbbb-cccc-100000000002	3c041e01-9d26-429e-b22c-fcb4e852500d	Priya Shah	priya@smoketest.firm	Solicitor	Conveyancing	active	5	712334	2020-03-15 00:00:00	2025-09-22 00:00:00	\N	2026-05-10 17:34:15.358438	2026-05-10 17:34:15.358438	\N	\N
11111111-aaaa-bbbb-cccc-100000000003	3c041e01-9d26-429e-b22c-fcb4e852500d	Marcus Hollings	marcus@smoketest.firm	Trainee	Family	active	1	845221	2024-09-01 00:00:00	2026-01-08 00:00:00	\N	2026-05-10 17:34:15.358438	2026-05-10 17:34:15.358438	\N	\N
11111111-aaaa-bbbb-cccc-100000000004	3c041e01-9d26-429e-b22c-fcb4e852500d	Owen Pritchard	owen@smoketest.firm	Partner	Commercial	active	21	331108	2003-06-01 00:00:00	2025-12-01 00:00:00	\N	2026-05-10 17:34:15.358438	2026-05-10 17:34:15.358438	\N	\N
\.


--
-- Data for Name: staff_training; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.staff_training (id, firm_id, staff_id, staff_name, title, training_type, status, due_date, completed_at, cpd_hours, created_at, course_name, provider, completed_date, certificate_ref) FROM stdin;
bbbbbbbb-aaaa-bbbb-cccc-b00000000001	3c041e01-9d26-429e-b22c-fcb4e852500d	11111111-aaaa-bbbb-cccc-100000000001	\N	\N	\N	completed	2026-04-30 00:00:00	\N	4	2026-05-10 17:41:33.739914	AML Refresher 2026	Central Law Training	2026-04-12	CLT-2026-AML-J1
bbbbbbbb-aaaa-bbbb-cccc-b00000000002	3c041e01-9d26-429e-b22c-fcb4e852500d	11111111-aaaa-bbbb-cccc-100000000002	\N	\N	\N	completed	2026-04-30 00:00:00	\N	4	2026-05-10 17:41:33.739914	AML Refresher 2026	Central Law Training	2026-04-22	CLT-2026-AML-P1
bbbbbbbb-aaaa-bbbb-cccc-b00000000003	3c041e01-9d26-429e-b22c-fcb4e852500d	11111111-aaaa-bbbb-cccc-100000000003	\N	\N	\N	pending	2026-04-30 00:00:00	\N	\N	2026-05-10 17:41:33.739914	AML Refresher 2026	Central Law Training	\N	\N
bbbbbbbb-aaaa-bbbb-cccc-b00000000004	3c041e01-9d26-429e-b22c-fcb4e852500d	11111111-aaaa-bbbb-cccc-100000000004	\N	\N	\N	completed	2026-06-30 00:00:00	\N	2	2026-05-10 17:41:33.739914	GDPR for Solicitors 2026	Datalaw	2026-03-08	DAT-2026-GDPR-O1
bbbbbbbb-aaaa-bbbb-cccc-b00000000005	3c041e01-9d26-429e-b22c-fcb4e852500d	11111111-aaaa-bbbb-cccc-100000000002	\N	\N	\N	pending	2026-06-15 00:00:00	\N	\N	2026-05-10 17:41:33.739914	CPR Updates Q2 2026	CLT	\N	\N
\.


--
-- Data for Name: supervision_records; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.supervision_records (id, firm_id, staff_id, staff_name, supervisor, frequency, last_session, next_due, status, notes_count, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: transactions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.transactions (id, firm_id, account_id, date, description, amount, type, matter_ref, created_at) FROM stdin;
\.


--
-- Data for Name: undertakings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.undertakings (id, firm_id, description, matter_ref, given_to, given_by, given_date, due_date, status, completed_at, created_at, updated_at) FROM stdin;
88888888-aaaa-bbbb-cccc-800000000001	3c041e01-9d26-429e-b22c-fcb4e852500d	Hold £50,000 to order pending exchange of contracts on 14 Birch Lane.	CONV-2026-077	Nationwide Building Society	Priya Shah	2026-05-02 00:00:00	2026-05-30 00:00:00	active	\N	2026-05-10 17:34:15.415729	2026-05-10 17:34:15.415729
88888888-aaaa-bbbb-cccc-800000000002	3c041e01-9d26-429e-b22c-fcb4e852500d	Discharge existing mortgage on completion (Halifax #1234567).	CONV-2026-077	Halifax	Priya Shah	2026-05-02 00:00:00	2026-05-30 00:00:00	active	\N	2026-05-10 17:34:15.415729	2026-05-10 17:34:15.415729
\.


--
-- Data for Name: user_accounts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_accounts (id, firm_id, email, password_hash, role, staff_id, is_active, last_login, failed_login_attempts, locked_until, created_at, updated_at) FROM stdin;
9b51a778-75ea-474f-b0a8-7d72a73f157a	32775193-b10c-4969-962b-d867f55507b0	e2e-1778377286764@seema-test.invalid	$2a$10$otwvWhA5S4SVtAuq8S.AO.VnI87j9s.oXzNUzyPNqcH9U6hDgm6vC	colp	\N	t	2026-05-10 01:41:27.084	0	\N	2026-05-10 01:41:26.967	2026-05-10 01:41:27.089
d94b197d-5b93-4049-984e-87326b98ca4c	68e33950-e766-4986-9695-f984e902318d	e2e-1778377290690@seema-test.invalid	$2a$10$.VjFVxKN.xjYLxT0BaXYoOLJTuCw0KguG0GcCVcYRCnJwhx3PukHK	colp	\N	t	2026-05-10 01:41:30.951	0	\N	2026-05-10 01:41:30.836	2026-05-10 01:41:30.96
77d22ec3-fa94-4bde-9027-c57a379ab48a	e3198d39-6d17-48a8-99be-e9db448fe2e4	e2e-1778377294057@seema-test.invalid	$2a$10$BbZY/etB8v5H9FnJokC2FuK0A0GXrDO5xRaZMpNjVuID9uroplpHm	colp	\N	t	2026-05-10 01:41:34.311	0	\N	2026-05-10 01:41:34.2	2026-05-10 01:41:34.314
fb062dd8-73ac-4239-91d1-81d3c62a2896	6b9a595d-2759-4158-89b2-ac8e54aa81bc	omizzy786@gmail.com	$2b$12$n8xjftwHuJ6jxbTK8GMSCOuJ5fM5QZWAxX3D4L3dCKKILg23CFX6m	colp	\N	t	2026-05-02 16:37:35.434026	0	\N	2026-05-02 16:07:41.112484	2026-05-02 16:37:35.163989
7b04e693-e7e0-4677-aafc-59f45a0dab42	8a1e84c9-b66a-4d1f-85c2-5b58c0736e49	e2e-1778377297337@seema-test.invalid	$2a$10$TNPYcqLa..IAf00UH6u9ceGtnyV5/luZ71SFyajxaxRKoy/T2iJYu	colp	\N	t	2026-05-10 01:41:37.565	0	\N	2026-05-10 01:41:37.463	2026-05-10 01:41:37.57
a7592aa7-95fb-461c-a577-bcebb464cebb	61592422-8ee7-4be7-bcc9-8b3598ac7ef8	e2e-1778377889766@seema-test.invalid	$2a$10$YIuoq5cYC.4HobIl57.YF.9kzCQMpgNrUUqeVGAPGeIQhzph5KhfS	colp	\N	t	2026-05-10 01:51:30.022	0	\N	2026-05-10 01:51:29.924	2026-05-10 01:51:30.039
d0f3143f-3155-467f-a1bf-2a9f2e927203	9a9d5d03-156b-4f32-b669-c1762f1f5f16	rlstest@example.com	$2a$10$cauwx2A2P7fncWww8hANz.D.AGk9kFZF7sCK88Cg11MoQFodpXZ6O	colp	\N	t	2026-05-09 23:46:29.685	0	\N	2026-05-09 22:21:47.67	2026-05-09 23:46:29.72
82ac45e8-8968-4b78-b65b-71b55c77b970	1814e65e-ca48-4818-9158-20d8ab43b678	e2e-1778374329574@seema-test.invalid	$2a$10$5K8/7hqrl11OuxHyneNPOukXTNr69EEqfQ0mqXiU2xM8QXSj5Gmsi	colp	\N	t	2026-05-10 00:52:10.372	0	\N	2026-05-10 00:52:10.18	2026-05-10 00:52:10.473
1af206b9-9965-4c06-89e9-742973fc306f	2d08f3dc-cd8c-4c4c-8e66-86a35f5d1f82	e2e-1778374339085@seema-test.invalid	$2a$10$mWVsX7CX15a8H/ToU4qhk.TqTje.uWMRgLmEUjb2DPaQVCSS1q2jm	colp	\N	t	2026-05-10 00:52:19.861	0	\N	2026-05-10 00:52:19.578	2026-05-10 00:52:19.866
0a03279b-31dc-41b6-b8a0-9fcdcdc410b2	3bae1669-dbb7-4218-aa3e-371a19ede5ab	e2e-1778374350045@seema-test.invalid	$2a$10$QRfMxRyAef8r8WMiPvcA.eLsSM.yXm1Z2beShbXwwmivFuk77eSnG	colp	\N	t	2026-05-10 00:52:30.331	0	\N	2026-05-10 00:52:30.216	2026-05-10 00:52:30.335
3690a137-6504-4830-9d8b-826e081f1fb5	9a0f8780-52dc-4b71-8ccd-907ae57019a6	e2e-1778374359006@seema-test.invalid	$2a$10$IZnoWZjab326on/3ivFmSe7bVI1si66rTP/N3hMe0iH6fGrKHRGkC	colp	\N	t	2026-05-10 00:52:39.415	0	\N	2026-05-10 00:52:39.214	2026-05-10 00:52:39.42
9c1f368f-f195-4628-9ae3-649f63e34e14	5e741e37-4bb8-4720-af05-1b5de57c5ffd	e2e-1778374363162@seema-test.invalid	$2a$10$LzFbOC0cjwNnHXooKY18iuSNWfBxBH2DBum1gT/dImNO7.MAkMsNy	colp	\N	t	2026-05-10 00:52:43.423	0	\N	2026-05-10 00:52:43.307	2026-05-10 00:52:43.429
1f621a12-4d09-4891-ae44-a49d16f2de26	420e3c1a-08cc-4beb-9a80-ecb49a904fa7	e2e-1778374371960@seema-test.invalid	$2a$10$Vs6JAN5AgnEJsukbaNJ3G.pcxOrfGItLbxkd5PKxeV1NWBFlOWC7.	colp	\N	t	2026-05-10 00:52:52.335	0	\N	2026-05-10 00:52:52.199	2026-05-10 00:52:52.339
d0c38c22-159d-4210-8acb-95c2b5c3b89c	5b221eee-59eb-42bb-84eb-41e616bf9394	e2e-1778377278645@seema-test.invalid	$2a$10$0SSpaXWmS9ctTeo8lLOz3O3PzTHKwShw5ESMYbinrd7eExHHOOMwa	colp	\N	t	2026-05-10 01:41:19.63	0	\N	2026-05-10 01:41:19.463	2026-05-10 01:41:19.674
d0351d0e-6912-4254-bf67-8c15310de68d	55c16e48-c9f5-46e2-ae90-08cd05cb45d4	e2e-1778377282890@seema-test.invalid	$2a$10$ZIQom4GZR45C3D/MOjG4z.UsJqvEmLwIF1UW7KYtdbQ70jOWjPU2u	colp	\N	t	2026-05-10 01:41:23.145	0	\N	2026-05-10 01:41:23.042	2026-05-10 01:41:23.149
17e10c05-da16-4051-9282-83d95b7b7708	96b87309-1d53-4446-a063-2a39f81827ef	e2e-1778377904157@seema-test.invalid	$2a$10$5eDN8WGi0m1SWXG0VUXk7.y0bK4BTriaLr7dI00scPbqDVJ7IEGC6	colp	\N	t	2026-05-10 01:51:44.522	0	\N	2026-05-10 01:51:44.367	2026-05-10 01:51:44.53
c045c817-cd2f-4c83-8e4c-81775abaf8a1	de3db366-af99-46d1-bf9f-660ab805b326	e2e-1778377917713@seema-test.invalid	$2a$10$GuFJpg02WinEpq8TjrsYnOovUOTbdI252RET3rh87SkqshWQzya.y	colp	\N	t	2026-05-10 01:51:57.975	0	\N	2026-05-10 01:51:57.856	2026-05-10 01:51:57.992
d473ddc2-5320-434e-8b6a-ec4a8b4c6917	c9464eb8-0ba9-43bf-bb08-eb3f4bf06345	e2e-1778377931506@seema-test.invalid	$2a$10$G2uoFq/1OxUgChiPeTC8xuXaWvO146ZkgWKG1r7SCnNeGTmSUJuaK	colp	\N	t	2026-05-10 01:52:11.75	0	\N	2026-05-10 01:52:11.631	2026-05-10 01:52:11.757
9785aa99-6026-4b83-b9ed-e286778165d1	73216b58-aeff-4f65-837a-cc4d5fc4f9d6	e2e-shared-1778378856157@seema-test.invalid	$2a$10$N9JWxI25gwcc4v8z7UbkKeKLpYtQ1q5DLHM8SIKj3hpY0nar3WfTq	colp	\N	t	\N	0	\N	2026-05-10 02:07:36.538	2026-05-10 02:07:36.538
9b88b087-b3f8-40c4-837d-f11953d7394c	ae3a0443-25e1-4a0f-9dff-7d8017e0504b	e2e-shared-1778379529450@seema-test.invalid	$2a$10$3wsUcsDpnib2mfvyqrTxz.zXnhWHO4Q6Imzzfz/02wMx7TYpmrX8q	colp	\N	t	\N	0	\N	2026-05-10 02:18:49.831	2026-05-10 02:18:49.831
07933773-7b90-4c65-bfe4-9d66a39966bf	ba29120c-b595-48fb-85b2-f3e79c245f14	e2e-shared-1778381658900@seema-test.invalid	$2a$10$dL6tjcaepfTIZwf6eDA3Q.gQGfMSyGwOdG7BYpj8LAQG8iz5Wh2FG	colp	\N	t	\N	0	\N	2026-05-10 02:54:19.706	2026-05-10 02:54:19.706
7ddcd005-c93e-4e74-a3c5-c12eac959577	a0072f02-9953-427f-914a-9c5e613cb932	e2e-shared-1778382430681@seema-test.invalid	$2a$10$0ZkGm8w6iBilIFL4./3DTuqtKlIMT20yWIecL7yySwbPs9hDa9LXq	colp	\N	t	2026-05-10 03:07:12.404	0	\N	2026-05-10 03:07:11.262	2026-05-10 03:07:12.61
a9bd802a-8f25-42a3-8ab0-8d41bf0fc2e3	1fe69a96-8e10-47bc-9113-0fa1a503562b	e2e-shared-1778427207272@seema-test.invalid	$2a$10$yf.hMKKUTicwlJ51FwqTKuKJwKPog6P2MaVSdduxnZfZ45rmcTXfq	colp	\N	t	2026-05-10 15:33:28.839	0	\N	2026-05-10 15:33:27.669	2026-05-10 15:33:28.913
4a668e05-9da2-42b5-b3ec-8eb170860e81	b70d78ae-681f-4e51-9990-6d8871dbdd04	e2e-shared-1778430065946@seema-test.invalid	$2a$10$pOmqMBOuRxueu8khUJau.eahpt8vfs16XxH.0epzYlj8iBHB5M7wq	colp	\N	t	2026-05-10 16:21:49.825	0	\N	2026-05-10 16:21:06.283	2026-05-10 16:21:49.829
94ef9cdd-4241-4cca-b036-d75ec7b0a253	c8770b56-8e6b-4ed2-8f4f-8d4e5b4ef4e3	e2e-shared-1778427506163@seema-test.invalid	$2a$10$F8nVF0VLoSyua2wfyRFdveTxUKdr3q1/M8K3.c44fMGQuBq/CYm5a	colp	\N	t	2026-05-10 15:41:57.839	0	\N	2026-05-10 15:38:26.511	2026-05-10 15:41:57.844
01ba1012-3314-44c2-8b64-ed43591727e0	f340a016-069e-4cda-a81e-6b0788e08673	e2e-shared-1778431359390@seema-test.invalid	$2a$10$lTLRVGitaYxlg160dW/uA.C6WtjZYkKNfBxyYq3Z0qLmyb.KGfAk2	colp	\N	t	2026-05-10 16:42:40.286	0	\N	2026-05-10 16:42:39.677	2026-05-10 16:42:40.335
dec80d89-44d8-4799-b75f-ec43c7ed7bb7	11902720-5ef3-4bb5-ab6a-03832b32c725	e2e-shared-1778430849578@seema-test.invalid	$2a$10$YmJ0DHyu7vM7ycaIKcmYNOfQV5lyeSocsWOf8z8094JpCJCL2RVfi	colp	\N	t	2026-05-10 16:34:10.905	0	\N	2026-05-10 16:34:09.786	2026-05-10 16:34:10.924
8d519c5a-5663-4a0d-9025-615e99d28e14	3c041e01-9d26-429e-b22c-fcb4e852500d	smoketest@seema-test.invalid	$2a$10$mm2aLa1bhjLenPepCPBxz.LDJZn/vrpvhUr7rjRv/ztdJZ.Utzvze	colp	\N	t	2026-05-10 19:00:36.189	0	\N	2026-05-10 17:19:56.603	2026-05-10 19:00:36.224
\.


--
-- Data for Name: user_sessions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_sessions (id, user_id, firm_id, token, refresh_token, ip_address, user_agent, expires_at, is_active, created_at) FROM stdin;
fe1b5904-285c-4b14-b408-123d64ed257f	fb062dd8-73ac-4239-91d1-81d3c62a2896	6b9a595d-2759-4158-89b2-ac8e54aa81bc	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYjA2MmRkOC03M2FjLTQyMzktOTFkMS04MWQzYzYyYTI4OTYiLCJmaXJtX2lkIjoiNmI5YTU5NWQtMjc1OS00MTU4LTg5YjItYWM4ZTU0YWE4MWJjIiwicm9sZSI6ImNvbHAiLCJ0eXBlIjoiYWNjZXNzIiwiaWF0IjoxNzc3NzM4Njk2LCJleHAiOjE3Nzc3Mzk1OTZ9.nJ7_H7ZMMbSoXXkFYciAPJRZ9ywoXFoLSwu2vn46GmY	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYjA2MmRkOC03M2FjLTQyMzktOTFkMS04MWQzYzYyYTI4OTYiLCJmaXJtX2lkIjoiNmI5YTU5NWQtMjc1OS00MTU4LTg5YjItYWM4ZTU0YWE4MWJjIiwidHlwZSI6InJlZnJlc2giLCJpYXQiOjE3Nzc3Mzg2OTYsImV4cCI6MTc3ODM0MzQ5Nn0.LLAEfgR569XfAu02_M_7RUrQZ9Fu-_uK_LixA86mGl8	192.168.65.1	curl/8.4.0	2026-05-09 16:18:16.912197	t	2026-05-02 16:18:16.651725
338070e1-f90e-401f-b59d-339de6c0960c	fb062dd8-73ac-4239-91d1-81d3c62a2896	6b9a595d-2759-4158-89b2-ac8e54aa81bc	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYjA2MmRkOC03M2FjLTQyMzktOTFkMS04MWQzYzYyYTI4OTYiLCJmaXJtX2lkIjoiNmI5YTU5NWQtMjc1OS00MTU4LTg5YjItYWM4ZTU0YWE4MWJjIiwicm9sZSI6ImNvbHAiLCJ0eXBlIjoiYWNjZXNzIiwiaWF0IjoxNzc3NzM4NzI2LCJleHAiOjE3Nzc3Mzk2MjZ9.Eg0eSPYvTub7nimFeu9ZRph0xpIHLNO22WCHXcHMkwk	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYjA2MmRkOC03M2FjLTQyMzktOTFkMS04MWQzYzYyYTI4OTYiLCJmaXJtX2lkIjoiNmI5YTU5NWQtMjc1OS00MTU4LTg5YjItYWM4ZTU0YWE4MWJjIiwidHlwZSI6InJlZnJlc2giLCJpYXQiOjE3Nzc3Mzg3MjYsImV4cCI6MTc3ODM0MzUyNn0.Z8xEhnapLWmYUFiRJDJDcauJN8JLJnj2jplNH0BILIg	192.168.65.1	curl/8.4.0	2026-05-09 16:18:46.225236	t	2026-05-02 16:18:45.971174
58dc9ab5-e38e-4610-a18c-e0cf70d4706d	fb062dd8-73ac-4239-91d1-81d3c62a2896	6b9a595d-2759-4158-89b2-ac8e54aa81bc	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYjA2MmRkOC03M2FjLTQyMzktOTFkMS04MWQzYzYyYTI4OTYiLCJmaXJtX2lkIjoiNmI5YTU5NWQtMjc1OS00MTU4LTg5YjItYWM4ZTU0YWE4MWJjIiwicm9sZSI6ImNvbHAiLCJ0eXBlIjoiYWNjZXNzIiwiaWF0IjoxNzc3NzM4ODQyLCJleHAiOjE3Nzc3Mzk3NDJ9.rxyO68zDX4JiIvkxJ9rTR0nZPE9tFulnL1exlGsrnH8	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYjA2MmRkOC03M2FjLTQyMzktOTFkMS04MWQzYzYyYTI4OTYiLCJmaXJtX2lkIjoiNmI5YTU5NWQtMjc1OS00MTU4LTg5YjItYWM4ZTU0YWE4MWJjIiwidHlwZSI6InJlZnJlc2giLCJpYXQiOjE3Nzc3Mzg4NDIsImV4cCI6MTc3ODM0MzY0Mn0.1ueXCDksTiZbBUDPEf0ZrYhV0eETtfopbmfV_RShjn4	192.168.65.1	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-05-09 16:20:42.75734	f	2026-05-02 16:20:42.497082
fc3a988f-82a1-46d8-8525-9c71130f8d6c	fb062dd8-73ac-4239-91d1-81d3c62a2896	6b9a595d-2759-4158-89b2-ac8e54aa81bc	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYjA2MmRkOC03M2FjLTQyMzktOTFkMS04MWQzYzYyYTI4OTYiLCJmaXJtX2lkIjoiNmI5YTU5NWQtMjc1OS00MTU4LTg5YjItYWM4ZTU0YWE4MWJjIiwicm9sZSI6ImNvbHAiLCJ0eXBlIjoiYWNjZXNzIiwiaWF0IjoxNzc3NzM5ODM1LCJleHAiOjE3Nzc3NDA3MzV9.0Kp1jSwRgA3GAIGZVAbHdEHcQnxSHrxlcLXbYQX1wmY	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYjA2MmRkOC03M2FjLTQyMzktOTFkMS04MWQzYzYyYTI4OTYiLCJmaXJtX2lkIjoiNmI5YTU5NWQtMjc1OS00MTU4LTg5YjItYWM4ZTU0YWE4MWJjIiwidHlwZSI6InJlZnJlc2giLCJpYXQiOjE3Nzc3Mzk4MzUsImV4cCI6MTc3ODM0NDYzNX0.Q9I0EpNyF2cPM4k8NYOGWHVsKreEiq3RXcjV04duJjs	\N	\N	2026-05-09 16:37:15.772156	t	2026-05-02 16:37:15.748465
98fd4b48-b4a7-47da-b2dd-d86c42c21e1c	fb062dd8-73ac-4239-91d1-81d3c62a2896	6b9a595d-2759-4158-89b2-ac8e54aa81bc	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYjA2MmRkOC03M2FjLTQyMzktOTFkMS04MWQzYzYyYTI4OTYiLCJmaXJtX2lkIjoiNmI5YTU5NWQtMjc1OS00MTU4LTg5YjItYWM4ZTU0YWE4MWJjIiwicm9sZSI6ImNvbHAiLCJ0eXBlIjoiYWNjZXNzIiwiaWF0IjoxNzc3NzM5ODU1LCJleHAiOjE3Nzc3NDA3NTV9.hrJqdarNGThwQl0cSzR-aWBWFlweNOFIG3IGmEoWGoM	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYjA2MmRkOC03M2FjLTQyMzktOTFkMS04MWQzYzYyYTI4OTYiLCJmaXJtX2lkIjoiNmI5YTU5NWQtMjc1OS00MTU4LTg5YjItYWM4ZTU0YWE4MWJjIiwidHlwZSI6InJlZnJlc2giLCJpYXQiOjE3Nzc3Mzk4NTUsImV4cCI6MTc3ODM0NDY1NX0.31zBdGaeOqTZYrpdRGkPdQpitQUi3pXNUCvDdAnL1g4	142.250.117.95	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-05-09 16:37:35.437314	f	2026-05-02 16:37:35.163989
9025ba5d-dec6-43ec-82fe-5ea4ad35a4f7	fb062dd8-73ac-4239-91d1-81d3c62a2896	6b9a595d-2759-4158-89b2-ac8e54aa81bc	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYjA2MmRkOC03M2FjLTQyMzktOTFkMS04MWQzYzYyYTI4OTYiLCJmaXJtX2lkIjoiNmI5YTU5NWQtMjc1OS00MTU4LTg5YjItYWM4ZTU0YWE4MWJjIiwicm9sZSI6ImNvbHAiLCJ0eXBlIjoiYWNjZXNzIiwiaWF0IjoxNzc3NzQxNDgxLCJleHAiOjE3Nzc3NDIzODF9.1amo0anXXzkYdKCkhpt8aKp3Z3WvBGzC4IU4JJNWq1o	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYjA2MmRkOC03M2FjLTQyMzktOTFkMS04MWQzYzYyYTI4OTYiLCJmaXJtX2lkIjoiNmI5YTU5NWQtMjc1OS00MTU4LTg5YjItYWM4ZTU0YWE4MWJjIiwidHlwZSI6InJlZnJlc2giLCJpYXQiOjE3Nzc3NDE0ODEsImV4cCI6MTc3ODM0NjI4MX0.Xjjfq7z_DFQSlLNlvthVMMJmtvlY9B6hVZbz5IoyU44	\N	\N	2026-05-09 17:04:41.789349	t	2026-05-02 17:04:41.667393
37323b72-19cf-4577-a787-d06376e52233	d0f3143f-3155-467f-a1bf-2a9f2e927203	9a9d5d03-156b-4f32-b669-c1762f1f5f16	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkMGYzMTQzZi0zMTU1LTQ2N2YtYTFiZi0yYTlmMmU5MjcyMDMiLCJmaXJtSWQiOiI5YTlkNWQwMy0xNTZiLTRmMzItYjY2OS1jMTc2MmYxZjVmMTYiLCJyb2xlIjoiY29scCIsImVtYWlsIjoicmxzdGVzdEBleGFtcGxlLmNvbSIsImlhdCI6MTc3ODM2NTM0MSwiZXhwIjoxNzc4MzY2MjQxfQ.MH2Lrf8v1QogkTm8ZOjy0COuiNncQLYEQgn2hYNPcTQ	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkMGYzMTQzZi0zMTU1LTQ2N2YtYTFiZi0yYTlmMmU5MjcyMDMiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc3ODM2NTM0MSwiZXhwIjoxNzc4OTcwMTQxfQ.ZSfpRarqWufj_Ej-xU3jA3m1sngLSSoMi_6830r96qY	::ffff:192.168.65.1	curl/8.4.0	2026-05-09 22:37:21.722	t	2026-05-09 22:22:21.765
c0b0cbab-573e-412c-a06d-c2438bb3cf59	d0f3143f-3155-467f-a1bf-2a9f2e927203	9a9d5d03-156b-4f32-b669-c1762f1f5f16	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkMGYzMTQzZi0zMTU1LTQ2N2YtYTFiZi0yYTlmMmU5MjcyMDMiLCJmaXJtSWQiOiI5YTlkNWQwMy0xNTZiLTRmMzItYjY2OS1jMTc2MmYxZjVmMTYiLCJyb2xlIjoiY29scCIsImVtYWlsIjoicmxzdGVzdEBleGFtcGxlLmNvbSIsImlhdCI6MTc3ODM2NTUwNSwiZXhwIjoxNzc4MzY2NDA1fQ.d5zJF77ZlOn4c6eoDQ_Bfz5JAm8m_RcJ_uN0vqTthHU	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkMGYzMTQzZi0zMTU1LTQ2N2YtYTFiZi0yYTlmMmU5MjcyMDMiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc3ODM2NTUwNSwiZXhwIjoxNzc4OTcwMzA1fQ.y593lIB7971H3jR29K0wmtVxgD43lHmjqbU6GSZUtmY	::ffff:192.168.65.1	curl/8.4.0	2026-05-09 22:40:05.906	t	2026-05-09 22:25:05.914
6c31aaf1-64b4-4414-a7d7-c8d13139bea1	d0f3143f-3155-467f-a1bf-2a9f2e927203	9a9d5d03-156b-4f32-b669-c1762f1f5f16	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkMGYzMTQzZi0zMTU1LTQ2N2YtYTFiZi0yYTlmMmU5MjcyMDMiLCJmaXJtSWQiOiI5YTlkNWQwMy0xNTZiLTRmMzItYjY2OS1jMTc2MmYxZjVmMTYiLCJyb2xlIjoiY29scCIsImVtYWlsIjoicmxzdGVzdEBleGFtcGxlLmNvbSIsImlhdCI6MTc3ODM2ODgzNywiZXhwIjoxNzc4MzY5NzM3fQ.fORgeCXKEZCxbQNaeNi6olxjAGXtl0ujd7S51qD0TTw	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkMGYzMTQzZi0zMTU1LTQ2N2YtYTFiZi0yYTlmMmU5MjcyMDMiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc3ODM2ODgzNywiZXhwIjoxNzc4OTczNjM3fQ.ENSTKLvtIKKK1CVihIZC-vq5jFYj1u7OfeHkPN7570k	::ffff:192.168.65.1	curl/8.4.0	2026-05-09 23:35:37.808	t	2026-05-09 23:20:37.821
864c429c-d778-4438-a2dd-36fbdeafd588	d0f3143f-3155-467f-a1bf-2a9f2e927203	9a9d5d03-156b-4f32-b669-c1762f1f5f16	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkMGYzMTQzZi0zMTU1LTQ2N2YtYTFiZi0yYTlmMmU5MjcyMDMiLCJmaXJtSWQiOiI5YTlkNWQwMy0xNTZiLTRmMzItYjY2OS1jMTc2MmYxZjVmMTYiLCJyb2xlIjoiY29scCIsImVtYWlsIjoicmxzdGVzdEBleGFtcGxlLmNvbSIsImlhdCI6MTc3ODM2OTc3NywiZXhwIjoxNzc4MzcwNjc3fQ.qUgEaFLMrvc3RZjxH4z4bO9X8L_3tvcG-WV11JzKz4U	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkMGYzMTQzZi0zMTU1LTQ2N2YtYTFiZi0yYTlmMmU5MjcyMDMiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc3ODM2OTc3NywiZXhwIjoxNzc4OTc0NTc3fQ.vQesA_TvIg7YZ9S05dpkwOiys8l93dQRPLR2ar2N93Q	::ffff:192.168.65.1	curl/8.4.0	2026-05-09 23:51:17.082	t	2026-05-09 23:36:17.092
581a5eed-78d6-47a4-9170-c28e76c281fb	d0f3143f-3155-467f-a1bf-2a9f2e927203	9a9d5d03-156b-4f32-b669-c1762f1f5f16	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkMGYzMTQzZi0zMTU1LTQ2N2YtYTFiZi0yYTlmMmU5MjcyMDMiLCJmaXJtSWQiOiI5YTlkNWQwMy0xNTZiLTRmMzItYjY2OS1jMTc2MmYxZjVmMTYiLCJyb2xlIjoiY29scCIsImVtYWlsIjoicmxzdGVzdEBleGFtcGxlLmNvbSIsImlhdCI6MTc3ODM3MDM4OSwiZXhwIjoxNzc4MzcxMjg5fQ.pzO7p7D3A_Zoq8gf_AOzTNHsGhmCAMZ5eE-3I-hdr48	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkMGYzMTQzZi0zMTU1LTQ2N2YtYTFiZi0yYTlmMmU5MjcyMDMiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc3ODM3MDM4OSwiZXhwIjoxNzc4OTc1MTg5fQ.KK9zxMgUncMEhTy1bkp8atQX8fr_IvBqdF5fkn6isxo	::ffff:192.168.65.1	curl/8.4.0	2026-05-10 00:01:29.73	t	2026-05-09 23:46:29.74
7e2d7a8c-11d0-4598-bf32-4b3d6704c615	82ac45e8-8968-4b78-b65b-71b55c77b970	1814e65e-ca48-4818-9158-20d8ab43b678	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI4MmFjNDVlOC04OTY4LTRiNzgtYjY1Yi03MWI1NWM3N2I5NzAiLCJmaXJtSWQiOiIxODE0ZTY1ZS1jYTQ4LTQ4MTgtOTE1OC0yMGQ4YWI0M2I2NzgiLCJyb2xlIjoiY29scCIsImVtYWlsIjoiZTJlLTE3NzgzNzQzMjk1NzRAc2VlbWEtdGVzdC5pbnZhbGlkIiwiaWF0IjoxNzc4Mzc0MzMwLCJleHAiOjE3NzgzNzUyMzB9.WwAR-cZxEZiPp0uI6HKxIU0e7UMM9GoEdFclnJTX27g	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI4MmFjNDVlOC04OTY4LTRiNzgtYjY1Yi03MWI1NWM3N2I5NzAiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc3ODM3NDMzMCwiZXhwIjoxNzc4OTc5MTMwfQ.8H8YIbJDw9flE05mdzk3d0H10U3RovkS1MDz_piZX9w	::ffff:192.168.65.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36	2026-05-10 01:07:10.503	t	2026-05-10 00:52:10.527
2fdf35db-b8b2-4adb-8039-1a996efaf7ef	1af206b9-9965-4c06-89e9-742973fc306f	2d08f3dc-cd8c-4c4c-8e66-86a35f5d1f82	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxYWYyMDZiOS05OTY1LTRjMDYtODllOS03NDI5NzNmYzMwNmYiLCJmaXJtSWQiOiIyZDA4ZjNkYy1jZDhjLTRjNGMtOGU2Ni04NmEzNWY1ZDFmODIiLCJyb2xlIjoiY29scCIsImVtYWlsIjoiZTJlLTE3NzgzNzQzMzkwODVAc2VlbWEtdGVzdC5pbnZhbGlkIiwiaWF0IjoxNzc4Mzc0MzM5LCJleHAiOjE3NzgzNzUyMzl9.ZouJ3OFx7ZA-F7FXTh8IyD9WAI9ofxthwZ7Iywmx8hI	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxYWYyMDZiOS05OTY1LTRjMDYtODllOS03NDI5NzNmYzMwNmYiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc3ODM3NDMzOSwiZXhwIjoxNzc4OTc5MTM5fQ.JX1CRedOhWKwhZI7d7ZmXpO84eMSrsRL4AS76udBfUw	::ffff:192.168.65.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36	2026-05-10 01:07:19.871	t	2026-05-10 00:52:19.878
d0ecad69-65e1-4f78-bf65-aa269b096d11	0a03279b-31dc-41b6-b8a0-9fcdcdc410b2	3bae1669-dbb7-4218-aa3e-371a19ede5ab	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIwYTAzMjc5Yi0zMWRjLTQxYjYtYjhhMC05ZmNkY2RjNDEwYjIiLCJmaXJtSWQiOiIzYmFlMTY2OS1kYmI3LTQyMTgtYWEzZS0zNzFhMTllZGU1YWIiLCJyb2xlIjoiY29scCIsImVtYWlsIjoiZTJlLTE3NzgzNzQzNTAwNDVAc2VlbWEtdGVzdC5pbnZhbGlkIiwiaWF0IjoxNzc4Mzc0MzUwLCJleHAiOjE3NzgzNzUyNTB9.1ZvuxS1Zu6NaqtSxXtgJcWnpTj34O_9kQFisRxZhOtI	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIwYTAzMjc5Yi0zMWRjLTQxYjYtYjhhMC05ZmNkY2RjNDEwYjIiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc3ODM3NDM1MCwiZXhwIjoxNzc4OTc5MTUwfQ.vDBgLSs-11BKLVIZdlBkHvyZ7IsSCPbHrZK1VC8-tQo	::ffff:192.168.65.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36	2026-05-10 01:07:30.342	t	2026-05-10 00:52:30.346
d2d49c84-2165-4e2b-a63a-2df4ed2d01ed	3690a137-6504-4830-9d8b-826e081f1fb5	9a0f8780-52dc-4b71-8ccd-907ae57019a6	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIzNjkwYTEzNy02NTA0LTQ4MzAtOWQ4Yi04MjZlMDgxZjFmYjUiLCJmaXJtSWQiOiI5YTBmODc4MC01MmRjLTRiNzEtOGNjZC05MDdhZTU3MDE5YTYiLCJyb2xlIjoiY29scCIsImVtYWlsIjoiZTJlLTE3NzgzNzQzNTkwMDZAc2VlbWEtdGVzdC5pbnZhbGlkIiwiaWF0IjoxNzc4Mzc0MzU5LCJleHAiOjE3NzgzNzUyNTl9.sd4KyUbu-OdnOdJ6IgOAsDFW8bhgVJmrOj9g3zo677o	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIzNjkwYTEzNy02NTA0LTQ4MzAtOWQ4Yi04MjZlMDgxZjFmYjUiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc3ODM3NDM1OSwiZXhwIjoxNzc4OTc5MTU5fQ.eAGqXAzA1P9Q8fHA0x471bRPwOykgMPz93FA0foiSj8	::ffff:192.168.65.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36	2026-05-10 01:07:39.424	t	2026-05-10 00:52:39.429
49149ee1-9ff6-43fe-aff5-0df43f2e82bb	9c1f368f-f195-4628-9ae3-649f63e34e14	5e741e37-4bb8-4720-af05-1b5de57c5ffd	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI5YzFmMzY4Zi1mMTk1LTQ2MjgtOWFlMy02NDlmNjNlMzRlMTQiLCJmaXJtSWQiOiI1ZTc0MWUzNy00YmI4LTQ3MjAtYWYwNS0xYjVkZTU3YzVmZmQiLCJyb2xlIjoiY29scCIsImVtYWlsIjoiZTJlLTE3NzgzNzQzNjMxNjJAc2VlbWEtdGVzdC5pbnZhbGlkIiwiaWF0IjoxNzc4Mzc0MzYzLCJleHAiOjE3NzgzNzUyNjN9.nw5ocxuGMD-zv0yOB5JZwrkUcYKpi07ayvOFlh_H_6Y	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI5YzFmMzY4Zi1mMTk1LTQ2MjgtOWFlMy02NDlmNjNlMzRlMTQiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc3ODM3NDM2MywiZXhwIjoxNzc4OTc5MTYzfQ.pmYYjVZebvPgJTb0MNtZGvIzPFOZ4e4oVxXhPZUouW4	::ffff:192.168.65.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36	2026-05-10 01:07:43.432	t	2026-05-10 00:52:43.436
2a13b6db-0cda-4347-ae4d-0e458a1a407c	1f621a12-4d09-4891-ae44-a49d16f2de26	420e3c1a-08cc-4beb-9a80-ecb49a904fa7	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxZjYyMWExMi00ZDA5LTQ4OTEtYWU0NC1hNDlkMTZmMmRlMjYiLCJmaXJtSWQiOiI0MjBlM2MxYS0wOGNjLTRiZWItOWE4MC1lY2I0OWE5MDRmYTciLCJyb2xlIjoiY29scCIsImVtYWlsIjoiZTJlLTE3NzgzNzQzNzE5NjBAc2VlbWEtdGVzdC5pbnZhbGlkIiwiaWF0IjoxNzc4Mzc0MzcyLCJleHAiOjE3NzgzNzUyNzJ9.yu-1s-v0yqFRDD65p362n_ZRhTenucLLGYACIAQRoQA	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxZjYyMWExMi00ZDA5LTQ4OTEtYWU0NC1hNDlkMTZmMmRlMjYiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc3ODM3NDM3MiwiZXhwIjoxNzc4OTc5MTcyfQ.O55-GoRV18jWcMJ0T9NRc1f3xWofnGFU8-oAhTMokrs	::ffff:192.168.65.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36	2026-05-10 01:07:52.344	t	2026-05-10 00:52:52.348
3307a18c-57e4-498f-95c8-98f18ed16ffa	d0c38c22-159d-4210-8acb-95c2b5c3b89c	5b221eee-59eb-42bb-84eb-41e616bf9394	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkMGMzOGMyMi0xNTlkLTQyMTAtOGFjYi05NWMyYjVjM2I4OWMiLCJmaXJtSWQiOiI1YjIyMWVlZS01OWViLTQyYmItODRlYi00MWU2MTZiZjkzOTQiLCJyb2xlIjoiY29scCIsImVtYWlsIjoiZTJlLTE3NzgzNzcyNzg2NDVAc2VlbWEtdGVzdC5pbnZhbGlkIiwiaWF0IjoxNzc4Mzc3Mjc5LCJleHAiOjE3NzgzNzgxNzl9.4jmYsBnPnkkPd2OnEQl2XtTQ39cwznaGjS8YEwU-SzA	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkMGMzOGMyMi0xNTlkLTQyMTAtOGFjYi05NWMyYjVjM2I4OWMiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc3ODM3NzI3OSwiZXhwIjoxNzc4OTgyMDc5fQ.9Y50VUYdOA4QD5X7HK__QOifauI-B7EmcNkV8PDoZDk	::ffff:192.168.65.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36	2026-05-10 01:56:19.696	t	2026-05-10 01:41:19.73
c2297d45-7de6-4c1b-a5f7-f4321a2f93e5	d0351d0e-6912-4254-bf67-8c15310de68d	55c16e48-c9f5-46e2-ae90-08cd05cb45d4	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkMDM1MWQwZS02OTEyLTQyNTQtYmY2Ny04YzE1MzEwZGU2OGQiLCJmaXJtSWQiOiI1NWMxNmU0OC1jOWY1LTQ2ZTItYWU5MC0wOGNkMDVjYjQ1ZDQiLCJyb2xlIjoiY29scCIsImVtYWlsIjoiZTJlLTE3NzgzNzcyODI4OTBAc2VlbWEtdGVzdC5pbnZhbGlkIiwiaWF0IjoxNzc4Mzc3MjgzLCJleHAiOjE3NzgzNzgxODN9.ct8_YoX1RBCiBvL8C6Xe2WwA_1qi6z28zIomO99kjwE	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkMDM1MWQwZS02OTEyLTQyNTQtYmY2Ny04YzE1MzEwZGU2OGQiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc3ODM3NzI4MywiZXhwIjoxNzc4OTgyMDgzfQ.tWq2YBvK_Qey1OT9uePsvVhmbH7OlrpomTC1nCDSfpo	::ffff:192.168.65.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36	2026-05-10 01:56:23.162	t	2026-05-10 01:41:23.17
cd0765d5-a59b-4028-9bb4-7327da931cda	9b51a778-75ea-474f-b0a8-7d72a73f157a	32775193-b10c-4969-962b-d867f55507b0	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI5YjUxYTc3OC03NWVhLTQ3NGYtYjBhOC03ZDcyYTczZjE1N2EiLCJmaXJtSWQiOiIzMjc3NTE5My1iMTBjLTQ5NjktOTYyYi1kODY3ZjU1NTA3YjAiLCJyb2xlIjoiY29scCIsImVtYWlsIjoiZTJlLTE3NzgzNzcyODY3NjRAc2VlbWEtdGVzdC5pbnZhbGlkIiwiaWF0IjoxNzc4Mzc3Mjg3LCJleHAiOjE3NzgzNzgxODd9._UYCr2xdNqI4dDRPiekPYo7gzNeDiTZ6h9t2cbR4swM	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI5YjUxYTc3OC03NWVhLTQ3NGYtYjBhOC03ZDcyYTczZjE1N2EiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc3ODM3NzI4NywiZXhwIjoxNzc4OTgyMDg3fQ.yhXyrztSFCWeT1MV3FnH2Ksr20SRXfNX6p3PLxXSqEM	::ffff:192.168.65.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36	2026-05-10 01:56:27.091	t	2026-05-10 01:41:27.098
f0f597cc-64e9-44eb-9e60-9d7c42777cb0	d94b197d-5b93-4049-984e-87326b98ca4c	68e33950-e766-4986-9695-f984e902318d	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkOTRiMTk3ZC01YjkzLTQwNDktOTg0ZS04NzMyNmI5OGNhNGMiLCJmaXJtSWQiOiI2OGUzMzk1MC1lNzY2LTQ5ODYtOTY5NS1mOTg0ZTkwMjMxOGQiLCJyb2xlIjoiY29scCIsImVtYWlsIjoiZTJlLTE3NzgzNzcyOTA2OTBAc2VlbWEtdGVzdC5pbnZhbGlkIiwiaWF0IjoxNzc4Mzc3MjkwLCJleHAiOjE3NzgzNzgxOTB9.SE2K42rgfhcJ4gu8gOt2hFcuBa5t2prUhJnrDGQN9es	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkOTRiMTk3ZC01YjkzLTQwNDktOTg0ZS04NzMyNmI5OGNhNGMiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc3ODM3NzI5MCwiZXhwIjoxNzc4OTgyMDkwfQ.BDxqhwq-xzrq4Ivp4kYfsgTMNzT5qj9Lbidp-HGv0hE	::ffff:192.168.65.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36	2026-05-10 01:56:30.964	t	2026-05-10 01:41:30.97
9dd126fe-a4cc-4334-86b1-e51d9a8c2a96	77d22ec3-fa94-4bde-9027-c57a379ab48a	e3198d39-6d17-48a8-99be-e9db448fe2e4	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI3N2QyMmVjMy1mYTk0LTRiZGUtOTAyNy1jNTdhMzc5YWI0OGEiLCJmaXJtSWQiOiJlMzE5OGQzOS02ZDE3LTQ4YTgtOTliZS1lOWRiNDQ4ZmUyZTQiLCJyb2xlIjoiY29scCIsImVtYWlsIjoiZTJlLTE3NzgzNzcyOTQwNTdAc2VlbWEtdGVzdC5pbnZhbGlkIiwiaWF0IjoxNzc4Mzc3Mjk0LCJleHAiOjE3NzgzNzgxOTR9.EZasbmDvt4M90AwCh22o8-4hF-4_yJsDRU1uUSJ6fNM	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI3N2QyMmVjMy1mYTk0LTRiZGUtOTAyNy1jNTdhMzc5YWI0OGEiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc3ODM3NzI5NCwiZXhwIjoxNzc4OTgyMDk0fQ.wWxqjJyfLHXgVOPJW8TyShwNrwOrFQ1FKRV9wVjg5a8	::ffff:192.168.65.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36	2026-05-10 01:56:34.317	t	2026-05-10 01:41:34.321
cde5d427-4dc2-4ba7-9a03-41b52249413e	7b04e693-e7e0-4677-aafc-59f45a0dab42	8a1e84c9-b66a-4d1f-85c2-5b58c0736e49	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI3YjA0ZTY5My1lN2UwLTQ2NzctYWFmYy01OWY0NWEwZGFiNDIiLCJmaXJtSWQiOiI4YTFlODRjOS1iNjZhLTRkMWYtODVjMi01YjU4YzA3MzZlNDkiLCJyb2xlIjoiY29scCIsImVtYWlsIjoiZTJlLTE3NzgzNzcyOTczMzdAc2VlbWEtdGVzdC5pbnZhbGlkIiwiaWF0IjoxNzc4Mzc3Mjk3LCJleHAiOjE3NzgzNzgxOTd9.1yyi70uXF_FDSQFbHw4EWTKHoMH-qhJZWyZltviKAvY	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI3YjA0ZTY5My1lN2UwLTQ2NzctYWFmYy01OWY0NWEwZGFiNDIiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc3ODM3NzI5NywiZXhwIjoxNzc4OTgyMDk3fQ.tTgBFYIr61HSUXrxDuumfGgDgCNLy4r1MnDp8N1v0EY	::ffff:192.168.65.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36	2026-05-10 01:56:37.573	t	2026-05-10 01:41:37.577
0c9efda9-df59-434a-b647-11d2393de85d	a7592aa7-95fb-461c-a577-bcebb464cebb	61592422-8ee7-4be7-bcc9-8b3598ac7ef8	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhNzU5MmFhNy05NWZiLTQ2MWMtYTU3Ny1iY2ViYjQ2NGNlYmIiLCJmaXJtSWQiOiI2MTU5MjQyMi04ZWU3LTRiZTctYmNjOS04YjM1OThhYzdlZjgiLCJyb2xlIjoiY29scCIsImVtYWlsIjoiZTJlLTE3NzgzNzc4ODk3NjZAc2VlbWEtdGVzdC5pbnZhbGlkIiwiaWF0IjoxNzc4Mzc3ODkwLCJleHAiOjE3NzgzNzg3OTB9.eL5awYHWrpOE2WjDFfh5SirpT7aRQgFr2KZBjlzy3A0	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhNzU5MmFhNy05NWZiLTQ2MWMtYTU3Ny1iY2ViYjQ2NGNlYmIiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc3ODM3Nzg5MCwiZXhwIjoxNzc4OTgyNjkwfQ._bkT68nfB2l5SPh__3f2CXl1EFZ942XRnD41AXfEz04	::ffff:192.168.65.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36	2026-05-10 02:06:30.045	t	2026-05-10 01:51:30.048
61fde09e-ff3e-4a45-a6c2-e51c7c9e3747	17e10c05-da16-4051-9282-83d95b7b7708	96b87309-1d53-4446-a063-2a39f81827ef	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxN2UxMGMwNS1kYTE2LTQwNTEtOTI4Mi04M2Q5NWI3Yjc3MDgiLCJmaXJtSWQiOiI5NmI4NzMwOS0xZDUzLTQ0NDYtYTA2My0yYTM5ZjgxODI3ZWYiLCJyb2xlIjoiY29scCIsImVtYWlsIjoiZTJlLTE3NzgzNzc5MDQxNTdAc2VlbWEtdGVzdC5pbnZhbGlkIiwiaWF0IjoxNzc4Mzc3OTA0LCJleHAiOjE3NzgzNzg4MDR9.Up9jkB3cCXXEPwFzh--GMlMxbCbEWDAdp2ETNbhnhRw	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxN2UxMGMwNS1kYTE2LTQwNTEtOTI4Mi04M2Q5NWI3Yjc3MDgiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc3ODM3NzkwNCwiZXhwIjoxNzc4OTgyNzA0fQ.0QQqldGbmc32ofLXFsNinF-D-kcyCuixC1Eh2kyysHk	::ffff:192.168.65.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36	2026-05-10 02:06:44.535	t	2026-05-10 01:51:44.542
3a484197-deef-48ae-b9d9-b50bcf79b1f5	c045c817-cd2f-4c83-8e4c-81775abaf8a1	de3db366-af99-46d1-bf9f-660ab805b326	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJjMDQ1YzgxNy1jZDJmLTRjODMtOGU0Yy04MTc3NWFiYWY4YTEiLCJmaXJtSWQiOiJkZTNkYjM2Ni1hZjk5LTQ2ZDEtYmY5Zi02NjBhYjgwNWIzMjYiLCJyb2xlIjoiY29scCIsImVtYWlsIjoiZTJlLTE3NzgzNzc5MTc3MTNAc2VlbWEtdGVzdC5pbnZhbGlkIiwiaWF0IjoxNzc4Mzc3OTE3LCJleHAiOjE3NzgzNzg4MTd9.rwMxBx8pbv2sEuPJcMgU_WjREl3Wcgg-aw-YIFjQqew	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJjMDQ1YzgxNy1jZDJmLTRjODMtOGU0Yy04MTc3NWFiYWY4YTEiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc3ODM3NzkxNywiZXhwIjoxNzc4OTgyNzE3fQ.JjOJYnURi4qitfhLlzE4ClKFKEuygpQ9q9SQycxobkw	::ffff:192.168.65.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36	2026-05-10 02:06:57.997	t	2026-05-10 01:51:58.001
982b1d2b-d9f1-4c52-b59e-f89316a5181c	d473ddc2-5320-434e-8b6a-ec4a8b4c6917	c9464eb8-0ba9-43bf-bb08-eb3f4bf06345	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkNDczZGRjMi01MzIwLTQzNGUtOGI2YS1lYzRhOGI0YzY5MTciLCJmaXJtSWQiOiJjOTQ2NGViOC0wYmE5LTQzYmYtYmIwOC1lYjNmNGJmMDYzNDUiLCJyb2xlIjoiY29scCIsImVtYWlsIjoiZTJlLTE3NzgzNzc5MzE1MDZAc2VlbWEtdGVzdC5pbnZhbGlkIiwiaWF0IjoxNzc4Mzc3OTMxLCJleHAiOjE3NzgzNzg4MzF9.QS-bAXc-3vDcmS4Hb916k0A8wGb-BuZAWvwO-RkRojY	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkNDczZGRjMi01MzIwLTQzNGUtOGI2YS1lYzRhOGI0YzY5MTciLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc3ODM3NzkzMSwiZXhwIjoxNzc4OTgyNzMxfQ.gp99nerQEO8hEuq-1sJhR3XMunj8bINLGop2koujeS0	::ffff:192.168.65.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36	2026-05-10 02:07:11.767	t	2026-05-10 01:52:11.773
1a99aa13-c0ff-44f6-848a-b45dd313ee18	7ddcd005-c93e-4e74-a3c5-c12eac959577	a0072f02-9953-427f-914a-9c5e613cb932	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI3ZGRjZDAwNS1jOTNlLTRlNzQtYTNjNS1jMTJlYWM5NTk1NzciLCJmaXJtSWQiOiJhMDA3MmYwMi05OTUzLTQyN2YtOTE0YS05YzVlNjEzY2I5MzIiLCJyb2xlIjoiY29scCIsImVtYWlsIjoiZTJlLXNoYXJlZC0xNzc4MzgyNDMwNjgxQHNlZW1hLXRlc3QuaW52YWxpZCIsImlhdCI6MTc3ODM4MjQzMiwiZXhwIjoxNzc4MzgzMzMyfQ.j8xWnOSYjWITULY25l5NlfHSF67jpXUZtnkW-vanSlc	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI3ZGRjZDAwNS1jOTNlLTRlNzQtYTNjNS1jMTJlYWM5NTk1NzciLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc3ODM4MjQzMiwiZXhwIjoxNzc4OTg3MjMyfQ.sGdl34yP061yp9WXXCoOcMGd16in9XmBitguUQAyYtI	::ffff:172.18.0.1	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-05-10 03:22:12.678	t	2026-05-10 03:07:12.734
f1a0b79a-1f14-49a8-ba63-371ece1503b2	a9bd802a-8f25-42a3-8ab0-8d41bf0fc2e3	1fe69a96-8e10-47bc-9113-0fa1a503562b	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhOWJkODAyYS04ZjI1LTQyYTMtOGFiMC04ZDQxYmYwZmMyZTMiLCJmaXJtSWQiOiIxZmU2OWE5Ni04ZTEwLTQ3YmMtOTExMy0wZmExYTUwMzU2MmIiLCJyb2xlIjoiY29scCIsImVtYWlsIjoiZTJlLXNoYXJlZC0xNzc4NDI3MjA3MjcyQHNlZW1hLXRlc3QuaW52YWxpZCIsImlhdCI6MTc3ODQyNzIwOCwiZXhwIjoxNzc4NDI4MTA4fQ.mbAAO7kU49MVEljkZv6bVwC54oFQS_p1iWYX7UFsWW0	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhOWJkODAyYS04ZjI1LTQyYTMtOGFiMC04ZDQxYmYwZmMyZTMiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc3ODQyNzIwOCwiZXhwIjoxNzc5MDMyMDA4fQ.KqLhzCFWXr2wo6XZsOUPXKSs4KT3xFHsNpD5JfV7N3k	::ffff:172.18.0.1	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-05-10 15:48:28.936	t	2026-05-10 15:33:28.951
30d23ade-1b30-4c7f-8cd9-7868dd8b939b	94ef9cdd-4241-4cca-b036-d75ec7b0a253	c8770b56-8e6b-4ed2-8f4f-8d4e5b4ef4e3	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI5NGVmOWNkZC00MjQxLTRjY2EtYjAzNi1kNzVlYzdiMGEyNTMiLCJmaXJtSWQiOiJjODc3MGI1Ni04ZTZiLTRlZDItOGY0Zi04ZDRlNWI0ZWY0ZTMiLCJyb2xlIjoiY29scCIsImVtYWlsIjoiZTJlLXNoYXJlZC0xNzc4NDI3NTA2MTYzQHNlZW1hLXRlc3QuaW52YWxpZCIsImlhdCI6MTc3ODQyNzUyMywiZXhwIjoxNzc4NDI4NDIzfQ.gy3aBxEkvJLNhiXu4ld4pnNB3IqVY_cB71ZA0BA43eg	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI5NGVmOWNkZC00MjQxLTRjY2EtYjAzNi1kNzVlYzdiMGEyNTMiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc3ODQyNzUwNywiZXhwIjoxNzc5MDMyMzA3fQ.5Sf1kLaYabYaevvDaqYGhbL4PuGJtD0Oda2LJvmq-bE	::ffff:172.18.0.1	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-05-10 15:53:43.434	t	2026-05-10 15:38:27.335
ed9286ed-3a06-4a8a-9df9-75f4b08a8c95	94ef9cdd-4241-4cca-b036-d75ec7b0a253	c8770b56-8e6b-4ed2-8f4f-8d4e5b4ef4e3	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI5NGVmOWNkZC00MjQxLTRjY2EtYjAzNi1kNzVlYzdiMGEyNTMiLCJmaXJtSWQiOiJjODc3MGI1Ni04ZTZiLTRlZDItOGY0Zi04ZDRlNWI0ZWY0ZTMiLCJyb2xlIjoiY29scCIsImVtYWlsIjoiZTJlLXNoYXJlZC0xNzc4NDI3NTA2MTYzQHNlZW1hLXRlc3QuaW52YWxpZCIsImlhdCI6MTc3ODQyNzcxNywiZXhwIjoxNzc4NDI4NjE3fQ.iepvjytFWdIIELiIMei31EKwy-OkMisDJH0o8G8Xz9c	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI5NGVmOWNkZC00MjQxLTRjY2EtYjAzNi1kNzVlYzdiMGEyNTMiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc3ODQyNzcxNywiZXhwIjoxNzc5MDMyNTE3fQ.PPOYb4N2r0Y97DSj-tvh0G7RfOh0o74_j2MkpR_S7Bk	::ffff:172.18.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36	2026-05-10 15:56:57.849	t	2026-05-10 15:41:57.852
891a1768-4320-43d3-90fb-bcf7d7178a04	4a668e05-9da2-42b5-b3ec-8eb170860e81	b70d78ae-681f-4e51-9990-6d8871dbdd04	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI0YTY2OGUwNS05ZGEyLTQyYjUtYjNlYy04ZWIxNzA4NjBlODEiLCJmaXJtSWQiOiJiNzBkNzhhZS02ODFmLTRlNTEtOTk5MC02ZDg4NzFkYmRkMDQiLCJyb2xlIjoiY29scCIsImVtYWlsIjoiZTJlLXNoYXJlZC0xNzc4NDMwMDY1OTQ2QHNlZW1hLXRlc3QuaW52YWxpZCIsImlhdCI6MTc3ODQzMDA4OSwiZXhwIjoxNzc4NDMwOTg5fQ.RftnASSWrbO0iX74sIexbA7TnGNqkpkEJ4n2JCe8bvQ	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI0YTY2OGUwNS05ZGEyLTQyYjUtYjNlYy04ZWIxNzA4NjBlODEiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc3ODQzMDA2NywiZXhwIjoxNzc5MDM0ODY3fQ.yg4FzqiyVYcBI-r2atBF-wPWDn6AlTVVExc-f7I6as8	::ffff:172.18.0.1	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-05-10 16:36:29.968	t	2026-05-10 16:21:07.096
cd20ce73-c2fc-44c1-b9de-ea058e8616c2	4a668e05-9da2-42b5-b3ec-8eb170860e81	b70d78ae-681f-4e51-9990-6d8871dbdd04	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI0YTY2OGUwNS05ZGEyLTQyYjUtYjNlYy04ZWIxNzA4NjBlODEiLCJmaXJtSWQiOiJiNzBkNzhhZS02ODFmLTRlNTEtOTk5MC02ZDg4NzFkYmRkMDQiLCJyb2xlIjoiY29scCIsImVtYWlsIjoiZTJlLXNoYXJlZC0xNzc4NDMwMDY1OTQ2QHNlZW1hLXRlc3QuaW52YWxpZCIsImlhdCI6MTc3ODQzMDEwOSwiZXhwIjoxNzc4NDMxMDA5fQ.eR52_kwROFAOLP8ta8e7A0h_-8qoVyD29aIWVR9woyI	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI0YTY2OGUwNS05ZGEyLTQyYjUtYjNlYy04ZWIxNzA4NjBlODEiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc3ODQzMDEwOSwiZXhwIjoxNzc5MDM0OTA5fQ.YACWxuHNmTJt5z2Drj6QyNIfyx-gugi5oDBdOYV2UQs	::ffff:172.18.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Safari/537.36	2026-05-10 16:36:49.833	t	2026-05-10 16:21:49.837
0c96bbd2-e06a-48db-8da0-5d126756c834	dec80d89-44d8-4799-b75f-ec43c7ed7bb7	11902720-5ef3-4bb5-ab6a-03832b32c725	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkZWM4MGQ4OS00NGQ4LTQ3OTktYjc1Zi1lYzQzYzdlZDdiYjciLCJmaXJtSWQiOiIxMTkwMjcyMC01ZWYzLTRiYjUtYWI2YS0wMzgzMmIzMmM3MjUiLCJyb2xlIjoiY29scCIsImVtYWlsIjoiZTJlLXNoYXJlZC0xNzc4NDMwODQ5NTc4QHNlZW1hLXRlc3QuaW52YWxpZCIsImlhdCI6MTc3ODQzMDg1MCwiZXhwIjoxNzc4NDMxNzUwfQ.KV6Ur9o99_0VbML34n16tQqzkL7J0jhdI5h2WKi78TE	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkZWM4MGQ4OS00NGQ4LTQ3OTktYjc1Zi1lYzQzYzdlZDdiYjciLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc3ODQzMDg1MCwiZXhwIjoxNzc5MDM1NjUwfQ.YWBrjxaLyZQm9myFJTq9em949-Ia7wNZjKM714neGjA	::ffff:172.18.0.1	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/147.0.7727.15 Safari/537.36	2026-05-10 16:49:10.93	t	2026-05-10 16:34:10.934
3149fc81-29c8-44b4-97f2-a51e00ecd85d	01ba1012-3314-44c2-8b64-ed43591727e0	f340a016-069e-4cda-a81e-6b0788e08673	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIwMWJhMTAxMi0zMzE0LTQ0YzItOGI2NC1lZDQzNTkxNzI3ZTAiLCJmaXJtSWQiOiJmMzQwYTAxNi0wNjllLTRjZGEtYTgxZS02YjA3ODhlMDg2NzMiLCJyb2xlIjoiY29scCIsImVtYWlsIjoiZTJlLXNoYXJlZC0xNzc4NDMxMzU5MzkwQHNlZW1hLXRlc3QuaW52YWxpZCIsImlhdCI6MTc3ODQzMTM2MCwiZXhwIjoxNzc4NDMyMjYwfQ.DxEEOhsSO0BUv6_xesQCBhEQ5DW_oFRjZB3id6Pz0L8	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIwMWJhMTAxMi0zMzE0LTQ0YzItOGI2NC1lZDQzNTkxNzI3ZTAiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc3ODQzMTM2MCwiZXhwIjoxNzc5MDM2MTYwfQ.bO8mh43KYV05pmCwIDE6Z7PLbiu5T66xiNU4askKlwU	::ffff:172.18.0.1	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/147.0.7727.15 Safari/537.36	2026-05-10 16:57:40.343	t	2026-05-10 16:42:40.352
cb580e76-d81d-4f1a-9189-b64aad4ca03d	8d519c5a-5663-4a0d-9025-615e99d28e14	3c041e01-9d26-429e-b22c-fcb4e852500d	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI4ZDUxOWM1YS01NjYzLTRhMGQtOTAyNS02MTVlOTlkMjhlMTQiLCJmaXJtSWQiOiIzYzA0MWUwMS05ZDI2LTQyOWUtYjIyYy1mY2I0ZTg1MjUwMGQiLCJyb2xlIjoiY29scCIsImVtYWlsIjoic21va2V0ZXN0QHNlZW1hLXRlc3QuaW52YWxpZCIsImlhdCI6MTc3ODQzMzkzNiwiZXhwIjoxNzc4NDM0ODM2fQ.hhyB6rg5oDjtJOOtPT3dG4v8Pme2K_dupyQtm77Sgpo	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI4ZDUxOWM1YS01NjYzLTRhMGQtOTAyNS02MTVlOTlkMjhlMTQiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc3ODQzMzkzNiwiZXhwIjoxNzc5MDM4NzM2fQ.obwFq0qjmezHnv9_akGzpCmT_4dWeWVtATiu48e0PVY	::ffff:172.18.0.1	curl/8.4.0	2026-05-10 17:40:36.046	t	2026-05-10 17:25:36.07
5647b53e-a7e5-4f4e-b6d1-fa4a21b3374b	8d519c5a-5663-4a0d-9025-615e99d28e14	3c041e01-9d26-429e-b22c-fcb4e852500d	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI4ZDUxOWM1YS01NjYzLTRhMGQtOTAyNS02MTVlOTlkMjhlMTQiLCJmaXJtSWQiOiIzYzA0MWUwMS05ZDI2LTQyOWUtYjIyYy1mY2I0ZTg1MjUwMGQiLCJyb2xlIjoiY29scCIsImVtYWlsIjoic21va2V0ZXN0QHNlZW1hLXRlc3QuaW52YWxpZCIsImlhdCI6MTc3ODQzNDE2NSwiZXhwIjoxNzc4NDM1MDY1fQ.a-QdE-qG01yc1arrQgzfx1TAmM_OiXZb2xQYwotP1oo	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI4ZDUxOWM1YS01NjYzLTRhMGQtOTAyNS02MTVlOTlkMjhlMTQiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc3ODQzNDAyOCwiZXhwIjoxNzc5MDM4ODI4fQ.bIRnc2Oyw4BhQSYpKc6RhmravzkhnnFgpdsKtK3vtqk	::ffff:172.18.0.1	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-05-10 17:44:25.312	t	2026-05-10 17:27:08.324
70978d93-910d-4247-ba9c-c501682775c2	8d519c5a-5663-4a0d-9025-615e99d28e14	3c041e01-9d26-429e-b22c-fcb4e852500d	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI4ZDUxOWM1YS01NjYzLTRhMGQtOTAyNS02MTVlOTlkMjhlMTQiLCJmaXJtSWQiOiIzYzA0MWUwMS05ZDI2LTQyOWUtYjIyYy1mY2I0ZTg1MjUwMGQiLCJyb2xlIjoiY29scCIsImVtYWlsIjoic21va2V0ZXN0QHNlZW1hLXRlc3QuaW52YWxpZCIsImlhdCI6MTc3ODQzNTE5OSwiZXhwIjoxNzc4NDM2MDk5fQ.iRGlRs5TxG8bNp2Pcy67kVnTe_4_WVg9ld89ipbLa7I	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI4ZDUxOWM1YS01NjYzLTRhMGQtOTAyNS02MTVlOTlkMjhlMTQiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc3ODQzNTA4NSwiZXhwIjoxNzc5MDM5ODg1fQ.4yOewqaUpUDLqhNsSAYLUk5ebU6l5drr_MVkIvMOGN8	::ffff:172.18.0.1	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-05-10 18:01:39.76	t	2026-05-10 17:44:45.585
0f0a2c22-8a21-4c2d-9af9-ea262cac8275	8d519c5a-5663-4a0d-9025-615e99d28e14	3c041e01-9d26-429e-b22c-fcb4e852500d	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI4ZDUxOWM1YS01NjYzLTRhMGQtOTAyNS02MTVlOTlkMjhlMTQiLCJmaXJtSWQiOiIzYzA0MWUwMS05ZDI2LTQyOWUtYjIyYy1mY2I0ZTg1MjUwMGQiLCJyb2xlIjoiY29scCIsImVtYWlsIjoic21va2V0ZXN0QHNlZW1hLXRlc3QuaW52YWxpZCIsImlhdCI6MTc3ODQzNjAwNCwiZXhwIjoxNzc4NDM2OTA0fQ.8GJFFz2BnBPp-7xitN4apdEprwskyTF3dJyCws6RwCk	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI4ZDUxOWM1YS01NjYzLTRhMGQtOTAyNS02MTVlOTlkMjhlMTQiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc3ODQzNTg2OSwiZXhwIjoxNzc5MDQwNjY5fQ.2poLjhtT4PdNLh1poSfFV093KJrgU2-5o3jKyWeoFrc	::ffff:172.18.0.1	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-05-10 18:15:04.714	t	2026-05-10 17:57:49.178
eb0773e7-c68a-4c1a-be40-0a42a25dfa5c	8d519c5a-5663-4a0d-9025-615e99d28e14	3c041e01-9d26-429e-b22c-fcb4e852500d	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4ZDUxOWM1YS01NjYzLTRhMGQtOTAyNS02MTVlOTlkMjhlMTQiLCJmaXJtX2lkIjoiM2MwNDFlMDEtOWQyNi00MjllLWIyMmMtZmNiNGU4NTI1MDBkIiwidHlwZSI6ImFjY2VzcyIsInVzZXJJZCI6IjhkNTE5YzVhLTU2NjMtNGEwZC05MDI1LTYxNWU5OWQyOGUxNCIsImZpcm1JZCI6IjNjMDQxZTAxLTlkMjYtNDI5ZS1iMjJjLWZjYjRlODUyNTAwZCIsInJvbGUiOiJjb2xwIiwiZW1haWwiOiJzbW9rZXRlc3RAc2VlbWEtdGVzdC5pbnZhbGlkIiwiaWF0IjoxNzc4NDQyNjc2LCJleHAiOjE3Nzg0NDM1NzZ9.H6X_P3Xmik5M8fuJ7XknjsyMAbCD-hkL8TJLxq8DaOw	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4ZDUxOWM1YS01NjYzLTRhMGQtOTAyNS02MTVlOTlkMjhlMTQiLCJ1c2VySWQiOiI4ZDUxOWM1YS01NjYzLTRhMGQtOTAyNS02MTVlOTlkMjhlMTQiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc3ODQzOTYzNiwiZXhwIjoxNzc5MDQ0NDM2fQ.zmCV3p2Rpd1_WCXonODU6XXc2mgpnJnSXwSSzVfcn_I	::ffff:172.18.0.1	Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36	2026-05-10 20:06:16.351	t	2026-05-10 19:00:36.243
\.


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: breach_reports breach_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.breach_reports
    ADD CONSTRAINT breach_reports_pkey PRIMARY KEY (id);


--
-- Name: cdd_records cdd_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cdd_records
    ADD CONSTRAINT cdd_records_pkey PRIMARY KEY (id);


--
-- Name: chaser_logs chaser_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chaser_logs
    ADD CONSTRAINT chaser_logs_pkey PRIMARY KEY (id);


--
-- Name: client_accounts client_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_accounts
    ADD CONSTRAINT client_accounts_pkey PRIMARY KEY (id);


--
-- Name: client_intakes client_intakes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_intakes
    ADD CONSTRAINT client_intakes_pkey PRIMARY KEY (id);


--
-- Name: complaints complaints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_pkey PRIMARY KEY (id);


--
-- Name: compliance_alerts compliance_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_alerts
    ADD CONSTRAINT compliance_alerts_pkey PRIMARY KEY (id);


--
-- Name: compliance_checks compliance_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_checks
    ADD CONSTRAINT compliance_checks_pkey PRIMARY KEY (id);


--
-- Name: compliance_scan_results compliance_scan_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_scan_results
    ADD CONSTRAINT compliance_scan_results_pkey PRIMARY KEY (id);


--
-- Name: compliance_tasks compliance_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_tasks
    ADD CONSTRAINT compliance_tasks_pkey PRIMARY KEY (id);


--
-- Name: conflict_checks conflict_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conflict_checks
    ADD CONSTRAINT conflict_checks_pkey PRIMARY KEY (id);


--
-- Name: conflict_parties conflict_parties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conflict_parties
    ADD CONSTRAINT conflict_parties_pkey PRIMARY KEY (id);


--
-- Name: deadlines deadlines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deadlines
    ADD CONSTRAINT deadlines_pkey PRIMARY KEY (id);


--
-- Name: email_queue email_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_queue
    ADD CONSTRAINT email_queue_pkey PRIMARY KEY (id);


--
-- Name: email_templates email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);


--
-- Name: evidence_documents evidence_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidence_documents
    ADD CONSTRAINT evidence_documents_pkey PRIMARY KEY (id);


--
-- Name: firms firms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.firms
    ADD CONSTRAINT firms_pkey PRIMARY KEY (id);


--
-- Name: firms firms_sra_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.firms
    ADD CONSTRAINT firms_sra_number_key UNIQUE (sra_number);


--
-- Name: import_history import_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_history
    ADD CONSTRAINT import_history_pkey PRIMARY KEY (id);


--
-- Name: integration_sync_logs integration_sync_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_sync_logs
    ADD CONSTRAINT integration_sync_logs_pkey PRIMARY KEY (id);


--
-- Name: integrations integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_pkey PRIMARY KEY (id);


--
-- Name: key_dates key_dates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.key_dates
    ADD CONSTRAINT key_dates_pkey PRIMARY KEY (id);


--
-- Name: matter_items matter_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matter_items
    ADD CONSTRAINT matter_items_pkey PRIMARY KEY (id);


--
-- Name: matters matters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matters
    ADD CONSTRAINT matters_pkey PRIMARY KEY (id);


--
-- Name: matters matters_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matters
    ADD CONSTRAINT matters_reference_key UNIQUE (reference);


--
-- Name: policy_documents policy_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_documents
    ADD CONSTRAINT policy_documents_pkey PRIMARY KEY (id);


--
-- Name: reconciliations reconciliations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reconciliations
    ADD CONSTRAINT reconciliations_pkey PRIMARY KEY (id);


--
-- Name: regulatory_interpretations regulatory_interpretations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regulatory_interpretations
    ADD CONSTRAINT regulatory_interpretations_pkey PRIMARY KEY (id);


--
-- Name: regulatory_updates regulatory_updates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regulatory_updates
    ADD CONSTRAINT regulatory_updates_pkey PRIMARY KEY (id);


--
-- Name: remediation_plans remediation_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remediation_plans
    ADD CONSTRAINT remediation_plans_pkey PRIMARY KEY (id);


--
-- Name: risk_scores risk_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_scores
    ADD CONSTRAINT risk_scores_pkey PRIMARY KEY (id);


--
-- Name: sar_records sar_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sar_records
    ADD CONSTRAINT sar_records_pkey PRIMARY KEY (id);


--
-- Name: sra_audit_items sra_audit_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sra_audit_items
    ADD CONSTRAINT sra_audit_items_pkey PRIMARY KEY (id);


--
-- Name: sra_feed_log sra_feed_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sra_feed_log
    ADD CONSTRAINT sra_feed_log_pkey PRIMARY KEY (id);


--
-- Name: staff_members staff_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_members
    ADD CONSTRAINT staff_members_pkey PRIMARY KEY (id);


--
-- Name: staff_training staff_training_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_training
    ADD CONSTRAINT staff_training_pkey PRIMARY KEY (id);


--
-- Name: supervision_records supervision_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supervision_records
    ADD CONSTRAINT supervision_records_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: undertakings undertakings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.undertakings
    ADD CONSTRAINT undertakings_pkey PRIMARY KEY (id);


--
-- Name: user_accounts user_accounts_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_accounts
    ADD CONSTRAINT user_accounts_email_key UNIQUE (email);


--
-- Name: user_accounts user_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_accounts
    ADD CONSTRAINT user_accounts_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_refresh_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_refresh_token_key UNIQUE (refresh_token);


--
-- Name: user_sessions user_sessions_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_token_key UNIQUE (token);


--
-- Name: ix_audit_logs_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_logs_firm_id ON public.audit_logs USING btree (firm_id);


--
-- Name: ix_breach_reports_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_breach_reports_firm_id ON public.breach_reports USING btree (firm_id);


--
-- Name: ix_cdd_records_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_cdd_records_firm_id ON public.cdd_records USING btree (firm_id);


--
-- Name: ix_chaser_logs_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_chaser_logs_firm_id ON public.chaser_logs USING btree (firm_id);


--
-- Name: ix_client_accounts_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_client_accounts_firm_id ON public.client_accounts USING btree (firm_id);


--
-- Name: ix_client_intakes_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_client_intakes_firm_id ON public.client_intakes USING btree (firm_id);


--
-- Name: ix_complaints_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_complaints_firm_id ON public.complaints USING btree (firm_id);


--
-- Name: ix_compliance_alerts_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_compliance_alerts_firm_id ON public.compliance_alerts USING btree (firm_id);


--
-- Name: ix_compliance_checks_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_compliance_checks_firm_id ON public.compliance_checks USING btree (firm_id);


--
-- Name: ix_compliance_scan_results_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_compliance_scan_results_firm_id ON public.compliance_scan_results USING btree (firm_id);


--
-- Name: ix_compliance_tasks_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_compliance_tasks_firm_id ON public.compliance_tasks USING btree (firm_id);


--
-- Name: ix_conflict_checks_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_conflict_checks_firm_id ON public.conflict_checks USING btree (firm_id);


--
-- Name: ix_conflict_parties_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_conflict_parties_firm_id ON public.conflict_parties USING btree (firm_id);


--
-- Name: ix_deadlines_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_deadlines_firm_id ON public.deadlines USING btree (firm_id);


--
-- Name: ix_email_queue_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_email_queue_firm_id ON public.email_queue USING btree (firm_id);


--
-- Name: ix_email_templates_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_email_templates_firm_id ON public.email_templates USING btree (firm_id);


--
-- Name: ix_evidence_documents_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_evidence_documents_firm_id ON public.evidence_documents USING btree (firm_id);


--
-- Name: ix_import_history_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_import_history_firm_id ON public.import_history USING btree (firm_id);


--
-- Name: ix_integration_sync_logs_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_integration_sync_logs_firm_id ON public.integration_sync_logs USING btree (firm_id);


--
-- Name: ix_integration_sync_logs_integration_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_integration_sync_logs_integration_id ON public.integration_sync_logs USING btree (integration_id);


--
-- Name: ix_integrations_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_integrations_firm_id ON public.integrations USING btree (firm_id);


--
-- Name: ix_key_dates_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_key_dates_firm_id ON public.key_dates USING btree (firm_id);


--
-- Name: ix_matter_items_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_matter_items_firm_id ON public.matter_items USING btree (firm_id);


--
-- Name: ix_matters_external_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_matters_external_ref ON public.matters USING btree (external_ref);


--
-- Name: ix_matters_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_matters_firm_id ON public.matters USING btree (firm_id);


--
-- Name: ix_policy_documents_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_policy_documents_firm_id ON public.policy_documents USING btree (firm_id);


--
-- Name: ix_reconciliations_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_reconciliations_firm_id ON public.reconciliations USING btree (firm_id);


--
-- Name: ix_regulatory_interpretations_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_regulatory_interpretations_firm_id ON public.regulatory_interpretations USING btree (firm_id);


--
-- Name: ix_regulatory_interpretations_update_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_regulatory_interpretations_update_id ON public.regulatory_interpretations USING btree (update_id);


--
-- Name: ix_regulatory_updates_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_regulatory_updates_firm_id ON public.regulatory_updates USING btree (firm_id);


--
-- Name: ix_remediation_plans_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_remediation_plans_firm_id ON public.remediation_plans USING btree (firm_id);


--
-- Name: ix_risk_scores_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_risk_scores_firm_id ON public.risk_scores USING btree (firm_id);


--
-- Name: ix_sar_records_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_sar_records_firm_id ON public.sar_records USING btree (firm_id);


--
-- Name: ix_sra_audit_items_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_sra_audit_items_firm_id ON public.sra_audit_items USING btree (firm_id);


--
-- Name: ix_staff_members_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_staff_members_firm_id ON public.staff_members USING btree (firm_id);


--
-- Name: ix_staff_training_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_staff_training_firm_id ON public.staff_training USING btree (firm_id);


--
-- Name: ix_supervision_records_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_supervision_records_firm_id ON public.supervision_records USING btree (firm_id);


--
-- Name: ix_transactions_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_transactions_firm_id ON public.transactions USING btree (firm_id);


--
-- Name: ix_undertakings_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_undertakings_firm_id ON public.undertakings USING btree (firm_id);


--
-- Name: ix_user_accounts_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_user_accounts_firm_id ON public.user_accounts USING btree (firm_id);


--
-- Name: ix_user_sessions_firm_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_user_sessions_firm_id ON public.user_sessions USING btree (firm_id);


--
-- Name: ix_user_sessions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_user_sessions_user_id ON public.user_sessions USING btree (user_id);


--
-- Name: compliance_alerts compliance_alerts_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_alerts
    ADD CONSTRAINT compliance_alerts_firm_id_fkey FOREIGN KEY (firm_id) REFERENCES public.firms(id);


--
-- Name: compliance_checks compliance_checks_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_checks
    ADD CONSTRAINT compliance_checks_firm_id_fkey FOREIGN KEY (firm_id) REFERENCES public.firms(id);


--
-- Name: compliance_scan_results compliance_scan_results_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_scan_results
    ADD CONSTRAINT compliance_scan_results_firm_id_fkey FOREIGN KEY (firm_id) REFERENCES public.firms(id);


--
-- Name: compliance_tasks compliance_tasks_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_tasks
    ADD CONSTRAINT compliance_tasks_firm_id_fkey FOREIGN KEY (firm_id) REFERENCES public.firms(id);


--
-- Name: integration_sync_logs integration_sync_logs_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_sync_logs
    ADD CONSTRAINT integration_sync_logs_firm_id_fkey FOREIGN KEY (firm_id) REFERENCES public.firms(id);


--
-- Name: integration_sync_logs integration_sync_logs_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_sync_logs
    ADD CONSTRAINT integration_sync_logs_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id);


--
-- Name: regulatory_interpretations regulatory_interpretations_acknowledged_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regulatory_interpretations
    ADD CONSTRAINT regulatory_interpretations_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES public.user_accounts(id);


--
-- Name: regulatory_interpretations regulatory_interpretations_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regulatory_interpretations
    ADD CONSTRAINT regulatory_interpretations_firm_id_fkey FOREIGN KEY (firm_id) REFERENCES public.firms(id);


--
-- Name: regulatory_interpretations regulatory_interpretations_overridden_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regulatory_interpretations
    ADD CONSTRAINT regulatory_interpretations_overridden_by_fkey FOREIGN KEY (overridden_by) REFERENCES public.user_accounts(id);


--
-- Name: regulatory_interpretations regulatory_interpretations_update_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.regulatory_interpretations
    ADD CONSTRAINT regulatory_interpretations_update_id_fkey FOREIGN KEY (update_id) REFERENCES public.regulatory_updates(id);


--
-- Name: risk_scores risk_scores_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.risk_scores
    ADD CONSTRAINT risk_scores_firm_id_fkey FOREIGN KEY (firm_id) REFERENCES public.firms(id);


--
-- Name: sra_audit_items sra_audit_items_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sra_audit_items
    ADD CONSTRAINT sra_audit_items_firm_id_fkey FOREIGN KEY (firm_id) REFERENCES public.firms(id);


--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: breach_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.breach_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: cdd_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cdd_records ENABLE ROW LEVEL SECURITY;

--
-- Name: chaser_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chaser_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: client_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: client_intakes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_intakes ENABLE ROW LEVEL SECURITY;

--
-- Name: complaints; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;

--
-- Name: compliance_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.compliance_alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: compliance_checks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.compliance_checks ENABLE ROW LEVEL SECURITY;

--
-- Name: compliance_scan_results; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.compliance_scan_results ENABLE ROW LEVEL SECURITY;

--
-- Name: compliance_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.compliance_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: conflict_checks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conflict_checks ENABLE ROW LEVEL SECURITY;

--
-- Name: conflict_parties; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conflict_parties ENABLE ROW LEVEL SECURITY;

--
-- Name: deadlines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deadlines ENABLE ROW LEVEL SECURITY;

--
-- Name: email_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: email_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: evidence_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.evidence_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: import_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.import_history ENABLE ROW LEVEL SECURITY;

--
-- Name: integration_sync_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.integration_sync_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: integrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

--
-- Name: key_dates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.key_dates ENABLE ROW LEVEL SECURITY;

--
-- Name: matters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.matters ENABLE ROW LEVEL SECURITY;

--
-- Name: policy_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.policy_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: reconciliations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reconciliations ENABLE ROW LEVEL SECURITY;

--
-- Name: regulatory_interpretations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.regulatory_interpretations ENABLE ROW LEVEL SECURITY;

--
-- Name: remediation_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.remediation_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: risk_scores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.risk_scores ENABLE ROW LEVEL SECURITY;

--
-- Name: sar_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sar_records ENABLE ROW LEVEL SECURITY;

--
-- Name: sra_audit_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sra_audit_items ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_training; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staff_training ENABLE ROW LEVEL SECURITY;

--
-- Name: supervision_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supervision_records ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.audit_logs USING (((firm_id)::text = current_setting('app.current_firm_id'::text, true))) WITH CHECK (((firm_id)::text = current_setting('app.current_firm_id'::text, true)));


--
-- Name: breach_reports tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.breach_reports USING (((firm_id)::text = current_setting('app.current_firm_id'::text, true))) WITH CHECK (((firm_id)::text = current_setting('app.current_firm_id'::text, true)));


--
-- Name: cdd_records tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.cdd_records USING (((firm_id)::text = current_setting('app.current_firm_id'::text, true))) WITH CHECK (((firm_id)::text = current_setting('app.current_firm_id'::text, true)));


--
-- Name: chaser_logs tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.chaser_logs USING (((firm_id)::text = current_setting('app.current_firm_id'::text, true))) WITH CHECK (((firm_id)::text = current_setting('app.current_firm_id'::text, true)));


--
-- Name: client_accounts tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.client_accounts USING (((firm_id)::text = current_setting('app.current_firm_id'::text, true))) WITH CHECK (((firm_id)::text = current_setting('app.current_firm_id'::text, true)));


--
-- Name: client_intakes tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.client_intakes USING (((firm_id)::text = current_setting('app.current_firm_id'::text, true))) WITH CHECK (((firm_id)::text = current_setting('app.current_firm_id'::text, true)));


--
-- Name: complaints tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.complaints USING (((firm_id)::text = current_setting('app.current_firm_id'::text, true))) WITH CHECK (((firm_id)::text = current_setting('app.current_firm_id'::text, true)));


--
-- Name: compliance_alerts tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.compliance_alerts USING (((firm_id)::text = current_setting('app.current_firm_id'::text, true))) WITH CHECK (((firm_id)::text = current_setting('app.current_firm_id'::text, true)));


--
-- Name: compliance_checks tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.compliance_checks USING (((firm_id)::text = current_setting('app.current_firm_id'::text, true))) WITH CHECK (((firm_id)::text = current_setting('app.current_firm_id'::text, true)));


--
-- Name: compliance_scan_results tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.compliance_scan_results USING (((firm_id)::text = current_setting('app.current_firm_id'::text, true))) WITH CHECK (((firm_id)::text = current_setting('app.current_firm_id'::text, true)));


--
-- Name: compliance_tasks tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.compliance_tasks USING (((firm_id)::text = current_setting('app.current_firm_id'::text, true))) WITH CHECK (((firm_id)::text = current_setting('app.current_firm_id'::text, true)));


--
-- Name: conflict_checks tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.conflict_checks USING (((firm_id)::text = current_setting('app.current_firm_id'::text, true))) WITH CHECK (((firm_id)::text = current_setting('app.current_firm_id'::text, true)));


--
-- Name: conflict_parties tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.conflict_parties USING (((firm_id)::text = current_setting('app.current_firm_id'::text, true))) WITH CHECK (((firm_id)::text = current_setting('app.current_firm_id'::text, true)));


--
-- Name: deadlines tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.deadlines USING (((firm_id)::text = current_setting('app.current_firm_id'::text, true))) WITH CHECK (((firm_id)::text = current_setting('app.current_firm_id'::text, true)));


--
-- Name: email_queue tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.email_queue USING (((firm_id)::text = current_setting('app.current_firm_id'::text, true))) WITH CHECK (((firm_id)::text = current_setting('app.current_firm_id'::text, true)));


--
-- Name: email_templates tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.email_templates USING (((firm_id)::text = current_setting('app.current_firm_id'::text, true))) WITH CHECK (((firm_id)::text = current_setting('app.current_firm_id'::text, true)));


--
-- Name: evidence_documents tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.evidence_documents USING (((firm_id)::text = current_setting('app.current_firm_id'::text, true))) WITH CHECK (((firm_id)::text = current_setting('app.current_firm_id'::text, true)));


--
-- Name: import_history tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.import_history USING (((firm_id)::text = current_setting('app.current_firm_id'::text, true))) WITH CHECK (((firm_id)::text = current_setting('app.current_firm_id'::text, true)));


--
-- Name: integration_sync_logs tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.integration_sync_logs USING (((firm_id)::text = current_setting('app.current_firm_id'::text, true))) WITH CHECK (((firm_id)::text = current_setting('app.current_firm_id'::text, true)));


--
-- Name: integrations tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.integrations USING (((firm_id)::text = current_setting('app.current_firm_id'::text, true))) WITH CHECK (((firm_id)::text = current_setting('app.current_firm_id'::text, true)));


--
-- Name: key_dates tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.key_dates USING (((firm_id)::text = current_setting('app.current_firm_id'::text, true))) WITH CHECK (((firm_id)::text = current_setting('app.current_firm_id'::text, true)));


--
-- Name: matters tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.matters USING (((firm_id)::text = current_setting('app.current_firm_id'::text, true))) WITH CHECK (((firm_id)::text = current_setting('app.current_firm_id'::text, true)));


--
-- Name: policy_documents tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.policy_documents USING (((firm_id)::text = current_setting('app.current_firm_id'::text, true))) WITH CHECK (((firm_id)::text = current_setting('app.current_firm_id'::text, true)));


--
-- Name: reconciliations tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.reconciliations USING (((firm_id)::text = current_setting('app.current_firm_id'::text, true))) WITH CHECK (((firm_id)::text = current_setting('app.current_firm_id'::text, true)));


--
-- Name: regulatory_interpretations tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.regulatory_interpretations USING (((firm_id)::text = current_setting('app.current_firm_id'::text, true))) WITH CHECK (((firm_id)::text = current_setting('app.current_firm_id'::text, true)));


--
-- Name: remediation_plans tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.remediation_plans USING (((firm_id)::text = current_setting('app.current_firm_id'::text, true))) WITH CHECK (((firm_id)::text = current_setting('app.current_firm_id'::text, true)));


--
-- Name: risk_scores tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.risk_scores USING (((firm_id)::text = current_setting('app.current_firm_id'::text, true))) WITH CHECK (((firm_id)::text = current_setting('app.current_firm_id'::text, true)));


--
-- Name: sar_records tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.sar_records USING (((firm_id)::text = current_setting('app.current_firm_id'::text, true))) WITH CHECK (((firm_id)::text = current_setting('app.current_firm_id'::text, true)));


--
-- Name: sra_audit_items tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.sra_audit_items USING (((firm_id)::text = current_setting('app.current_firm_id'::text, true))) WITH CHECK (((firm_id)::text = current_setting('app.current_firm_id'::text, true)));


--
-- Name: staff_members tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.staff_members USING (((firm_id)::text = current_setting('app.current_firm_id'::text, true))) WITH CHECK (((firm_id)::text = current_setting('app.current_firm_id'::text, true)));


--
-- Name: staff_training tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.staff_training USING (((firm_id)::text = current_setting('app.current_firm_id'::text, true))) WITH CHECK (((firm_id)::text = current_setting('app.current_firm_id'::text, true)));


--
-- Name: supervision_records tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.supervision_records USING (((firm_id)::text = current_setting('app.current_firm_id'::text, true))) WITH CHECK (((firm_id)::text = current_setting('app.current_firm_id'::text, true)));


--
-- Name: transactions tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.transactions USING (((firm_id)::text = current_setting('app.current_firm_id'::text, true))) WITH CHECK (((firm_id)::text = current_setting('app.current_firm_id'::text, true)));


--
-- Name: undertakings tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.undertakings USING (((firm_id)::text = current_setting('app.current_firm_id'::text, true))) WITH CHECK (((firm_id)::text = current_setting('app.current_firm_id'::text, true)));


--
-- Name: user_accounts tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.user_accounts USING (((firm_id)::text = current_setting('app.current_firm_id'::text, true))) WITH CHECK (((firm_id)::text = current_setting('app.current_firm_id'::text, true)));


--
-- Name: user_sessions tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.user_sessions USING (((firm_id)::text = current_setting('app.current_firm_id'::text, true))) WITH CHECK (((firm_id)::text = current_setting('app.current_firm_id'::text, true)));


--
-- Name: transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: undertakings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.undertakings ENABLE ROW LEVEL SECURITY;

--
-- Name: user_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: user_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict Y2urqM3cxqkfaTwILJDg2AKCRMuDa3cIckHLF7CSQzxuMJOLiBHc4oxH8kY0YUW

