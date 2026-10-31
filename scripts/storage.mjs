/** Token Form Storage — persistent state and atomic form switching for v14. */
export const MODULE_ID = "token-form-storage";
export const STORAGE_KEY = "storage";

const clone = data => foundry.utils.deepClone(data);
// Foundry v14 replacement operators are for OBJECT data, never for primitives.
// Wrapping a numeric TokenDocument width/height caused: "width must be a number".
const replacement = data => foundry.data.operators.ForcedReplacement.create(data);
const nativeSize = (value, fallback = 1) => {
  const number = Number(value);
  if (Number.isFinite(number) && number > 0) return number;
  const backup = Number(fallback);
  return Number.isFinite(backup) && backup > 0 ? backup : 1;
};

export const uuid = () => foundry.utils.randomID(16);

/** Only save token appearance fields relevant to a form. Never touch map position or initiative. */
export const FORM_FIELDS = Object.freeze([
  "name", "width", "height", "texture", "ring", "shape", "alpha", "light", "sight",
  "bar1", "bar2", "displayBars", "displayName", "disposition", "lockRotation"
]);

export function capture(token) {
  const raw = token.toObject();
  const result = {};
  for (const field of FORM_FIELDS) {
    if (raw[field] !== undefined) result[field] = clone(raw[field]);
  }
  // Store the actual ActorDelta (items, effects, system data and flags) for unlinked tokens.
  // Linked tokens read the up-to-date world Actor; their delta is not used.
  result.delta = token.actorLink ? {} : clone(raw.delta ?? {});
  return result;
}

export function fromActor(actor, token) {
  const raw = actor.prototypeToken?.toObject?.() ?? {};
  const result = {};
  for (const field of FORM_FIELDS) {
    if (raw[field] !== undefined) result[field] = clone(raw[field]);
  }
  result.name = raw.name || actor.name;
  result.texture = clone(raw.texture ?? {});
  if (!result.texture?.src) result.texture.src = actor.img || token.texture.src;
  result.width = nativeSize(result.width, token.width);
  result.height = nativeSize(result.height, token.height);
  result.delta = {};
  return result;
}

export function getStorage(token) {
  const stored = token.getFlag(MODULE_ID, STORAGE_KEY);
  if (stored && Array.isArray(stored.forms) && stored.forms.length) return clone(stored);
  return {
    schema: 1,
    activeId: "base",
    forms: [{
      id: "base",
      name: "Original",
      actorId: token.actorId,
      snapshot: capture(token)
    }]
  };
}

export function mayManage(token) {
  if (!token?.actor) return false;
  if (game.user.isGM) return true;
  return Boolean(token.actor.isOwner && token.canUserModify?.(game.user, "update"));
}

export function actorAllowed(actor) {
  return Boolean(actor && (game.user.isGM || actor.isOwner));
}

function currentForm(storage) {
  const form = storage.forms.find(f => f.id === storage.activeId);
  if (!form) throw new Error("Saved active form could not be found.");
  return form;
}

function assertReady(token) {
  if (!token?.parent) throw new Error("Select a token that is already placed on a scene.");
  if (!mayManage(token)) throw new Error("You do not have permission to manage this token.");
}

/** Use a single update, so failed switches do not discard the currently selected form. */
async function write(token, storage, changes = {}) {
  await token.update({
    ...changes,
    [`flags.${MODULE_ID}.${STORAGE_KEY}`]: replacement(storage)
  });
}

export async function saveCurrent(token) {
  assertReady(token);
  const storage = getStorage(token);
  const form = currentForm(storage);
  // Defensive guard in case the token's actor was swapped manually outside this module.
  if (form.actorId !== token.actorId) throw new Error("Token actor changed outside Form Storage. Switch back or reinitialize this token.");
  form.snapshot = capture(token);
  await write(token, storage);
  return storage;
}

export async function addActorForm(token, actorId, customName = "") {
  assertReady(token);
  const actor = game.actors.get(actorId);
  if (!actorAllowed(actor)) throw new Error("Actor not found, or you do not have permission to use it.");
  if (actor.type === "group") throw new Error("Group actors cannot be used as token forms.");
  const storage = getStorage(token);
  // Persist the current state too, so the first form is safely snapshotted.
  currentForm(storage).snapshot = capture(token);
  storage.forms.push({id: uuid(), name: customName.trim() || actor.name, actorId: actor.id, snapshot: fromActor(actor, token)});
  await write(token, storage);
  return storage;
}

