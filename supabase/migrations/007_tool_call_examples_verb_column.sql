-- Add verb column to tool_call_examples for direct verb matching.
-- Avoids fragile parsing of multi-word verbs ("pick up", "out of") from input_text.

alter table tool_call_examples
  add column verb text;

-- Backfill existing rows: extract first word as best-effort approximation.
-- New rows written by trainAssembleExample will always have the correct verb.
update tool_call_examples
  set verb = lower(split_part(input_text, ' ', 1))
  where verb is null;

-- Make non-null going forward
alter table tool_call_examples
  alter column verb set not null;
