import { define } from "@opencode/plugin/effect/plugin"
import { Money } from "@opencode/schema/money"
import { Effect } from "effect"
import { Model } from "../../model.js"
import { Provider } from "../../provider.js"
import { Variant } from "../../variant.js"

const providerID = Provider.ID.make("argavis")
const modelID = Model.ID.make("argavis-ai")

const providerPackage = "@opencode/ai/providers/openai-compatible"

const base = {
  id: modelID,
  // Upstream abliteration.ai model; the catalog id above is the only one clients see.
  modelID: Model.ID.make("abliterated-model-large-v2"),
  providerID,
  name: "ARGAVIS AI",
  capabilities: { tools: true, input: ["text"], output: ["text"] },
  variants: [],
  time: { released: Date.UTC(2026, 7, 29) },
  cost: [
    {
      input: Money.USDPerMillionTokens.make(3),
      output: Money.USDPerMillionTokens.make(5),
      cache: { read: Money.USDPerMillionTokens.make(0.3), write: Money.USDPerMillionTokens.zero },
    },
  ],
  status: "active",
  enabled: true,
  limit: { context: 1_000_000, input: 1_000_000, output: 65_536 },
} satisfies Model.Info

const model = {
  ...base,
  variants: Variant.resolve({ ...base, package: providerPackage }, [{ type: "effort", values: ["low", "high", "max"] }]),
}

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
        models: [model],
      })
    })
    yield* ctx.model.transform((models) => {
      models.default.set(providerID, modelID)
    })
  }),
})
