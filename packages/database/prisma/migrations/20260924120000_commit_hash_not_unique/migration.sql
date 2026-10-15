-- Commit hashes are content hashes (audit L-3): identical content, identical hash.
-- A commit that returns the project to an earlier state is legitimate, so the
-- (projectId, hash) pair can no longer be unique.
DROP INDEX "ProjectCommit_projectId_hash_key";
