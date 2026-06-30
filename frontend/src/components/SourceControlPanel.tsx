import cx from 'classnames';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

import { commitChanges, generateCommitMessage, getGitStatus, type GitFileStatus, type GitStatus, pushChanges, stagePaths, unstagePaths } from '../api.ts';
import { confirmDialog } from '../confirmDialog.ts';
import { AiIcon, PlusIcon, RefreshIcon, RemoveIcon } from './Icons.tsx';

import styles from './SourceControlPanel.module.css';

// A single changed-file row: the status letter, the path (basename emphasized via title), and a stage or unstage button.
const FileRow = function (
    { file, statusChar, actionLabel, ActionIcon, onAction, disabled }:
    { file: GitFileStatus; statusChar: string; actionLabel: string; ActionIcon: () => ReactNode; onAction: () => void; disabled: boolean }
) {
    // Split into a muted directory (which truncates) and the basename (always fully shown), like VS Code's SCM list.
    const lastSlash = file.path.lastIndexOf('/');
    const directory = lastSlash === -1 ? '' : file.path.slice(0, lastSlash + 1);
    const basename = lastSlash === -1 ? file.path : file.path.slice(lastSlash + 1);
    return (
        <li className={styles.fileRow}>
            <span className={styles.statusChar} title={file.path}>{statusChar}</span>
            <span className={styles.filePath} title={file.path}>
                {directory !== '' && <span className={styles.fileDir}>{directory}</span>}
                <span className={styles.fileBase}>{basename}</span>
            </span>
            <button
                type="button"
                className={styles.rowAction}
                aria-label={`${actionLabel} ${file.path}`}
                title={actionLabel}
                onClick={onAction}
                disabled={disabled}
            >
                <ActionIcon />
            </button>
        </li>
    );
};

