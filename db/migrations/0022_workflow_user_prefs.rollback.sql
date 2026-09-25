-- Undo 0022 (LP project rcjcgjlqzepicbwhnnjl). Drops the per-user favorites
-- and saved-filter tables; the app then shows "could not save" on star and
-- save-filter and nothing else changes. Run in the dashboard SQL editor.
drop table if exists public.dashboard_workflow_presets;
drop table if exists public.dashboard_workflow_favorites;
