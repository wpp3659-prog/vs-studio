import { inferMediaScale, resolveMediaAspectRatio } from "@/lib/media-size";

export function midjourneyHdForSelectedSize(size: string) {
    const scale = inferMediaScale(size);
    if (scale === "2k") return true;
    if (scale === "1k") return false;
    return undefined;
}

export function isUnsupportedMidjourneySize(size: string) {
    return inferMediaScale(size) === "4k";
}

export function prepareMidjourneyPrompt(prompt: string) {
    let stylize = 100;
    let chaos = 0;
    let style = "";
    const cleaned = prompt
        .replace(/(^|\s)--(?:stylize|s)(?:\s*=\s*|\s*)(\d+)(?=\s|$)/gi, (_match, prefix: string, value: string) => {
            stylize = Math.max(0, Math.min(1000, Number(value)));
            return prefix;
        })
        .replace(/(^|\s)--(?:chaos|c)(?:\s*=\s*|\s*)(\d+)(?=\s|$)/gi, (_match, prefix: string, value: string) => {
            chaos = Math.max(0, Math.min(100, Number(value)));
            return prefix;
        })
        .replace(/(^|\s)--raw(?=\s|$)/gi, (_match, prefix: string) => {
            style = "raw";
            return prefix;
        })
        // These are structured API options, not prompt text; the UI's selected size is authoritative.
        .replace(/(^|\s)--ar(?:\s*=\s*|\s+)\d+(?:\.\d+)?\s*:\s*\d+(?:\.\d+)?(?=\s|$)/gi, "$1")
        .replace(/(^|\s)--hd(?:\s*=\s*(?:true|false)|\s+(?:true|false))?(?=\s|$)/gi, "$1")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
    return { prompt: cleaned, stylize: String(stylize), chaos: String(chaos), style };
}

function midjourneyQuality(value: string) {
    const normalized = value.trim().toLowerCase();
    if (["0.25", "0.5", "1", "2"].includes(normalized)) return normalized;
    return ({ low: "0.5", medium: "1", high: "2", xhigh: "2", max: "2", auto: "1" } as Record<string, string>)[normalized] || "1";
}

export function buildMidjourneyRequest(size: string, quality: string, count: number, prompt: string) {
    const parsed = prepareMidjourneyPrompt(prompt);
    const ratio = resolveMediaAspectRatio(size);
    const hd = midjourneyHdForSelectedSize(size);
    const params = {
        ...(ratio ? { aspect_ratio: ratio } : {}),
        quality: midjourneyQuality(quality),
        stylize: parsed.stylize,
        chaos: parsed.chaos,
        ...(parsed.style ? { style: parsed.style } : {}),
        ...(hd === undefined ? {} : { hd }),
        n: count,
        response_format: "url",
    };
    return { prompt: parsed.prompt, params };
}
