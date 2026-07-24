// Tracks which PLUGIN handler modules have actually been imported.
//
// (Core commands are bundled and imported at discovery — that's intentional
// and cheap. The lazy-import guarantee applies to PLUGINS: discovery reads
// their manifest fragments as JSON only and must NOT import their handlers.
// This set makes that guarantee assertable.)
export const loadedPluginHandlers = new Set<string>();

export function markPluginHandlerLoaded(handlerModule: string): void {
  loadedPluginHandlers.add(handlerModule);
}
