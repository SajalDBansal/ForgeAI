"use client"

import { useCallback, useEffect, useState } from "react"

import type { RepoRef } from "@/lib/types"
import { PUBLIC_ENV } from "@/lib/env"

const AUTH_URL = PUBLIC_ENV.AUTH_URL

interface GithubRepo {
  name: string
  fullName: string
  defaultBranch: string
}

export type GithubReposStatus = "loading" | "connected" | "disconnected"

// Converts a GitHub repo listing entry to a RepoRef on its default branch.
// Used to populate the repo picker.
function toRepoRef(r: GithubRepo): RepoRef {
  const [owner = "", name = r.name] = r.fullName.split("/")
  return { owner, name, branch: r.defaultBranch }
}

// Loads the repos the ForgeAI GitHub App can access, only while `enabled`.
// Reports "disconnected" when GitHub isn't connected.
export function useGithubRepos(enabled: boolean) {
  const [repos, setRepos] = useState<RepoRef[]>([])
  const [status, setStatus] = useState<GithubReposStatus>("loading")

  const refresh = useCallback(async () => {
    setStatus("loading")
    try {
      const res = await fetch(`${AUTH_URL}/api/v1/connections/github`, {
        credentials: "include",
      })
      if (!res.ok) {
        setRepos([])
        setStatus("disconnected")
        return
      }
      const body = (await res.json()) as { repos: GithubRepo[] }
      setRepos(body.repos.map(toRepoRef))
      setStatus("connected")
    } catch {
      setRepos([])
      setStatus("disconnected")
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [enabled, refresh])

  return { repos, status, refresh }
}
