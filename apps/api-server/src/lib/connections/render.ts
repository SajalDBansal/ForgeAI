export interface RenderService {
  id: string
  name: string
  type: string
  url: string | null
  updatedAt: string
}

// Lists up to 100 Render services owned by an account.
// Shown on the Render connection card.
export async function listOwnerServices(
  apiKey: string,
  ownerId: string,
): Promise<RenderService[]> {
  const url = new URL("https://api.render.com/v1/services")
  url.searchParams.set("ownerId", ownerId)
  url.searchParams.set("limit", "100")

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!response.ok) {
    throw new Error(
      `Failed to list Render services: ${response.status} ${await response.text()}`,
    )
  }

  const data = (await response.json()) as Array<{
    service: {
      id: string
      name: string
      type: string
      updatedAt: string
      serviceDetails?: { url?: string }
    }
  }>
  return data.map(({ service }) => ({
    id: service.id,
    name: service.name,
    type: service.type,
    url: service.serviceDetails?.url ?? null,
    updatedAt: service.updatedAt,
  }))
}
