// Helpers for the dependency-category declaration format used by package.json.ts (see its
// "Dependency declaration format" header note): dependencies are declared in semantic category
// objects (dependenciesFor*), a branch-owned mapping decides which npm field each category lands
// in, and per-category {category}_overrides objects merge into the manifest's "overrides".

// The npm fields a category may be mapped to. A runtime value (not just a type) so the mapping can
// be validated during generation too - package.json.ts is loaded with its types stripped there.
const NPM_DEPENDENCIES_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'] as const;

type NpmDependenciesField = typeof NPM_DEPENDENCIES_FIELDS[number];

type DependencyDeclarations = {
    dependencyCategories: Record<string, Record<string, string>>;
    dependencyCategoriesMapping: Record<string, NpmDependenciesField>;
    dependencyCategoriesOverrides: Record<string, Record<string, unknown>>
};

// Case-insensitive compare, mirroring compareEntries in
// scripts/health-checks/checks/claude-settings-sort.ts (duplicated rather than imported: that file
// is a CLI script that reads process.argv and calls process.exit at module scope). The locale is
// pinned so the order does not depend on the machine's ICU locale, and the codepoint tiebreak keeps
// case-only neighbours deterministic (base sensitivity treats them as equal, and
// Array.prototype.sort stability is not guaranteed to express the intended order).
const compareKeys = function (a: string, b: string): number {
    const byLocale = a.localeCompare(b, 'en', { sensitivity: 'base' });
    if (byLocale !== 0) {
        return byLocale;
    }
    if (a < b) {
        return -1;
    }
    if (a > b) {
        return 1;
    }
    return 0;
};

// Alphabetical sort of an object's keys, matching the repo's sorting convention (package-cjson
// re-sorts the generated package.json anyway).
const toObjectSortedByKey = function <ValueType>(object: Record<string, ValueType>) {
    return Object.fromEntries(
        Object.entries(object).toSorted(function ([keyA], [keyB]) {
            return compareKeys(keyA, keyB);
        })
    );
};

// Guard for the category declarations. It asserts:
// - dependencyCategories, dependencyCategoriesMapping, and dependencyCategoriesOverrides declare
//   the SAME category names - a category missing from the mapping would otherwise be silently
//   dropped from the manifest.
// - Every dependencyCategoriesMapping value is one of the three npm fields - a typo would otherwise
//   drop that whole category just as silently.
// - A package may appear in multiple categories, but every occurrence must carry the EXACT same
//   value - otherwise the category merge would silently pick one of them. Categories mapped to
//   "peerDependencies" are exempt: a peer contract (e.g. ">=18") legitimately differs from the
//   concrete dev copy declared in another category.
// - A package may appear in only ONE {category}_overrides object - overrides apply to the whole
//   install tree, so a second declaration would at best be redundant and at worst silently lose
//   to the merge order.
const assertDependencyDeclarationsConsistent = function ({
    dependencyCategories,
    dependencyCategoriesMapping,
    dependencyCategoriesOverrides
}: DependencyDeclarations) {
    const categoryNames = Object.keys(dependencyCategories);
    const companions: Record<string, string[]> = {
        dependencyCategoriesMapping: Object.keys(dependencyCategoriesMapping),
        dependencyCategoriesOverrides: Object.keys(dependencyCategoriesOverrides)
    };
    for (const [companionName, companionCategoryNames] of Object.entries(companions)) {
        for (const categoryName of categoryNames) {
            if (!companionCategoryNames.includes(categoryName)) {
                throw new Error(`Category "${categoryName}" is declared in dependencyCategories but missing from ${companionName}`);
            }
        }
        for (const categoryName of companionCategoryNames) {
            if (!categoryNames.includes(categoryName)) {
                throw new Error(`Category "${categoryName}" is declared in ${companionName} but missing from dependencyCategories`);
            }
        }
    }

    // Looks vacuous to tsc (targetField is already typed NpmDependenciesField), but it is not: the
    // generation path loads package.json.ts with its types stripped, which is exactly when a typo
    // here would truncate the manifest.
    for (const [categoryName, targetField] of Object.entries(dependencyCategoriesMapping)) {
        if (!NPM_DEPENDENCIES_FIELDS.includes(targetField)) {
            throw new Error(
                `Category "${categoryName}" maps to "${targetField}", which is not an npm dependencies` +
                ` field - use one of: ${NPM_DEPENDENCIES_FIELDS.join(', ')}`
            );
        }
    }

    const seen: Record<string, { categoryName: string; value: string }> = {};
    for (const [categoryName, targetField] of Object.entries(dependencyCategoriesMapping)) {
        if (targetField === 'peerDependencies') {
            continue;
        }
        const categoryEntries = Object.entries(dependencyCategories[categoryName]);
        for (const [packageName, value] of categoryEntries) {
            const earlier = seen[packageName];
            if (earlier && earlier.value !== value) {
                throw new Error(
                    `Package "${packageName}" appears in "${earlier.categoryName}" (${earlier.value})` +
                    ` and "${categoryName}" (${value}) with different values - keep them identical` +
                    ' or declare it in a single category'
                );
            }
            seen[packageName] = { categoryName, value };
        }
    }

    const overridesHome: Record<string, string> = {};
    for (const [categoryName, categoryOverrides] of Object.entries(dependencyCategoriesOverrides)) {
        for (const packageName of Object.keys(categoryOverrides)) {
            const earlierCategoryName = overridesHome[packageName];
            if (earlierCategoryName) {
                throw new Error(
                    `Package "${packageName}" appears in the overrides of "${earlierCategoryName}"` +
                    ` and "${categoryName}" - overrides apply to the whole install tree, declare it once`
                );
            }
            overridesHome[packageName] = categoryName;
        }
    }
};

