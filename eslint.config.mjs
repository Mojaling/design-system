import js from "@eslint/js"
import { plugin as shadcn } from "@shadcn/lint"
import tsParser from "@typescript-eslint/parser"
import reactHooks from "eslint-plugin-react-hooks"
import { defineConfig, globalIgnores } from "eslint/config"
import globals from "globals"
import tseslint from "typescript-eslint"

// 디자인 규칙은 이 JSON에 있다. 규칙을 바꾸려면 사람의 승인이 필요하다.
import policy from "./design-system.lint.json" with { type: "json" }

const NOTE = "(참고: 디자인 규칙과 허용된 예외는 docs/DESIGN-RULES.md)"

/** 앱에서 직접 쓰면 안 되는 HTML 요소 → 대신 쓸 디자인 시스템 컴포넌트 */
const RAW_ELEMENTS = {
  button: "Button",
  input: "Input",
  label: "Label",
  hr: "Separator",
}

export default defineConfig([
  globalIgnores(["**/dist/", "**/node_modules/", "apps/*/data/"]),

  {
    // 코드 안의 eslint-disable / eslint 설정 주석은 무시된다.
    // 예외가 필요하면 design-system.lint.json에 추가하고 사람에게 확인받는다.
    linterOptions: {
      noInlineConfig: true,
    },
  },

  // 서버·스크립트 (Node, JavaScript)
  {
    files: ["**/*.{js,mjs}"],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
    rules: {
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },

  // 화면 (React, TypeScript)
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat["recommended-latest"],
    ],
    languageOptions: { globals: globals.browser },
  },

  // 디자인 시스템 규칙
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { shadcn },
    settings: {
      shadcn: { note: NOTE },
    },
    rules: policy.rules,
  },
  ...policy.overrides,

  // 앱에서는 기본 HTML 요소 대신 디자인 시스템 컴포넌트를 쓴다.
  // (기본 요소에는 no-restyle 검사가 적용되지 않아서 우회로가 되기 때문)
  {
    files: ["apps/*/web/src/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...Object.entries(RAW_ELEMENTS).map(([element, component]) => ({
          selector: `JSXOpeningElement[name.name='${element}']`,
          message: `<${element}> 대신 @workspace/ui/components의 <${component}>를 쓰세요. 디자인 시스템 컴포넌트여야 스타일 규칙이 검사됩니다. ${NOTE}`,
        })),
      ],
    },
  },
])
