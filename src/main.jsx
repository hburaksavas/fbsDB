import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./styles.css";
import "./sqlFormatterSettings.css";
import "./editorSettings.css";
import "./docking.css";
import "./connectionControl.css";
import "./editorTabs.css";
import "./themeConsistency.css";
import './miniTools.css';
import './workbenchUx.css';
import './resultColumnActions.css';
import './themeTokens.css';
import './themeSurfaces.css';
import './connectionLibrary.css';
import './connectionContextMenu.css';
import './workspaceManagement.css';
import './formControls.css';
import './explorerIcons.css';
import './connectionPassword.css';
import './resultStatus.css';
import './feedback.css';
import {FeedbackHost} from './Feedback';
import {applyDocumentTheme} from './themeModel';
import {loadSettings,resolveSetting} from './settingsModel';
applyDocumentTheme(resolveSetting(loadSettings(localStorage),'ui.theme').value);

// Keep the embedded workbench free of the browser's default right-click menu.
// Feature-specific menus, such as the Results grid menu, still receive the event.
document.addEventListener("contextmenu", (event) => event.preventDefault(), { capture: true });

class ApplicationErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, details) {
    console.error("fbsDB application render failed", error, details.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="desktop-shell application-error theme-scope" data-theme={document.documentElement.dataset.theme||'default'}>
        <h1>fbsDB arayüzü görüntülenemedi</h1>
        <p>Arayüz hatasının ayrıntıları aşağıdadır. İnceledikten sonra uygulamayı yeniden yükleyebilirsiniz.</p>
        <pre>{String(this.state.error?.stack || this.state.error)}</pre>
        <button className="button-secondary" onClick={() => window.location.reload()}>Uygulamayı yeniden yükle</button>
      </main>
    );
  }
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ApplicationErrorBoundary><App /><FeedbackHost /></ApplicationErrorBoundary>
  </React.StrictMode>,
);
