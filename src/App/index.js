import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  CameraHelper,
  Clock,
  DirectionalLight,
  DirectionalLightHelper,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
  PCFShadowMap,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GUI } from "three/addons/libs/lil-gui.module.min.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";
import Stats from "stats.js";
import resources from "./Resources";

const MAX_DPR = 2;

export default class App {
  #renderer;
  #camera;
  #scene;
  #stats;
  #mesh;
  #ambientLight;
  #directionalLights;
  #clock;
  #controls;
  #gui;
  #lightHelpers;
  #shadowHelpers;
  #composer;
  #renderPass;
  #bloomPass;
  #fxaaPass;
  #outputPass;
  #guiState;
  #rafId;
  #isDestroyed;
  #isSceneRotationEnabled;
  #areLightsEnabled;
  #lightSnapshot;
  #rotateSceneButton;
  #screenTexture;
  #screenMaterialStates;

  constructor() {
    this.#rafId = 0;
    this.#isDestroyed = false;
    this.#isSceneRotationEnabled = false;
    this.#areLightsEnabled = true;
    this.#lightSnapshot = null;
    this.#rotateSceneButton = null;
    this.#ambientLight = null;
    this.#directionalLights = [];
    this.#gui = null;
    this.#lightHelpers = [];
    this.#shadowHelpers = [];
    this.#composer = null;
    this.#renderPass = null;
    this.#bloomPass = null;
    this.#fxaaPass = null;
    this.#outputPass = null;
    this.#screenTexture = null;
    this.#screenMaterialStates = [];
    this.#guiState = {
      rotateScene: false,
      lightsEnabled: true,
      rotateSpeed: 0.8,
      showLightHelpers: false,
      showShadowHelpers: false,
      bloomEnabled: true,
      fxaaEnabled: true,
      bloomStrength: 0.04,
      bloomRadius: 0.26,
      bloomThreshold: 1,
      toneMappingExposure: 0.82,
    };

