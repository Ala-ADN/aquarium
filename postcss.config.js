// 98.css ships global selectors; contain them so it can coexist with 7.css.
export default {
  plugins: [{
    postcssPlugin: "scope-98-css",
    Once(root) {
      root.walkRules((rule) => {
        const file = rule.source?.input.file?.replaceAll("\\", "/");
        if (!file?.endsWith("/98.css/dist/98.css")) return;
        rule.selectors = rule.selectors.map((selector) =>
          selector === "body" ? ".win98" : `.win98 ${selector}`
        );
      });
    },
  }],
};
