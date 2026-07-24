import { join } from "node:path";
import { getCoreDescriptors, discoverPluginFragments } from "./discover.js";
function pluginDirsFor(roots) {
  const dirs = [];
  if (roots.user) dirs.push(join(roots.user, "plugins"));
  if (roots.project) dirs.push(join(roots.project, "plugins"));
  return dirs;
}
async function getMergedManifest(pluginDirs = []) {
  const descs = await getCoreDescriptors();
  for (const frag of discoverPluginFragments(pluginDirs)) {
    for (const d of frag.descriptors) {
      if (!d.plugin) d.plugin = frag.plugin;
      descs.push(d);
    }
  }
  return descs;
}
async function findTool(name, pluginDirs = []) {
  return (await getMergedManifest(pluginDirs)).find((t) => t.name === name);
}
export {
  findTool,
  getMergedManifest,
  pluginDirsFor
};
