-- Cover both foreign keys on mahi_ai_messages and the common user history lookup.
CREATE INDEX IF NOT EXISTS mahi_ai_messages_conversation_user_created_idx
  ON public.mahi_ai_messages (conversation_id, user_id, created_at);
CREATE INDEX IF NOT EXISTS mahi_ai_messages_user_created_idx
  ON public.mahi_ai_messages (user_id, created_at DESC);

-- Atomic per-guest request reservations for Mahi AI.
-- The Edge Function calls this with the service_role key; clients cannot call it directly.
CREATE OR REPLACE FUNCTION public.mahi_ai_reserve_request(
  p_user_id uuid,
  p_minute_limit integer DEFAULT 10,
  p_day_limit integer DEFAULT 200
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
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  -- Serialize requests for this user so concurrent calls cannot all pass the same count.
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

  INSERT INTO public.mahi_ai_usage_events (user_id, task_type, success, error_code)
  VALUES (p_user_id, 'request_reserved', false, NULL)
  RETURNING id INTO v_usage_id;

  RETURN QUERY SELECT true, v_usage_id, 0, NULL::text;
END;
$function$;

REVOKE ALL ON FUNCTION public.mahi_ai_reserve_request(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mahi_ai_reserve_request(uuid, integer, integer) TO service_role;
