import assert from "node:assert/strict";
import test from "node:test";

const deepcopy = v => structuredClone(v);
let id = 0;
const replacement = o => ({__replace: true, value: deepcopy(o)});
function applyChange(dest, data) {
  for (const [key, val] of Object.entries(data)) {
    if (val?.__replace) dest[key] = deepcopy(val.value);
    else if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      dest[key] ??= {};
      applyChange(dest[key], val);
    } else dest[key] = deepcopy(val);
  }
}

globalThis.foundry = {
  utils: {deepClone: deepcopy, randomID: () => `unique-${++id}`},
  data: {operators: {ForcedReplacement: {create: replacement}}}
};
globalThis.game = {user: {isGM: true}, actors: new Map(), scenes: {contents: []}};
globalThis.ui = {notifications: {warn() {}}};

class MockActor {
  constructor({id, type="npc", name, hp, img="actor.png", items=[], effects=[], flags={}}) {
    this.id = id;
    this.uuid = `Actor.${id}`;
    this.name = name;
    this.type = type;
    this.img = img;
    this.documentName = "Actor";
    this.isToken = false;
    this.parent = null;
    this.isOwner = true;
    this.data = {
      _id: id, type, name, img,
      system: {attributes: {hp: {value: hp, max: hp}}, abilities: {str: {value: 10}}},
      prototypeToken: {name, width: 1, height: 1, texture: {src: `${name}.webp`}},
      items: deepcopy(items), effects: deepcopy(effects), flags: deepcopy(flags)
    };
    this.failOnItemCreate = false;
    this.items = {contents: []};
    this.effects = {contents: []};
    this.refresh();
  }
  refresh() {
    this.name = this.data.name;
    this.img = this.data.img;
    this.items.contents = this.data.items.map(x => ({id:x._id}));
    this.effects.contents = this.data.effects.map(x => ({id:x._id}));
  }
  canUserModify() { return true; }
  toObject() { return deepcopy(this.data); }
  getFlag(namespace, key) { return deepcopy(this.data.flags?.[namespace]?.[key]); }
  async setFlag(namespace, key, value) {
    this.data.flags[namespace] ??= {};
    this.data.flags[namespace][key] = deepcopy(value);
  }
  async update(patch) { applyChange(this.data, patch); this.refresh(); }
  async deleteEmbeddedDocuments(kind, ids) {
    const field = kind === "Item" ? "items" : "effects";
    this.data[field] = this.data[field].filter(x => !ids.includes(x._id));
    this.refresh();
  }
  async createEmbeddedDocuments(kind, values, options) {
    const field = kind === "Item" ? "items" : "effects";
    assert.equal(options.keepId, true);
    if (this.failOnItemCreate && field === "items") {
      this.failOnItemCreate = false;
      throw new Error("Simulated Item creation failure");
    }
    this.data[field].push(...deepcopy(values));
    this.refresh();
  }
}

const mod = await import("../scripts/actor-storage.mjs");
const mkActors = () => {
  const a = new MockActor({id:"BASE",name:"Base",hp:23,
    items:[{_id:"sword",name:"Sword",system:{damage:"1d8"}}],
    effects:[{_id:"bless",name:"Bless"}],flags:{dnd5e:{foo:"bar"}}});
  const b = new MockActor({id:"ALT",name:"Monster",hp:90,img:"monster.webp",
    items:[{_id:"claw",name:"Claw",system:{damage:"2d8"}}],
    effects:[{_id:"rage",name:"Rage"}],flags:{dnd5e:{foo:"alt"}}});
  game.actors = new Map([[a.id,a],[b.id,b]]);
  game.scenes.contents = [];
  return [a,b];
};

test("actor storage can initialize without a placed token", () => {
  const [a] = mkActors();
  const storage = mod.getActorStorage(a);
  assert.equal(storage.activeId,"base");
  assert.equal(storage.forms[0].snapshot.system.attributes.hp.value,23);
  assert.deepEqual(storage.forms[0].snapshot.items.map(x=>x._id),["sword"]);
});

