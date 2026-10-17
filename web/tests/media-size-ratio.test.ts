import { expect, test } from "bun:test";

import { computeMediaSize, imageSizePresets, mediaRatioOptions, resolveMediaAspectRatio } from "../src/lib/media-size";
import { buildMidjourneyRequest, isUnsupportedMidjourneySize, midjourneyHdForSelectedSize, prepareMidjourneyPrompt } from "../src/lib/midjourney-request";

test("preserves every selected preset ratio for all 1k, 2k, and 4k image sizes", () => {
    let checked = 0;
    for (const [scale, presets] of Object.entries(imageSizePresets)) {
        for (const [ratio, size] of Object.entries(presets)) {
            expect(resolveMediaAspectRatio(size)).toBe(ratio);
            expect(resolveMediaAspectRatio(computeMediaSize(scale, ratio))).toBe(ratio);
            checked += 1;
        }
    }
    expect(checked).toBe(27);
});

test("keeps explicit aspect-ratio labels and leaves Auto unconstrained", () => {
    for (const { value } of mediaRatioOptions) {
        expect(resolveMediaAspectRatio(value)).toBe(value === "auto" ? "" : value);
    }
    expect(resolveMediaAspectRatio("2688x1152")).toBe("21:9");
    expect(resolveMediaAspectRatio("2016x864")).toBe("21:9");
    expect(resolveMediaAspectRatio("2048x1152")).toBe("16:9");
});

test("maps the selected image resolution to the Midjourney HD API field", () => {
    expect(midjourneyHdForSelectedSize(imageSizePresets["1k"]["21:9"])).toBe(false);
    expect(midjourneyHdForSelectedSize(imageSizePresets["2k"]["21:9"])).toBe(true);
    expect(midjourneyHdForSelectedSize("auto")).toBeUndefined();
    expect(midjourneyHdForSelectedSize("21:9")).toBeUndefined();
    expect(isUnsupportedMidjourneySize(imageSizePresets["4k"]["21:9"])).toBe(true);
    expect(isUnsupportedMidjourneySize(imageSizePresets["2k"]["21:9"])).toBe(false);
});

test("converts MJ command-style prompt options into structured fields", () => {
    expect(prepareMidjourneyPrompt("Song dynasty monastery --ar 21: 9 --hd=true --raw --s250")).toEqual({
        prompt: "Song dynasty monastery",
        stylize: "250",
        chaos: "0",
        style: "raw",
    });
});

test("builds the MJ request from UI-selected ratio and resolution, not prompt aliases", () => {
    const request = buildMidjourneyRequest(imageSizePresets["2k"]["21:9"], "auto", 1, "Song dynasty monastery --ar 3:2 --hd=false --s250 --c10 --raw");
    expect(request.prompt).toBe("Song dynasty monastery");
    expect(request.params).toEqual({ aspect_ratio: "21:9", quality: "1", stylize: "250", chaos: "10", style: "raw", hd: true, n: 1, response_format: "url" });
});
