-- Repair the deployed push RPC without changing its contract or old receipts.
-- Pin the exact 0006 body so an unexpected hosted definition fails closed.
do $$
declare
  v_oid regprocedure := to_regprocedure('public.push_library_changes(jsonb)');
  v_body text;
  v_security_definer boolean;
  v_config text[];
  v_old text := 'v_fingerprint := public.digest(p_request::text,''sha256'');';
  v_new text := 'v_fingerprint := pg_catalog.sha256(pg_catalog.convert_to(p_request::text,''UTF8''));';
  v_definition text;
begin
  if v_oid is null then raise exception 'expected push function is absent'; end if;
  select prosrc, prosecdef, proconfig into strict v_body, v_security_definer, v_config
    from pg_proc where oid = v_oid;
  if encode(pg_catalog.sha256(pg_catalog.convert_to(v_body,'UTF8')),'hex') <>
      '4eb178335123ecbf21a05420e8216f2034d788ac00e5d7cb779a04b3c98a48ed'
    or not v_security_definer or v_config <> array['search_path=""']
    or position(v_old in v_body) = 0
  then raise exception 'unexpected push function definition'; end if;
  v_definition := pg_get_functiondef(v_oid::oid);
  if position(v_old in v_definition) = 0 then
    raise exception 'expected fingerprint call is absent from function definition';
  end if;
  execute replace(v_definition,v_old,v_new);
  if (select prosrc from pg_proc where oid = v_oid) is distinct from replace(v_body,v_old,v_new)
  then raise exception 'fingerprint replacement changed another function statement'; end if;
end $$;
