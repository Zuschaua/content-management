-- Prevent concurrent agent jobs for the same reference + job type.
-- Only one queued/running job allowed per (referenceId, jobType) pair.
CREATE UNIQUE INDEX agent_job_active_unique
  ON agent_jobs (reference_id, job_type)
  WHERE status IN ('queued', 'running')
    AND reference_id IS NOT NULL;
