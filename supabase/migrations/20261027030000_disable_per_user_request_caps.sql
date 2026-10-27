-- Disable per-user request-count throttling for MahiCloud.
-- Keep this RPC signature and the usage reservation row so existing Edge Function
-- clients and usage analytics remain compatible; only minute/day rejection is removed.

CREATE OR REPLACE FUNCTION public.mahi_ai_reserve_request(
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
  v_usage_id bigint;
  v_request_id uuid := COALESCE(p_request_id, gen_random_uuid());
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  -- p_minute_limit and p_day_limit are retained for backward compatibility only.
  -- Every authenticated user request is allowed here, regardless of request counts.
  INSERT INTO public.mahi_ai_usage_events (user_id, task_type, success, error_code, request_id)
  VALUES (p_user_id, 'request_reserved', false, NULL, v_request_id)
  RETURNING id INTO v_usage_id;

  RETURN QUERY SELECT true, v_usage_id, 0, NULL::text;
END;
$function$;

REVOKE ALL ON FUNCTION public.mahi_ai_reserve_request(uuid, integer, integer, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mahi_ai_reserve_request(uuid, integer, integer, uuid)
  TO service_role;

NOTIFY pgrst, 'reload schema';
