import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = [
  { ignores: [".next/"] },
  ...nextCoreWebVitals,
  ...nextTypescript,
  prettier,
  {
    // Links to authenticated pages must not prefetch: see AppLink for the
    // measured cost. Public, static pages may keep next/link's default.
    files: ["app/**/*.tsx", "components/**/*.tsx"],
    ignores: [
      "components/shared/app-link.tsx",
      "app/page.tsx",
      "app/auth/**",
      "app/privacy/**",
      "app/no-access/**",
      "components/login-form.tsx",
      "components/sign-up-form.tsx",
      "components/forgot-password-form.tsx",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next/link",
              message:
                "Use AppLink from @/components/shared/app-link: default prefetching re-renders every linked dynamic page on each load and save.",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
