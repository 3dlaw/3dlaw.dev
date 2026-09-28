export type InspectInteraction = {
  type: 'inspect';
  label: string;
  title: string;
  description: string;
};

type BasicInteraction = {
  type: 'open' | 'interact' | 'collect';
  label: string;
};

export type InteractionDefinition =
  | InspectInteraction
  | BasicInteraction;

export type InteractionType = InteractionDefinition['type'];