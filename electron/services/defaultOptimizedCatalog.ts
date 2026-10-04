import type { OptimizedModelsCatalog } from '@shared/types';

/** Bundled fallback when the remote NeuronVS/neuron-models catalog is unreachable. */
export const DEFAULT_OPTIMIZED_CATALOG: OptimizedModelsCatalog = {
  models: [],
};

export const REMOTE_OPTIMIZED_CATALOG_URL =
  'https://raw.githubusercontent.com/NeuronVS/neuron-models/main/models.json';
