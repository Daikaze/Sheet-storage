import {
  getStorage, mayManage, actorAllowed, switchForm, saveCurrent, addActorForm, duplicateSnapshot,
  createActorClone, renameForm, removeForm, registerCurrentActor
} from "./storage.mjs";
import {
  getActorStorage, saveActorForm, addActorToActorStorage, duplicateActorForm,
  switchActorForm, renameActorForm, removeActorForm
} from "./actor-storage.mjs";

const Dialog = foundry.applications.api.DialogV2;
const HbsApp = foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2);

async function askName(title, proposed = "") {
  const text = foundry.utils.escapeHTML(proposed);
  const data = await Dialog.input({
    window: {title},
    content: `<div class="form-group"><label>Form name</label><input type="text" name="name" maxlength="80" value="${text}" autofocus required></div>`,
    ok: {label: "Save"},
    rejectClose: false
  });
  return data ? String(data.name ?? "").trim() : null;
}

export class FormStorageManager extends HbsApp {
  static DEFAULT_OPTIONS = {
    id: "token-form-storage-{id}",
    classes: ["token-form-storage-app"],
    tag: "div",
    window: {title: "Token Form Storage", icon: "fa-solid fa-layer-group", resizable: true},
    position: {width: 615, height: 520},
    actions: {
      switch: FormStorageManager.doSwitch,
      save: FormStorageManager.doSave,
      edit: FormStorageManager.doEdit,
      add: FormStorageManager.doAdd,
      duplicate: FormStorageManager.doDuplicate,
      clone: FormStorageManager.doClone,
      rename: FormStorageManager.doRename,
      remove: FormStorageManager.doRemove,
      recover: FormStorageManager.doRecover
    }
  };

  static PARTS = {main: {template: "modules/token-form-storage/templates/manager.hbs"}};

  constructor(document, options = {}) {
    super(options);
    this.subject = document;
    this.actorMode = document.documentName === "Actor";
    this._busy = false;
  }

