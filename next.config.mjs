import { fileURLToPath } from "node:url";

export default {
  output: "export",
  devIndicators: false,
  outputFileTracingRoot: fileURLToPath(new URL(".", import.meta.url)),
};
