import type { Line, PhoneState } from './types';

export interface StageState {
  lines: Line[];
  phone: PhoneState;
  payoff: boolean;
}

export type Action =
  | { type: 'reset'; phone?: Partial<PhoneState> }
  | { type: 'add'; line: Line }
  | { type: 'patch'; id: number; patch: Partial<Line> }
  | { type: 'phone'; patch: Partial<PhoneState> }
  | { type: 'payoff' };

export const emptyPhone: PhoneState = { build: 0, bug: false, squashed: false, launched: false, notified: false };
export const initialStage: StageState = { lines: [], phone: emptyPhone, payoff: false };

export function stageReducer(state: StageState, action: Action): StageState {
  switch (action.type) {
    case 'reset':
      return { lines: [], payoff: false, phone: { ...emptyPhone, ...action.phone } };
    case 'add':
      return { ...state, lines: [...state.lines, action.line] };
    case 'patch':
      return {
        ...state,
        lines: state.lines.map(l => (l.id === action.id ? ({ ...l, ...action.patch } as Line) : l)),
      };
    case 'phone': {
      const phone = { ...state.phone, ...action.patch };
      // A fresh bug is never already squashed.
      if (action.patch.bug) phone.squashed = false;
      return { ...state, phone };
    }
    case 'payoff':
      return { ...state, payoff: true };
  }
}
