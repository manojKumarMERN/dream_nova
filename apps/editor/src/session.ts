import { createEditorSession } from '@nova/editor-core';
import { createMinimalAppDefinition } from '@nova/spec';
import type { AppDefinition } from '@nova/spec';
import { createStudioSession } from './studio-session';
import type { EditorSessionLike } from './types';

export { createUniqueId } from './id';

export function createSession(
  definition: AppDefinition = createMinimalAppDefinition(),
  getActivePageId?: () => string | undefined
): EditorSessionLike {
  return createStudioSession(createEditorSession({ definition }), getActivePageId);
}
