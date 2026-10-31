import {openManager} from "./manager.mjs";
import {MODULE_ID, mayManage, getStorage} from "./storage.mjs";
import {getActorStorage} from "./actor-storage.mjs";

/** World Actor sheets use Actor storage; token/synthetic-Actor sheets use Token storage. */
function documentFromSheet(app) {
  const doc = app.document ?? app.object;
  if (doc?.documentName === "Token") return doc;
  if (app.token?.documentName === "Token") return app.token;
  const actor = app.actor ?? (doc?.documentName === "Actor" ? doc : null);
  if (!actor || actor.documentName !== "Actor") return null;
  if (actor.isToken && actor.token?.documentName === "Token") return actor.token;
  // A world Actor needs no selected or placed token, even on a blank canvas.
  return actor;
}

function fromSheet(app) {
  const doc = documentFromSheet(app);
  if (!doc) return ui.notifications.warn("Open a world Actor or a placed token to manage forms.");
  return openManager(doc);
}

Hooks.once("init", () => {
  if (game.system.id !== "dnd5e") return;
  console.info("Token Form Storage | Starting v1.1.0 for Foundry v14 / dnd5e 6.0.6");
});

Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
  if (game.system.id !== "dnd5e") return;
  const d = app.document ?? app.object;
  const sheet = d?.documentName === "Actor" || d?.documentName === "Token" ||
    app.actor?.documentName === "Actor";
  if (!sheet || !Array.isArray(controls)) return;
  if (controls.some(c => c.action === "tokenFormStorage")) return;
  controls.unshift({
    action: "tokenFormStorage",
    icon: "fa-solid fa-layer-group",
    label: "Token Forms",
    visible: true,
    onClick: () => fromSheet(app)
  });
});

Hooks.on("getActorSheetHeaderButtons", (app, buttons) => {
  if (game.system.id !== "dnd5e") return;
  if (!buttons.some(b => b.class === "token-form-storage-open")) buttons.unshift({
    label: "Token Forms",
    class: "token-form-storage-open",
    icon: "fas fa-layer-group",
    onclick: () => fromSheet(app)
  });
});

Hooks.on("renderTokenHUD", (app, root) => {
  if (game.system.id !== "dnd5e") return;
  const token = app.object?.document ?? app.document ?? app.object;
  if (token?.documentName !== "Token" || !mayManage(token)) return;
  const html = root instanceof HTMLElement ? root : root?.[0];
  if (!html || html.querySelector(".tfs-hud-control")) return;
  const target = html.querySelector(".col.right, .right, .controls.right") ?? html;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tfs-hud-control control-icon";
  button.title = "Token Form Storage — switch complete forms";
  button.setAttribute("aria-label", "Token Form Storage");
  button.innerHTML = `<i class="fa-solid fa-layer-group"></i>`;
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    openManager(token);
  });
  target.append(button);
});

Hooks.once("ready", () => {
  if (game.system.id !== "dnd5e") return;
  game.modules.get(MODULE_ID).api = Object.freeze({
    openForSelectedToken() {
      const token = canvas?.tokens?.controlled?.[0]?.document;
      if (!token) return ui.notifications.warn("Select a token first.");
      return openManager(token);
    },
    openForActor(actorId) {
      const actor = game.actors.get(actorId);
      if (!actor) return ui.notifications.warn("Actor not found.");
      return openManager(actor);
    },
    getForms(document) {
      if (!document) return [];
      if (document.documentName === "Token" && !document.actor) return [];
      const storage = document.documentName === "Actor" ? getActorStorage(document) : getStorage(document);
      return storage.forms.map(form => ({
        id: form.id, name: form.name, actorId: form.actorId, active: form.id === storage.activeId
      }));
    }
  });
});
