import next from "eslint-config-next";

export default [
  ...next,
  { ignores: [".next/**", "node_modules/**", "test-results/**", "playwright-report/**", "public/sw.js"] },
];
