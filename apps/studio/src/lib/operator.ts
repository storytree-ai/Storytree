// The single local operator identity (ADR-0008: a simple local
// operator for the single-operator dogfood; revisit when multi-operator). Stored
// in localStorage so comments carry a name across reloads.

import { useState } from 'react';

const KEY = 'storytree.operator';

export function getOperator(): string {
  return (typeof localStorage !== 'undefined' && localStorage.getItem(KEY)) || 'operator';
}

export function useOperator(): [string, (value: string) => void] {
  const [operator, setOperator] = useState<string>(getOperator);
  const update = (value: string): void => {
    const name = value.trim() || 'operator';
    localStorage.setItem(KEY, name);
    setOperator(name);
  };
  return [operator, update];
}
