'use client';

import { useState } from 'react';
import { normalizeSubName, subColor } from '@/lib/subcontractors';

interface Props {
  value: string;
  onChange: (name: string) => void;
  names: string[];
  labelClass?: string;
  inputClass?: string;
  required?: boolean;
}

const ADD_NEW = '__add_new__';

export default function SubcontractorSelect({
  value,
  onChange,
  names,
  labelClass = 'block text-sm font-medium text-slate-700 mb-1',
  inputClass = 'w-full px-3 py-2 border border-slate-300 rounded-lg',
  required,
}: Props) {
  const current = normalizeSubName(value);
  // If the saved name isn't in the known list yet, keep it selectable.
  const options = [...new Set([...names, current].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const [addingNew, setAddingNew] = useState(false);

  const color = subColor(current);

  return (
    <div>
      <label className={labelClass}>
        Subcontractor Name {required && <span className="text-red-500">*</span>}
      </label>

      {addingNew ? (
        <div className="flex gap-2">
          <input
            type="text"
            autoFocus
            value={current}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Type the subcontractor's name"
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => setAddingNew(false)}
            className="shrink-0 px-3 py-2 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg transition"
          >
            Done
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {current && <span className={`shrink-0 w-3 h-3 rounded-full ${color.dot}`} />}
          <select
            value={options.includes(current) ? current : ''}
            onChange={(e) => {
              if (e.target.value === ADD_NEW) {
                onChange('');
                setAddingNew(true);
              } else {
                onChange(e.target.value);
              }
            }}
            required={required}
            className={inputClass}
          >
            <option value="">Select subcontractor...</option>
            {options.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
            <option value={ADD_NEW}>+ Add new name...</option>
          </select>
        </div>
      )}

      <p className="text-xs text-slate-400 mt-1">
        Saved to the &quot;Subcontractor Name&quot; column. Subcontractors have no portal access.
      </p>
    </div>
  );
}
