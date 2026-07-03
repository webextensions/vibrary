import cx from 'classnames';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

import { commitChanges, discardPaths, generateCommitMessage, getGitDiff, getGitStatus, type GitFileStatus, type GitStash, type GitStashResult, type GitStatus, listStashes, pullChanges, pushChanges, stagePaths, stashAction, stashChanges, unstagePaths } from '../api.ts';
import { confirmDialog } from '../confirmDialog.ts';
import { promptDialog } from '../promptDialog.ts';
import { AccordionSection } from './AccordionSection.tsx';
import { ResponsiveDialog } from './ResponsiveDialog.tsx';
import { AiIcon, DiscardIcon, PlusIcon, RefreshIcon, RemoveIcon } from './Icons.tsx';
import { StashSection } from './StashSection.tsx';

import styles from './SourceControlPanel.module.css';

// One hover-revealed button on a changed-file row (stage, unstage, discard, ...), like VS Code's SCM list.
type FileAction = { label: string; Icon: () => ReactNode; onAction: () => void };

// A single changed-file row: the status letter, the path (basename emphasized via title), and its action buttons.
const FileRow = function (
    { file, statusChar, actions, disabled, onView }:
    { file: GitFileStatus; statusChar: string; actions: FileAction[]; disabled: boolean; onView: () => void }
) {
    // Split into a muted directory (which truncates) and the basename (always fully shown), like VS Code's SCM list.
    const lastSlash = file.path.lastIndexOf('/');
    const directory = lastSlash === -1 ? '' : file.path.slice(0, lastSlash + 1);
    const basename = lastSlash === -1 ? file.path : file.path.slice(lastSlash + 1);
    return (
        <li className={styles.fileRow}>
            <button type="button" className={styles.fileMain} title={`Show changes in ${file.path}`} onClick={onView}>
                <span className={styles.statusChar}>{statusChar}</span>
                <span className={styles.filePath}>
                    {directory !== '' && <span className={styles.fileDir}>{directory}</span>}
                    <span className={styles.fileBase}>{basename}</span>
                </span>
            </button>
            {actions.map(function ({ label, Icon, onAction }) {
                return (
                    <button
                        key={label}
                        type="button"
                        className={styles.rowAction}
                        aria-label={`${label} ${file.path}`}
                        title={label}
                        onClick={onAction}
                        disabled={disabled}
                    >
                        <Icon />
                    </button>
                );
            })}
        </li>
    );
};

