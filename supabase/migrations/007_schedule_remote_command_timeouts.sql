-- Move expired commands out of PENDING even when no app is open.
-- pg_cron runs inside the hosted Supabase Postgres instance, so this does
-- not depend on a handset timer or a long-lived Edge Function.
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  existing_job_id BIGINT;
BEGIN
  SELECT jobid
    INTO existing_job_id
    FROM cron.job
   WHERE jobname = 'sirius-reconcile-expired-commands';

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'sirius-reconcile-expired-commands',
    '* * * * *',
    'SELECT public.reconcile_expired_commands();'
  );
END
$$;