// The Source Control view: current branch, changed files grouped into Staged / Changes / Untracked, and a commit box
// with a "Generate with Claude" drafting button plus Commit and Push. Loads fresh each time the view is shown (it is
// only mounted while active), and refreshes its status after every mutating action.
const SourceControlPanel = function () {
    const [status, setStatus] = useState<GitStatus | null>(null);
    // A load failure - most importantly "Not a git repository" - shown as the panel's empty state.
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const [summary, setSummary] = useState('');
    const [body, setBody] = useState('');

    const [generating, setGenerating] = useState(false);
    const [committing, setCommitting] = useState(false);
    const [pushing, setPushing] = useState(false);
    // Errors and notices from an action (stage, commit, push, generate), shown above the commit box.
    const [actionError, setActionError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const refresh = useCallback(async function () {
        setLoading(true);
        try {
            setStatus(await getGitStatus());
            setLoadError(null);
        } catch (error) {
            setStatus(null);
            setLoadError((error as Error).message);
        } finally {
            setLoading(false);
        }
    }, []);

    // Load once when the view is shown. Done inline (not via refresh) so no state is set synchronously in the effect
    // body: the first state update happens only after the await resolves. `loading` already starts true.
    useEffect(function () {
        let isActive = true;
        const load = async function () {
            try {
                const next = await getGitStatus();
                if (isActive) {
                    setStatus(next);
                    setLoadError(null);
                }
            } catch (error) {
                if (isActive) {
                    setStatus(null);
                    setLoadError((error as Error).message);
                }
            } finally {
                if (isActive) {
                    setLoading(false);
                }
            }
        };
        void load();
        return function () {
            isActive = false;
        };
    }, []);

    // Staged entries carry an index change; Changes are tracked files with a worktree change; Untracked are new files.
    // A file mid-edit after staging (e.g. "MM") legitimately appears in both Staged and Changes. Untracked is git's "??"
    // (both columns "?"); a real letter in a column means that column changed.
    const { staged, changes, untracked } = useMemo(function () {
        const files = status?.files ?? [];
        const isUntracked = function (file: GitFileStatus) {
            return file.index === '?' && file.working_dir === '?';
        };
        return {
            staged: files.filter(function (file) {
                return !isUntracked(file) && file.index !== ' ';
            }),
            changes: files.filter(function (file) {
                return !isUntracked(file) && file.working_dir !== ' ';
            }),
            untracked: files.filter(function (file) {
                return isUntracked(file);
            })
        };
    }, [status]);

    if (loading && status === null && loadError === null) {
        return <p className={styles.message}>Loading...</p>;
    }

    if (loadError !== null) {
        return (
            <div className={styles.sourceControl}>
                <div className={styles.header}>
                    <span className={styles.title}>Source Control</span>
                    <button type="button" className={cx(styles.iconButton, loading && styles.spinning)} aria-label="Refresh" title="Refresh" onClick={refresh} disabled={loading}>
                        <RefreshIcon />
                    </button>
                </div>
                <p className={styles.message}>{loadError}</p>
            </div>
        );
    }

    const busy = generating || committing || pushing;

    // Run an action that returns refreshed status, surfacing any failure as the action error. Used by stage/unstage so a
    // single round trip both mutates and re-renders.
    const runStatusAction = async function (action: () => Promise<GitStatus>) {
        setActionError(null);
        setNotice(null);
        try {
            setStatus(await action());
        } catch (error) {
            setActionError((error as Error).message);
        }
    };

    const handleGenerate = async function () {
        setGenerating(true);
        setActionError(null);
        setNotice(null);
        try {
            const message = await generateCommitMessage();
            setSummary(message.summary);
            setBody(message.body);
        } catch (error) {
            setActionError((error as Error).message);
        } finally {
            setGenerating(false);
        }
    };

    const handleCommit = async function () {
        if (summary.trim() === '' || staged.length === 0) {
            return;
        }
        setCommitting(true);
        setActionError(null);
        setNotice(null);
        try {
            setStatus(await commitChanges({ summary: summary.trim(), body }));
            setSummary('');
            setBody('');
            setNotice('Committed.');
        } catch (error) {
            setActionError((error as Error).message);
        } finally {
            setCommitting(false);
        }
    };

    const handlePush = async function () {
        const confirmed = await confirmDialog(`Push ${status?.current || 'the current branch'} to its remote?`, 'Push');
        if (!confirmed) {
            return;
        }
        setPushing(true);
        setActionError(null);
        setNotice(null);
        try {
            await pushChanges();
            setNotice('Pushed.');
        } catch (error) {
            setActionError((error as Error).message);
        } finally {
            setPushing(false);
        }
    };

    const totalChanged = staged.length + changes.length + untracked.length;

    return (
        <div className={styles.sourceControl}>
            <div className={styles.header}>
                <span className={styles.title}>Source Control</span>
                {status !== null && status.current && <span className={styles.branch} title={`Branch ${status.current}`}>{status.current}</span>}
                <button type="button" className={cx(styles.iconButton, loading && styles.spinning)} aria-label="Refresh" title="Refresh" onClick={refresh} disabled={loading || busy}>
                    <RefreshIcon />
                </button>
            </div>

            <div className={styles.commitBox}>
                <input
                    type="text"
                    className={styles.summaryInput}
                    placeholder="Summary (required)"
                    aria-label="Commit summary"
                    value={summary}
                    disabled={busy}
                    onChange={function (changeEvent) {
                        setSummary(changeEvent.target.value);
                    }}
                />
                <textarea
                    className={styles.bodyInput}
                    placeholder="Extended description"
                    aria-label="Commit description"
                    rows={4}
                    value={body}
                    disabled={busy}
                    onChange={function (changeEvent) {
                        setBody(changeEvent.target.value);
                    }}
                />
                <div className={styles.commitActions}>
                    <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={handleGenerate}
                        disabled={busy || staged.length === 0}
                        title={staged.length === 0 ? 'Stage changes to generate a message' : 'Draft a commit message with Claude'}
                    >
                        {generating ? <span className={styles.spinner} role="status" aria-label="Generating" /> : <AiIcon />}
                        Generate
                    </button>
                    <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={handleCommit}
                        disabled={busy || summary.trim() === '' || staged.length === 0}
                    >
                        {committing ? <span className={styles.spinner} role="status" aria-label="Committing" /> : 'Commit'}
                    </button>
                    <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={handlePush}
                        disabled={busy}
                    >
                        {pushing ? <span className={styles.spinner} role="status" aria-label="Pushing" /> : 'Push'}
                    </button>
                </div>
                {actionError !== null && <p className={styles.error}>{actionError}</p>}
                {notice !== null && <p className={styles.notice}>{notice}</p>}
            </div>

            {totalChanged === 0 && <p className={styles.message}>No changes.</p>}

            {staged.length > 0 &&
            <section className={styles.group}>
                <p className={styles.groupTitle}>Staged ({staged.length})</p>
                <ul className={styles.fileList}>
                    {staged.map(function (file) {
                        return (
                            <FileRow
                                key={file.path}
                                file={file}
                                statusChar={file.index}
                                actionLabel="Unstage"
                                ActionIcon={RemoveIcon}
                                disabled={busy}
                                onAction={function () {
                                    void runStatusAction(function () {
                                        return unstagePaths([file.path]);
                                    });
                                }}
                            />
                        );
                    })}
                </ul>
            </section>}

            {changes.length > 0 &&
            <section className={styles.group}>
                <p className={styles.groupTitle}>Changes ({changes.length})</p>
                <ul className={styles.fileList}>
                    {changes.map(function (file) {
                        return (
                            <FileRow
                                key={file.path}
                                file={file}
                                statusChar={file.working_dir}
                                actionLabel="Stage"
                                ActionIcon={PlusIcon}
                                disabled={busy}
                                onAction={function () {
                                    void runStatusAction(function () {
                                        return stagePaths([file.path]);
                                    });
                                }}
                            />
                        );
                    })}
                </ul>
            </section>}

            {untracked.length > 0 &&
            <section className={styles.group}>
                <p className={styles.groupTitle}>Untracked ({untracked.length})</p>
                <ul className={styles.fileList}>
                    {untracked.map(function (file) {
                        return (
                            <FileRow
                                key={file.path}
                                file={file}
                                statusChar="?"
                                actionLabel="Stage"
                                ActionIcon={PlusIcon}
                                disabled={busy}
                                onAction={function () {
                                    void runStatusAction(function () {
                                        return stagePaths([file.path]);
                                    });
                                }}
                            />
                        );
                    })}
                </ul>
            </section>}
        </div>
    );
};

export { SourceControlPanel };
