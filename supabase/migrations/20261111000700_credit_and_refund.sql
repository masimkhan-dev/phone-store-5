-- A refund that also corrects revenue is one atomic operation: the credit note and the
-- refund that pays it out are written together, or not at all.
create function public.credit_and_refund(p_invoice uuid, p_method public.payment_method, p_amount_pence integer, p_reason text)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_credit uuid;
begin
  -- Both called functions check the caller's role and branch and lock the invoice.
  v_credit := public.create_credit_note(p_invoice, p_amount_pence, p_reason);
  return public.record_refund(p_invoice, p_method, p_amount_pence, p_reason, null, v_credit);
end $$;
revoke execute on function public.credit_and_refund(uuid, public.payment_method, integer, text) from public, anon;
grant execute on function public.credit_and_refund(uuid, public.payment_method, integer, text) to authenticated;