// The Source Control view: current branch, changed files grouped into Staged / Changes / Untracked (each with per-file
// and per-group stage / unstage / discard actions), a stash section (save, apply, pop, drop), and a commit box with a
// "Generate with Claude" drafting button plus Commit, Push and Pull. Loads fresh each time the view is shown (it is
// only mounted while active), and refreshes after every mutating action.
const SourceControlPanel = function () {
    const [status, setStatus] = useState<GitStatus | null>(null);
    const [stashes, setStashes] = useState<GitStash[]>([]);
    // A load failure - most importantly "Not a git repository" - shown as the panel's empty state.
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const [summary, setSummary] = useState('');
    const [body, setBody] = useState('');

    // The collapsible sections; Status and Commit open by default like the Explorer's accordions, Stashes closed since
    // it is a secondary view.
    const [statusOpen, setStatusOpen] = useState(true);
    const [stashesOpen, setStashesOpen] = useState(false);
    const [commitOpen, setCommitOpen] = useState(true);

    const [generating, setGenerating] = useState(false);
    const [committing, setCommitting] = useState(false);
    const [pushing, setPushing] = useState(false);
    const [pulling, setPulling] = useState(false);
    const [stashing, setStashing] = useState(false);
    // Errors and notices from an action (stage, commit, push, generate), shown above the commit box.
    const [actionError, setActionError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    // The per-file diff dialog: which file is being viewed and what came back. Discard and Delete are irreversible,
    // so the rows offer a look at what would be lost before the confirm ("what did the agent actually change?" is
    // the most common question here); content: null renders the loading state.
    const [diffView, setDiffView] = useState<{ path: string; untracked: boolean; content: string | null; error: string | null } | null>(null);

    const openDiffView = function (path: string, options: { staged?: boolean; untracked?: boolean }) {
        setDiffView({ path, untracked: options.untracked === true, content: null, error: null });
        void (async function () {
            try {
                const result = await getGitDiff(path, options);
                setDiffView(function (previous) {
                    return previous !== null && previous.path === path ? { ...previous, content: result.diff } : previous;
                });
            } catch (error) {
                setDiffView(function (previous) {
                    return previous !== null && previous.path === path ? { ...previous, error: (error as Error).message } : previous;
                });
            }
        })();
    };

    const refresh = useCallback(async function () {
        setLoading(true);
        try {
            const [nextStatus, nextStashes] = await Promise.all([getGitStatus(), listStashes()]);
            setStatus(nextStatus);
            setStashes(nextStashes);
            setLoadError(null);
        } catch (error) {
            setStatus(null);
            setStashes([]);
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
                const [nextStatus, nextStashes] = await Promise.all([getGitStatus(), listStashes()]);
                if (isActive) {
                    setStatus(nextStatus);
                    setStashes(nextStashes);
                    setLoadError(null);
                }
            } catch (error) {
                if (isActive) {
                    setStatus(null);
                    setStashes([]);
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

    const busy = generating || committing || pushing || pulling || stashing;

    // Run an action that returns refreshed status, surfacing any failure as the action error. Used by
    // stage/unstage/discard so a single round trip both mutates and re-renders.
    const runStatusAction = async function (action: () => Promise<GitStatus>) {
        setActionError(null);
        setNotice(null);
        try {
            setStatus(await action());
        } catch (error) {
            setActionError((error as Error).message);
        }
    };

    // Same, for stash mutations, which answer with both the refreshed status and the refreshed stash list.
    const runStashAction = async function (action: () => Promise<GitStashResult>) {
        setActionError(null);
        setNotice(null);
        try {
            const result = await action();
            setStatus(result.status);
            setStashes(result.stashes);
        } catch (error) {
            setActionError((error as Error).message);
        }
    };

    // Discard is destructive (a tracked file loses its edits, an untracked file is deleted), so every discard action
    // confirms first with a message matching what will actually happen.
    const confirmAndDiscard = async function (paths: string[], message: string) {
        const confirmed = await confirmDialog(message, 'Discard');
        if (!confirmed) {
            return;
        }
        await runStatusAction(function () {
            return discardPaths(paths);
        });
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
        // A branch without an upstream gets published (push -u) by the backend; say so in the confirmation.
        const hasUpstream = status === null || status.tracking !== null;
        const branchName = status?.current || 'the current branch';
        const confirmed = await confirmDialog(
            hasUpstream ? `Push ${branchName} to its remote?` : `${branchName} has no upstream branch yet. Publish it to the remote?`,
            hasUpstream ? 'Push' : 'Publish'
        );
        if (!confirmed) {
            return;
        }
        setPushing(true);
        setActionError(null);
        setNotice(null);
        try {
            setStatus(await pushChanges());
            setNotice('Pushed.');
        } catch (error) {
            setActionError((error as Error).message);
        } finally {
            setPushing(false);
        }
    };

    const handlePull = async function () {
        setPulling(true);
        setActionError(null);
        setNotice(null);
        try {
            setStatus(await pullChanges());
            setNotice('Pulled.');
        } catch (error) {
            setActionError((error as Error).message);
        } finally {
            setPulling(false);
        }
    };

    // Stash everything currently shown in Status (staged + unstaged + untracked) under an optional message. The prompt
    // allows an empty submit (git's default "WIP on ..." message); null means the user cancelled.
    const handleStashSave = async function () {
        const message = await promptDialog({
            message: 'Stash all current changes. Optional message:',
            placeholder: 'Leave empty for git\'s default message',
            confirmLabel: 'Stash',
            allowEmpty: true
        });
        if (message === null) {
            return;
        }
        setStashing(true);
        try {
            await runStashAction(function () {
                return stashChanges(message === '' ? undefined : message);
            });
        } finally {
            setStashing(false);
        }
    };

    const handleStashApply = function (stash: GitStash) {
        void runStashAction(function () {
            return stashAction('apply', stash.index);
        });
    };

    const handleStashPop = function (stash: GitStash) {
        void runStashAction(function () {
            return stashAction('pop', stash.index);
        });
    };

    // Dropping deletes the stashed changes for good, so it confirms first; apply/pop keep them recoverable.
    const handleStashDrop = async function (stash: GitStash) {
        const confirmed = await confirmDialog(`Drop stash@{${stash.index}} ("${stash.message}")? Its changes will be lost.`, 'Drop');
        if (!confirmed) {
            return;
        }
        await runStashAction(function () {
            return stashAction('drop', stash.index);
        });
    };

    const totalChanged = staged.length + changes.length + untracked.length;

    return (
        <div className={styles.sourceControl}>
            <div className={styles.header}>
                <span className={styles.title}>Source Control</span>
                {status !== null && status.current && (
                    <span
                        className={styles.branch}
                        title={status.tracking === null ? `Branch ${status.current} (no upstream - Push will publish it)` : `Branch ${status.current}, tracking ${status.tracking}`}
                    >
                        {status.current}
                    </span>
                )}
                {status !== null && (status.ahead > 0 || status.behind > 0) && (
                    <span
                        className={styles.syncState}
                        title={`${status.ahead} commit${status.ahead === 1 ? '' : 's'} ahead, ${status.behind} behind ${status.tracking ?? 'upstream'}`}
                    >
                        {status.ahead > 0 && `↑${status.ahead}`}
                        {status.ahead > 0 && status.behind > 0 && ' '}
                        {status.behind > 0 && `↓${status.behind}`}
                    </span>
                )}
            </div>

            <AccordionSection
                title="Status"
                expanded={statusOpen}
                onToggle={function () {
                    setStatusOpen(!statusOpen);
                }}
                badge={totalChanged > 0 ? <span className={styles.statusCount}>{totalChanged}</span> : undefined}
                actions={
                    <button type="button" className={cx(styles.iconButton, loading && styles.spinning)} aria-label="Refresh" title="Refresh" onClick={refresh} disabled={loading || busy}>
                        <RefreshIcon />
                    </button>
                }
            >
                {totalChanged === 0 && <p className={styles.message}>No changes.</p>}

                {staged.length > 0 &&
                <section className={styles.group}>
                    <div className={styles.groupHeader}>
                        <p className={styles.groupTitle}>Staged ({staged.length})</p>
                        <button
                            type="button"
                            className={styles.groupAction}
                            aria-label="Unstage all staged files"
                            title="Unstage all"
                            disabled={busy}
                            onClick={function () {
                                void runStatusAction(function () {
                                    return unstagePaths(staged.map(function (file) {
                                        return file.path;
                                    }));
                                });
                            }}
                        >
                            <RemoveIcon />
                        </button>
                    </div>
                    <ul className={styles.fileList}>
                        {staged.map(function (file) {
                            return (
                                <FileRow
                                    key={file.path}
                                    file={file}
                                    statusChar={file.index}
                                    disabled={busy}
                                    onView={function () {
                                        openDiffView(file.path, { staged: true });
                                    }}
                                    actions={[{
                                        label: 'Unstage',
                                        Icon: RemoveIcon,
                                        onAction: function () {
                                            void runStatusAction(function () {
                                                return unstagePaths([file.path]);
                                            });
                                        }
                                    }]}
                                />
                            );
                        })}
                    </ul>
                </section>}

                {changes.length > 0 &&
                <section className={styles.group}>
                    <div className={styles.groupHeader}>
                        <p className={styles.groupTitle}>Changes ({changes.length})</p>
                        <button
                            type="button"
                            className={styles.groupAction}
                            aria-label="Discard all changes"
                            title="Discard all changes"
                            disabled={busy}
                            onClick={function () {
                                void confirmAndDiscard(
                                    changes.map(function (file) {
                                        return file.path;
                                    }),
                                    `Discard changes in ${changes.length} file${changes.length === 1 ? '' : 's'}? This cannot be undone.`
                                );
                            }}
                        >
                            <DiscardIcon />
                        </button>
                        <button
                            type="button"
                            className={styles.groupAction}
                            aria-label="Stage all changes"
                            title="Stage all"
                            disabled={busy}
                            onClick={function () {
                                void runStatusAction(function () {
                                    return stagePaths(changes.map(function (file) {
                                        return file.path;
                                    }));
                                });
                            }}
                        >
                            <PlusIcon />
                        </button>
                    </div>
                    <ul className={styles.fileList}>
                        {changes.map(function (file) {
                            return (
                                <FileRow
                                    key={file.path}
                                    file={file}
                                    statusChar={file.working_dir}
                                    disabled={busy}
                                    onView={function () {
                                        openDiffView(file.path, {});
                                    }}
                                    actions={[
                                        {
                                            label: 'Discard changes',
                                            Icon: DiscardIcon,
                                            onAction: function () {
                                                void confirmAndDiscard([file.path], `Discard changes in "${file.path}"? This cannot be undone.`);
                                            }
                                        },
                                        {
                                            label: 'Stage',
                                            Icon: PlusIcon,
                                            onAction: function () {
                                                void runStatusAction(function () {
                                                    return stagePaths([file.path]);
                                                });
                                            }
                                        }
                                    ]}
                                />
                            );
                        })}
                    </ul>
                </section>}

                {untracked.length > 0 &&
                <section className={styles.group}>
                    <div className={styles.groupHeader}>
                        <p className={styles.groupTitle}>Untracked ({untracked.length})</p>
                        <button
                            type="button"
                            className={styles.groupAction}
                            aria-label="Delete all untracked files"
                            title="Delete all untracked files"
                            disabled={busy}
                            onClick={function () {
                                void confirmAndDiscard(
                                    untracked.map(function (file) {
                                        return file.path;
                                    }),
                                    `Delete ${untracked.length} untracked file${untracked.length === 1 ? '' : 's'}? This cannot be undone.`
                                );
                            }}
                        >
                            <RemoveIcon />
                        </button>
                        <button
                            type="button"
                            className={styles.groupAction}
                            aria-label="Stage all untracked files"
                            title="Stage all"
                            disabled={busy}
                            onClick={function () {
                                void runStatusAction(function () {
                                    return stagePaths(untracked.map(function (file) {
                                        return file.path;
                                    }));
                                });
                            }}
                        >
                            <PlusIcon />
                        </button>
                    </div>
                    <ul className={styles.fileList}>
                        {untracked.map(function (file) {
                            return (
                                <FileRow
                                    key={file.path}
                                    file={file}
                                    statusChar="?"
                                    disabled={busy}
                                    onView={function () {
                                        openDiffView(file.path, { untracked: true });
                                    }}
                                    actions={[
                                        {
                                            label: 'Delete',
                                            Icon: RemoveIcon,
                                            onAction: function () {
                                                void confirmAndDiscard([file.path], `Delete untracked file "${file.path}"? This cannot be undone.`);
                                            }
                                        },
                                        {
                                            label: 'Stage',
                                            Icon: PlusIcon,
                                            onAction: function () {
                                                void runStatusAction(function () {
                                                    return stagePaths([file.path]);
                                                });
                                            }
                                        }
                                    ]}
                                />
                            );
                        })}
                    </ul>
                </section>}
            </AccordionSection>

            {diffView !== null &&
            <ResponsiveDialog
                open
                onClose={function () {
                    setDiffView(null);
                }}
                title={diffView.untracked ? `${diffView.path} (untracked - full content)` : diffView.path}
                maxWidthWhenNotFullScreen={760}
                noPrimaryButton
            >
                {diffView.error !== null && <p className={styles.message}>{diffView.error}</p>}
                {diffView.error === null && diffView.content === null && <p className={styles.message}>Loading...</p>}
                {diffView.error === null && diffView.content === '' && <p className={styles.message}>No changes.</p>}
                {diffView.error === null && diffView.content !== null && diffView.content !== '' &&
                <pre className={styles.diffText}>{diffView.content}</pre>}
            </ResponsiveDialog>}

            <StashSection
                stashes={stashes}
                expanded={stashesOpen}
                onToggle={function () {
                    setStashesOpen(!stashesOpen);
                }}
                busy={busy}
                stashing={stashing}
                totalChanged={totalChanged}
                onStashSave={handleStashSave}
                onStashApply={handleStashApply}
                onStashPop={handleStashPop}
                onStashDrop={handleStashDrop}
            />

            <AccordionSection
                title="Commit"
                expanded={commitOpen}
                onToggle={function () {
                    setCommitOpen(!commitOpen);
                }}
            >
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
                        <button
                            type="button"
                            className={styles.secondaryButton}
                            onClick={handlePull}
                            disabled={busy}
                        >
                            {pulling ? <span className={styles.spinner} role="status" aria-label="Pulling" /> : 'Pull'}
                        </button>
                    </div>
                    {actionError !== null && <p className={styles.error}>{actionError}</p>}
                    {notice !== null && <p className={styles.notice}>{notice}</p>}
                </div>
            </AccordionSection>
        </div>
    );
};

export { SourceControlPanel };
