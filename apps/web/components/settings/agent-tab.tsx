import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@forgeAI/ui/components/select"
import { Switch } from "@forgeAI/ui/components/switch"

import { PageCard, SectionHeader } from "@/components/layout/page-card"
import { Row } from "@/components/settings/row"

// Settings tab for the agent's default mode, safety prompts and context size.
// Demo controls; not persisted yet.
export function AgentTab() {
  return (
    <PageCard className="p-5">
      <SectionHeader label="Agent behavior" />
      <Row label="Default mode" hint="Plan first, or jump to build">
        <Select defaultValue="Build">
          <SelectTrigger className="border-hairline bg-canvas h-9 w-full rounded-sm text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Build">Build</SelectItem>
            <SelectItem value="Plan">Plan</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      <Row label="Ask before destructive edits">
        <Switch defaultChecked />
      </Row>
      <Row label="Auto-run preview after edits">
        <Switch defaultChecked />
      </Row>
      <Row label="Context window" hint="Tokens kept across turns">
        <Select defaultValue="128k">
          <SelectTrigger className="border-hairline bg-canvas h-9 w-full rounded-sm text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="32k">32k</SelectItem>
            <SelectItem value="128k">128k</SelectItem>
            <SelectItem value="200k">200k</SelectItem>
          </SelectContent>
        </Select>
      </Row>
    </PageCard>
  )
}
