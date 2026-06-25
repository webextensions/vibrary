import formStyles from './forms.module.css';

type ApprovedByProperties = {
    idPrefix: string;
    value: string;
    contentHash: string;
    isEditing: boolean;
    onChange: (next: string) => void
};

// The "Approved" Yes/No control. In edit mode it is a togglable radio pair (picking "Yes" stores the current content
// hash; "No" clears it); in review mode it just reads "Yes" or "No".
const ApprovedBy = function ({ idPrefix, value, contentHash, isEditing, onChange }: ApprovedByProperties) {
    const groupName = `${idPrefix}-approved`;
    const isApproved = value !== '';
    if (!isEditing) {
        return <span>{isApproved ? 'Yes' : 'No'}</span>;
    }
    return (
        <div className={formStyles.radioGroup}>
            <label className={formStyles.radio} htmlFor={`${groupName}-yes`}>
                <input
                    id={`${groupName}-yes`}
                    type="radio"
                    name={groupName}
                    checked={isApproved}
                    onChange={function () {
                        onChange(contentHash);
                    }}
                />
                Yes
            </label>
            <label className={formStyles.radio} htmlFor={`${groupName}-no`}>
                <input
                    id={`${groupName}-no`}
                    type="radio"
                    name={groupName}
                    checked={!isApproved}
                    onChange={function () {
                        onChange('');
                    }}
                />
                No
            </label>
        </div>
    );
};

export { ApprovedBy };
