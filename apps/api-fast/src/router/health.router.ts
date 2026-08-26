import { FastifyInstance } from "fastify";
import { getLiveCheckHandler, getReadyCheckHandler } from "../controller/health.controller.js";

export async function healthRouter(app: FastifyInstance): Promise<void> {
    app.get("/live", getLiveCheckHandler);
    app.get("/ready", getReadyCheckHandler);
}