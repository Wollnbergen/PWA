/**
 * PIN Input Component
 * 
 * Premium Sultan PIN entry with auto-focus, backspace navigation, and paste support.
 */

import { useState, useRef, useEffect } from 'react';
import './PinInput.css';

interface PinInputProps {
  onComplete: (pin: string) => void;
  length?: number;
}

export default function PinInput({ onComplete, length = 6 }: PinInputProps) {
  const [pin, setPin] = useState<string[]>(Array(length).fill(''));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus first box on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return; // Only allow digits

    const newPin = [...pin];
    newPin[index] = value.slice(-1); // Only take the last character typed
    setPin(newPin);

    // Auto-advance to next box
    if (value && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Check if PIN is complete
    const fullPin = newPin.join('');
    if (fullPin.length === length) {
      onComplete(fullPin);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    // Navigate back on backspace if current box is empty
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').slice(0, length);
    if (!/^\d+$/.test(pastedData)) return;

    const newPin = [...pin];
    for (let i = 0; i < pastedData.length; i++) {
      newPin[i] = pastedData[i];
    }
    setPin(newPin);

    // Auto-focus the next relevant box
    const nextIndex = Math.min(pastedData.length, length - 1);
    inputRefs.current[nextIndex]?.focus();

    if (pastedData.length === length) {
      onComplete(pastedData);
    }
  };

  return (
    <div className="pin-input" onPaste={handlePaste}>
      {pin.map((digit, index) => (
        <div key={index} className="pin-digit-container">
          <input
            ref={el => (inputRefs.current[index] = el)}
            type="password"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={e => handleChange(index, e.target.value)}
            onKeyDown={e => handleKeyDown(index, e)}
            className="pin-digit"
            autoComplete="off"
          />
        </div>
      ))}
    </div>
  );
}
