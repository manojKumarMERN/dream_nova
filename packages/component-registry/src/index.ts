import { BUILT_IN_COMPONENT_CONTRACTS } from './built-in-contracts';
import { createComponentRegistry } from './component-registry';

export { BUILT_IN_COMPONENT_CONTRACTS } from './built-in-contracts';
export { BUILDER_COMPONENT_CONTRACTS } from './builder-contracts';
export { createComponentRegistry } from './component-registry';
export type { ComponentRegistry, ComponentRegistryListOptions } from './component-registry';

export const builtInComponentRegistry = createComponentRegistry(BUILT_IN_COMPONENT_CONTRACTS);
