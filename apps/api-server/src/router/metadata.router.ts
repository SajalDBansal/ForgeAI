import { FastifyInstance } from "fastify";
import { getAppMetadataHandler } from "../controller/metadata.controller.js";

export async function metadataRouter(app: FastifyInstance): Promise<void> {
    app.get("/user", getAppMetadataHandler)
}