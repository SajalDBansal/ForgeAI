import { Switch } from "@forgeAI/ui/components/switch"

import { PageCard, SectionHeader } from "@/components/layout/page-card"
import { Row } from "@/components/settings/row"

export function NotificationsTab() {
  return (
    <PageCard className="p-5">
      <SectionHeader label="Notifications" />
      <Row label="Build completed">
        <Switch defaultChecked />
      </Row>
      <Row label="Agent needs input">
        <Switch defaultChecked />
      </Row>
      <Row label="Weekly usage digest">
        <Switch />
      </Row>
      <Row label="Product announcements">
        <Switch />
      </Row>
    </PageCard>
  )
}
