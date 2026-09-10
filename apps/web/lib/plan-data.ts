export type DiagramView = "system" | "data" | "flow" | "sequence"

export interface DiagramViewConfig {
  id: DiagramView
  label: string
  hint: string
}

export const DIAGRAM_VIEWS: DiagramViewConfig[] = [
  {
    id: "system",
    label: "System",
    hint: "Services, components, and how they connect.",
  },
  {
    id: "data",
    label: "Data model",
    hint: "Entities and the relationships between them.",
  },
  {
    id: "flow",
    label: "User flow",
    hint: "The path a user takes through the product.",
  },
  {
    id: "sequence",
    label: "Sequence",
    hint: "Ordered calls between the parts of a request.",
  },
]

export const DIAGRAMS: Record<DiagramView, string> = {
  system: "",
  data: "",
  flow: "",
  sequence: "",
}
