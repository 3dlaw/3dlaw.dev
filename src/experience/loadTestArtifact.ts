import type { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader';

import '@babylonjs/loaders/glTF';

import type { InteractionDefinition } from './interactionTypes';

export async function loadTestArtifact(
  scene: Scene,
): Promise<void> {
  const result = await ImportMeshAsync(
    '/models/test-box.glb',
    scene,
  );

  const root = result.meshes[0];

  if (!root) {
    throw new Error('The test artifact did not contain a root mesh.');
  }

  // Keep it separate from our existing interaction test.
  root.position = new Vector3(-2, 0.5, 2.5);

  const interaction: InteractionDefinition = {
    type: 'inspect',
    label: 'Inspect',
    title: 'Imported Artifact',
    description:
      'This object was loaded from an external GLB file rather than created directly in Babylon.',
  };

  root.metadata = {
    interaction,
  };
}