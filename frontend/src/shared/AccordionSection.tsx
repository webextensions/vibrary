import type { ReactNode } from 'react';

import { ChevronIcon } from './Icons.tsx';

import styles from './AccordionSection.module.css';

// A VS Code-style collapsible panel section: a header bar with a rotating chevron, a title, an optional badge and an
// optional right-aligned actions slot, over a body that shows only when expanded. Expansion is controlled by the
// caller so sections collapse independently. Reuses the chevron-rotation pattern from the file tree's folder rows.
type AccordionSectionProperties = {
    title: string;
    expanded: boolean;
    onToggle: () => void;
    badge?: ReactNode;
    actions?: ReactNode;
    children: ReactNode
};

const AccordionSection = function ({ title, expanded, onToggle, badge, actions, children }: AccordionSectionProperties) {
    return (
        <section className={styles.section}>
            <div className={styles.header}>
                <button type="button" className={styles.headerToggle} aria-expanded={expanded} onClick={onToggle}>
                    <ChevronIcon />
                    <span className={styles.title}>{title}</span>
                    {badge}
                </button>
                {actions && <div className={styles.actions}>{actions}</div>}
            </div>
            {expanded && <div className={styles.body}>{children}</div>}
        </section>
    );
};

export { AccordionSection };