test("add and switch full forms preserving same Actor ID and source Actor", async () => {
  const [a,b] = mkActors();
  await mod.addActorToActorStorage(a,b.id,"Demon");
  const newId = mod.getActorStorage(a).forms[1].id;
  await mod.switchActorForm(a,newId);
  assert.equal(a.id,"BASE");
  assert.equal(a.name,"Monster");
  assert.equal(a.data.system.attributes.hp.value,90);
  assert.deepEqual(a.data.items.map(x=>x._id),["claw"]);
  assert.deepEqual(a.data.effects.map(x=>x._id),["rage"]);
  assert.equal(a.data.prototypeToken.texture.src,"Monster.webp");
  assert.equal(a.data.flags.dnd5e.foo,"alt");
  assert.equal(b.data.system.attributes.hp.value,90);
  assert.equal(mod.getActorStorage(a).activeId,newId);
  assert.equal(JSON.stringify(mod.getActorStorage(a)).includes('"actorStorage":'),false, "no storage recursion");
});

test("switching back saves outgoing edits and restores original independent HP and items", async () => {
  const [a,b] = mkActors();
  await mod.addActorToActorStorage(a,b.id);
  const other = mod.getActorStorage(a).forms[1].id;
  await mod.switchActorForm(a,other);
  a.data.system.attributes.hp.value = 27;
  a.data.items[0].system.damage="3d8";
  await mod.switchActorForm(a,"base");
  assert.equal(a.data.system.attributes.hp.value,23);
  assert.deepEqual(a.data.items.map(x=>x._id),["sword"]);
  await mod.switchActorForm(a,other);
  assert.equal(a.data.system.attributes.hp.value,27);
  assert.equal(a.data.items[0].system.damage,"3d8");
});

test("duplicate and remove form from an Actor that is not on a scene", async () => {
  const [a] = mkActors();
  await mod.duplicateActorForm(a,"Awakened");
  let storage=mod.getActorStorage(a);
  assert.equal(storage.forms[1].name,"Awakened");
  await mod.renameActorForm(a,storage.forms[1].id,"Ascended");
  assert.equal(mod.getActorStorage(a).forms[1].name,"Ascended");
  await mod.removeActorForm(a,storage.forms[1].id);
  assert.equal(mod.getActorStorage(a).forms.length,1);
});

test("mismatched NPC/character types rejected before writing",async()=>{
  const [a,b]=mkActors();
  b.type="character";b.data.type="character";
  await assert.rejects(mod.addActorToActorStorage(a,b.id), /same sheet type/);
  assert.equal(a.getFlag("token-form-storage","actorStorage"),undefined);
});

test("failed embedded document migration restores original data",async()=>{
  const [a,b]=mkActors();
  await mod.addActorToActorStorage(a,b.id);
  const next=mod.getActorStorage(a).forms[1].id;
  a.failOnItemCreate=true;
  await assert.rejects(mod.switchActorForm(a,next),/Simulated/);
  assert.equal(mod.getActorStorage(a).activeId,"base");
  assert.equal(a.data.system.attributes.hp.value,23);
  assert.equal(a.name,"Base");
  assert.deepEqual(a.data.items.map(x=>x._id),["sword"]);
  assert.deepEqual(a.data.effects.map(x=>x._id),["bless"]);
});

test("linked tokens get art updates, without moving or replacing the token",async()=>{
  const [a,b]=mkActors();
  const scene={name:"Test",tokens:{contents:[]},updated:[],async updateEmbeddedDocuments(kind,patch){this.updated.push({kind,patch})}};
  const linked={id:"token01",actorId:a.id,actorLink:true,x:124,y:356,getFlag(){return null}};
  scene.tokens.contents.push(linked);
  game.scenes.contents=[scene];
  await mod.addActorToActorStorage(a,b.id);
  await mod.switchActorForm(a,mod.getActorStorage(a).forms[1].id);
  assert.equal(scene.updated.length,1);
  assert.deepEqual(scene.updated[0].patch[0],{
    _id:"token01",name:"Monster",width:1,height:1,texture:{src:"Monster.webp"}
  });
  assert.equal(linked.x,124);assert.equal(linked.y,356);
});
