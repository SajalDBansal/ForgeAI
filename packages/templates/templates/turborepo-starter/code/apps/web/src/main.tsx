import React from "react"
import { createRoot } from "react-dom/client"
import { productName } from "@forgeai-template/shared"

import "./styles.css"

function App() {
  return (
    <main>
      <p>Web + API monorepo</p>
      <h1>{productName}</h1>
      <span>Start from apps/web, apps/api and packages/shared.</span>
    </main>
  )
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
