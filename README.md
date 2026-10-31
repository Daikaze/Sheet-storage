# Token Form Storage

Foundry VTT **v14** / D&D 5e **6.0.6** — version **1.0.1**

Store multiple complete world Actor forms on a placed token, then switch between them without dragging a replacement token. Preserves token ID, position, combat turn and rotation while switching art, dimensions, HP, stats, features, items and effects.

## Install through Foundry

Use the following manifest in **Setup → Add-on Modules → Install Module**:

```text
https://raw.githubusercontent.com/Daikaze/Sheet-storage/main/module.json
```

The manifest installs the **v1.0.1** ZIP automatically. Restart Foundry and enable the module.

[Download the v1.0.1 ZIP](https://raw.githubusercontent.com/Daikaze/Sheet-storage/main/token-form-storage-v1.0.1.zip).

## How to use

1. Place a token on the scene and select it.
2. Open its Actor sheet, select **Token Forms** from the sheet header or use the layers icon on the Token HUD.
3. Choose an Actor from the world sidebar, then **Add** it to the stored forms. Or clone the active Actor to make a separate editable world Actor (GM only).
4. Click **Switch**. A single token switches the entire form without moving or changing identity.
5. Unlinked token forms keep their own HP/item/effect state. Linked forms use their underlying world Actor.

Saved forms are flags stored on the placed token. This is not a global Actor prototype-token storage system.

## v1.0.1 changes

- Fixed **"Token Form Storage: width must be a number"** when switching forms.
- Numeric token dimensions remain plain numbers, rather than object-replacement operators.
- Migrates legacy width/height values stored as numeric strings when switching.
- Replaced all custom dark-card colors and button skins with **native Foundry ApplicationV2 styling**, fieldsets, tables, and buttons.
- Expanded automated tests to include primitive field validation and legacy width/height normalization.

**Quality notes:** JavaScript syntax checks and six Node-based regression tests pass. This release has not yet been live-tested inside a Foundry v14 + D&D 5e 6.0.6 world. Back up before testing major transformations and check integration with third-party modules such as Midi-QOL.

The previous v1.0.0 package remains available for rollback.
