import formStyles from './forms.module.css';

type ApprovedByProperties = {
    idPrefix: string;
    value: string;
    contentHash: string;
    onChange: (next: string) => void
};

// The editable "Approved by" checkbox. Shared by the edit form and the review card, since approval is always togglable
// - even while a truth is otherwise in review mode. Checking it stores the current content hash; unchecking clears it.
const ApprovedBy = function ({ idPrefix, value, contentHash, onChange }: ApprovedByProperties) {
    const checkboxId = `${idPrefix}-approved-by-human`;
    return (
        <div className={formStyles.checkboxGroup}>
            <label className={formStyles.checkbox} htmlFor={checkboxId}>
                <input
                    id={checkboxId}
                    type="checkbox"
                    checked={value !== ''}
                    onChange={function (changeEvent) {
                        onChange(changeEvent.target.checked ? contentHash : '');
                    }}
                />
                Human
            </label>
        </div>
    );
};

export { ApprovedBy };
