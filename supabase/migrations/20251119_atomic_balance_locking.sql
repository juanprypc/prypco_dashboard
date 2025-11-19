-- Migration: Atomic Balance Locking for Concurrent Redemptions
-- This prevents race conditions where multiple concurrent requests 
-- can exceed an agent's available balance

-- 1. Create pending_redemptions table
CREATE TABLE IF NOT EXISTS public.pending_redemptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id text,
  agent_code text,
  points integer NOT NULL,
  unit_allocation_id text,
  ler_code text,
  created_at timestamptz DEFAULT now() NOT NULL,
  expires_at timestamptz DEFAULT (now() + interval '10 minutes') NOT NULL
);

-- Indexes for quick lookups
CREATE INDEX IF NOT EXISTS idx_pending_redemptions_agent_id ON public.pending_redemptions(agent_id);
CREATE INDEX IF NOT EXISTS idx_pending_redemptions_agent_code ON public.pending_redemptions(agent_code);
CREATE INDEX IF NOT EXISTS idx_pending_redemptions_expires_at ON public.pending_redemptions(expires_at);

-- 2. Function to check balance and reserve points atomically
CREATE OR REPLACE FUNCTION public.check_and_reserve_balance(
  p_agent_id text,
  p_agent_code text,
  p_required_points integer,
  p_unit_allocation_id text DEFAULT NULL,
  p_ler_code text DEFAULT NULL
)
RETURNS TABLE(
  success boolean,
  message text,
  pending_id uuid,
  available_balance integer,
  required_points integer
) AS $$
DECLARE
  v_total_points integer;
  v_pending_points integer;
  v_available integer;
  v_new_pending_id uuid;
BEGIN
  -- Lock and calculate total posted points for this agent
  SELECT COALESCE(SUM(points), 0) INTO v_total_points
  FROM public.loyalty_points
  WHERE status = 'posted'
    AND (expires_at IS NULL OR expires_at >= now())
    AND (
      (p_agent_id IS NOT NULL AND agent_id = p_agent_id) OR
      (p_agent_code IS NOT NULL AND LOWER(agent_code) = LOWER(p_agent_code))
    )
  FOR UPDATE;
  
  -- Calculate pending points (already reserved by other in-flight requests)
  SELECT COALESCE(SUM(points), 0) INTO v_pending_points
  FROM public.pending_redemptions
  WHERE expires_at > now()
    AND (
      (p_agent_id IS NOT NULL AND agent_id = p_agent_id) OR
      (p_agent_code IS NOT NULL AND LOWER(agent_code) = LOWER(p_agent_code))
    );
  
  -- Calculate available balance
  v_available := v_total_points - v_pending_points;
  
  -- Check if sufficient balance
  IF v_available < p_required_points THEN
    RETURN QUERY SELECT 
      false, 
      'Insufficient balance'::text, 
      NULL::uuid, 
      v_available, 
      p_required_points;
    RETURN;
  END IF;
  
  -- Reserve the points by creating a pending redemption
  INSERT INTO public.pending_redemptions (
    agent_id, 
    agent_code, 
    points, 
    unit_allocation_id, 
    ler_code
  )
  VALUES (
    p_agent_id, 
    p_agent_code, 
    p_required_points, 
    p_unit_allocation_id, 
    p_ler_code
  )
  RETURNING id INTO v_new_pending_id;
  
  RETURN QUERY SELECT 
    true, 
    'Balance reserved'::text, 
    v_new_pending_id, 
    v_available, 
    p_required_points;
END;
$$ LANGUAGE plpgsql;

-- 3. Function to finalize (confirm) a pending redemption
CREATE OR REPLACE FUNCTION public.finalize_pending_redemption(p_pending_id uuid)
RETURNS boolean AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.pending_redemptions
  WHERE id = p_pending_id;
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$ LANGUAGE plpgsql;

-- 4. Function to cancel a pending redemption (release reserved points)
CREATE OR REPLACE FUNCTION public.cancel_pending_redemption(p_pending_id uuid)
RETURNS boolean AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.pending_redemptions
  WHERE id = p_pending_id;
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$ LANGUAGE plpgsql;

-- 5. Function to expire stale pending redemptions (cleanup)
CREATE OR REPLACE FUNCTION public.expire_pending_redemptions()
RETURNS integer AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.pending_redemptions
  WHERE expires_at < now();
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;
