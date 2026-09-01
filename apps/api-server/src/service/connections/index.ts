import { Connection, ConnectionProvider, prisma } from "@forgeAI/database";

export async function getConnection(userId: string, provider: ConnectionProvider): Promise<Connection | null> {
    return prisma.connection.findUnique({ where: { userId_provider: { userId, provider } } })
}