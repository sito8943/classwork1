import "./style.css";
import App from "./App";

const app = new App();

window.addEventListener("pointermove", (e) => app.onMouseMove(e));
