import type { GenerateResponse, TabInstruction } from './types';

export type Msg =
  | { type: 'GENERATE_TABS'; payload: TabInstruction }
  | { type: 'OPEN_GROUP'; payload: GenerateResponse }
  | { type: 'CLOSE_GROUP'; payload: { groupId: number } };
