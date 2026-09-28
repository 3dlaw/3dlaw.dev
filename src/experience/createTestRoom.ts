import type { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';

import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';

import type { InteractionDefinition } from './interactionTypes';

export function createTestRoom(scene: Scene): void {
  // Interior dimensions. Our convention is 1 world unit = 1 metre.
  const width = 10;
  const depth = 12;
  const height = 3.6;
  const thickness = 0.2;

  // Create a reusable, plain-colored material.
  function makeMaterial(name: string, color: string): StandardMaterial {
    const material = new StandardMaterial(name, scene);
    material.diffuseColor = Color3.FromHexString(color);
    material.specularColor = new Color3(0, 0, 0);
    return material;
  }

  // Create a visible box and a matching physical box.
  function addBox(
    name: string,
    size: { width: number; height: number; depth: number },
    position: Vector3,
    material: StandardMaterial,
    mass = 0,
  ) {
    const mesh = CreateBox(name, size, scene);
    mesh.position.copyFrom(position);
    mesh.material = material;

    new PhysicsAggregate(
      mesh,
      PhysicsShapeType.BOX,
      {
        mass,
        friction: 0.6,
        restitution: 0,
      },
      scene,
    );
    return mesh;
  }

  const floorMaterial = makeMaterial('room-floor-material', '#343039');
  const wallMaterial = makeMaterial('room-wall-material', '#68616F');
  const ceilingMaterial = makeMaterial('room-ceiling-material', '#45404C');
  const cubeMaterial = makeMaterial('cube-material', '#C3A6E8');
  const interactableMaterial = makeMaterial(
    'interactable-material',
    '#8B70A8',
  );

  // The floor's TOP surface is at y = 0.
  addBox(
    'room-floor',
    {
      width: width + 2 * thickness,
      height: thickness,
      depth: depth + 2 * thickness,
    },
    new Vector3(0, -thickness / 2, 0),
    floorMaterial,
  );

  // The ceiling's BOTTOM surface is at the room height.
  addBox(
    'room-ceiling',
    {
      width: width + 2 * thickness,
      height: thickness,
      depth: depth + 2 * thickness,
    },
    new Vector3(0, height + thickness / 2, 0),
    ceilingMaterial,
  );

  // Front and back walls.
  addBox(
    'wall-front',
    { width: width + 2 * thickness, height, depth: thickness },
    new Vector3(0, height / 2, depth / 2 + thickness / 2),
    wallMaterial,
  );

  addBox(
    'wall-back',
    { width: width + 2 * thickness, height, depth: thickness },
    new Vector3(0, height / 2, -depth / 2 - thickness / 2),
    wallMaterial,
  );

  // Left and right walls.
  addBox(
    'wall-left',
    { width: thickness, height, depth },
    new Vector3(-width / 2 - thickness / 2, height / 2, 0),
    wallMaterial,
  );

  addBox(
    'wall-right',
    { width: thickness, height, depth },
    new Vector3(width / 2 + thickness / 2, height / 2, 0),
    wallMaterial,
  );

  // Temporary physics test: start above the floor and let gravity act.
  addBox(
    'test-cube',
    { width: 1.5, height: 1.5, depth: 1.5 },
    new Vector3(1.5, 2.4, 1),
    cubeMaterial,
    1,
  );

  // Temporary interaction target.
  const interactionTarget = addBox(
    'interaction-test',
    {
      width: 0.8,
      height: 1.8,
      depth: 0.8,
    },
    new Vector3(0, 0.9, 2.5),
    interactableMaterial,
  );

  // Metadata lets the interaction system recognize this mesh.
  const testInteraction: InteractionDefinition = {
    type: 'inspect',
    label: 'Inspect',
  };

  interactionTarget.metadata = {
    interaction: testInteraction,
  };
}