import { type Agent, AGENTS } from '../truthsXml.ts';

type ApprovedByProperties = {
    idPrefix: string;
    value: Agent[];
    onChange: (next: Agent[]) => void
};

// Editable "Approved by" checkboxes (Human / AI). Shared by the edit form and the review card, since approval is
// always togglable - even while a truth is otherwise in review mode. The AI box is disabled in the UI: a human cannot
// claim AI approved a truth, so only AI itself sets that when editing the XML file directly.
const ApprovedBy = function ({ idPrefix, value, onChange }: ApprovedByProperties) {
    return (
        <div className="checkbox-group">
            {AGENTS.map(function (agent) {
                const checkboxId = `${idPrefix}-approved-by-${agent}`;
                return (
                    <label key={agent} className="checkbox" htmlFor={checkboxId}>
                        <input
                            id={checkboxId}
                            type="checkbox"
                            disabled={agent === 'AI'}
                            checked={value.includes(agent)}
                            onChange={function (changeEvent) {
                                const without = value.filter(function (entry) {
                                    return entry !== agent;
                                });
                                onChange(changeEvent.target.checked ? [...without, agent] : without);
                            }}
                        />
                        {agent}
                    </label>
                );
            })}
        </div>
    );
};

export { ApprovedBy };
