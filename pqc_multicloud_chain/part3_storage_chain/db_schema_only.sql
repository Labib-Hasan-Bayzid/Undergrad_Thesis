--
-- PostgreSQL database dump
--

\restrict ahg1QoeoMqZdf4J7oOkUCLavP6Iysr1VnBZqjn8gzX1ysKe7D4yH2wznfCuYQuz

-- Dumped from database version 18.1
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chunks (
    file_id uuid NOT NULL,
    chunk_index integer NOT NULL,
    nonce bytea NOT NULL,
    ciphertext_len integer NOT NULL,
    chunk_hash_sha3_512 bytea NOT NULL,
    size integer
);


--
-- Name: file_chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_chunks (
    file_id uuid NOT NULL,
    chunk_index integer NOT NULL,
    cloud_id text NOT NULL,
    ciphertext bytea NOT NULL,
    nonce bytea NOT NULL,
    tag bytea NOT NULL,
    hash_sha3_512 bytea NOT NULL
);


--
-- Name: files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.files (
    file_id uuid NOT NULL,
    filename text NOT NULL,
    file_size bigint NOT NULL,
    chunk_size integer NOT NULL,
    chunks_total integer NOT NULL,
    salt bytea,
    merkle_root_sha3_512 bytea,
    final_hash_sha3_512 bytea,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'UPLOADING'::text NOT NULL,
    uploaded_chunks integer DEFAULT 0 NOT NULL,
    dek_wrapped bytea,
    dek_wrap_nonce bytea,
    dek_wrap_salt bytea,
    dek_wrap_info text DEFAULT 'wrap-dek-v1'::text,
    kek_version integer DEFAULT 1 NOT NULL,
    dek_version integer DEFAULT 1 NOT NULL,
    rotated_at timestamp with time zone,
    last_activity_at timestamp with time zone DEFAULT now() NOT NULL,
    aborted_at timestamp with time zone,
    cleaned_at timestamp with time zone,
    wrapped_dek bytea,
    wrap_nonce bytea,
    wrap_salt bytea,
    kdf text DEFAULT 'hkdf-sha3-512'::text,
    enc text DEFAULT 'aes-256-gcm'::text,
    wrap_alg text,
    dek_kdf text DEFAULT 'hkdf-sha3-512'::text,
    hybrid_session_id text,
    hybrid_challenge bytea,
    hybrid_proof_ok boolean DEFAULT false,
    session_id bytea,
    challenge bytea,
    kms_rand_wrapped bytea,
    kms_rand_nonce bytea,
    kdf_info text,
    hybrid_mode text,
    tls_binding_mode text,
    aad_salt bytea,
    finalized_at timestamp with time zone,
    available_at timestamp with time zone,
    uploaded_bytes bigint DEFAULT 0 NOT NULL,
    last_error_code text,
    last_error_at timestamp with time zone,
    transcript_hash bytea,
    transcript_hash_sha3_512 bytea,
    kdf_mode text,
    failed_at timestamp with time zone
);


