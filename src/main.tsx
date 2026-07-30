import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { installOperatorSessionFetch } from "./services/operatorSession";
import "./index.css";

installOperatorSessionFetch();

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Frontend root element was not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);