    this.#init().catch((error) => {
      // Keep errors visible during bootstrap without crashing silently.
      console.error(error);
    });
  }

  async #init() {
    this.#stats = new Stats();
    this.#stats.showPanel(1); // 0: fps, 1: ms, 2: mb, 3+: custom

    document.body.appendChild(this.#stats.dom);

    const canvas = document.querySelector("#canvas");
    if (!canvas) {
      throw new Error("Canvas element #canvas was not found");
    }

    this.#renderer = new WebGLRenderer({
      canvas,
      antialias: false,
    });

    this.#renderer.shadowMap.enabled = true;
    this.#renderer.shadowMap.type = PCFShadowMap;
    this.#renderer.toneMapping = ACESFilmicToneMapping;
    this.#renderer.toneMappingExposure = this.#guiState.toneMappingExposure;

    this.#renderer.setPixelRatio(this.#getPixelRatio());
    this.#renderer.setSize(window.innerWidth, window.innerHeight);

    this.#clock = new Clock();

    const aspect = window.innerWidth / window.innerHeight;

    this.#camera = new PerspectiveCamera(60, aspect, 0.1, 100);
    this.#camera.position.z = 20;
    this.#camera.position.y = 20;
    this.#camera.position.x= 20;

    this.#controls = new OrbitControls(this.#camera, this.#renderer.domElement);
    this.#controls.enableDamping = false;

    this.#scene = new Scene();

    await this.#load();
    this.#initPostProcessing();
    this.#initUI();
    this.#initGUI();

    this.#animate();
    this.#initEvents();
    this.#setPresentationActive(true);
  }

  async #load() {
    await resources.load();

    // ENVIRONMENT
    this.#applyEnvironment();

    // MESHES
    this.#initMesh();

    // LIGHTS
    this.#initLights();
  }

  #applyEnvironment() {
    const envMap = resources.get("envmap");
    if (!envMap) {
      throw new Error("HDR environment map was not loaded");
    }

    this.#scene.environment = envMap;
    // Decrease environment intensity to make shadows more visible
    this.#scene.environmentIntensity = 0.45;
  }

  #initLights() {
    const al = new AmbientLight("white", 0.2);
    this.#ambientLight = al;
    this.#scene.add(al);

    const key = this.#createDirectionalLight({
      color: "#ffe7c2",
      intensity: 2.1,
      position: [24, 33, 18],
      shadowSize: 2048,
      shadowBias: -0.00015,
    });
    const fill = this.#createDirectionalLight({
      color: "#c9dcff",
      intensity: 0.95,
      position: [-26, 33, 10],
      shadowSize: 1024,
      shadowBias: -0.0001,
    });
    const rim = this.#createDirectionalLight({
      color: "#ffffff",
      intensity: 0.8,
      position: [0, 33, -28],
      shadowSize: 1024,
      shadowBias: -0.0001,
    });

    this.#directionalLights = [key, fill, rim];
    this.#saveCurrentLightState();
  }

  #createDirectionalLight({
    color,
    intensity,
    position,
    shadowSize = 1024,
    shadowBias = -0.0001,
    target = [0, 0, 0],
  }) {
    const light = new DirectionalLight(color, intensity);
    light.position.set(...position);
    light.castShadow = true;
    light.shadow.mapSize.set(shadowSize, shadowSize);
    light.shadow.camera.near = 0.5;
    light.shadow.camera.far = 120;
    light.shadow.camera.left = -35;
    light.shadow.camera.right = 35;
    light.shadow.camera.top = 35;
    light.shadow.camera.bottom = -35;
    light.shadow.bias = shadowBias;

    this.#scene.add(light);
    this.#scene.add(light.target);
    light.target.position.set(...target);

    return light;
  }

  #setLightHelpersVisible(visible) {
    if (visible) {
      if (this.#lightHelpers.length === 0) {
        this.#directionalLights.forEach((light) => {
          const helper = new DirectionalLightHelper(light, 5);
          this.#scene.add(helper);
          this.#lightHelpers.push(helper);
        });
      }
      return;
    }

    this.#lightHelpers.forEach((helper) => {
      helper.dispose();
      this.#scene.remove(helper);
    });
    this.#lightHelpers = [];
  }

  #setShadowHelpersVisible(visible) {
    if (visible) {
      if (this.#shadowHelpers.length === 0) {
        this.#directionalLights.forEach((light) => {
          const helper = new CameraHelper(light.shadow.camera);
          this.#scene.add(helper);
          this.#shadowHelpers.push(helper);
        });
      }
      return;
    }

    this.#shadowHelpers.forEach((helper) => {
      helper.dispose();
      this.#scene.remove(helper);
    });
    this.#shadowHelpers = [];
  }

  #updateHelpers() {
    this.#lightHelpers.forEach((helper) => helper.update());
    this.#shadowHelpers.forEach((helper) => helper.update());
  }

  #saveCurrentLightState() {
    this.#lightSnapshot = {
      directional: this.#directionalLights.map((light) => ({
        intensity: light.intensity,
        castShadow: light.castShadow,
      })),
      ambient: this.#ambientLight?.intensity ?? 0,
    };
  }

  #setLightsEnabled(enabled) {
    if (this.#directionalLights.length === 0) {
      return;
    }

    if (enabled === this.#areLightsEnabled) {
      return;
    }

    if (!enabled) {
      this.#saveCurrentLightState();
      this.#directionalLights.forEach((light) => {
        light.intensity = 0;
        light.castShadow = false;
      });
      if (this.#ambientLight) {
        this.#ambientLight.intensity = Math.min(this.#ambientLight.intensity, 0.06);
      }
      this.#renderer.shadowMap.needsUpdate = true;
      this.#areLightsEnabled = false;
      this.#guiState.lightsEnabled = false;
      return;
    }

    const directionalSnapshot = this.#lightSnapshot?.directional ?? [];

    this.#directionalLights.forEach((light, index) => {
      const state = directionalSnapshot[index];

      light.intensity =
        typeof state?.intensity === "number" ? state.intensity : light.intensity;
      light.castShadow =
        typeof state?.castShadow === "boolean" ? state.castShadow : light.castShadow;
    });
    if (this.#ambientLight && typeof this.#lightSnapshot?.ambient === "number") {
      this.#ambientLight.intensity = this.#lightSnapshot.ambient;
    }
    this.#renderer.shadowMap.needsUpdate = true;
    this.#areLightsEnabled = true;
    this.#guiState.lightsEnabled = true;
  }

  #setSceneRotationEnabled(enabled) {
    this.#isSceneRotationEnabled = enabled;
    this.#syncRotateButton();
  }

  #setPresentationActive(active) {
    this.#setSceneRotationEnabled(active);
    this.#setLightsEnabled(active);
    this.#setScreenPowered(active);
  }

  #initMesh() {
    const model = this.#initTVModel();

    const geo = new PlaneGeometry(35, 35);
    const material = new MeshStandardMaterial({
      side: DoubleSide,
    });
    const floor = new Mesh(geo, material);
    floor.rotateX(-Math.PI / 2);
    const modelBounds = new Box3().setFromObject(model);
    floor.position.y = modelBounds.min.y - 0.05;
    floor.receiveShadow = true;

    this.#scene.add(floor);
  }

  #initTVModel() {
    const tvAsset = resources.get("tv");
    if (!tvAsset?.scene) {
      throw new Error("TV model was not loaded");
    }

    const model = tvAsset.scene;
    const screenAsset = resources.get("screen");

    if (screenAsset?.scene) {
      model.add(screenAsset.scene);
      this.#initScreenImage(screenAsset.scene);
    }

    model.traverse((node) => {
      if (!node.isMesh) {
        return;
      }
      node.castShadow = true;
      node.receiveShadow = true;
    });

    const box = new Box3().setFromObject(model);
    const center = new Vector3();
    box.getCenter(center);

    model.position.sub(center);

    const size = new Vector3();
    box.getSize(size);
    const largestDimension = Math.max(size.x, size.y, size.z) || 1;
    const targetSize = 16;
    const scaleFactor = targetSize / largestDimension;
    model.scale.setScalar(scaleFactor);

    const recenteredBox = new Box3().setFromObject(model);
    const bottomY = recenteredBox.min.y;
    model.position.y -= bottomY;

    this.#mesh = model;
    this.#scene.add(model);

    return model;
  }

  #initScreenImage(screenScene) {
    const texture = resources.get("windows");
    if (!texture) {
      return;
    }

    texture.colorSpace = SRGBColorSpace;
    texture.flipY = true;
    texture.wrapS = RepeatWrapping;
    texture.repeat.set(-1, 1);
    texture.offset.x = 1;
    texture.needsUpdate = true;
    this.#screenTexture = texture;
    this.#screenMaterialStates = [];

    screenScene.traverse((node) => {
      if (!node.isMesh) {
        return;
      }
      if (Array.isArray(node.material)) {
        node.material.forEach((material) => {
          this.#rememberScreenMaterialState(material);
        });
        return;
      }

      this.#rememberScreenMaterialState(node.material);
    });

    this.#setScreenPowered(true);
  }

  #rememberScreenMaterialState(material) {
    if (!material) {
      return;
    }

    const isTracked = this.#screenMaterialStates.some(
      (entry) => entry.material === material,
    );
    if (isTracked) {
      return;
    }

    this.#screenMaterialStates.push({
      material,
      baseColor:
        "color" in material && material.color?.isColor
          ? material.color.clone()
          : null,
    });
  }

  #setScreenPowered(enabled) {
    if (!this.#screenTexture || this.#screenMaterialStates.length === 0) {
      return;
    }

    this.#screenMaterialStates.forEach((entry) => {
      const { material, baseColor } = entry;

      if (enabled) {
        if (baseColor && "color" in material) {
          material.color.copy(baseColor);
        }
        this.#setScreenTextureOnMaterial(material, this.#screenTexture);
        return;
      }

      if ("map" in material) {
        material.map = null;
      }
      if ("emissiveMap" in material) {
        material.emissiveMap = null;
      }
      if ("emissive" in material) {
        material.emissive.set(0x000000);
      }
      if ("emissiveIntensity" in material) {
        material.emissiveIntensity = 0;
      }
      if ("color" in material) {
        material.color.set(0x050505);
      }

      material.needsUpdate = true;
    });
  }

  #setScreenTextureOnMaterial(material, texture) {
    if (!material) {
      return;
    }

    if ("map" in material) {
      material.map = texture;
    }
    if ("emissiveMap" in material) {
      material.emissiveMap = texture;
    }
    if ("emissive" in material) {
      material.emissive.set(0xffffff);
    }
    if ("emissiveIntensity" in material) {
      material.emissiveIntensity = Math.max(material.emissiveIntensity ?? 1, 1);
    }

    material.needsUpdate = true;
  }

  #initPostProcessing() {
    const size = new Vector2(window.innerWidth, window.innerHeight);

    this.#composer = new EffectComposer(this.#renderer);
    this.#composer.setPixelRatio(this.#getPixelRatio());
    this.#composer.setSize(size.x, size.y);

    this.#renderPass = new RenderPass(this.#scene, this.#camera);
    this.#composer.addPass(this.#renderPass);

    this.#bloomPass = new UnrealBloomPass(
      size,
      this.#guiState.bloomStrength,
      this.#guiState.bloomRadius,
      this.#guiState.bloomThreshold,
    );
    this.#bloomPass.enabled = this.#guiState.bloomEnabled;
    this.#composer.addPass(this.#bloomPass);

    this.#fxaaPass = new ShaderPass(FXAAShader);
    this.#fxaaPass.enabled = this.#guiState.fxaaEnabled;
    this.#composer.addPass(this.#fxaaPass);
    this.#updateFxaaResolution(size.x, size.y, this.#getPixelRatio());

    this.#outputPass = new OutputPass();
    this.#composer.addPass(this.#outputPass);
  }

  #updateFxaaResolution(width, height, dpr) {
    if (!this.#fxaaPass) {
      return;
    }

    const resolution = this.#fxaaPass.material?.uniforms?.resolution?.value;
    if (!resolution) {
      return;
    }

    const safeWidth = Math.max(1, width * dpr);
    const safeHeight = Math.max(1, height * dpr);
    resolution.set(1 / safeWidth, 1 / safeHeight);
  }

  #getPixelRatio() {
    return Math.min(window.devicePixelRatio || 1, MAX_DPR);
  }

  #resize = () => {
    if (this.#isDestroyed) {
      return;
    }

    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = this.#getPixelRatio();

    this.#renderer.setPixelRatio(dpr);
    this.#renderer.setSize(w, h);
    this.#composer?.setPixelRatio(dpr);
    this.#composer?.setSize(w, h);
    this.#updateFxaaResolution(w, h, dpr);
    const aspect = w / h;

    this.#camera.aspect = aspect;
    this.#camera.updateProjectionMatrix();
  };

  #initEvents() {
    window.addEventListener("resize", this.#resize);
  }

  #removeEvents() {
    window.removeEventListener("resize", this.#resize);
  }

  #initGUI() {
    this.#gui = new GUI({
      title: "Scene Controls",
      width: 320,
    });

    const sceneFolder = this.#gui.addFolder("Scene");
    sceneFolder
      .add(this.#guiState, "rotateScene")
      .name("Rotate scene")
      .listen()
      .onChange((value) => {
        this.#setSceneRotationEnabled(value);
      });
    sceneFolder
      .add(this.#guiState, "lightsEnabled")
      .name("Lights enabled")
      .listen()
      .onChange((value) => {
        this.#setLightsEnabled(value);
      });
    sceneFolder
      .add(this.#guiState, "rotateSpeed", 0.1, 2, 0.05)
      .name("Rotate speed");

    const ambientFolder = this.#gui.addFolder("Ambient");
    ambientFolder
      .add(this.#ambientLight, "intensity", 0, 2, 0.01)
      .name("Intensity");

    const helpersFolder = this.#gui.addFolder("Helpers");
    helpersFolder
      .add(this.#guiState, "showLightHelpers")
      .name("Directional helper")
      .onChange((value) => {
        this.#setLightHelpersVisible(value);
      });
    helpersFolder
      .add(this.#guiState, "showShadowHelpers")
      .name("Shadow camera helper")
      .onChange((value) => {
        this.#setShadowHelpersVisible(value);
      });

    const postFolder = this.#gui.addFolder("Post FX");
    postFolder
      .add(this.#guiState, "bloomEnabled")
      .name("Bloom enabled")
      .onChange((value) => {
        if (this.#bloomPass) {
          this.#bloomPass.enabled = value;
        }
      });
    postFolder
      .add(this.#guiState, "fxaaEnabled")
      .name("FXAA enabled")
      .onChange((value) => {
        if (this.#fxaaPass) {
          this.#fxaaPass.enabled = value;
        }
      });
    postFolder
      .add(this.#guiState, "bloomStrength", 0, 2, 0.01)
      .name("Bloom strength")
      .onChange((value) => {
        if (this.#bloomPass) {
          this.#bloomPass.strength = value;
        }
      });
    postFolder
      .add(this.#guiState, "bloomRadius", 0, 2, 0.01)
      .name("Bloom radius")
      .onChange((value) => {
        if (this.#bloomPass) {
          this.#bloomPass.radius = value;
        }
      });
    postFolder
      .add(this.#guiState, "bloomThreshold", 0, 1, 0.01)
      .name("Bloom threshold")
      .onChange((value) => {
        if (this.#bloomPass) {
          this.#bloomPass.threshold = value;
        }
      });
    postFolder
      .add(this.#guiState, "toneMappingExposure", 0.4, 2, 0.01)
      .name("Exposure")
      .onChange((value) => {
        this.#renderer.toneMappingExposure = value;
      });
  }

  #removeGUI() {
    if (!this.#gui) {
      return;
    }

    this.#gui.destroy();
    this.#gui = null;
  }

  #initUI() {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Open piece of art";
    button.style.position = "fixed";
    button.style.right = "16px";
    button.style.bottom = "16px";
    button.style.zIndex = "10";
    button.style.padding = "10px 14px";
    button.style.border = "1px solid rgba(255, 255, 255, 0.4)";
    button.style.borderRadius = "8px";
    button.style.background = "rgba(20, 20, 20, 0.8)";
    button.style.color = "#fff";
    button.style.fontFamily = "system-ui, sans-serif";
    button.style.cursor = "pointer";
    button.style.backdropFilter = "blur(2px)";
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", this.#togglePresentation);

    document.body.appendChild(button);
    this.#rotateSceneButton = button;
  }

  #removeUI() {
    if (!this.#rotateSceneButton) {
      return;
    }

    this.#rotateSceneButton.removeEventListener(
      "click",
      this.#togglePresentation,
    );
    this.#rotateSceneButton.remove();
    this.#rotateSceneButton = null;
  }

  #togglePresentation = () => {
    this.#setPresentationActive(!this.#isSceneRotationEnabled);
  };

  #syncRotateButton() {
    this.#guiState.rotateScene = this.#isSceneRotationEnabled;

    if (!this.#rotateSceneButton) {
      return;
    }

    this.#rotateSceneButton.textContent = this.#isSceneRotationEnabled
      ? "Close art"
      : "Open piece of art";
    this.#rotateSceneButton.setAttribute(
      "aria-pressed",
      this.#isSceneRotationEnabled ? "true" : "false",
    );
  }

  #animate = () => {
    if (this.#isDestroyed) {
      return;
    }

    this.#stats.begin();

    const delta = this.#clock.getDelta();
    this.#controls.update(delta);
    if (this.#isSceneRotationEnabled) {
      this.#scene.rotation.y += delta * this.#guiState.rotateSpeed;
    }
    this.#updateHelpers();

    this.#composer?.render();
    this.#stats.end();

    this.#rafId = window.requestAnimationFrame(this.#animate);
  };

  destroy() {
    if (this.#isDestroyed) {
      return;
    }
    this.#isDestroyed = true;

    if (this.#rafId) {
      window.cancelAnimationFrame(this.#rafId);
      this.#rafId = 0;
    }

    this.#removeEvents();
    this.#removeUI();
    this.#setLightHelpersVisible(false);
    this.#setShadowHelpersVisible(false);
    this.#removeGUI();
    this.#controls?.dispose();
    this.#bloomPass?.dispose?.();
    this.#fxaaPass?.dispose?.();
    this.#outputPass?.dispose?.();
    this.#composer?.dispose?.();

    if (this.#scene) {
      this.#scene.traverse((object) => {
        if (!(object instanceof Mesh)) {
          return;
        }

        object.geometry?.dispose();
        const { material } = object;
        if (Array.isArray(material)) {
          material.forEach((m) => m?.dispose?.());
          return;
        }
        material?.dispose?.();
      });
      this.#scene.clear();
    }

    this.#renderer?.dispose();

    if (this.#stats?.dom?.parentNode) {
      this.#stats.dom.parentNode.removeChild(this.#stats.dom);
    }

    this.#mesh = null;
    this.#controls = null;
    this.#clock = null;
    this.#isSceneRotationEnabled = false;
    this.#areLightsEnabled = false;
    this.#lightSnapshot = null;
    this.#ambientLight = null;
    this.#directionalLights = [];
    this.#scene = null;
    this.#camera = null;
    this.#composer = null;
    this.#renderPass = null;
    this.#bloomPass = null;
    this.#fxaaPass = null;
    this.#outputPass = null;
    this.#screenTexture = null;
    this.#screenMaterialStates = [];
    this.#renderer = null;
    this.#stats = null;
  }
}
