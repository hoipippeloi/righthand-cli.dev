import { join } from "node:path";
import type { ToolDescriptor } from "./contracts.ts";
import { getCoreDescriptors, discoverPluginFragments } from "./discover.ts";

// Plugin dirs whose manifest.json fragments merge into the manifest. Core-only
// by default; footprint plugin dirs layered in once a footprint exists.
export function pluginDirsFor(roots: { user?: string; project?: string }): string[] {
  const dirs: string[] = [];
  if (roots.user) dirs.push(join(roots.user, "plugins"));
  if (roots.project) dirs.push(join(roots.project, "plugins"));
  return dirs;
}

// Merged manifest: core descriptors (auto-discovered) + plugin fragments.
// Plugin fragments are read as JSON only — handlers are NOT imported here.
export async function getMergedManifest(
  pluginDirs: string[] = [],
): Promise<ToolDescriptor[]> {
  const descs = await getCoreDescriptors();
  for (const frag of discoverPluginFragments(pluginDirs)) {
    for (const d of frag.descriptors) {
      if (!d.plugin) d.plugin = frag.plugin;
      descs.push(d);
    }
  }
  return descs;
}

export async function findTool(
  name: string,
  pluginDirs: string[] = [],
): Promise<ToolDescriptor | undefined> {
  return (await getMergedManifest(pluginDirs)).find((t) => t.name === name);
}
