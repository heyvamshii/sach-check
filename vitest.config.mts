import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      // browser-only modules (canvas, Tesseract, ONNX, Cache Storage) are checked in the browser instead
      exclude: ["src/lib/**/*.test.ts", "src/lib/testUtils.ts", "src/lib/samples.ts", "src/lib/client/image.ts", "src/lib/client/ocr.ts", "src/lib/client/share.ts"],
    },
  },
});
