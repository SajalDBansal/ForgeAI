import {
  Database,
  GitBranch,
  Layers,
  ListChecks,
  Map,
  Gauge,
  Shield,
  Sparkles,
  Target,
} from "lucide-react"

export const PLAN_TABS = [
  {
    id: "overview",
    label: "Overview",
    icon: <Sparkles className="h-3.5 w-3.5" />,
  },
  { id: "mvp", label: "MVP scope", icon: <Target className="h-3.5 w-3.5" /> },
  { id: "stack", label: "Stack", icon: <Layers className="h-3.5 w-3.5" /> },
  { id: "schema", label: "Schema", icon: <Database className="h-3.5 w-3.5" /> },
  { id: "tasks", label: "Tasks", icon: <ListChecks className="h-3.5 w-3.5" /> },
  { id: "roadmap", label: "Roadmap", icon: <Map className="h-3.5 w-3.5" /> },
  {
    id: "diagrams",
    label: "Diagrams",
    icon: <GitBranch className="h-3.5 w-3.5" />,
  },
  { id: "risks", label: "Risks", icon: <Shield className="h-3.5 w-3.5" /> },
  { id: "metrics", label: "Metrics", icon: <Gauge className="h-3.5 w-3.5" /> },
] as const

export type PlanTab = (typeof PLAN_TABS)[number]["id"]
