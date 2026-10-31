/** Actor Form Storage — forms anchored to a sidebar/world Actor (no Scene required). */
import {MODULE_ID, uuid, actorAllowed} from "./storage.mjs";

const KEY = "actorStorage";
const clone = value => foundry.utils.deepClone(value);
const replace = data => foundry.data.operators.ForcedReplacement.create(data);

/** Capture only the form-defining data, not ownership, folder, sort, IDs or metadata. */
export function captureActor(actor) {
  const data = actor.toObject();
  const flags = clone(data.flags ?? {});
  // Storage must never include itself: storing it in a snapshot would recurse indefinitely.
  if (flags[MODULE_ID]) {
    delete flags[MODULE_ID][KEY];
    if (!Object.keys(flags[MODULE_ID]).length) delete flags[MODULE_ID];
  }
  return {
    type: data.type,
    name: data.name,
    img: data.img,
    system: clone(data.system ?? {}),
    prototypeToken: clone(data.prototypeToken ?? {}),
    flags,
    items: clone(data.items ?? []),
    effects: clone(data.effects ?? [])
  };
}

export function getActorStorage(actor) {
  const data = actor.getFlag(MODULE_ID, KEY);
  if (data && Array.isArray(data.forms) && data.forms.length) return clone(data);
  return {
    schema: 1,
    activeId: "base",
    forms: [{id: "base", name: "Original", actorId: actor.id, snapshot: captureActor(actor)}]
  };
}

function mustManage(actor) {
  if (!actor || actor.documentName !== "Actor" || actor.isToken || actor.parent) {
    throw new Error("Choose a world Actor from the Actors sidebar, not a synthetic token Actor.");
  }
  if (!actorAllowed(actor) || !actor.canUserModify?.(game.user, "update")) {
    throw new Error("You do not have permission to change this Actor.");
  }
}

function activeForm(storage) {
  const form = storage.forms.find(f => f.id === storage.activeId);
  if (!form) throw new Error("Active form is missing from Actor storage.");
  return form;
}

async function store(actor, storage) {
  await actor.setFlag(MODULE_ID, KEY, storage);
}

export async function saveActorForm(actor) {
  mustManage(actor);
  const storage = getActorStorage(actor);
  activeForm(storage).snapshot = captureActor(actor);
  await store(actor, storage);
  return storage;
}

export async function addActorToActorStorage(actor, sourceId, name = "") {
  mustManage(actor);
  const source = game.actors.get(sourceId);
  if (!actorAllowed(source) || source?.type === "group") throw new Error("Source Actor not found, or you do not own it.");
  if (source.type !== actor.type) {
    throw new Error(`Actor-based forms must use the same sheet type (${actor.type}). Use a matching Actor.`);
  }
  const storage = getActorStorage(actor);
  activeForm(storage).snapshot = captureActor(actor);
  storage.forms.push({id: uuid(), name: name.trim() || source.name, actorId: source.id, snapshot: captureActor(source)});
  await store(actor, storage);
  return storage;
}

/** Save a separate, independent version of this Actor without adding another sidebar Actor. */
export async function duplicateActorForm(actor, name = "") {
  mustManage(actor);
  const storage = getActorStorage(actor);
  const current = activeForm(storage);
  current.snapshot = captureActor(actor);
  storage.forms.push({
    id: uuid(), name: name.trim() || `${current.name} (Copy)`,
    actorId: actor.id, snapshot: clone(current.snapshot)
  });
  await store(actor, storage);
  return storage;
}