// Validates the declarations once (a violation throws, failing the caller's module load) and
// returns the two merge helpers:
// - collectDependenciesFor(npmField): merges every category mapped to that npm field into one
//   alphabetically sorted object. A package may appear in multiple categories, as long as every
//   occurrence in a non-peer-mapped category carries the identical value; categories mapped to
//   "peerDependencies" are exempt from that consistency rule, so a peer contract may differ from
//   the concrete copy elsewhere (e.g. react: peer contract ">=18" + app dev copy "^19.2.8").
//   When a multi-category package resolves into both "dependencies" and "devDependencies", it is
//   emitted only in "dependencies".
// - collectOverrides(): merges the per-category {category}_overrides objects into one
//   alphabetically sorted object.
const createDependencyCollectors = function (declarations: DependencyDeclarations) {
    assertDependencyDeclarationsConsistent(declarations);

    const { dependencyCategories, dependencyCategoriesMapping, dependencyCategoriesOverrides } = declarations;

    const collectDependenciesFor = function (npmField: NpmDependenciesField) {
        const merged: Record<string, string> = {};
        for (const [categoryName, targetField] of Object.entries(dependencyCategoriesMapping)) {
            if (targetField === npmField) {
                Object.assign(merged, dependencyCategories[categoryName]);
            }
        }
        // "dependencies" wins: a package may be declared in multiple categories (e.g. commander in
        // a server category and a build category); on a branch whose mapping splits those
        // categories across "dependencies" and "devDependencies", emit it only in "dependencies".
        // Categories mapped to "peerDependencies" are deliberately untouched - a peer contract
        // coexists with the concrete copy declared elsewhere (see the header note above).
        if (npmField === 'devDependencies') {
            for (const [categoryName, targetField] of Object.entries(dependencyCategoriesMapping)) {
                if (targetField !== 'dependencies') {
                    continue;
                }
                const categoryPackageNames = Object.keys(dependencyCategories[categoryName]);
                for (const packageName of categoryPackageNames) {
                    delete merged[packageName];
                }
            }
        }
        return toObjectSortedByKey(merged);
    };

    const collectOverrides = function () {
        const merged: Record<string, unknown> = Object.assign({}, ...Object.values(dependencyCategoriesOverrides));
        return toObjectSortedByKey(merged);
    };

    return { collectDependenciesFor, collectOverrides };
};

export { createDependencyCollectors };
