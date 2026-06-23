import { type RefObject, useEffect, useRef, useState } from 'react';

// Twitter/X-style "hide on scroll down, show on scroll up" visibility for a floating control. Tracks the scroll position
// of the given element and returns whether the control should currently be shown: visible at the top and whenever the
// user scrolls up, hidden once they scroll down past a small jitter threshold. Starts visible so the control is present
// at initial load.
const useScrollVisibility = function (reference: RefObject<HTMLElement | null>) {
    const [visible, setVisible] = useState(true);
    const lastYReference = useRef(0);

    useEffect(function () {
        const element = reference.current;
        if (!element) {
            return;
        }
        const handleScroll = function () {
            const y = element.scrollTop;
            // Ignore sub-threshold jitter so the control does not flicker on tiny scroll moves.
            if (Math.abs(y - lastYReference.current) < 8) {
                return;
            }
            setVisible(y <= 0 || y < lastYReference.current);
            lastYReference.current = y;
        };
        element.addEventListener('scroll', handleScroll, { passive: true });
        return function () {
            element.removeEventListener('scroll', handleScroll);
        };
    }, [reference]);

    return visible;
};

export { useScrollVisibility };
