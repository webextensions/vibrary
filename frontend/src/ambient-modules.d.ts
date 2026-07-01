// Ambient declarations for deep imports that ship no matching types: the project imports with explicit .js extensions,
// which the DefinitelyTyped declarations for react-syntax-highlighter do not cover, and helpmate publishes no types.

declare module 'react-syntax-highlighter/dist/esm/languages/prism/markup.js' {
    // Prism grammar object consumed by PrismLight.registerLanguage, which DefinitelyTyped itself types as `any`.
    const markup: unknown;
    // The underlying module ships a default export, so the declaration has to mirror it.
    // eslint-disable-next-line import-x/no-default-export
    export default markup;
}

declare module 'react-syntax-highlighter/dist/esm/styles/prism/index.js' {
    export { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
}

declare module 'helpmate/dist/dom/alertDialog.js' {
    // Renders a modal <dialog> containing the given content and closes it on a backdrop click.
    export const alertDialog: (message: HTMLElement | string | Array<HTMLElement | string>) => void;
}
