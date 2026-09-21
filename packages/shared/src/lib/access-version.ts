const PROJECT_ACCESS_VERSION_PREFIX = "project-access-version:"
const PROJECT_USER_ACCESS_VERSION_PREFIX = "project-user-access-version:"

export interface AccessVersionRedis {
  get(key: string): Promise<string | null>
  incr(key: string): Promise<number>
}

export function projectAccessVersionKey(projectId: string): string {
  return `${PROJECT_ACCESS_VERSION_PREFIX}${projectId}`
}

export function projectUserAccessVersionKey(
  projectId: string,
  userId: string,
): string {
  return `${PROJECT_USER_ACCESS_VERSION_PREFIX}${projectId}:${userId}`
}

function parseVersion(value: string | null): number {
  const parsed = Number(value ?? 0)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0
}

export async function currentProjectAccessVersion(
  redis: Pick<AccessVersionRedis, "get">,
  projectId: string,
  userId: string,
): Promise<string> {
  const [project, user] = await Promise.all([
    redis.get(projectAccessVersionKey(projectId)),
    redis.get(projectUserAccessVersionKey(projectId, userId)),
  ])
  return `${parseVersion(project)}:${parseVersion(user)}`
}

export async function bumpProjectAccessVersion(
  redis: Pick<AccessVersionRedis, "incr">,
  projectId: string,
  userId: string | null,
): Promise<void> {
  await redis.incr(
    userId
      ? projectUserAccessVersionKey(projectId, userId)
      : projectAccessVersionKey(projectId),
  )
}
