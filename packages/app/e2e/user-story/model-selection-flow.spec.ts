import { expect, test } from "@playwright/test"
import { project, sessionHref } from "../utils/app"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectAppVisible } from "../utils/waits"
import { openSession } from "../utils/workspace"

const directory = "C:/OpenCode/NewProject"

// The built-in Argavis catalog: one provider, two curated models, ARGAVIS AI as the default.
const variants = { low: {}, high: {}, max: {} }
const argavis = {
  all: [
    {
      id: "argavis",
      name: "Argavis AI",
      models: {
        "argavis-ai": {
          id: "argavis-ai",
          name: "ARGAVIS AI",
          cost: { input: 3, output: 5 },
          limit: { context: 1_000_000 },
          variants,
        },
        "argavis-ai-flash": {
          id: "argavis-ai-flash",
          name: "ARGAVIS AI Flash",
          cost: { input: 1, output: 2 },
          limit: { context: 1_048_576 },
          variants,
        },
      },
    },
  ],
  connected: ["argavis"],
  default: { providerID: "argavis", modelID: "argavis-ai" },
}

test("creates a session in a new project and selects its model", async ({ page }) => {
  // An empty draft must remain usable when the file viewer is unavailable.
  await page.route(/(?:\/_assets\/file-(?!icon-)[^/]+\.js|\/session-ui\/src\/components\/file\.tsx)(?:\?|$)/, (route) =>
    route.abort(),
  )
  const created = project({ id: "proj_model_selection_flow", directory, name: "NewProject" })
  // The server knows no project until the user adds this one.
  const projects: unknown[] = []
  await mockOpenCodeServer(page, {
    directory,
    project: created,
    projects: () => projects,
    // The picker answers with the platform's separators; the server resolves them to its own.
    onLocationGet: (requested) => {
      if (requested.replaceAll("\\", "/") === directory && !projects.includes(created)) projects.push(created)
    },
    provider: argavis,
    sessions: [],
    pageMessages: () => ({ items: [] }),
    // Listings are requested by absolute path and returned relative to the stable Location.
    fileList: (path) => (path === "C:/OpenCode" ? [{ path: "./", type: "directory", ignored: false }] : []),
  })
  // Both Argavis models are visible without any user visibility choice; only the last used model is remembered.
  await page.addInitScript(() => {
    localStorage.setItem(
      "opencode.global.dat:model",
      JSON.stringify({
        user: [],
        recent: [{ providerID: "argavis", modelID: "argavis-ai-flash" }],
        variant: {},
      }),
    )
  })

  await page.goto("/")
  const addProject = page.locator('[data-action="home-add-project-row"]')
  await expectAppVisible(addProject)
  await addProject.click()
  const picker = page.getByRole("dialog", { name: "Open project", exact: true })
  await expect(picker.getByRole("combobox")).toHaveValue("")

  const listing = page.waitForRequest((request) => {
    const url = new URL(request.url())

    return url.pathname === "/api/fs/list" && url.searchParams.get("path") === "C:/OpenCode"
  })

  await picker.getByRole("button", { name: "Parent", exact: true }).click()
  expect(new URL((await listing).url()).searchParams.get("location[directory]")).toBe(directory)
  const directoryItem = picker.getByRole("treeitem", { name: "NewProject", exact: true })
  await expect(directoryItem).toBeVisible()
  await directoryItem.click()
  await expect(directoryItem).toHaveAttribute("aria-selected", "true")
  await expect(picker.getByText("C:\\OpenCode\\NewProject", { exact: true })).toBeVisible()
  const selectFolder = picker.getByRole("button", { name: "Select folder", exact: true })
  await expect(selectFolder).toBeEnabled()
  await selectFolder.click()
  await expect(picker).toBeHidden()

  await page.locator('[data-action="home-new-session"]').click()
  await expectAppVisible(page.locator('[data-component="composer"]'))

  // "ARGAVIS AI" is a prefix of "ARGAVIS AI Flash", so only the full label proves which model is applied.
  const modelControl = page.locator('[data-action="composer-model"]')
  await expect(modelControl).toHaveText("Argavis AI / ARGAVIS AI Flash")
  await modelControl.click()
  const modelSearch = page.getByPlaceholder("Search models", { exact: true })
  await expect(modelSearch).toBeFocused()
  await modelSearch.press("ArrowDown")
  await modelSearch.press("Enter")
  await expect(modelControl).toHaveText("Argavis AI / ARGAVIS AI")

  await modelControl.click()
  await expect(modelSearch).toBeFocused()
  await modelSearch.press("ArrowUp")
  await modelSearch.press("Enter")

  await expect(modelControl).toHaveText("Argavis AI / ARGAVIS AI Flash")
})

test("restores each existing session's model and variant when switching tabs", async ({ page }) => {
  const sessions = [
    {
      id: "ses_model_default",
      title: "Model Default",
      model: { id: "argavis-ai", providerID: "argavis", variant: "low" },
    },
    {
      id: "ses_model_flash",
      title: "Model Flash",
      model: { id: "argavis-ai-flash", providerID: "argavis", variant: "low" },
    },
  ]

  await openSession(page, {
    name: "ModelSelection",
    sessions,
    provider: argavis,
  })

  const hrefDefault = sessionHref(sessions[0]!.id)
  const hrefFlash = sessionHref(sessions[1]!.id)
  const composer = page.locator('[data-component="composer"]')
  const modelControl = composer.locator('[data-action="composer-model"]')
  const variant = composer.getByRole("button", { name: "Choose model variant", exact: true })
  await expect(modelControl).toHaveText("Argavis AI / ARGAVIS AI")
  await expect(variant).toHaveText("low")
  await variant.click()
  await page.getByRole("menuitemradio", { name: "high", exact: true }).click()
  await expect(variant).toHaveText("high")

  await page.locator(`[data-titlebar-tab-link][href="${hrefFlash}"]`).click()
  await expect(page).toHaveURL(hrefFlash)
  await expect(modelControl).toHaveText("Argavis AI / ARGAVIS AI Flash")
  await expect(variant).toHaveText("low")
  await variant.click()
  await page.getByRole("menuitemradio", { name: "high", exact: true }).click()
  await expect(variant).toHaveText("high")

  // A new draft starts from the current session's non-default model and chosen variant.
  await page.getByRole("button", { name: "New session", exact: true }).click()
  await expect(page).toHaveURL(/\/new-session\?draftId=/)
  await expect(modelControl).toHaveText("Argavis AI / ARGAVIS AI Flash")
  await expect(variant).toHaveText("high")

  await page.locator(`[data-titlebar-tab-link][href="${hrefDefault}"]`).click()
  await expect(page).toHaveURL(hrefDefault)
  await expect(modelControl).toHaveText("Argavis AI / ARGAVIS AI")
  await expect(variant).toHaveText("high")
})
