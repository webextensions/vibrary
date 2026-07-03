import { AccordionSection } from './AccordionSection.tsx';
import { ActivityMonitor } from './ActivityMonitor.tsx';
import { useActivityQueueActions, useActivityQueueState } from '../activityQueue.ts';

// The Activity monitor view: the background-job queue in its own navigation-rail tab. The accordion's open state lives in
// the queue context so enqueuing a job can auto-expand it; the running+queued count is surfaced as a badge on the rail
// icon (see NavigationRail), so the header carries no badge here.
const ActivityPanel = function ({ onOpenActivity }: { onOpenActivity: (jobId: string, title: string) => void }) {
    const { monitorOpen } = useActivityQueueState();
    const { setMonitorOpen } = useActivityQueueActions();
    return (
        <AccordionSection
            title="Activity monitor"
            expanded={monitorOpen}
            onToggle={function () {
                setMonitorOpen(!monitorOpen);
            }}
        >
            <ActivityMonitor onOpenActivity={onOpenActivity} />
        </AccordionSection>
    );
};

export { ActivityPanel };
