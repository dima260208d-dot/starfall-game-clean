export interface GameParticipant {
  brawlerId: string;
  displayName: string;
  team: string;
  isPlayer: boolean;
  level: number;
  trophies: number;
}

export type PreQuestSnapshot = Array<{ id: string; progress: number }>;
