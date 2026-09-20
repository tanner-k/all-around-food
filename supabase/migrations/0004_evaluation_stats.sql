-- 0004_evaluation_stats.sql — aggregate stats for the evaluations dashboard.
--
-- The dashboard needs the old /evaluations/stats shape without reading every
-- evaluation row client-side. `security_invoker = true` keeps the underlying
-- evaluations RLS policy in force for the signed-in user.

create or replace view public.evaluation_stats
with (security_invoker = true)
as
select
    user_id,
    count(*)::integer as count,
    avg(overall_grade)::double precision as mean_overall,
    avg(accuracy_grade)::double precision as mean_accuracy,
    avg(completeness_grade)::double precision as mean_completeness,
    min(overall_grade)::integer as min_overall,
    max(overall_grade)::integer as max_overall,
    count(*) filter (
        where created_at >= now() - interval '30 days'
    )::integer as last_30d_count
from public.evaluations
where user_id = auth.uid()
group by user_id;

grant select on public.evaluation_stats to authenticated;
