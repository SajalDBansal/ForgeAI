export async function getLiveCheckHandler() {
    return {
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    }
}

export async function getReadyCheckHandler() {
    return {
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    }
}