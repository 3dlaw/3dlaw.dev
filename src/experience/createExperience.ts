import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { FreeCameraMouseInput } from '@babylonjs/core/Cameras/Inputs/freeCameraMouseInput';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';

import { createTestRoom } from './createTestRoom';

import HavokPhysics from '@babylonjs/havok';
import havokWasmUrl from '@babylonjs/havok/lib/esm/HavokPhysics.wasm?url';

import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import '@babylonjs/core/Physics/physicsEngineComponent';

export function createExperience(
  canvas: HTMLCanvasElement,
  onReady: () => void,
  onError: (error: unknown) => void,
): () => void {
  const engine = new Engine(canvas, true);
  const scene = new Scene(engine);

  let ready = false;
  let disposed = false;

  const render = () => scene.render();

  // Stop drawing while the browser tab is hidden.
  const updateRendering = () => {
    engine.stopRenderLoop(render);

    if (ready && !disposed && !document.hidden) {
      engine.runRenderLoop(render);
    }
  };

  // Keep the drawing surface matched to its actual displayed size.
  const resizeObserver = new ResizeObserver(() => {
    engine.resize();
  });

  // Everything we start here must also have a way to stop.
  const dispose = () => {
    if (disposed) return;
    disposed = true;

    engine.stopRenderLoop(render);
    resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', updateRendering);

    scene.dispose();
    engine.dispose();
  };

  try {
    // Background behind the geometry.
    scene.clearColor = new Color4(20 / 255, 18 / 255, 24 / 255, 1);

    // Begin inside the room at eye level.
    const eyeHeight = 1.65;

    const camera = new FreeCamera(
      'exploration-camera',
      new Vector3(0, eyeHeight, -3),
      scene,
    );

    // Look straight ahead rather than down toward the floor.
    camera.setTarget(new Vector3(0, eyeHeight, 0));
    camera.minZ = 0.1;
    camera.fov = (65 * Math.PI) / 180;

    // Keep only our current click-and-drag mouse input.
    camera.inputs.clear();

    const mouseLook = new FreeCameraMouseInput();
    mouseLook.buttons = [0];
    mouseLook.angularSensibility = 1500;

    camera.inputs.add(mouseLook);
    camera.inertia = 0;
    camera.attachControl(canvas, false);

    // Temporary broad lighting for inspecting the room.
    const light = new HemisphericLight(
      'test-light',
      new Vector3(-0.5, 1, -0.5),
      scene,
    );

    light.intensity = 0.9;
    light.groundColor = new Color3(0.35, 0.32, 0.4);

    resizeObserver.observe(canvas);
    document.addEventListener('visibilitychange', updateRendering);
    engine.resize();

    // Initialization takes time, so this part runs asynchronously.
    const start = async () => {
      const havok = await HavokPhysics({
        locateFile: () => havokWasmUrl,
      });

      // The visitor may have left while Havok was loading.
      if (disposed) return;

      const physicsPlugin = new HavokPlugin(true, havok);

      const physicsEnabled = scene.enablePhysics(
        new Vector3(0, -9.81, 0),
        physicsPlugin,
      );

      if (!physicsEnabled) {
        physicsPlugin.dispose();
        throw new Error('Babylon could not enable the physics engine.');
      }

      // Physics must be enabled before this creates any collision bodies.
      createTestRoom(scene);

      scene.executeWhenReady(() => {
        if (disposed) return;

        ready = true;
        updateRendering();
        onReady();
      });
    };

    // Report errors from the asynchronous startup.
    void start().catch((error: unknown) => {
      if (disposed) return;

      dispose();
      onError(error);
    });

    return dispose;
  } catch (error) {
    dispose();
    throw error;
  }
}