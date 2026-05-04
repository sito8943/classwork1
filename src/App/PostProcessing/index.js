import {
  BloomEffect,
  ChromaticAberrationEffect,
  EffectComposer,
  EffectPass,
  FXAAEffect,
  RenderPass,
  ShockWaveEffect,
  SepiaEffect,
} from "postprocessing";
import { Vector2 } from "three";

export default class PostProcessing {
  #renderer;
  #scene;
  #camera;
  #composer;
  #bloomEffect;
  #bloomPass;
  #fxaaPass;

  constructor({
    renderer,
    scene,
    camera,
    bloomEnabled,
    fxaaEnabled,
    bloomStrength,
    bloomRadius,
    bloomThreshold,
  }) {
    this.#renderer = renderer;
    this.#scene = scene;
    this.#camera = camera;
    this.#bloomEffect = null;
    this.#bloomPass = null;
    this.#fxaaPass = null;

    this.#init({
      bloomEnabled,
      fxaaEnabled,
      bloomStrength,
      bloomRadius,
      bloomThreshold,
    });
  }

  #init({
    bloomEnabled,
    fxaaEnabled,
    bloomStrength,
    bloomRadius,
    bloomThreshold,
  }) {
    this.#composer = new EffectComposer(this.#renderer);

    const rp = new RenderPass(this.#scene, this.#camera);
    this.#composer.addPass(rp);

    const cae = new ChromaticAberrationEffect({
      offset: new Vector2(0.005, 0.005),
    });
    const ef = new EffectPass(this.#camera, cae);
    this.#composer.addPass(ef);

    this.#bloomEffect = new BloomEffect({
      intensity: bloomStrength,
      radius: bloomRadius,
      luminanceThreshold: bloomThreshold,
      mipmapBlur: true,
    });
    this.#bloomPass = new EffectPass(this.#camera, this.#bloomEffect);
    this.#bloomPass.enabled = bloomEnabled;
    this.#composer.addPass(this.#bloomPass);

    const fxaaEffect = new FXAAEffect();
    this.#fxaaPass = new EffectPass(this.#camera, fxaaEffect);
    this.#fxaaPass.enabled = fxaaEnabled;
    this.#composer.addPass(this.#fxaaPass);
  }

  resize(width, height) {
    this.#composer.setSize(width, height);
  }

  setBloomEnabled(enabled) {
    if (!this.#bloomPass) {
      return;
    }

    this.#bloomPass.enabled = enabled;
  }

  setFXAAEnabled(enabled) {
    if (!this.#fxaaPass) {
      return;
    }

    this.#fxaaPass.enabled = enabled;
  }

  setBloomStrength(value) {
    if (!this.#bloomEffect) {
      return;
    }

    this.#bloomEffect.intensity = value;
  }

  setBloomRadius(value) {
    if (!this.#bloomEffect) {
      return;
    }

    this.#bloomEffect.mipmapBlurPass.radius = value;
  }

  setBloomThreshold(value) {
    if (!this.#bloomEffect) {
      return;
    }

    this.#bloomEffect.luminanceMaterial.threshold = value;
  }

  render() {
    this.#composer.render();
  }

  dispose() {
    this.#composer?.dispose();
    this.#bloomEffect = null;
    this.#bloomPass = null;
    this.#fxaaPass = null;
    this.#composer = null;
  }
}
