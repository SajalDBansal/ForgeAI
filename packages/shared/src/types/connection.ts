import { ConnectionProvider, ConnectionStatus } from "./enum.js";

export type Connection = {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    expiresAt: Date | null;
    userId: string;
    provider: ConnectionProvider;
    status: ConnectionStatus;
    externalAccountId: string;
    externalAccountLogin: string;
    accessTokenEnc: string | null;
    refreshTokenEnc: string | null;
    scopes: string[];
    settingsJson: JSON;
    createdByUserId: string;
}