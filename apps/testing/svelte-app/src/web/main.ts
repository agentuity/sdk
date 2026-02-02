import { mount } from "svelte";
import { initAgentuity } from "@agentuity/svelte";
import App from "./App.svelte";

// Initialize Agentuity context
initAgentuity();

// Mount the Svelte app
const app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;
