// mm:ss for an elapsed span; the running job ticks live, finished jobs show their final duration. Kept in its own
// module (free of the React-icon imports in activityPresentation) so it stays unit-testable under plain node.
const formatDuration = function (milliseconds: number): string {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

export { formatDuration };
