import { type TitleIndexEntry } from '../api.ts';
import { type JobTarget } from './activityQueue.ts';

// Resolve a job's recorded entry target against the CURRENT title index, so a click in the activity view opens the
// entry where it lives now rather than where it lived when the job was enqueued. The recorded file wins when the
// title still resolves there (duplicate titles resolve to the run's own file, not the folder's first occurrence);
// an entry moved to another file is followed by title; a title found nowhere returns null so the caller can show
// the same "renamed or removed" toast the relation chips use instead of a silent dead click.
const resolveJobTarget = function (titleIndex: TitleIndexEntry[], target: JobTarget): TitleIndexEntry | null {
    const inRecordedFile = titleIndex.find(function (entry) {
        return entry.title === target.entryTitle && entry.path === target.filePath;
    });
    if (inRecordedFile !== undefined) {
        return inRecordedFile;
    }
    const elsewhere = titleIndex.find(function (entry) {
        return entry.title === target.entryTitle;
    });
    return elsewhere ?? null;
};

export { resolveJobTarget };
