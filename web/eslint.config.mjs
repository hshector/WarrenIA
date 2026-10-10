import next from "eslint-config-next";

const config = [
  ...next,
  { ignores: [".next/**", "node_modules/**", "test-results/**", "playwright-report/**", "public/sw.js"] },
];

export default config;
