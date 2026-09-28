export type InteractionType =
  | 'inspect'
  | 'open'
  | 'interact'
  | 'collect';

export type InteractionDefinition = {
  type: InteractionType;
  label: string;
};