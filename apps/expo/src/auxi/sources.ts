import type { DataSourceRegistry } from "auxi/sdui";

/**
 * Data source registry for house-ops SDUI.
 * Each source maps a name to a Supabase query.
 * The shell resolves all sources before rendering the spec.
 */

/**
 * Only register sources that the active spec actually binds to.
 * The baseline spec uses shell context (pipeline state), not data sources.
 * Add sources here when specs reference them via "{sources.name}".
 */
export function buildSourceRegistry(): DataSourceRegistry {
  return {};
}
