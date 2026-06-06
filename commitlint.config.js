// Enforce Conventional Commits — https://www.conventionalcommits.org/
// Pairs with the commit-msg Husky hook in each subproject.
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "header-max-length": [2, "always", 100],
    "type-enum": [
      2,
      "always",
      [
        "feat",      // new feature
        "fix",       // bug fix
        "docs",      // documentation only
        "style",     // formatting, no code change
        "refactor",  // neither fixes a bug nor adds a feature
        "perf",      // performance improvement
        "test",      // adding or correcting tests
        "build",     // build system / dependencies
        "ci",        // CI configuration
        "chore",     // other (tooling, deps, etc.)
        "revert",    // reverts a previous commit
        "security"   // security fix (non-breaking)
      ]
    ],
    "scope-enum": [
      2,
      "always",
      ["backend", "frontend", "ci", "docker", "deps", "docs", "auth", "api", "config", "release"]
    ]
  }
};
