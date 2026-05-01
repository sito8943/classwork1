import {
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
  Scene,
  Vector3,
  WebGLRenderer,
  PCFShadowMap,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GUI } from "three/addons/libs/lil-gui.module.min.js";
import Stats from "stats.js";
import resources from "./Resources";

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
  #guiState;
  #rafId;
  #isDestroyed;
  #isSceneRotationEnabled;
  #areLightsEnabled;
  #lightSnapshot;
  #rotateSceneButton;

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
    this.#guiState = {
      rotateScene: false,
      rotateSpeed: 0.8,
      showLightHelpers: false,
      showShadowHelpers: false,
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
    });

    this.#renderer.shadowMap.enabled = true;
    this.#renderer.shadowMap.type = PCFShadowMap;

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
    this.#initUI();
    this.#initGUI();

    this.#animate();
    this.#initEvents();
    this.#setLightsEnabled(false);
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
  }

  #setPresentationActive(active) {
    this.#isSceneRotationEnabled = active;
    this.#setLightsEnabled(active);
    this.#syncRotateButton();
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

  #resize = () => {
    if (this.#isDestroyed) {
      return;
    }

    const w = window.innerWidth;
    const h = window.innerHeight;

    this.#renderer.setSize(w, h);
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
        this.#setPresentationActive(value);
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

    this.#renderer.render(this.#scene, this.#camera);
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
    this.#renderer = null;
    this.#stats = null;
  }
}
