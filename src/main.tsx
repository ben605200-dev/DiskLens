import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Apply the OS theme immediately to avoid a flash before settings load.
document.documentElement.dataset.theme = window.matchMedia("(prefers-color-scheme: light)")
  .matches
  ? "light"
  : "dark";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
