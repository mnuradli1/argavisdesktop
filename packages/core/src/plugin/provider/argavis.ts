import { define } from "@opencode/plugin/effect/plugin"
import { Money } from "@opencode/schema/money"
import { Effect } from "effect"
import { Model } from "../../model.js"
import { Provider } from "../../provider.js"
import { Variant } from "../../variant.js"

const providerID = Provider.ID.make("argavis")
const defaultModelID = Model.ID.make("argavis-ai")

const providerPackage = "@opencode/ai/providers/openai-compatible"

// Upstream abliteration.ai models; the catalog ids are the only ones clients see.
const models = [
  argavisModel({
    id: defaultModelID,
    upstream: "abliterated-model-large-v2",
    name: "ARGAVIS AI",
    family: "argavis-ai",
    input: ["text"],
    released: Date.UTC(2026, 7, 29),
    cost: { input: 3, output: 5, cacheRead: 0.3 },
    context: 1_000_000,
  }),
  argavisModel({
    id: Model.ID.make("argavis-ai-flash"),
    upstream: "abliterated-model-large-flash",
    name: "ARGAVIS AI Flash",
    family: "argavis-ai-flash",
    input: ["text", "image"],
    released: Date.UTC(2026, 9, 20),
    cost: { input: 1, output: 2, cacheRead: 0.1 },
    context: 1_048_576,
  }),
]

/**
 * Argavis builds expose exactly one provider and model. The plugin runs last, so it replaces whatever the
 * catalog, configuration, policies and other plugins registered. Without a key it does nothing.
 */
export const ArgavisPlugin = define({
  id: "argavis.provider",
  effect: Effect.fn(function* (ctx) {
    // Release builds inline the key at compile time (packages/cli/script/build.ts); source runs read the environment.
    const key = process.env.ARGAVIS_API_KEY
    if (!key) return
    yield* ctx.provider.transform((providers) => {
      for (const record of providers.list()) providers.remove(record.provider.id)
      providers.add({
        info: {
          id: providerID,
          name: "Argavis AI",
          activation: "enabled",
          package: providerPackage,
          compatibility: { supportsPromptCacheKey: true },
          settings: { baseURL: "https://api.abliteration.ai/v1", apiKey: key, provider: providerID },
        },
        models,
      })
    })
    yield* ctx.model.transform((catalog) => {
      catalog.default.set(providerID, defaultModelID)
    })
  }),
})

function argavisModel(input: {
  id: Model.ID
  upstream: string
  name: string
  // Distinct families keep both models visible: the picker shows only the newest model of each family by default.
  family: string
  input: Model.Info["capabilities"]["input"]
  released: number
  cost: { input: number; output: number; cacheRead: number }
  context: number
}) {
  const base = {
    id: input.id,
    modelID: Model.ID.make(input.upstream),
    providerID,
    name: input.name,
    family: Model.Family.make(input.family),
    capabilities: { tools: true, input: input.input, output: ["text"] },
    variants: [],
    time: { released: input.released },
    cost: [
      {
        input: Money.USDPerMillionTokens.make(input.cost.input),
        output: Money.USDPerMillionTokens.make(input.cost.output),
        cache: { read: Money.USDPerMillionTokens.make(input.cost.cacheRead), write: Money.USDPerMillionTokens.zero },
      },
    ],
    status: "active",
    enabled: true,
    limit: { context: input.context, input: input.context, output: 65_536 },
  } satisfies Model.Info
  return {
    ...base,
    variants: Variant.resolve({ ...base, package: providerPackage }, [{ type: "effort", values: ["low", "high", "max"] }]),
  }
}
