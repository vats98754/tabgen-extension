export type TabInstruction = {
  goal: string; // user plaintext request
  style?: 'quick' | 'research' | 'videos' | 'mix';
  maxTabs?: number;
};

export type GeneratedTab = {
  title: string;
  url: string;
};

export type GenerateResponse = {
  plan: string;
  tabs: GeneratedTab[];
  groupTitle: string;
  color?: 'grey' | 'blue' | 'red' | 'yellow' | 'green' | 'pink' | 'purple' | 'cyan' | 'orange';
};