/** Make a second, independently mutable form from the current token (unlinked only). */
export async function duplicateSnapshot(token, name) {
  assertReady(token);
  if (token.actorLink) throw new Error("Use 'Clone as Actor' for linked tokens, so each form has independent stats.");
  const storage = getStorage(token);
  const base = currentForm(storage);
  base.snapshot = capture(token);
  storage.forms.push({id: uuid(), name: name.trim() || `${base.name} (copy)`, actorId: token.actorId, snapshot: capture(token)});
  await write(token, storage);
  return storage;
}

export async function createActorClone(token, name) {
  assertReady(token);
  if (!game.user.isGM) throw new Error("Only a GM can create new world Actors with this action.");
  const newName = name.trim() || `${token.actor.name} (Alternate)`;
  const source = clone(token.actor.toObject());
  delete source._id;
  source.name = newName;
  // Set an appropriate token image and footprint on the newly created form.
  source.prototypeToken ??= {};
  source.prototypeToken.name = newName;
  source.prototypeToken.width = nativeSize(token.width);
  source.prototypeToken.height = nativeSize(token.height);
  source.prototypeToken.texture ??= {};
  source.prototypeToken.texture.src = token.texture.src || token.actor.img;
  source.prototypeToken.actorLink = token.actorLink;
  const created = await Actor.create(source, {renderSheet: false});
  if (!created) throw new Error("Foundry could not create the alternate Actor.");
  try {
    await addActorForm(token, created.id, newName);
  } catch (err) {
    // Keep the new Actor rather than deleting user data; report its name.
    throw new Error(`Actor '${created.name}' was created, but could not be attached: ${err.message}`);
  }
  return created;
}

export async function switchForm(token, formId) {
  assertReady(token);
  const storage = getStorage(token);
  const incoming = storage.forms.find(f => f.id === formId);
  if (!incoming) throw new Error("The chosen form no longer exists.");
  if (storage.activeId === incoming.id) return storage;
  const actor = game.actors.get(incoming.actorId);
  if (!actorAllowed(actor)) throw new Error("The target Actor has been deleted or you do not own it.");
  const outgoing = currentForm(storage);
  if (outgoing.actorId !== token.actorId) throw new Error("Token actor no longer matches the active form. Switch cancelled to protect saved data.");

  outgoing.snapshot = capture(token);
  const snap = clone(incoming.snapshot ?? fromActor(actor, token));
  const changes = {actorId: actor.id};
  for (const field of FORM_FIELDS) {
    if (snap[field] === undefined) continue;
    const value = clone(snap[field]);
    // Foundry requires TokenDocument dimensions to be actual numbers, not
    // ForcedReplacement objects (or strings from older saved snapshots).
    if (field === "width" || field === "height") {
      changes[field] = nativeSize(value, token[field]);
    } else if (value !== null && typeof value === "object") {
      changes[field] = replacement(value);
    } else {
      changes[field] = value;
    }
  }
  // On v14 replacement is important: normal recursive merging would leave residual
  // items, effects, HP overrides, and flags from the previous unlinked form.
  const delta = token.actorLink ? {} : clone(snap.delta ?? {});
  delta._id = token.delta?.id ?? delta._id ?? null;
  delta.flags ??= {};
  changes.delta = replacement(delta);
  storage.activeId = incoming.id;
  await write(token, storage, changes);
  return storage;
}

export async function renameForm(token, formId, name) {
  assertReady(token);
  const newName = name.trim();
  if (!newName) throw new Error("Form name cannot be empty.");
  const storage = getStorage(token);
  const form = storage.forms.find(f => f.id === formId);
  if (!form) throw new Error("Form not found.");
  form.name = newName;
  await write(token, storage);
}

export async function removeForm(token, formId) {
  assertReady(token);
  const storage = getStorage(token);
  if (storage.forms.length <= 1) throw new Error("A token must have at least one form.");
  if (formId === storage.activeId) throw new Error("Switch to another form before deleting this one.");
  storage.forms = storage.forms.filter(f => f.id !== formId);
  await write(token, storage);
}

/** Recovery for an externally reassigned actor. Does not delete saved entries. */
export async function registerCurrentActor(token) {
  assertReady(token);
  const storage = getStorage(token);
  const existing = storage.forms.find(f => f.actorId === token.actorId);
  if (existing) {
    storage.activeId = existing.id;
    existing.snapshot = capture(token);
  } else {
    const id = uuid();
    storage.forms.push({id, name: token.actor.name, actorId: token.actorId, snapshot: capture(token)});
    storage.activeId = id;
  }
  await write(token, storage);
}
