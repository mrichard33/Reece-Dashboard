// eslint-config-next v16 ships flat-native configs — imported directly. The old
// FlatCompat("next/core-web-vitals") wiring crashed under ESLint 9 + Next 16
// (and `next lint` itself was removed in Next 16, so the lint script runs
// eslint directly).
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
  {
    ignores: [
      "prototype/**",
      "node_modules/**",
      ".next/**",
      "next-env.d.ts",
      // Design-tool artifacts — generated bundles, not app code.
      ".design-sync/**",
      "components/capacity-board/design-export*/**",
    ],
  },
];

export default eslintConfig;
