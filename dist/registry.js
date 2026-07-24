const loadedPluginHandlers = /* @__PURE__ */ new Set();
function markPluginHandlerLoaded(handlerModule) {
  loadedPluginHandlers.add(handlerModule);
}
export {
  loadedPluginHandlers,
  markPluginHandlerLoaded
};
