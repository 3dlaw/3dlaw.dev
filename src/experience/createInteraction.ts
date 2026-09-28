import type { Scene } from '@babylonjs/core/scene';
import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { InteractionDefinition } from './interactionTypes';
import type { Node } from '@babylonjs/core/node';

import '@babylonjs/core/Culling/ray';

export function createInteraction(
  scene: Scene,
  camera: FreeCamera,
  canvas: HTMLCanvasElement,
  onTargetChange: (interaction: InteractionDefinition | null) => void,
  onInteract: (interaction: InteractionDefinition) => void,
): () => void {
  const maxDistance = 3;

  let targetedMesh: AbstractMesh | null = null;
  let originalEmissiveColor: Color3 | null = null;

  const highlightColor = Color3.FromHexString('#5A3D78');

  const getInteraction = (
    mesh: AbstractMesh | null,
  ): InteractionDefinition | null => {
    let current: Node | null = mesh;

    while (current) {
      const interaction =
        current.metadata?.interaction as InteractionDefinition | undefined;

      if (interaction) {
        return interaction;
      }

       current = current.parent;
    }

    return null;
  };

  const setTarget = (mesh: AbstractMesh | null) => {
    if (mesh === targetedMesh) return;

    // Restore the previous target.
    if (
      targetedMesh?.material instanceof StandardMaterial &&
      originalEmissiveColor
    ) {
      targetedMesh.material.emissiveColor.copyFrom(originalEmissiveColor);
    }

    targetedMesh = mesh;
    originalEmissiveColor = null;
    onTargetChange(getInteraction(targetedMesh));

    // Highlight the new target.
    if (targetedMesh?.material instanceof StandardMaterial) {
      originalEmissiveColor =
        targetedMesh.material.emissiveColor.clone();

      targetedMesh.material.emissiveColor.copyFrom(highlightColor);
    }
  };

  const onClick = (event: MouseEvent) => {
    // Left click only.
    if (event.button !== 0) return;

    // The first click is reserved for entering exploration mode.
    if (document.pointerLockElement !== canvas) return;

    const interaction = getInteraction(targetedMesh);

    if (!interaction) return;

    onInteract(interaction);
    };

    canvas.addEventListener('mousedown', onClick);

  const updateObserver = scene.onBeforeRenderObservable.add(() => {
    const ray = camera.getForwardRay(maxDistance);
    const hit = scene.pickWithRay(ray);

    const pickedMesh = hit?.hit && hit.pickedMesh
        ? hit.pickedMesh
        : null;

    const interaction = getInteraction(pickedMesh);

    setTarget(interaction ? pickedMesh : null);
  });

  return () => {
    scene.onBeforeRenderObservable.remove(updateObserver);
    canvas.removeEventListener('mousedown', onClick);
    setTarget(null);
  };
}