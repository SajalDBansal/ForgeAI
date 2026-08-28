-- Better Auth 1.7.3 never writes account.issuer, so a NOT NULL column here makes
-- every account insert fail — credential signup included.
--
-- 20260906160000_account_issuer_optional already dropped the constraint, but
-- 20260906132134_added_changes_in_template_model was generated afterwards from a
-- schema.prisma that still declared `issuer String`, so Prisma re-added
-- `SET NOT NULL` and undid the fix. schema.prisma now declares `issuer String?`,
-- so this drop is the final state rather than another round trip.
ALTER TABLE "account" ALTER COLUMN "issuer" DROP NOT NULL;
