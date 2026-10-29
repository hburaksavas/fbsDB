import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./styles.css";
import "./docking.css";
import "./connectionControl.css";
import "./editorTabs.css";

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
      <main style={{ minHeight: "100vh", padding: 32, boxSizing: "border-box", background: "#0d141d", color: "#dce5ef", fontFamily: "Segoe UI, sans-serif" }}>
        <h1 style={{ color: "#ff8f8f", fontSize: 18 }}>fbsDB arayüzü görüntülenemedi</h1>
        <p>Uygulama boş ekrana düşmek yerine hatayı gösterdi. SQL sonuçlarını veya bağlantı durumunu kaybetmeden hatayı inceleyebilmemiz için bu mesajı paylaşın.</p>
        <pre style={{ padding: 16, overflow: "auto", whiteSpace: "pre-wrap", background: "#151f2b", border: "1px solid #344253", borderRadius: 8 }}>{String(this.state.error?.stack || this.state.error)}</pre>
        <button onClick={() => window.location.reload()} style={{ padding: "8px 12px", color: "#dce5ef", background: "#263747", border: "1px solid #43576b", borderRadius: 6, cursor: "pointer" }}>Uygulamayı yeniden yükle</button>
      </main>
    );
  }
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ApplicationErrorBoundary><App /></ApplicationErrorBoundary>
  </React.StrictMode>,
);
