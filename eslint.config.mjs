import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = [
  { ignores: [".next/"] },
  ...nextCoreWebVitals,
  ...nextTypescript,
  prettier,
];

export default eslintConfig;