/** Restore form data on the same Actor ID so sidebar references and future drops work. */
export async function applyActorSnapshot(actor, snap, storage) {
  if (snap.type !== actor.type) throw new Error("Cannot switch between different Actor sheet types.");
  const flags = clone(snap.flags ?? {});
  flags[MODULE_ID] = {
    ...(flags[MODULE_ID] ?? {}),
    ...(actor.toObject().flags?.[MODULE_ID] ?? {}),
    [KEY]: clone(storage)
  };

  // Keep world Actor ID, ownership, folder, and other structural metadata intact.
  await actor.update({
    name: snap.name,
    img: snap.img,
    system: replace(clone(snap.system)),
    prototypeToken: replace(clone(snap.prototypeToken)),
    flags: replace(flags)
  });

  // Embedded documents require their own create/delete API. Preserve original IDs
  // so effect links, activities, and D&D item references can resolve after switching.
  const oldItems = actor.items.contents.map(item => item.id);
  const oldEffects = actor.effects.contents.map(effect => effect.id);
  if (oldEffects.length) await actor.deleteEmbeddedDocuments("ActiveEffect", oldEffects);
  if (oldItems.length) await actor.deleteEmbeddedDocuments("Item", oldItems);
  if (snap.items?.length) await actor.createEmbeddedDocuments("Item", clone(snap.items), {keepId: true, keepEmbeddedIds: true});
  if (snap.effects?.length) await actor.createEmbeddedDocuments("ActiveEffect", clone(snap.effects), {keepId: true, keepEmbeddedIds: true});
}

/** Synchronize artwork of placed *linked* tokens; never change ID, position or initiative. */
async function updateLinkedTokenArt(actor, snap) {
  if (!game.user.isGM) return;
  const proto = snap.prototypeToken ?? {};
  const changes = {};
  for (const field of ["name", "width", "height", "texture", "ring", "shape"]) {
    if (proto[field] === undefined) continue;
    if (field === "width" || field === "height") {
      const n = Number(proto[field]);
      if (Number.isFinite(n) && n > 0) changes[field] = n;
    } else changes[field] = clone(proto[field]);
  }
  for (const scene of game.scenes.contents) {
    const updates = scene.tokens.contents
      .filter(t => t.actorLink && t.actorId === actor.id && !t.getFlag(MODULE_ID, "storage"))
      .map(t => ({_id: t.id, ...changes}));
    if (!updates.length) continue;
    try { await scene.updateEmbeddedDocuments("Token", updates); }
    catch (err) {
      // The Actor switch has already completed: a scene permissions failure
      // should not roll back its sheet. Warn and preserve placed token state.
      console.warn("Token Form Storage | Could not synchronize linked token artwork", scene.name, err);
      ui.notifications.warn(`Forms switched, but linked tokens on ${scene.name} were not updated.`);
    }
  }
}

export async function switchActorForm(actor, formId) {
  mustManage(actor);
  const storage = getActorStorage(actor);
  const next = storage.forms.find(f => f.id === formId);
  if (!next) throw new Error("Stored form not found.");
  if (next.id === storage.activeId) return storage;
  const before = captureActor(actor);
  const current = activeForm(storage);
  current.snapshot = clone(before);
  const target = clone(next.snapshot);
  if (!target || target.type !== actor.type) throw new Error("Stored form has a different Actor sheet type.");

  // Save the outgoing form before any potentially destructive embedded document changes.
  // Keep activeId on the previous form until the target has actually been applied.
  await store(actor, storage);
  const completed = clone(storage);
  completed.activeId = next.id;
  try {
    await applyActorSnapshot(actor, target, completed);
  } catch (error) {
    console.error("Token Form Storage | Actor switch failed, attempting recovery", error);
    try { await applyActorSnapshot(actor, before, storage); }
    catch (rollbackError) {
      console.error("Token Form Storage | Actor recovery failed", rollbackError);
      throw new Error("Form switch failed and automatic recovery also failed. Restore your Actor from a world backup. Details in F12 console.");
    }
    throw error;
  }
  await updateLinkedTokenArt(actor, target);
  return completed;
}

export async function renameActorForm(actor, formId, name) {
  mustManage(actor);
  const safe = name.trim();
  if (!safe) throw new Error("Form name cannot be empty.");
  const storage = getActorStorage(actor);
  const form = storage.forms.find(f => f.id === formId);
  if (!form) throw new Error("Stored form not found.");
  form.name = safe;
  await store(actor, storage);
  return storage;
}

export async function removeActorForm(actor, formId) {
  mustManage(actor);
  const storage = getActorStorage(actor);
  if (storage.forms.length <= 1) throw new Error("At least one form is required.");
  if (storage.activeId === formId) throw new Error("Switch away from a form before removing it.");
  storage.forms = storage.forms.filter(f => f.id !== formId);
  await store(actor, storage);
  return storage;
}
