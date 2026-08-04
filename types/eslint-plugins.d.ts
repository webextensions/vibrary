// eslint-config-ironplate and eslint-plugin-import-newlines ship no TypeScript types, so the ESM
// "import" statements in eslint.config.js would otherwise fail the tsc check (TS7016 under
// noImplicitAny / strict). Declare them ambiently. (The other ESLint packages used there -
// simple-import-sort, globals - ship types.)
declare module 'eslint-config-ironplate/node-typescript.js' {
    import type { Linter } from 'eslint';

    const config: Linter.Config[];
    // eslint-disable-next-line import-x/no-default-export
    export default config;
}
declare module 'eslint-plugin-import-newlines';
