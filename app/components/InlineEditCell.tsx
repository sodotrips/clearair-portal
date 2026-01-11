'use client';

import { useState, useRef, useEffect } from 'react';

interface InlineEditCellProps {
  value: string;
  field: string;
  leadId: string;
  rowIndex: string;
  onSave: (rowIndex: string, field: string, value: string) => Promise<boolean>;
  type?: 'text' | 'select' | 'phone' | 'date';
  options?: string[];
  editable?: boolean;
  displayValue?: string | React.ReactNode;
  className?: string;
}

export default function InlineEditCell({
  value,
  field,
  leadId,
  rowIndex,
  onSave,
  type = 'text',
  options = [],
  editable = true,
  displayValue,
  className = '',
}: InlineEditCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current instanceof HTMLInputElement) {
        inputRef.current.select();
      }
    }
  }, [isEditing]);

  useEffect(() => {
    setEditValue(value || '');
  }, [value]);

  const formatPhone = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 10);
    if (digits.length === 0) return '';
    if (digits.length <= 3) return '(' + digits;
    if (digits.length <= 6) return '(' + digits.slice(0, 3) + ') ' + digits.slice(3);
    return '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);
  };

  const handleClick = () => {
    if (editable && !isEditing) {
      setIsEditing(true);
      setEditValue(value || '');
    }
  };

  const handleSave = async () => {
    if (editValue === value) {
      setIsEditing(false);
      return;
    }

    setSaving(true);
    const success = await onSave(rowIndex, field, editValue);
    setSaving(false);

    if (success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditValue(value || '');
      setIsEditing(false);
    } else if (e.key === 'Tab') {
      handleSave();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    let newValue = e.target.value;
    if (type === 'phone') {
      newValue = formatPhone(newValue);
    }
    setEditValue(newValue);
  };

  if (!editable) {
    return (
      <td className={`px-4 py-3 text-sm text-slate-600 truncate ${className}`}>
        {displayValue || value || ''}
      </td>
    );
  }

  if (isEditing) {
    return (
      <td className="px-2 py-1 relative">
        {type === 'select' ? (
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement>}
            value={editValue}
            onChange={handleChange}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            disabled={saving}
            className="w-full px-2 py-1.5 text-sm border border-[#14b8a6] rounded focus:outline-none focus:ring-2 focus:ring-[#14b8a6]/30 bg-white"
          >
            <option value="">Select...</option>
            {options.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type={type === 'date' ? 'date' : 'text'}
            value={editValue}
            onChange={handleChange}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            disabled={saving}
            className="w-full px-2 py-1.5 text-sm border border-[#14b8a6] rounded focus:outline-none focus:ring-2 focus:ring-[#14b8a6]/30"
          />
        )}
        {saving && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <div className="w-3 h-3 border-2 border-[#14b8a6] border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
      </td>
    );
  }

  return (
    <td
      onClick={handleClick}
      className={`px-4 py-3 text-sm truncate cursor-pointer hover:bg-[#14b8a6]/10 transition relative group ${className} ${saved ? 'bg-green-50' : ''}`}
      title="Click to edit"
    >
      <span className={saved ? 'text-green-600' : ''}>
        {displayValue || value || ''}
      </span>
      {saved && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-green-500">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </span>
      )}
      {!saved && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 opacity-0 group-hover:opacity-100 transition">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </span>
      )}
    </td>
  );
}
