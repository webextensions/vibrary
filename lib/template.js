// Core library logic for the package.
//
// This is where the package's real functionality lives. index.js is a thin wrapper that re-exports
// from here. Replace this stub with your package's real implementation (see
// docs/init/CUSTOMIZE/CUSTOMIZE-source-code-and-tests.md).

const vibrary = function (name = 'world') {
    return `Hello, ${name}!`;
};

export { vibrary };
