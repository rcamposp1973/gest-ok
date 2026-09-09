import React, { useState, useEffect, useRef } from 'react';

interface FormattedAmountInputProps {
  id?: string;
  value: number;
  onChange: (val: number) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  autoSelectOnFocus?: boolean;
}

/**
 * FormattedAmountInput
 * Renders integer amounts with Chilean thousands separators (e.g. "54.329.805")
 * without currency symbol, allowing live typing, backspacing, copy/pasting,
 * and preserving cursor position seamlessly.
 */
export const FormattedAmountInput: React.FC<FormattedAmountInputProps> = ({
  id,
  value,
  onChange,
  placeholder = "0",
  className = "",
  disabled = false,
  min,
  max,
  autoSelectOnFocus = true
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [localText, setLocalText] = useState<string>(() => {
    if (value > 0) return value.toLocaleString('es-CL');
    if (value === 0) return '0';
    return '';
  });
  const inputRef = useRef<HTMLInputElement>(null);

  // Synchronize when value changes externally (e.g. auto-balancing, counter-entry zeroing)
  useEffect(() => {
    if (!isFocused) {
      if (value > 0) {
        setLocalText(value.toLocaleString('es-CL'));
      } else if (value === 0) {
        setLocalText('0');
      } else {
        setLocalText('');
      }
    }
  }, [value, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const raw = input.value;
    const selectionStart = input.selectionStart || 0;

    // Count how many digits were before the cursor
    const digitsBeforeCursor = raw.slice(0, selectionStart).replace(/\D/g, '').length;

    const allDigits = raw.replace(/\D/g, '');
    if (!allDigits) {
      setLocalText('');
      onChange(0);
      return;
    }

    let num = parseInt(allDigits, 10);
    if (isNaN(num)) num = 0;
    if (min !== undefined && num < min) num = min;
    if (max !== undefined && num > max) num = max;

    const formatted = num > 0 ? num.toLocaleString('es-CL') : '0';
    setLocalText(formatted);
    onChange(num);

    // Maintain accurate cursor position after thousand dots are injected/removed
    requestAnimationFrame(() => {
      if (inputRef.current) {
        let targetPos = 0;
        let digitCount = 0;
        for (let i = 0; i < formatted.length; i++) {
          if (/\d/.test(formatted[i])) {
            digitCount++;
          }
          if (digitCount === digitsBeforeCursor) {
            targetPos = i + 1;
            break;
          }
        }
        if (digitCount < digitsBeforeCursor || targetPos === 0) {
          targetPos = formatted.length;
        }
        inputRef.current.setSelectionRange(targetPos, targetPos);
      }
    });
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    if (autoSelectOnFocus) {
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.select();
        }
      }, 20);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    const digits = localText.replace(/\D/g, '');
    const num = digits ? parseInt(digits, 10) : 0;
    const formatted = num > 0 ? num.toLocaleString('es-CL') : '0';
    setLocalText(formatted);
    onChange(num);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      const formatted = value > 0 ? value.toLocaleString('es-CL') : '0';
      setLocalText(formatted);
      inputRef.current?.blur();
    }
  };

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      inputMode="numeric"
      disabled={disabled}
      placeholder={placeholder}
      value={localText}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={className}
    />
  );
};

export default FormattedAmountInput;
