-- 0013_dna_jobs.sql
--
-- Designer-DNA (Task 11) is a vision pass over a designer's whole back catalogue
-- — potentially many images, so it can run as long as the other engines. It
-- goes on the same queue rather than reintroducing the inline-timeout problem
-- 0012 solved. This adds 'dna' to the job kinds.
--
-- ADD VALUE runs outside the surrounding transaction on its own; it does not use
-- the new value in this migration, so there is no same-transaction hazard.

alter type job_kind add value if not exists 'dna';