--
-- Name: hygiene_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hygiene_log (
    id bigint NOT NULL,
    ts timestamp with time zone DEFAULT now() NOT NULL,
    actor text NOT NULL,
    action text NOT NULL,
    details jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: hygiene_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hygiene_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hygiene_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hygiene_log_id_seq OWNED BY public.hygiene_log.id;


--
-- Name: integrity_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integrity_events (
    id bigint NOT NULL,
    file_id uuid NOT NULL,
    cloud_name text NOT NULL,
    event_type text NOT NULL,
    detail text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: integrity_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.integrity_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: integrity_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.integrity_events_id_seq OWNED BY public.integrity_events.id;


--
-- Name: kek_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kek_versions (
    version integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL
);


--
-- Name: key_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.key_events (
    id bigint NOT NULL,
    ts timestamp with time zone DEFAULT now() NOT NULL,
    event_type text NOT NULL,
    file_id uuid,
    old_version integer,
    new_version integer,
    details jsonb
);


--
-- Name: key_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.key_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: key_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.key_events_id_seq OWNED BY public.key_events.id;


--
-- Name: key_rotation_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.key_rotation_log (
    id bigint NOT NULL,
    file_id uuid NOT NULL,
    old_kek_version integer,
    new_kek_version integer,
    old_dek_version integer,
    new_dek_version integer,
    reason text,
    actor text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: key_rotation_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.key_rotation_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: key_rotation_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.key_rotation_log_id_seq OWNED BY public.key_rotation_log.id;


--
-- Name: kms_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kms_audit (
    id bigint NOT NULL,
    ts timestamp with time zone DEFAULT now(),
    actor text NOT NULL,
    action text NOT NULL,
    file_id uuid,
    details jsonb
);


--
-- Name: kms_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.kms_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: kms_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.kms_audit_id_seq OWNED BY public.kms_audit.id;


--
-- Name: kms_keks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kms_keks (
    kek_version integer NOT NULL,
    kek_material bytea NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    active boolean DEFAULT true,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    revoked_at timestamp with time zone
);


--
-- Name: replicas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.replicas (
    file_id uuid NOT NULL,
    cloud_name text NOT NULL,
    status text NOT NULL,
    last_checked timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: request_replay_guard; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.request_replay_guard (
    request_id text NOT NULL,
    file_id uuid NOT NULL,
    ts timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: schema_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_version (
    version integer NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tls_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tls_audit (
    ts timestamp with time zone DEFAULT now(),
    actor text DEFAULT 'anon'::text NOT NULL,
    remote_addr text,
    action text NOT NULL,
    ok boolean DEFAULT false NOT NULL,
    file_id uuid,
    details jsonb,
    reason_code text,
    session_id text,
    client_identity text,
    client_ip text
);


--
-- Name: upload_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.upload_sessions (
    upload_token text NOT NULL,
    file_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: hygiene_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hygiene_log ALTER COLUMN id SET DEFAULT nextval('public.hygiene_log_id_seq'::regclass);


--
-- Name: integrity_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrity_events ALTER COLUMN id SET DEFAULT nextval('public.integrity_events_id_seq'::regclass);


--
-- Name: key_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.key_events ALTER COLUMN id SET DEFAULT nextval('public.key_events_id_seq'::regclass);


--
-- Name: key_rotation_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.key_rotation_log ALTER COLUMN id SET DEFAULT nextval('public.key_rotation_log_id_seq'::regclass);


--
-- Name: kms_audit id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kms_audit ALTER COLUMN id SET DEFAULT nextval('public.kms_audit_id_seq'::regclass);


--
-- Name: chunks chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chunks
    ADD CONSTRAINT chunks_pkey PRIMARY KEY (file_id, chunk_index);


--
-- Name: file_chunks file_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_chunks
    ADD CONSTRAINT file_chunks_pkey PRIMARY KEY (file_id, chunk_index, cloud_id);


--
-- Name: files files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_pkey PRIMARY KEY (file_id);


--
-- Name: hygiene_log hygiene_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hygiene_log
    ADD CONSTRAINT hygiene_log_pkey PRIMARY KEY (id);


--
-- Name: integrity_events integrity_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrity_events
    ADD CONSTRAINT integrity_events_pkey PRIMARY KEY (id);


--
-- Name: kek_versions kek_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kek_versions
    ADD CONSTRAINT kek_versions_pkey PRIMARY KEY (version);


--
-- Name: key_events key_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.key_events
    ADD CONSTRAINT key_events_pkey PRIMARY KEY (id);


--
-- Name: key_rotation_log key_rotation_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.key_rotation_log
    ADD CONSTRAINT key_rotation_log_pkey PRIMARY KEY (id);


--
-- Name: kms_audit kms_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kms_audit
    ADD CONSTRAINT kms_audit_pkey PRIMARY KEY (id);


--
-- Name: kms_keks kms_keks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kms_keks
    ADD CONSTRAINT kms_keks_pkey PRIMARY KEY (kek_version);


--
-- Name: replicas replicas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.replicas
    ADD CONSTRAINT replicas_pkey PRIMARY KEY (file_id, cloud_name);


--
-- Name: request_replay_guard request_replay_guard_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_replay_guard
    ADD CONSTRAINT request_replay_guard_pkey PRIMARY KEY (request_id);


--
-- Name: upload_sessions upload_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_sessions
    ADD CONSTRAINT upload_sessions_pkey PRIMARY KEY (upload_token);


--
-- Name: idx_chunks_file; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chunks_file ON public.file_chunks USING btree (file_id);


--
-- Name: idx_files_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_files_created ON public.files USING btree (created_at);


--
-- Name: idx_files_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_files_session_id ON public.files USING btree (session_id);


--
-- Name: idx_files_status_activity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_files_status_activity ON public.files USING btree (status, last_activity_at);


--
-- Name: idx_hygiene_log_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hygiene_log_ts ON public.hygiene_log USING btree (ts DESC);


--
-- Name: idx_key_rotation_log_file_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_key_rotation_log_file_id ON public.key_rotation_log USING btree (file_id);


--
-- Name: idx_replay_file; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_replay_file ON public.request_replay_guard USING btree (file_id);


--
-- Name: idx_replay_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_replay_ts ON public.request_replay_guard USING btree (ts);


--
-- Name: idx_tls_audit_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tls_audit_action ON public.tls_audit USING btree (action);


--
-- Name: idx_tls_audit_file; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tls_audit_file ON public.tls_audit USING btree (file_id);


--
-- Name: idx_tls_audit_file_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tls_audit_file_id ON public.tls_audit USING btree (file_id);


--
-- Name: idx_tls_audit_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tls_audit_ts ON public.tls_audit USING btree (ts);


--
-- Name: idx_upload_sessions_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_upload_sessions_created_at ON public.upload_sessions USING btree (created_at);


--
-- Name: idx_upload_sessions_file_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_upload_sessions_file_id ON public.upload_sessions USING btree (file_id);


--
-- Name: uq_kms_keks_active_true; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_kms_keks_active_true ON public.kms_keks USING btree (active) WHERE (active = true);


--
-- Name: chunks chunks_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chunks
    ADD CONSTRAINT chunks_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


--
-- Name: file_chunks fk_file; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_chunks
    ADD CONSTRAINT fk_file FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


--
-- Name: key_rotation_log key_rotation_log_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.key_rotation_log
    ADD CONSTRAINT key_rotation_log_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


--
-- Name: replicas replicas_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.replicas
    ADD CONSTRAINT replicas_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(file_id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict ahg1QoeoMqZdf4J7oOkUCLavP6Iysr1VnBZqjn8gzX1ysKe7D4yH2wznfCuYQuz

