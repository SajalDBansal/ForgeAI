-- I14: separate RAG embedding token spend from chat/completion model calls.
ALTER TYPE "UsageKind" ADD VALUE IF NOT EXISTS 'EMBEDDING_TOKENS';
