DROP POLICY IF EXISTS "Users can manage their own MahiCloud prompts" ON public.mahi_ai_prompts;
DROP POLICY IF EXISTS "Permanent users can manage their own MahiCloud prompts" ON public.mahi_ai_prompts;
CREATE POLICY "Permanent users can manage their own MahiCloud prompts"
  ON public.mahi_ai_prompts
  FOR ALL TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND COALESCE(((SELECT auth.jwt())->>'is_anonymous')::boolean, true) = false
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND COALESCE(((SELECT auth.jwt())->>'is_anonymous')::boolean, true) = false
  );