\set ON_ERROR_STOP on
-- Local-only: invoke through run-kan62-local-db.mjs, which verifies exact identity
-- before sending any SQL. No DB execution is approved by preparing this file.
\ir kan62_rule_contract_expanded.sql