  get actor() { return this.actorMode ? this.subject : this.subject.actor; }
  get storage() { return this.actorMode ? getActorStorage(this.subject) : getStorage(this.subject); }
  get title() { return `Forms · ${this.subject?.name ?? "Unknown"}`; }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const storage = this.storage;
    const actor = this.actor;
    const mismatched = !this.actorMode && storage.forms.find(f => f.id === storage.activeId)?.actorId !== this.subject.actorId;
    const forms = storage.forms.map(form => {
      const sourceActor = game.actors.get(form.actorId);
      return {
        id: form.id,
        name: form.name,
        actorName: this.actorMode ? (sourceActor?.name || "Saved snapshot") : (sourceActor?.name || "Missing Actor"),
        image: this.actorMode
          ? (form.snapshot?.img || "icons/svg/mystery-man.svg")
          : (form.snapshot?.texture?.src || sourceActor?.img || "icons/svg/mystery-man.svg"),
        active: storage.activeId === form.id,
        missing: !this.actorMode && !sourceActor,
        allowed: this.actorMode || actorAllowed(sourceActor),
        editAllowed: this.actorMode ? storage.activeId === form.id : actorAllowed(sourceActor)
      };
    });
    const actors = game.actors.contents
      .filter(other => actorAllowed(other) && other.type !== "group" && (!this.actorMode || other.type === actor.type))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(other => ({id: other.id, name: other.name}));
    return {
      ...context,
      tokenName: this.subject.name,
      currentActor: actor?.name || "Unknown",
      forms,
      actors,
      hasActors: actors.length > 0,
      canManage: this.actorMode ? actorAllowed(actor) && actor.canUserModify?.(game.user, "update") : mayManage(this.subject),
      linked: this.actorMode ? true : this.subject.actorLink,
      canClone: !this.actorMode && game.user.isGM,
      actorMode: this.actorMode,
      mismatched,
      tokenId: this.subject.id,
      hasSeveral: forms.length > 1
    };
  }

  async run(fn) {
    if (this._busy) return;
    this._busy = true;
    try { await fn(); }
    catch (err) {
      console.error("Token Form Storage | Action failed", err);
      ui.notifications.error(`Token Form Storage: ${err.message}`);
    } finally {
      this._busy = false;
      await this.render();
    }
  }

  static async doSwitch(event, button) {
    return this.run(async () => {
      if (this.actorMode) await switchActorForm(this.subject, button.dataset.formId);
      else await switchForm(this.subject, button.dataset.formId);
      ui.notifications.info("Form switched.");
    });
  }

  static async doEdit(event, button) {
    const storage = this.storage;
    const form = storage.forms.find(f => f.id === button.dataset.formId);
    if (!form) return;
    if (this.actorMode && form.id !== storage.activeId) {
      return ui.notifications.warn("Switch to this form first to edit its stats and features.");
    }
    const actor = this.actorMode ? this.subject :
      (form.id === storage.activeId ? this.subject.actor : game.actors.get(form.actorId));
    if (!actorAllowed(actor)) return ui.notifications.warn("You cannot open this Actor's sheet.");
    actor.sheet.render({force: true});
  }

  static async doSave() {
    return this.run(async () => {
      if (this.actorMode) await saveActorForm(this.subject);
      else await saveCurrent(this.subject);
      ui.notifications.info("Current form saved.");
    });
  }

  static async doAdd() {
    return this.run(async () => {
      const selected = this.element.querySelector("[name='alternateActor']")?.value;
      if (!selected) return ui.notifications.warn("Choose an Actor from the dropdown first.");
      const actor = game.actors.get(selected);
      const name = await askName("Add Actor as Form", actor?.name || "");
      if (name === null) return;
      if (this.actorMode) await addActorToActorStorage(this.subject, selected, name);
      else await addActorForm(this.subject, selected, name);
      ui.notifications.info(this.actorMode ? "Actor copied into stored forms." : "Form added to this token.");
    });
  }

  static async doDuplicate() {
    return this.run(async () => {
      const name = await askName("Save Current as Another Form", `${this.actor?.name ?? "Actor"} (Copy)`);
      if (name === null) return;
      if (this.actorMode) await duplicateActorForm(this.subject, name);
      else await duplicateSnapshot(this.subject, name);
      ui.notifications.info("Separate form saved.");
    });
  }

  static async doClone() {
    return this.run(async () => {
      if (this.actorMode) return;
      const name = await askName("Duplicate Actor as a New Form", `${this.subject.actor.name} (Alternate)`);
      if (name === null) return;
      const actor = await createActorClone(this.subject, name);
      ui.notifications.info(`New Actor '${actor.name}' added as a form.`);
    });
  }

  static async doRename(event, button) {
    return this.run(async () => {
      const selected = this.storage.forms.find(f => f.id === button.dataset.formId);
      if (!selected) return;
      const name = await askName("Rename Form", selected.name);
      if (name === null) return;
      if (this.actorMode) await renameActorForm(this.subject, selected.id, name);
      else await renameForm(this.subject, selected.id, name);
    });
  }

  static async doRemove(event, button) {
    return this.run(async () => {
      const form = this.storage.forms.find(f => f.id === button.dataset.formId);
      if (!form) return;
      const okay = await Dialog.confirm({
        window: {title: "Remove Stored Form"},
        content: `<p>Remove <strong>${foundry.utils.escapeHTML(form.name)}</strong> from stored forms?</p><p>No world Actor will be deleted.</p>`,
        rejectClose: false
      });
      if (!okay) return;
      if (this.actorMode) await removeActorForm(this.subject, form.id);
      else await removeForm(this.subject, form.id);
    });
  }

  static async doRecover() {
    if (this.actorMode) return;
    return this.run(async () => {
      await registerCurrentActor(this.subject);
      ui.notifications.info("Current Actor registered as an active form.");
    });
  }
}

const windows = new Map();
export function openManager(document) {
  if (!document) return ui.notifications.warn("Open an Actor from the sidebar, or select a placed token.");
  const isActor = document.documentName === "Actor";
  const isToken = document.documentName === "Token";
  if (!isActor && !isToken) return ui.notifications.warn("Form Storage supports Actors and Tokens.");
  if (isActor) {
    if (!actorAllowed(document) || !document.canUserModify?.(game.user, "update")) {
      return ui.notifications.warn("You do not have permission to manage this Actor.");
    }
  } else if (!document.actor || !mayManage(document)) {
    return ui.notifications.warn("You do not have permission to manage this token.");
  }
  const key = document.uuid;
  let app = windows.get(key);
  if (!app) {
    app = new FormStorageManager(document);
    windows.set(key, app);
    app.addEventListener("close", () => windows.delete(key), {once: true});
  }
  app.render({force: true});
  return app;
}
