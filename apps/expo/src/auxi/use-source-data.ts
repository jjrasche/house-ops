import { useState, useCallback, useMemo } from "react";
import { resolveAllSources } from "auxi/sdui";
import { buildSourceRegistry } from "./sources";
import { dataSourceCache } from "./storage";

export interface SourceDataState {
  sourceData: Record<string, unknown>;
  sourcesLoaded: boolean;
  refreshSources: () => Promise<void>;
}

export function useSourceData(): SourceDataState {
  const [sourceData, setSourceData] = useState<Record<string, unknown>>({});
  const [sourcesLoaded, setSourcesLoaded] = useState(false);

  const sourceRegistry = useMemo(buildSourceRegistry, []);

  const refreshSources = useCallback(async () => {
    const resolved = await resolveAllSources(sourceRegistry, dataSourceCache);
    setSourceData(resolved.sources);
    setSourcesLoaded(true);
  }, [sourceRegistry]);

  return { sourceData, sourcesLoaded, refreshSources };
}
