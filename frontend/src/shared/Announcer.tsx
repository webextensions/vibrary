import { useAnnouncement } from './announcer.ts';

import styles from './Announcer.module.css';

// The app's single polite live region, mounted once at the root. Visually hidden; screen readers speak whatever
// announce() (announcer.ts) puts here. aria-atomic so a message is always read whole, never as a diff.
const Announcer = function () {
    const message = useAnnouncement();
    return (
        <div aria-live="polite" aria-atomic="true" className={styles.visuallyHidden}>{message}</div>
    );
};

export { Announcer };
