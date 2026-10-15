import { PLUGIN_REGISTRY_URL } from "@/constant/env";

// An official registry item whose entry has been resolved to an absolute URL.
export type OfficialPluginEntry = {
    id: string;
    name: string;
    version: string;
    description?: string;
    icon?: string;
    url: string;
};

type RawEntry = { id?: string; name?: string; version?: string; description?: string; icon?: string; entry?: string; url?: string };
type RawManifest = { plugins?: RawEntry[] };

// Fetch the official registry and resolve relative entries against its URL for the existing URL installation flow.
// 多源容错:jsDelivr 对分支名有最长 12h 的快照缓存,新推内容可能暂时 404/陈旧;
// 主源失败时自动降级到 GitHub raw 镜像(实时),保证清单始终可拉到。
const REGISTRY_FALLBACK_URL = "https://ghfast.top/https://raw.githubusercontent.com/wpp3659-prog/vs-studio/plugins-dist/v2/official-plugins.json";

async function fetchManifest(url: string): Promise<RawManifest> {
    const response = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as RawManifest;
}

export async function fetchOfficialPlugins(registryUrl: string = PLUGIN_REGISTRY_URL): Promise<OfficialPluginEntry[]> {
    // 记录实际成功的源:bundle 相对地址必须按它解析,否则主源 404 时 bundle 也会跟着 404
    let sourceUrl = registryUrl;
    let manifest: RawManifest;
    try {
        manifest = await fetchManifest(registryUrl);
    } catch {
        sourceUrl = REGISTRY_FALLBACK_URL;
        manifest = await fetchManifest(REGISTRY_FALLBACK_URL);
    }
    const list = Array.isArray(manifest?.plugins) ? manifest.plugins : [];
    return list
        .filter((item): item is RawEntry & { id: string } => Boolean(item && item.id && (item.entry || item.url)))
        .map((item) => ({
            id: item.id,
            name: item.name || item.id,
            version: item.version || "0.0.0",
            description: item.description,
            icon: item.icon,
            url: item.url ? item.url : new URL(item.entry as string, sourceUrl).toString(),
        }));
}

// Compare semantic versions: positive means a is newer, negative means b is newer, and zero means equal.
// Compare numeric major.minor.patch components only and ignore non-numeric parts such as prerelease labels.
function compareSemver(a: string, b: string): number {
    const parse = (v: string) => v.split(".").map((part) => parseInt(part, 10) || 0);
    const [pa, pb] = [parse(a), parse(b)];
    for (let i = 0; i < 3; i++) {
        const diff = (pa[i] || 0) - (pb[i] || 0);
        if (diff !== 0) return diff;
    }
    return 0;
}

// Return whether the remote version is newer than the installed version.
export function hasUpgrade(installedVersion: string, remoteVersion: string): boolean {
    return compareSemver(remoteVersion, installedVersion) > 0;
}
import i18n from "@/i18n";
