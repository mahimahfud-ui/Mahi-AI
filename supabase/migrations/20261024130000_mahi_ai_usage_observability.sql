-- Extend Mahi AI usage rows with request-level observability.
ALTER TABLE public.mahi_ai_usage_events
  ADD COLUMN IF NOT EXISTS request_id uuid,
  ADD COLUMN IF NOT EXISTS duration_ms integer,
  ADD COLUMN IF NOT EXISTS input_chars integer,
  ADD COLUMN IF NOT EXISTS output_chars integer,
  ADD COLUMN IF NOT EXISTS attachment_count smallint;

UPDATE public.mahi_ai_usage_events
SET request_id = gen_random_uuid()
WHERE request_id IS NULL;

ALTER TABLE public.mahi_ai_usage_events
  ALTER COLUMN request_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN request_id SET NOT NULL;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mahi_ai_usage_duration_nonnegative'
      AND conrelid = 'public.mahi_ai_usage_events'::regclass
  ) THEN
    ALTER TABLE public.mahi_ai_usage_events
      ADD CONSTRAINT mahi_ai_usage_duration_nonnegative
      CHECK (duration_ms IS NULL OR duration_ms >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mahi_ai_usage_input_chars_nonnegative'
      AND conrelid = 'public.mahi_ai_usage_events'::regclass
  ) THEN
    ALTER TABLE public.mahi_ai_usage_events
      ADD CONSTRAINT mahi_ai_usage_input_chars_nonnegative
      CHECK (input_chars IS NULL OR input_chars >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mahi_ai_usage_output_chars_nonnegative'
      AND conrelid = 'public.mahi_ai_usage_events'::regclass
  ) THEN
    ALTER TABLE public.mahi_ai_usage_events
      ADD CONSTRAINT mahi_ai_usage_output_chars_nonnegative
      CHECK (output_chars IS NULL OR output_chars >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mahi_ai_usage_attachment_count_range'
      AND conrelid = 'public.mahi_ai_usage_events'::regclass
  ) THEN
    ALTER TABLE public.mahi_ai_usage_events
      ADD CONSTRAINT mahi_ai_usage_attachment_count_range
      CHECK (attachment_count IS NULL OR attachment_count BETWEEN 0 AND 5);
  END IF;
END
$constraints$;

CREATE UNIQUE INDEX IF NOT EXISTS mahi_ai_usage_request_id_unique
  ON public.mahi_ai_usage_events (request_id);

-- Add request_id to the reservation RPC. Drop/recreate is needed because PostgreSQL
-- does not allow CREATE OR REPLACE to change a function's input parameter list.
DROP FUNCTION IF EXISTS public.mahi_ai_reserve_request(uuid, integer, integer);

CREATE FUNCTION public.mahi_ai_reserve_request(
  p_user_id uuid,
  p_minute_limit integer DEFAULT 10,
  p_day_limit integer DEFAULT 200,
  p_request_id uuid DEFAULT gen_random_uuid()
)
RETURNS TABLE (
  allowed boolean,
  usage_id bigint,
  retry_after_seconds integer,
  limit_scope text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_minute_limit integer := LEAST(GREATEST(COALESCE(p_minute_limit, 10), 1), 120);
  v_day_limit integer := LEAST(GREATEST(COALESCE(p_day_limit, 200), 1), 5000);
  v_minute_count bigint;
  v_day_count bigint;
  v_retry_after integer;
  v_usage_id bigint;
  v_request_id uuid := COALESCE(p_request_id, gen_random_uuid());
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  SELECT count(*) INTO v_minute_count
  FROM public.mahi_ai_usage_events
  WHERE user_id = p_user_id
    AND created_at >= v_now - interval '1 minute';

  IF v_minute_count >= v_minute_limit THEN
    SELECT GREATEST(
      1,
      CEIL(EXTRACT(EPOCH FROM (MIN(created_at) + interval '1 minute' - v_now)))::integer
    )
    INTO v_retry_after
    FROM (
      SELECT created_at
      FROM public.mahi_ai_usage_events
      WHERE user_id = p_user_id
        AND created_at >= v_now - interval '1 minute'
      ORDER BY created_at ASC
      LIMIT v_minute_limit
    ) AS recent;
    RETURN QUERY SELECT false, NULL::bigint, COALESCE(v_retry_after, 60), 'minute'::text;
    RETURN;
  END IF;

  SELECT count(*) INTO v_day_count
  FROM public.mahi_ai_usage_events
  WHERE user_id = p_user_id
    AND created_at >= v_now - interval '1 day';

  IF v_day_count >= v_day_limit THEN
    SELECT GREATEST(
      1,
      CEIL(EXTRACT(EPOCH FROM (MIN(created_at) + interval '1 day' - v_now)))::integer
    )
    INTO v_retry_after
    FROM (
      SELECT created_at
      FROM public.mahi_ai_usage_events
      WHERE user_id = p_user_id
        AND created_at >= v_now - interval '1 day'
      ORDER BY created_at ASC
      LIMIT v_day_limit
    ) AS recent;
    RETURN QUERY SELECT false, NULL::bigint, COALESCE(v_retry_after, 3600), 'day'::text;
    RETURN;
  END IF;

  INSERT INTO public.mahi_ai_usage_events (user_id, task_type, success, error_code, request_id)
  VALUES (p_user_id, 'request_reserved', false, NULL, v_request_id)
  RETURNING id INTO v_usage_id;

  RETURN QUERY SELECT true, v_usage_id, 0, NULL::text;
END;
$function$;

REVOKE ALL ON FUNCTION public.mahi_ai_reserve_request(uuid, integer, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mahi_ai_reserve_request(uuid, integer, integer, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
