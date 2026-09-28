import type { Scene } from '@babylonjs/core/scene';
import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PhysicsCharacterController } from '@babylonjs/core/Physics/v2/characterController';
import { createMovementInput } from './createMovementInput';

export function createPlayer(
  scene: Scene,
  camera: FreeCamera,
  canvas: HTMLCanvasElement,
): () => void {
  const physicsEngine = scene.getPhysicsEngine();

  if (!physicsEngine) {
    throw new Error('Physics must be enabled before creating the player.');
  }

  // All dimensions are in metres.
  const capsuleHeight = 1.8;
  const capsuleRadius = 0.3;
  const eyeHeight = 1.65;

  // Temporary test: begin with our feet half a metre above the floor.
  const spawnFeet = new Vector3(0, 0.5, -3);

  // The controller is positioned by its center, not its feet.
  const spawnCenter = spawnFeet.add(
    new Vector3(0, capsuleHeight / 2, 0),
  );

  const controller = new PhysicsCharacterController(
    spawnCenter,
    {
      capsuleHeight,
      capsuleRadius,
    },
    scene,
  );

  const down = Vector3.Down();
  const velocity = Vector3.Zero();
  const moveDirection = Vector3.Zero();

  //Initial walking speed in meters per second.
  const walkSpeed = 4;

  // Follow the capsule without changing the camera's viewing direction.
  const syncCamera = () => {
    camera.position.copyFrom(controller.getPosition());
    camera.position.y += eyeHeight - capsuleHeight / 2;
  };

  syncCamera();

  const movementInput = createMovementInput(canvas);

const updateObserver = scene.onBeforeRenderObservable.add(() => {
  // Convert milliseconds to seconds and limit unusually long frame gaps.
  const dt = Math.min(scene.getEngine().getDeltaTime() / 1000, 0.1);

  if (dt <= 0) return;

  const support = controller.checkSupport(dt, down);
  const axes = movementInput.getAxes();

  // Use only the camera's horizontal heading, not its upward/downward tilt.
  const yaw = camera.rotation.y;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);

  // Convert camera-relative input into a world-space direction.
  moveDirection.set(
    axes.right * cos + axes.forward * sin,
    0,
    axes.forward * cos - axes.right * sin,
  );

  // Diagonal movement should be no faster than straight movement.
  if (moveDirection.lengthSquared() > 0) {
    moveDirection.normalize().scaleInPlace(walkSpeed);
  }

  // Preserve the vertical velocity left by the previous physics update.
  velocity.copyFrom(controller.getVelocity());

  // For this first walking test, horizontal speed changes immediately.
  velocity.x = moveDirection.x;
  velocity.z = moveDirection.z;

  // Keep the gravity behavior from our previous checkpoint.
  velocity.addInPlace(physicsEngine.gravity.scale(dt));

  controller.setVelocity(velocity);
  controller.integrate(dt, support, physicsEngine.gravity);

  // Follow the collision-resolved player position.
  syncCamera();
});

  return () => {
    scene.onBeforeRenderObservable.remove(updateObserver);
    movementInput.dispose();
    controller.dispose();
  };
}