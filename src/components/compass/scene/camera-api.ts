/**
 * Imperative camera commands. The in-canvas CameraRig registers real implementations;
 * HUD buttons outside the Canvas call these.
 */
export interface CameraApi {
  zoom: (factor: number) => void;
  rotate: (deg: number) => void;
  tilt: (deg: number) => void;
  pan: (dx: number, dy: number) => void;
  reset: () => void;
  top: () => void;
  focus: (x: number, y: number) => void;
}

const noop = () => {};

export const cameraApi: CameraApi = {
  zoom: noop,
  rotate: noop,
  tilt: noop,
  pan: noop,
  reset: noop,
  top: noop,
  focus: noop,
};
