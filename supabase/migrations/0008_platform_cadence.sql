-- Hugging Face Spaces become a platform, and platforms get their own cadence floor.
--
-- The free plan's 6h floor is right for Supabase's ~7-day window but useless for Render,
-- which spins a free service down after 15 minutes idle, and for Spaces whose sleep
-- timeout is shorter than 6h. The floor stays plan data so entitlements() remains the
-- only place a cadence is decided.
alter type platform add value if not exists 'huggingface';

update plans
set limits = limits || '{"platform_min_interval_seconds": {"render": 600, "huggingface": 600}}'::jsonb
where id = 'free';
