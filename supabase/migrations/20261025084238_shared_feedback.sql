-- 20261025084238_shared_feedback.sql
-- Feedback button. Messages go straight to Slack (SLACK_FEEDBACK_WEBHOOK_URL, lib/feedback.ts);
-- nothing is stored here.
-- - event_settings.feedback_audience: who sees the button, set in Settings. 'off', 'approved'
--   (full access: approved attendees and admins) or 'signed_in' (anyone signed in, including
--   pending and declined). NULL counts as 'approved'.

alter table event_settings add column feedback_audience text
  check (feedback_audience in ('off', 'approved', 'signed_in'));
