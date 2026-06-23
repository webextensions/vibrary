import { useState } from 'react';

import { emptyTruth, nowTimestamp, type Truth } from '../truthsXml.ts';

import { TruthCard } from './TruthCard.tsx';

type TruthsEditorProperties = {
    truths: Truth[];
    allTitles: string[];
    onChange: (next: Truth[]) => void
};

const TruthsEditor = function ({ truths, allTitles, onChange }: TruthsEditorProperties) {
    // Ids of truths currently open in edit mode. Existing truths default to review mode; only newly added truths (or
    // ones the user explicitly clicks "Edit" on) appear here.
    const [editingIds, setEditingIds] = useState<Set<string>>(function () {
        return new Set();
    });

    const toggleMode = function (id: string) {
        setEditingIds(function (previous) {
            const next = new Set(previous);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const updateAt = function (index: number, next: Truth) {
        // Any edit to an existing truth flows through here, so stamp the update time and updater in one place. The
        // editor UI is only ever driven by a human, so the updater is Human; AI stamps itself when editing the file.
        const stamped = { ...next, lastUpdated: nowTimestamp(), updatedBy: 'Human' as const };
        onChange(truths.map(function (truth, position) {
            return position === index ? stamped : truth;
        }));
    };

    const removeAt = function (index: number) {
        onChange(truths.filter(function (_truth, position) {
            return position !== index;
        }));
    };

    const addTruth = function () {
        const truth = emptyTruth();
        onChange([...truths, truth]);
        setEditingIds(function (previous) {
            return new Set(previous).add(truth.id); // a brand-new truth opens directly in edit mode
        });
    };

    return (
        <div className="truths-editor">
            {truths.length === 0 && <p className="placeholder">No truths yet. Add one to get started.</p>}

            {truths.map(function (truth, index) {
                return (
                    <TruthCard
                        key={truth.id}
                        index={index}
                        mode={editingIds.has(truth.id) ? 'edit' : 'review'}
                        value={truth}
                        allTitles={allTitles}
                        onChange={function (next) {
                            updateAt(index, next);
                        }}
                        onToggleMode={function () {
                            toggleMode(truth.id);
                        }}
                        onRemove={function () {
                            removeAt(index);
                        }}
                    />
                );
            })}

            <button type="button" className="add-truth" onClick={addTruth}>+ Add truth</button>
        </div>
    );
};

export { TruthsEditor };
