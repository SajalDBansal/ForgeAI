#!/usr/bin/env node
import { Command } from "commander"

// `inquirer` and `chalk` are installed but not wired up yet — pull them in
// here once real commands/prompts are added.

const program = new Command()

program.name("cli").description("turbo-starter CLI").version("0.0.0")

if (!process.argv.slice(2).length) {
  program.outputHelp()
}

program.parse()
