// Library entry point - the package's public API ("main" / "exports" in package.json.ts point
// here).
//
// This abstract branch ships only a placeholder export, so the publishable manifest resolves and
// publint / Vitest / "npm pack" have a real entry point to verify. Template branches / forks
// replace the fill-in block below wholesale with their own entry point (see
// docs/init/CUSTOMIZE/CUSTOMIZE-source-code-and-tests.md).

/* Begin: package specific exports */

export const abstractNpmPackage = function () {
    return 'abstract-npm-package base template';
};

/* End: package specific exports */
